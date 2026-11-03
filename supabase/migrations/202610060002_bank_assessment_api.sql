BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
DROP TRIGGER plantilla_inmutable ON plantilla_evaluacion;
CREATE FUNCTION validar_plantilla_banco() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE s JSONB; amount INTEGER:=0;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Plantilla versionada inmutable.'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(new)-'habilitada') IS DISTINCT FROM (to_jsonb(old)-'habilitada') THEN RAISE EXCEPTION 'Crea una nueva versión de plantilla.'; END IF;
  RETURN new;
 END IF;
 IF jsonb_array_length(new.composicion)=0 THEN RAISE EXCEPTION 'Composición vacía.'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(new.composicion) LOOP
  IF (s-'family'-'level'-'difficulty'-'size'-'blocks')<>'{}'::jsonb OR s->>'family' NOT IN ('vocabulario','avisos','conversaciones','gramatica','lectura_literal','lectura_inferencial','uso_integrado')
   OR coalesce((s->>'level')::integer,0) NOT BETWEEN 1 AND 3 OR (s->>'difficulty')::integer IS DISTINCT FROM (s->>'level')::integer
   OR coalesce((s->>'size')::integer,0)<1 OR coalesce((s->>'blocks')::integer,0)<1
   OR (new.tipo='control' AND (s->>'level')::integer<>new.nivel) THEN RAISE EXCEPTION 'Regla de composición inválida.'; END IF;
  amount:=amount+(s->>'size')::integer*(s->>'blocks')::integer;
 END LOOP;
 IF amount<>new.cantidad OR (SELECT count(*)<>count(DISTINCT value->>'family') FROM jsonb_array_elements(new.composicion))
  OR (new.tipo='final' AND (SELECT count(DISTINCT value->>'level') FROM jsonb_array_elements(new.composicion))<>3) THEN RAISE EXCEPTION 'Cantidad o cobertura inválida.'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER plantilla_banco BEFORE INSERT OR UPDATE OR DELETE ON plantilla_evaluacion FOR EACH ROW EXECUTE FUNCTION validar_plantilla_banco();
CREATE FUNCTION proteger_convocatoria() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR old.id<>new.id OR old.id_estudiante<>new.id_estudiante OR old.id_plantilla<>new.id_plantilla OR old.creada_en<>new.creada_en OR old.id_evaluacion IS NOT NULL OR new.id_evaluacion IS NULL THEN RAISE EXCEPTION 'Convocatoria inmutable; no habilites reintentos.'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER convocatoria_inmutable BEFORE UPDATE OR DELETE ON convocatoria_banco FOR EACH ROW EXECUTE FUNCTION proteger_convocatoria();

CREATE FUNCTION guardar_seleccion_intento() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 INSERT INTO seleccion_intento(id_intento,id_item,orden,id_pregunta,version_pregunta,id_bloque,version_bloque,dto)
 SELECT new.id,it.id,it.orden,p.id,p.version,b.id,b.version,pregunta_dto(p.id,it.id) FROM asignacion_evaluacion a JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion JOIN pregunta p ON p.id=it.id_pregunta LEFT JOIN bloque_preguntas b ON b.id=p.id_bloque WHERE a.id=new.id_asignacion;
 INSERT INTO exposicion_pregunta(id_estudiante,id_original,id_pregunta,id_intento)
 SELECT a.id_estudiante,coalesce(p.id_original,p.id),p.id,new.id FROM asignacion_evaluacion a JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion JOIN pregunta p ON p.id=it.id_pregunta WHERE a.id=new.id_asignacion;
 RETURN new;
END $$;
CREATE TRIGGER snapshot_intento AFTER INSERT ON intento FOR EACH ROW EXECUTE FUNCTION guardar_seleccion_intento();
-- Observable legacy selection only. No responses, results or versions are changed.
INSERT INTO seleccion_intento(id_intento,id_item,orden,id_pregunta,version_pregunta,id_bloque,version_bloque,dto)
SELECT i.id,it.id,it.orden,p.id,p.version,b.id,b.version,pregunta_dto(p.id,it.id) FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion JOIN pregunta p ON p.id=it.id_pregunta LEFT JOIN bloque_preguntas b ON b.id=p.id_bloque;
INSERT INTO exposicion_pregunta(id_estudiante,id_original,id_pregunta,id_intento)
SELECT a.id_estudiante,coalesce(p.id_original,p.id),p.id,i.id FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion JOIN pregunta p ON p.id=it.id_pregunta;

