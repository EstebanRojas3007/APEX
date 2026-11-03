BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
CREATE OR REPLACE FUNCTION validar_plantilla_banco() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE s JSONB; amount INTEGER:=0;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Plantilla versionada inmutable.'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(new)-'habilitada') IS DISTINCT FROM (to_jsonb(old)-'habilitada') THEN RAISE EXCEPTION 'Crea una nueva versión de plantilla.'; END IF;
  RETURN new;
 END IF;
 IF jsonb_array_length(new.composicion)=0 THEN RAISE EXCEPTION 'Composición vacía.'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(new.composicion) LOOP
  IF (s-'family'-'level'-'difficulty'-'size'-'blocks')<>'{}'::jsonb OR coalesce(s->>'family','') NOT IN ('vocabulario','avisos','conversaciones','gramatica','lectura_literal','lectura_inferencial','uso_integrado')
   OR coalesce((s->>'level')::integer,0) NOT BETWEEN 1 AND 3 OR (s->>'difficulty')::integer IS DISTINCT FROM (s->>'level')::integer
   OR coalesce((s->>'size')::integer,0)<1 OR coalesce((s->>'blocks')::integer,0)<1
   OR (new.tipo='control' AND (s->>'level')::integer<>new.nivel) THEN RAISE EXCEPTION 'Regla de composición inválida.'; END IF;
  amount:=amount+(s->>'size')::integer*(s->>'blocks')::integer;
 END LOOP;
 IF amount<>new.cantidad OR (SELECT count(*)<>count(DISTINCT value->>'family') FROM jsonb_array_elements(new.composicion))
  OR (new.tipo='final' AND (SELECT count(DISTINCT value->>'level') FROM jsonb_array_elements(new.composicion))<>3)
  OR (new.tipo='diagnostico' AND EXISTS(SELECT 1 FROM generate_series(1,3) n WHERE (SELECT coalesce(sum((cs.value->>'size')::integer*(cs.value->>'blocks')::integer),0) FROM jsonb_array_elements(new.composicion) cs WHERE (cs.value->>'level')::integer=n)<>CASE n WHEN 3 THEN 3 ELSE 2 END)) THEN RAISE EXCEPTION 'Cantidad o cobertura inválida.'; END IF;
 RETURN new;
END $$;