CREATE FUNCTION iniciar_banco(assignment_id TEXT,confirmed BOOLEAN) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario; call convocatoria_banco; pl plantilla_evaluacion; it intento; s JSONB; selected TEXT[]:='{}'; chosen TEXT[];
 required INTEGER; available INTEGER; eid TEXT; at BIGINT:=epoch_ms(); fail JSONB;
BEGIN
 u:=actor();
 IF u.rol<>'estudiante' OR NOT u.perfil_completo THEN RAISE EXCEPTION 'Completa tu perfil de estudiante.' USING ERRCODE='42501'; END IF;
 IF confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirma las condiciones.'; END IF;
 -- Serializes selection across every Auth session and assignment belonging to this student.
 PERFORM 1 FROM estudiante WHERE id_usuario=u.id FOR UPDATE;
 SELECT * INTO call FROM convocatoria_banco WHERE id=assignment_id AND id_estudiante=u.id FOR UPDATE;
 IF call.id IS NULL THEN RAISE EXCEPTION 'Evaluación no asignada.' USING ERRCODE='42501'; END IF;
 IF call.id_evaluacion IS NOT NULL THEN
  SELECT i.* INTO it FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id=call.id FOR UPDATE OF i;
  IF it.id IS NULL THEN RAISE EXCEPTION 'Asignación inconsistente; requiere recuperación administrativa.'; END IF;
  IF it.estado='activo' THEN UPDATE intento SET ultima_actividad=at WHERE id=it.id; UPDATE sesion_actividad SET ultima_actividad=now(),ambito='exam' WHERE id=(auth.jwt()->>'session_id')::uuid; END IF;
  RETURN intento_json(it.id);
 END IF;
 SELECT * INTO pl FROM plantilla_evaluacion WHERE id=call.id_plantilla;
 IF NOT pl.habilitada OR NOT EXISTS(SELECT 1 FROM carga_banco WHERE id_fuente=pl.id_fuente) THEN RAISE EXCEPTION 'Evaluación aún no habilitada.'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(pl.composicion) LOOP
  required:=(s->>'blocks')::integer;
  SELECT array_agg(id) INTO chosen FROM (
   SELECT b.id FROM bloque_preguntas b WHERE b.id_fuente=pl.id_fuente AND b.estado_revision='revisada' AND b.familia_habilidad=s->>'family'
   AND b.nivel_pedagogico=(s->>'level')::integer AND b.dificultad_prevista=(s->>'difficulty')::integer AND b.cantidad_preguntas=(s->>'size')::integer
   AND (SELECT count(*) FROM pregunta p WHERE p.id_bloque=b.id)=b.cantidad_preguntas
   AND NOT EXISTS(SELECT 1 FROM pregunta p WHERE p.id_bloque=b.id AND (p.estado_revision<>'revisada' OR p.tipo<>'seleccion_unica' OR p.dificultad_prevista<>b.dificultad_prevista
    OR (SELECT count(*) FROM opcion_respuesta o WHERE o.id_pregunta=p.id AND es_correcta=1)<>1
    OR EXISTS(SELECT 1 FROM exposicion_pregunta x WHERE x.id_estudiante=u.id AND x.id_original=coalesce(p.id_original,p.id))))
   ORDER BY random(),b.id LIMIT required
  ) candidates;
  available:=coalesce(cardinality(chosen),0);
  IF available<required THEN
   fail:=jsonb_build_object('code','BANK_EXHAUSTED','message','No hay una combinación válida de preguntas no vistas con bloques completos. Se requiere ampliar el banco o revisar una política explícita de reutilización.',
    'family',s->>'family','level',(s->>'level')::integer,'requiredBlocks',required,'availableBlocks',available,'policy',pl.politica_exposicion);
   INSERT INTO agotamiento_banco(id_convocatoria,detalle) VALUES(call.id,fail);
   RETURN jsonb_build_object('error',fail); -- Successful RPC transaction preserves the exhaustion audit; no attempt created.
  END IF;
  selected:=selected||chosen;
 END LOOP;
 eid:=gen_random_uuid()::text;
 INSERT INTO evaluacion(id,titulo,version,tipo,id_plantilla) VALUES(eid,pl.titulo,pl.version,CASE pl.tipo WHEN 'control' THEN 'cuestionario' ELSE 'simulacro' END,pl.id);
 INSERT INTO evaluacion_componente VALUES(eid,'ingles');
 INSERT INTO item_evaluacion(id,id_evaluacion,id_pregunta,orden)
 SELECT gen_random_uuid()::text,eid,p.id,row_number() OVER(ORDER BY ord,p.numero_original)::integer FROM unnest(selected) WITH ORDINALITY sb(id,ord) JOIN pregunta p ON p.id_bloque=sb.id;
 UPDATE evaluacion SET publicada=true WHERE id=eid; -- Concrete private form, only after an explicit assignment has been started.
 INSERT INTO asignacion_evaluacion VALUES(call.id,u.id,eid);
 UPDATE convocatoria_banco SET id_evaluacion=eid WHERE id=call.id;
 INSERT INTO intento(id,id_asignacion,estado,iniciado_en,ultima_actividad) VALUES(gen_random_uuid()::text,call.id,'activo',at,at) RETURNING * INTO it;
 UPDATE sesion_actividad SET ultima_actividad=now(),ambito='exam' WHERE id=(auth.jwt()->>'session_id')::uuid;
 RETURN intento_json(it.id);