CREATE FUNCTION diagnostico_terminado(uid TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN evaluacion e ON e.id=a.id_evaluacion JOIN evaluacion_componente ec ON ec.id_evaluacion=e.id WHERE a.id_estudiante=uid AND i.estado='finalizado' AND e.tipo='diagnostico' AND ec.id_componente='ingles')
$$;
CREATE FUNCTION control_aprobado(uid TEXT,lvl INTEGER) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM decision_avance d JOIN intento i ON i.id=d.id_intento JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id_estudiante=uid AND d.tipo='control' AND d.nivel=lvl AND d.aprobada)
$$;
CREATE FUNCTION nivel_habilitado(uid TEXT,lvl INTEGER) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT CASE WHEN lvl=1 THEN diagnostico_terminado(uid) ELSE control_aprobado(uid,lvl-1) END
$$;
CREATE FUNCTION control_habilitado(uid TEXT,lvl INTEGER) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT nivel_habilitado(uid,lvl) AND EXISTS(SELECT 1 FROM ruta_nivel_version r WHERE r.id_estudiante=uid AND r.nivel=lvl AND (SELECT count(*) FROM seccion_ruta s JOIN progreso_seccion p ON p.id_seccion=s.id AND p.id_estudiante=uid WHERE s.id_ruta=r.id AND p.completada_en IS NOT NULL)=7)
$$;
CREATE FUNCTION seleccionar_forma(uid TEXT,template_id TEXT,assignment_id TEXT,call_id TEXT,selection_policy TEXT DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE pl plantilla_evaluacion;s JSONB;selected TEXT[]:='{}';chosen TEXT[];required INTEGER;available INTEGER;eid TEXT;it intento;fail JSONB;at BIGINT:=epoch_ms();policy TEXT;
BEGIN
 SELECT * INTO pl FROM plantilla_evaluacion WHERE id=template_id;
 policy:=coalesce(selection_policy,pl.politica_exposicion);
 IF policy NOT IN ('solo_no_vistas-v1','no_vistas_lru_bloques-v2') THEN RAISE EXCEPTION 'Política de selección no autorizada.'; END IF;
 IF pl.id IS NULL OR NOT pl.habilitada OR NOT EXISTS(SELECT 1 FROM carga_banco WHERE id_fuente=pl.id_fuente) THEN RAISE EXCEPTION 'Evaluación aún no habilitada.'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(pl.composicion) LOOP
  required:=(s->>'blocks')::integer;
  SELECT array_agg(id ORDER BY rank) INTO chosen FROM (
   SELECT b.id,row_number() OVER(ORDER BY exposure.last_seen NULLS FIRST,random(),b.id) rank
   FROM bloque_preguntas b
   LEFT JOIN LATERAL (SELECT max(x.registrada_en) last_seen FROM pregunta bp JOIN exposicion_pregunta x ON x.id_original=coalesce(bp.id_original,bp.id) AND x.id_estudiante=uid WHERE bp.id_bloque=b.id) exposure ON true
   WHERE b.id_fuente=pl.id_fuente AND b.estado_revision='revisada' AND b.familia_habilidad=s->>'family'
    AND b.nivel_pedagogico=(s->>'level')::integer AND b.dificultad_prevista=(s->>'difficulty')::integer AND b.cantidad_preguntas=(s->>'size')::integer
    AND NOT b.id=ANY(selected) AND (SELECT count(*) FROM pregunta p WHERE p.id_bloque=b.id)=b.cantidad_preguntas
    AND NOT EXISTS(SELECT 1 FROM pregunta p WHERE p.id_bloque=b.id AND (p.estado_revision<>'revisada' OR p.tipo<>'seleccion_unica' OR p.dificultad_prevista<>b.dificultad_prevista OR (SELECT count(*) FROM opcion_respuesta o WHERE o.id_pregunta=p.id AND es_correcta=1)<>1))
    AND (policy='no_vistas_lru_bloques-v2' OR exposure.last_seen IS NULL)
   ORDER BY rank LIMIT required
  ) candidates;
  available:=coalesce(cardinality(chosen),0);
  IF available<required THEN
   fail:=jsonb_build_object('code','BANK_EXHAUSTED','message','No existe una composición válida con bloques completos para esta evaluación.','family',s->>'family','level',(s->>'level')::integer,'requiredBlocks',required,'availableBlocks',available,'policy',policy);
   INSERT INTO agotamiento_banco(id_convocatoria,detalle) VALUES(call_id,fail);
   RETURN jsonb_build_object('error',fail);
  END IF;
  selected:=selected||chosen;
 END LOOP;
 eid:=gen_random_uuid()::text;
 INSERT INTO evaluacion(id,titulo,version,tipo,id_plantilla) VALUES(eid,pl.titulo,pl.version,CASE pl.tipo WHEN 'control' THEN 'cuestionario' WHEN 'final' THEN 'simulacro' ELSE 'diagnostico' END,pl.id);
 INSERT INTO evaluacion_componente VALUES(eid,'ingles');
 INSERT INTO item_evaluacion(id,id_evaluacion,id_pregunta,orden)
 SELECT gen_random_uuid()::text,eid,p.id,row_number() OVER(ORDER BY ord,p.numero_original)::integer FROM unnest(selected) WITH ORDINALITY sb(id,ord) JOIN pregunta p ON p.id_bloque=sb.id;
 UPDATE evaluacion SET publicada=true WHERE id=eid;
 INSERT INTO asignacion_evaluacion VALUES(assignment_id,uid,eid);
 INSERT INTO intento(id,id_asignacion,estado,iniciado_en,ultima_actividad) VALUES(gen_random_uuid()::text,assignment_id,'activo',at,at) RETURNING * INTO it;
 UPDATE sesion_actividad SET ultima_actividad=now(),ambito='exam' WHERE id=(auth.jwt()->>'session_id')::uuid;
 RETURN intento_json(it.id);
END $$;
CREATE OR REPLACE FUNCTION iniciar_banco(assignment_id TEXT,confirmed BOOLEAN) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;c convocatoria_banco;pl plantilla_evaluacion;it intento;review sesion_refuerzo;outcome JSONB;number INTEGER;aid TEXT;mvp BOOLEAN;policy TEXT;
BEGIN
 u:=actor();
 IF u.rol<>'estudiante' OR NOT u.perfil_completo OR NOT datos_perfil_guardados_validos(u.id) THEN RAISE EXCEPTION 'Completa tu perfil de estudiante.' USING ERRCODE='42501'; END IF;
 IF confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirma las condiciones.'; END IF;
 PERFORM 1 FROM estudiante WHERE id_usuario=u.id FOR UPDATE;
 SELECT * INTO c FROM convocatoria_banco WHERE id=assignment_id AND id_estudiante=u.id FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Evaluación no asignada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO pl FROM plantilla_evaluacion WHERE id=c.id_plantilla;
 mvp:=pl.politica_exposicion='no_vistas_lru_bloques-v2' OR EXISTS(SELECT 1 FROM configuracion_mvp WHERE diagnostico IS NOT NULL);
 SELECT i.* INTO it FROM intento i LEFT JOIN intento_ruta ir ON ir.id_intento=i.id WHERE i.id_asignacion=c.id OR ir.id_convocatoria=c.id ORDER BY ir.numero DESC NULLS LAST,i.iniciado_en DESC,i.id DESC LIMIT 1 FOR UPDATE OF i;
 IF it.id IS NOT NULL THEN
  IF it.estado='activo' THEN
   UPDATE intento SET ultima_actividad=epoch_ms() WHERE id=it.id;
   UPDATE sesion_actividad SET ultima_actividad=now(),ambito='exam' WHERE id=(auth.jwt()->>'session_id')::uuid;
   RETURN intento_json(it.id);
  END IF;
  IF pl.tipo='diagnostico' OR NOT mvp OR EXISTS(SELECT 1 FROM decision_avance WHERE id_intento=it.id AND aprobada) THEN RETURN intento_json(it.id); END IF;
  -- Register the legacy first attempt as a fact; do not change its selection or result.
  INSERT INTO intento_ruta(id_intento,id_convocatoria,numero,politica_seleccion) VALUES(it.id,c.id,1,pl.politica_exposicion) ON CONFLICT(id_intento) DO NOTHING;
  SELECT * INTO review FROM sesion_refuerzo WHERE id_intento=it.id AND id_estudiante=u.id AND tipo='review' FOR UPDATE;
  IF review.id IS NULL OR review.completada_en IS NULL OR review.id_nuevo_intento IS NOT NULL THEN RAISE EXCEPTION 'Completa el repaso vinculado antes de repetir esta evaluación.'; END IF;
 ELSE
  IF mvp AND ((pl.tipo='control' AND NOT control_habilitado(u.id,pl.nivel)) OR (pl.tipo='final' AND NOT control_aprobado(u.id,3))) THEN RAISE EXCEPTION 'Evaluación bloqueada por los prerrequisitos de tu ruta.'; END IF;
 END IF;
 aid:=CASE WHEN it.id IS NULL THEN c.id ELSE gen_random_uuid()::text END;
 policy:=CASE WHEN mvp THEN 'no_vistas_lru_bloques-v2' ELSE pl.politica_exposicion END;
 outcome:=seleccionar_forma(u.id,pl.id,aid,c.id,policy);
 IF outcome ? 'error' THEN RETURN outcome; END IF;
 IF c.id_evaluacion IS NULL THEN UPDATE convocatoria_banco SET id_evaluacion=(SELECT id_evaluacion FROM asignacion_evaluacion WHERE id=aid) WHERE id=c.id; END IF;
 IF mvp THEN
  SELECT coalesce(max(numero),0)+1 INTO number FROM intento_ruta WHERE id_convocatoria=c.id;
  INSERT INTO intento_ruta(id_intento,id_convocatoria,numero,id_repaso,politica_seleccion) VALUES(outcome->>'id',c.id,number,review.id,policy);
  IF review.id IS NOT NULL THEN UPDATE sesion_refuerzo SET id_nuevo_intento=outcome->>'id' WHERE id=review.id; END IF;
 END IF;
 RETURN outcome;
END $$;

-- Replaces only initial allocation after an explicit future cutover. Existing assignments stay intact.
CREATE OR REPLACE FUNCTION completar_perfil_guardado(user_id TEXT) RETURNS VOID LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;tid TEXT;
BEGIN
 SELECT * INTO u FROM usuario WHERE id=user_id FOR UPDATE;
 IF u.id IS NULL OR u.perfil_completo OR NOT datos_perfil_guardados_validos(user_id) OR NOT EXISTS(SELECT 1 FROM consentimiento WHERE id_usuario=user_id AND finalidad='perfil-y-evaluacion' AND version_aviso='apex-v1' AND revocado_en IS NULL) THEN RETURN; END IF;
 UPDATE usuario SET perfil_completo=true WHERE id=user_id;
 SELECT diagnostico INTO tid FROM configuracion_mvp WHERE id;
 IF u.rol='estudiante' THEN
  IF tid IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM estudiante e JOIN programa_componente pc ON pc.id_programa=e.id_programa WHERE e.id_usuario=user_id AND pc.id_componente='ingles') THEN
    INSERT INTO convocatoria_banco(id_estudiante,id_plantilla) VALUES(user_id,tid) ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING;
   END IF;
  ELSE
   INSERT INTO asignacion_evaluacion(id,id_estudiante,id_evaluacion)
   SELECT gen_random_uuid()::text,user_id,ev.id FROM evaluacion ev WHERE ev.publicada AND ev.tipo='diagnostico' AND ev.id_plantilla IS NULL
    AND EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=ev.id)
    AND NOT EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=ev.id AND NOT EXISTS(SELECT 1 FROM estudiante e JOIN programa_componente pc ON pc.id_programa=e.id_programa WHERE e.id_usuario=user_id AND pc.id_componente=ec.id_componente))
   ON CONFLICT(id_estudiante,id_evaluacion) DO NOTHING;
  END IF;
 END IF;
END $$;
CREATE FUNCTION registrar_avance(iid TEXT) RETURNS VOID LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE pl plantilla_evaluacion;r resultado;uid TEXT;threshold INTEGER;
BEGIN
 SELECT t.* INTO pl FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN evaluacion e ON e.id=a.id_evaluacion JOIN plantilla_evaluacion t ON t.id=e.id_plantilla WHERE i.id=iid;
 SELECT * INTO r FROM resultado WHERE id_intento=iid;
 SELECT a.id_estudiante INTO uid FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.id=iid;
 IF (pl.politica_exposicion='no_vistas_lru_bloques-v2' OR EXISTS(SELECT 1 FROM configuracion_mvp WHERE diagnostico IS NOT NULL)) AND pl.id IS NOT NULL AND r.id_intento IS NOT NULL THEN
  threshold:=CASE pl.tipo WHEN 'control' THEN 7 WHEN 'final' THEN 22 END;
  INSERT INTO decision_avance(id_intento,tipo,nivel,aciertos,total,umbral,aprobada) VALUES(iid,pl.tipo,pl.nivel,r.aciertos,r.total_preguntas,threshold,CASE WHEN threshold IS NULL THEN NULL ELSE r.aciertos>=threshold END) ON CONFLICT DO NOTHING;
 END IF;
 IF diagnostico_terminado(uid) THEN PERFORM solicitar_nivel(uid,1); END IF;
 IF pl.tipo='control' AND pl.nivel<3 AND control_aprobado(uid,pl.nivel) THEN PERFORM solicitar_nivel(uid,pl.nivel+1); END IF;
 IF control_aprobado(uid,3) THEN
  INSERT INTO convocatoria_banco(id_estudiante,id_plantilla) SELECT uid,id FROM plantilla_evaluacion WHERE id='apex-ingles-final-v2' AND habilitada ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.apex_assign_bank(student_ids TEXT[],template_id TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;pl plantilla_evaluacion;n INTEGER;
BEGIN
 u:=actor();IF u.rol<>'administrador' THEN RAISE EXCEPTION 'Solo administrador.' USING ERRCODE='42501'; END IF;
 SELECT * INTO pl FROM plantilla_evaluacion WHERE id=template_id;
 IF pl.id IS NULL OR NOT pl.habilitada THEN RAISE EXCEPTION 'Plantilla aún no habilitada.'; END IF;
 IF coalesce(cardinality(student_ids),0)=0 OR EXISTS(SELECT 1 FROM unnest(student_ids) sid WHERE sid IS NULL OR NOT EXISTS(SELECT 1 FROM estudiante e JOIN usuario us ON us.id=e.id_usuario JOIN programa_componente pc ON pc.id_programa=e.id_programa AND pc.id_componente='ingles' WHERE e.id_usuario=sid AND us.rol='estudiante' AND us.estado='activo' AND us.perfil_completo)) THEN RAISE EXCEPTION 'Estudiante o componente autorizado inválido.'; END IF;
 PERFORM 1 FROM estudiante WHERE id_usuario=ANY(student_ids) ORDER BY id_usuario FOR UPDATE;
 INSERT INTO convocatoria_banco(id_estudiante,id_plantilla) SELECT DISTINCT sid,template_id FROM unnest(student_ids) sid
 WHERE pl.tipo<>'diagnostico' OR (NOT EXISTS(SELECT 1 FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion JOIN evaluacion_componente ec ON ec.id_evaluacion=e.id WHERE a.id_estudiante=sid AND e.tipo='diagnostico' AND ec.id_componente='ingles') AND NOT EXISTS(SELECT 1 FROM convocatoria_banco c JOIN plantilla_evaluacion t ON t.id=c.id_plantilla WHERE c.id_estudiante=sid AND t.tipo='diagnostico'))
 ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN jsonb_build_object('assigned',n);
END $$;
ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_aprendizaje;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE data JSONB;u usuario;
BEGIN
 IF operation IN ('route_retry','section','section_complete','chat_open','chat_get','chat_send','review_complete') THEN RETURN aprender_operacion(operation,payload); END IF;
 IF operation='finish' THEN u:=actor();PERFORM 1 FROM estudiante WHERE id_usuario=u.id FOR UPDATE;END IF;
 data:=public.apex_api_pre_aprendizaje(operation,payload);
 IF operation='finish' THEN PERFORM registrar_avance(payload->>'attemptId'); RETURN resultado_json(payload->>'attemptId'); END IF;
 IF operation='me' THEN
  u:=actor();
  IF control_aprobado(u.id,3) THEN
   PERFORM 1 FROM estudiante WHERE id_usuario=u.id FOR UPDATE;
   INSERT INTO convocatoria_banco(id_estudiante,id_plantilla) SELECT u.id,id FROM plantilla_evaluacion WHERE id='apex-ingles-final-v2' AND habilitada
    AND NOT EXISTS(SELECT 1 FROM convocatoria_banco c JOIN plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=u.id AND p.tipo='final') ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING;
  END IF;
  data:=jsonb_set(data,'{assignments}',coalesce((SELECT jsonb_agg(row ORDER BY row->>'id') FROM (
   SELECT jsonb_build_object('id',a.id,'title',e.titulo,'version',e.version,'status',i.estado,'attemptId',i.id,'kind',coalesce(pl.tipo,e.tipo),'count',coalesce(pl.cantidad,(SELECT count(*) FROM item_evaluacion WHERE id_evaluacion=e.id)),'canRetry',coalesce(rv.completada_en IS NOT NULL AND rv.id_nuevo_intento IS NULL,false),'reviewRequired',coalesce(d.aprobada=false,false),'retryPolicy',CASE WHEN pl.tipo IN ('control','final') AND (pl.politica_exposicion='no_vistas_lru_bloques-v2' OR EXISTS(SELECT 1 FROM configuracion_mvp WHERE diagnostico IS NOT NULL)) THEN 'linked-review-v2' ELSE 'single-attempt-v1' END) row
    FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion LEFT JOIN plantilla_evaluacion pl ON pl.id=e.id_plantilla
    LEFT JOIN LATERAL (SELECT it.* FROM intento it LEFT JOIN intento_ruta ir ON ir.id_intento=it.id WHERE it.id_asignacion=a.id OR ir.id_convocatoria=a.id ORDER BY ir.numero DESC NULLS LAST,it.iniciado_en DESC,it.id DESC LIMIT 1) i ON true
    LEFT JOIN decision_avance d ON d.id_intento=i.id LEFT JOIN sesion_refuerzo rv ON rv.id_intento=i.id
    WHERE a.id_estudiante=u.id AND NOT EXISTS(SELECT 1 FROM intento_ruta ir JOIN intento it ON it.id=ir.id_intento WHERE it.id_asignacion=a.id AND ir.numero>1)
   UNION ALL SELECT jsonb_build_object('id',c.id,'title',pl.titulo,'version',pl.version,'status',NULL,'attemptId',NULL,'kind',pl.tipo,'count',pl.cantidad,'retryPolicy',CASE WHEN pl.tipo IN ('control','final') AND (pl.politica_exposicion='no_vistas_lru_bloques-v2' OR EXISTS(SELECT 1 FROM configuracion_mvp WHERE diagnostico IS NOT NULL)) THEN 'linked-review-v2' ELSE 'single-attempt-v1' END)
    FROM convocatoria_banco c JOIN plantilla_evaluacion pl ON pl.id=c.id_plantilla WHERE c.id_estudiante=u.id AND c.id_evaluacion IS NULL
  ) assignments),'[]'::jsonb));
 END IF;
 RETURN data;
END $$;
-- Snapshot results are decorated with a separate immutable v2 decision; old detail is never rewritten.
ALTER FUNCTION resultado_json(TEXT) RENAME TO resultado_json_pre_avance;
CREATE FUNCTION resultado_json(iid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT resultado_json_pre_avance(iid)||coalesce((SELECT jsonb_build_object('kind',tipo,'level',nivel,'passed',aprobada,'threshold',umbral,'advancementRule',regla,'reviewRequired',aprobada=false) FROM decision_avance WHERE id_intento=iid),'{}'::jsonb)
$$;
REVOKE ALL ON FUNCTION public.apex_api_pre_aprendizaje(TEXT,JSONB),public.apex_api(TEXT,JSONB),resultado_json_pre_avance(TEXT),resultado_json(TEXT),diagnostico_terminado(TEXT),control_aprobado(TEXT,INTEGER),nivel_habilitado(TEXT,INTEGER),control_habilitado(TEXT,INTEGER),seleccionar_forma(TEXT,TEXT,TEXT,TEXT,TEXT),registrar_avance(TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB) TO authenticated;
COMMIT;