END $$;

-- Preparation only: never called by a migration or the import. No assignments by profile update.
CREATE FUNCTION public.apex_assign_bank(student_ids TEXT[],template_id TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario; pl plantilla_evaluacion; count_assigned INTEGER;
BEGIN
 u:=actor(); IF u.rol<>'administrador' THEN RAISE EXCEPTION 'Solo administrador.' USING ERRCODE='42501'; END IF;
 SELECT * INTO pl FROM plantilla_evaluacion WHERE id=template_id;
 IF pl.id IS NULL OR NOT pl.habilitada THEN RAISE EXCEPTION 'Plantilla aún no habilitada.'; END IF;
 IF coalesce(cardinality(student_ids),0)=0 OR EXISTS(SELECT 1 FROM unnest(student_ids) sid WHERE sid IS NULL OR NOT EXISTS(SELECT 1 FROM estudiante e JOIN usuario us ON us.id=e.id_usuario JOIN programa_componente pc ON pc.id_programa=e.id_programa AND pc.id_componente='ingles' WHERE e.id_usuario=sid AND us.rol='estudiante' AND us.estado='activo' AND us.perfil_completo)) THEN RAISE EXCEPTION 'Estudiante o componente autorizado inválido.'; END IF;
 INSERT INTO convocatoria_banco(id_estudiante,id_plantilla) SELECT DISTINCT sid,template_id FROM unnest(student_ids) sid ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING;
 GET DIAGNOSTICS count_assigned=ROW_COUNT;
 RETURN jsonb_build_object('assigned',count_assigned);
END $$;

ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_anterior;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE data JSONB; u usuario;
BEGIN
 IF operation='start' AND EXISTS(SELECT 1 FROM convocatoria_banco WHERE id=payload->>'assignmentId') THEN RETURN iniciar_banco(payload->>'assignmentId',(payload->>'confirmed')::boolean); END IF;
 data:=public.apex_api_anterior(operation,payload);
 IF operation='me' THEN
  u:=actor();
  data:=jsonb_set(data,'{assignments}',coalesce((SELECT jsonb_agg(row ORDER BY row->>'id') FROM (
   SELECT jsonb_build_object('id',a.id,'title',e.titulo,'version',e.version,'status',i.estado,'attemptId',i.id,'kind',coalesce(pl.tipo,e.tipo),'count',coalesce(pl.cantidad,(SELECT count(*) FROM item_evaluacion WHERE id_evaluacion=e.id))) row FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion LEFT JOIN intento i ON i.id_asignacion=a.id LEFT JOIN plantilla_evaluacion pl ON pl.id=e.id_plantilla WHERE a.id_estudiante=u.id
   UNION ALL
   SELECT jsonb_build_object('id',call.id,'title',pl.titulo,'version',pl.version,'status',NULL,'attemptId',NULL,'kind',pl.tipo,'count',pl.cantidad) FROM convocatoria_banco call JOIN plantilla_evaluacion pl ON pl.id=call.id_plantilla WHERE call.id_estudiante=u.id AND call.id_evaluacion IS NULL
  ) assignments),'[]'::jsonb));
 END IF;
 RETURN data;
END $$;
REVOKE ALL ON FUNCTION public.apex_api_anterior(TEXT,JSONB),iniciar_banco(TEXT,BOOLEAN),validar_plantilla_banco(),proteger_convocatoria(),guardar_seleccion_intento(),public.apex_assign_bank(TEXT[],TEXT),public.apex_api(TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_assign_bank(TEXT[],TEXT),public.apex_api(TEXT,JSONB) TO authenticated;
COMMIT;
