-- Additive preparation ONLY. No student, assignment, template, deadline or cron is enabled here.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;

-- This persistent marker is also the exclusion boundary after access is withdrawn.
CREATE TABLE prueba_reloj_tecnica (
 id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
 auth_estudiante UUID NOT NULL CHECK(auth_estudiante='d302e3f9-edcf-4cc7-a5ef-0a6c6adcdb70'),
 id_estudiante TEXT NOT NULL UNIQUE REFERENCES estudiante(id_usuario),
 id_convocatoria TEXT NOT NULL UNIQUE REFERENCES convocatoria_banco(id),
 habilitada BOOLEAN NOT NULL DEFAULT false,
 habilitada_en TIMESTAMPTZ NOT NULL DEFAULT now(),retirada_en TIMESTAMPTZ,
 CHECK(habilitada OR retirada_en IS NOT NULL)
);
ALTER TABLE prueba_reloj_tecnica ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON prueba_reloj_tecnica FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION proteger_prueba_tecnica() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(new)-ARRAY['habilitada','retirada_en']) IS DISTINCT FROM (to_jsonb(old)-ARRAY['habilitada','retirada_en'])
  OR old.retirada_en IS NOT NULL OR new.habilitada THEN RAISE EXCEPTION 'Conserva el marcador técnico; la retirada es definitiva para esta prueba.';END IF;
 RETURN new;
END $$;
CREATE TRIGGER prueba_tecnica_inmutable BEFORE UPDATE OR DELETE ON prueba_reloj_tecnica FOR EACH ROW EXECUTE FUNCTION proteger_prueba_tecnica();
CREATE FUNCTION asignacion_tecnica(aid TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM prueba_reloj_tecnica WHERE id_convocatoria=aid)
$$;
CREATE FUNCTION intento_tecnico(iid TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM intento WHERE id=iid AND asignacion_tecnica(id_asignacion))
$$;

-- Keep the existing snapshot trigger and selector, but do not write academic exposure.
CREATE FUNCTION aislar_exposicion_tecnica() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN IF intento_tecnico(new.id_intento) THEN RETURN NULL;END IF;RETURN new;END $$;
CREATE TRIGGER exposicion_tecnica BEFORE INSERT ON exposicion_pregunta FOR EACH ROW EXECUTE FUNCTION aislar_exposicion_tecnica();
-- Defensive guards: a future accidental caller cannot make these attempts academic.
CREATE FUNCTION rechazar_avance_tecnico() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF intento_tecnico(new.id_intento) OR (TG_TABLE_NAME='sesion_refuerzo' AND intento_tecnico(to_jsonb(new)->>'id_nuevo_intento')) THEN
  RAISE EXCEPTION 'La prueba técnica no admite avance, repaso ni vínculo a la ruta.';
 END IF;RETURN new;
END $$;
CREATE TRIGGER decision_tecnica BEFORE INSERT OR UPDATE ON decision_avance FOR EACH ROW EXECUTE FUNCTION rechazar_avance_tecnico();
CREATE TRIGGER ruta_tecnica BEFORE INSERT OR UPDATE ON intento_ruta FOR EACH ROW EXECUTE FUNCTION rechazar_avance_tecnico();
CREATE TRIGGER repaso_tecnico BEFORE INSERT OR UPDATE ON sesion_refuerzo FOR EACH ROW EXECUTE FUNCTION rechazar_avance_tecnico();
ALTER FUNCTION registrar_avance(TEXT) RENAME TO registrar_avance_pre_tecnica;
CREATE FUNCTION registrar_avance(iid TEXT) RETURNS VOID LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN IF intento_tecnico(iid) THEN RETURN;END IF;PERFORM registrar_avance_pre_tecnica(iid);END $$;

-- Same clock row, immutability guard, authorized save, grader and expiry processor.
-- Only the isolated assessment receives 900 seconds independently of the academic rollout flag.
CREATE OR REPLACE FUNCTION guardar_reloj_intento() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE kind TEXT;policy TEXT;duration INTEGER;
BEGIN
 SELECT coalesce(p.tipo,e.tipo) INTO kind FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion
 LEFT JOIN plantilla_evaluacion p ON p.id=e.id_plantilla WHERE a.id=new.id_asignacion;
 kind:=CASE WHEN kind IN ('diagnostico','control','final') THEN kind ELSE 'otro' END;
 IF asignacion_tecnica(new.id_asignacion) THEN
  IF kind<>'control' OR new.estado<>'activo' THEN RAISE EXCEPTION 'Instrumento técnico inconsistente.';END IF;
  policy:='total-apex-v1';duration:=900;
 ELSIF kind='diagnostico' THEN policy:='diagnostico-sin-limite-v1';
 ELSIF kind IN ('control','final') AND new.estado='activo' AND (SELECT activa FROM configuracion_reloj WHERE id) THEN
  policy:='total-apex-v1';duration:=CASE kind WHEN 'control' THEN 900 ELSE 2250 END;
 ELSE policy:='anterior-sin-limite-v1';END IF;
 INSERT INTO reloj_intento(id_intento,tipo,politica,iniciado_en,limite_segundos,vence_en)
 VALUES(new.id,kind,policy,new.iniciado_en,duration,CASE WHEN duration IS NOT NULL THEN new.iniciado_en+duration::bigint*1000 END);
 RETURN new;
END $$;

-- Filter the existing academic views without changing their columns or permissions.
CREATE OR REPLACE VIEW v_historial_academico WITH (security_invoker=true) AS
 SELECT a.id_estudiante,r.id_intento,r.calculado_en,r.aciertos,r.total_preguntas,r.version_regla,100.0*r.aciertos/r.total_preguntas AS porcentaje
 FROM resultado r JOIN intento i ON i.id=r.id_intento JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
 WHERE i.estado='finalizado' AND NOT asignacion_tecnica(a.id);
CREATE OR REPLACE VIEW v_progreso_nucleo WITH (security_invoker=true) AS
 SELECT a.id_estudiante,r.id_intento,p.id_nucleo AS categoria,n.nombre AS etiqueta,count(*) AS total,sum(CASE WHEN o.es_correcta=1 THEN 1 ELSE 0 END) AS aciertos
 FROM resultado r JOIN intento i ON i.id=r.id_intento JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion
 JOIN pregunta p ON p.id=it.id_pregunta JOIN nucleo_tematico n ON n.id=p.id_nucleo LEFT JOIN respuesta res ON res.id_intento=i.id AND res.id_item=it.id LEFT JOIN opcion_respuesta o ON o.id=res.id_opcion
 WHERE i.estado='finalizado' AND NOT asignacion_tecnica(a.id) GROUP BY a.id_estudiante,r.id_intento,p.id_nucleo,n.nombre;
CREATE OR REPLACE VIEW v_progreso_competencia WITH (security_invoker=true) AS
 SELECT a.id_estudiante,r.id_intento,p.id_competencia AS categoria,c.nombre AS etiqueta,count(*) AS total,sum(CASE WHEN o.es_correcta=1 THEN 1 ELSE 0 END) AS aciertos
 FROM resultado r JOIN intento i ON i.id=r.id_intento JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion
 JOIN pregunta p ON p.id=it.id_pregunta JOIN competencia c ON c.id=p.id_competencia LEFT JOIN respuesta res ON res.id_intento=i.id AND res.id_item=it.id LEFT JOIN opcion_respuesta o ON o.id=res.id_opcion
 WHERE i.estado='finalizado' AND NOT asignacion_tecnica(a.id) GROUP BY a.id_estudiante,r.id_intento,p.id_competencia,c.nombre;
CREATE OR REPLACE FUNCTION historial_json(uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT coalesce(jsonb_agg(resultado_json(i.id) ORDER BY i.finalizado_en,i.id),'[]'::jsonb) FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
 WHERE a.id_estudiante=uid AND i.estado='finalizado' AND NOT asignacion_tecnica(a.id)
$$;
CREATE OR REPLACE FUNCTION historial_ingles_json(uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT coalesce(jsonb_agg(resultado_json(i.id) ORDER BY i.finalizado_en,i.id),'[]'::jsonb) FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
 WHERE a.id_estudiante=uid AND i.estado='finalizado' AND NOT asignacion_tecnica(a.id)
 AND EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=a.id_evaluacion AND ec.id_componente='ingles')
$$;
CREATE OR REPLACE FUNCTION ingles_con_historial(uid TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion JOIN evaluacion_componente ec ON ec.id_evaluacion=e.id
 WHERE a.id_estudiante=uid AND ec.id_componente='ingles' AND NOT asignacion_tecnica(a.id)
 AND (e.tipo='diagnostico' OR EXISTS(SELECT 1 FROM intento i WHERE i.id_asignacion=a.id)))
 OR EXISTS(SELECT 1 FROM convocatoria_banco c JOIN plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=uid AND p.tipo='diagnostico')
$$;
-- AI assessmentResults already use historial_ingles_json; diagnostics only read diagnostic instruments.
-- Ignore technical active attempts when constructing the permitted educational references.
CREATE OR REPLACE FUNCTION fuentes_ia(uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('fragmentId',d.id,'sourceId',f.id,'title',f.titulo,'page',d.pagina,'text',d.texto,'sha256',f.sha256,'edition',f.referencia_edicion,'url',f.url_origen) ORDER BY f.id,d.pagina,d.ordinal),'[]'::jsonb)
 FROM fragmento_documental d JOIN fuente f ON f.id=d.id_fuente
 WHERE f.estado='revisado' AND NOT f.contiene_soluciones AND f.contexto_tutor_permitido AND d.revisado AND d.uso_contexto AND d.tipo_contenido='documental'
 AND NOT EXISTS(SELECT 1 FROM pregunta p WHERE p.id_fuente=f.id AND p.pagina_clave=d.pagina)
 AND NOT EXISTS(SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion JOIN pregunta p ON p.id=it.id_pregunta
  WHERE a.id_estudiante=uid AND i.estado='activo' AND NOT asignacion_tecnica(a.id) AND p.id_fuente=f.id)
 AND EXISTS(SELECT 1 FROM material_estudio m JOIN material_nucleo mn ON mn.id_material=m.id JOIN nucleo_tematico n ON n.id=mn.id_nucleo JOIN programa_componente pc ON pc.id_componente=n.id_componente JOIN estudiante e ON e.id_programa=pc.id_programa WHERE e.id_usuario=uid AND m.id_fuente=f.id AND m.publicado AND n.id_componente='ingles')
$$;

ALTER FUNCTION resultado_json(TEXT) RENAME TO resultado_json_pre_tecnica;
CREATE FUNCTION resultado_json(iid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT resultado_json_pre_tecnica(iid)||CASE WHEN intento_tecnico(iid) THEN
 jsonb_build_object('technical',true,'title','Prueba técnica del reloj — no afecta tu progreso','kind','control','level',NULL,'passed',NULL,'threshold',NULL,'reviewRequired',false,'componentIds','[]'::jsonb)
 ELSE '{}'::jsonb END
$$;
ALTER FUNCTION intento_json(TEXT) RENAME TO intento_json_pre_tecnica;
CREATE FUNCTION intento_json(iid TEXT) RETURNS JSONB LANGUAGE sql VOLATILE SET search_path=apex_private,pg_catalog AS $$
 SELECT intento_json_pre_tecnica(iid)||CASE WHEN intento_tecnico(iid) THEN jsonb_build_object('technical',true,'title','Prueba técnica del reloj — no afecta tu progreso') ELSE '{}'::jsonb END
$$;
CREATE FUNCTION prueba_tecnica_json(uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('id',t.id_convocatoria,'title','Prueba técnica del reloj — no afecta tu progreso','technical',true,'version',1,'kind','control','count',10,
 'status',i.estado,'attemptId',i.id,'timePolicy','total-apex-v1','durationSeconds',900,'retryPolicy','single-attempt-v1','canRetry',false,
 'result',CASE WHEN i.estado='finalizado' THEN resultado_json(i.id) END)
 FROM prueba_reloj_tecnica t JOIN usuario u ON u.id=t.id_estudiante LEFT JOIN intento i ON i.id_asignacion=t.id_convocatoria
 WHERE t.id_estudiante=uid AND u.auth_user_id=auth.uid() AND auth.uid()=t.auth_estudiante AND u.rol='estudiante' AND t.habilitada
$$;

-- Selection adapter only: all questions/snapshots/save/grading remain in the real pipeline.
CREATE FUNCTION iniciar_prueba_tecnica(payload JSONB) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;t prueba_reloj_tecnica;i intento;outcome JSONB;
BEGIN
 u:=actor();PERFORM 1 FROM estudiante WHERE id_usuario=u.id FOR UPDATE;
 SELECT * INTO t FROM prueba_reloj_tecnica WHERE id_estudiante=u.id AND habilitada FOR UPDATE;
 IF t.id IS NULL OR u.rol<>'estudiante' OR u.auth_user_id IS DISTINCT FROM t.auth_estudiante OR auth.uid() IS DISTINCT FROM t.auth_estudiante
  OR payload->>'assignmentId' IS DISTINCT FROM t.id_convocatoria THEN RAISE EXCEPTION 'Evaluación no autorizada.' USING ERRCODE='42501';END IF;
 IF NOT u.perfil_completo OR NOT datos_perfil_guardados_validos(u.id) THEN RAISE EXCEPTION 'Completa tu perfil de estudiante.' USING ERRCODE='42501';END IF;
 IF (payload->>'confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirma las condiciones.';END IF;
 SELECT * INTO i FROM intento WHERE id_asignacion=t.id_convocatoria FOR UPDATE;
 IF payload ? 'resumeAttemptId' AND (i.id IS NULL OR payload->>'resumeAttemptId' IS DISTINCT FROM i.id) THEN RAISE EXCEPTION 'Intento no autorizado.' USING ERRCODE='42501';END IF;
 IF i.id IS NOT NULL THEN
  PERFORM cerrar_vencidos_estudiante(u.id,100);
  SELECT * INTO i FROM intento WHERE id=i.id;
  IF i.estado='activo' THEN
   UPDATE intento SET ultima_actividad=epoch_ms() WHERE id=i.id;
   UPDATE sesion_actividad SET ultima_actividad=now(),ambito='exam' WHERE id=(auth.jwt()->>'session_id')::uuid;
  END IF;
  RETURN intento_json(i.id);
 END IF;
 IF EXISTS(SELECT 1 FROM intento it JOIN asignacion_evaluacion a ON a.id=it.id_asignacion WHERE a.id_estudiante=u.id AND it.estado='activo') THEN
  RAISE EXCEPTION 'Hay otro intento activo. Conserva y resuelve ese intento por su flujo normal antes de iniciar la prueba técnica.';
 END IF;
 outcome:=seleccionar_forma(u.id,'apex-clock-technical-v1',t.id_convocatoria,t.id_convocatoria,'no_vistas_lru_bloques-v2');
 IF NOT outcome ? 'error' THEN UPDATE convocatoria_banco SET id_evaluacion=(SELECT id_evaluacion FROM asignacion_evaluacion WHERE id=t.id_convocatoria) WHERE id=t.id_convocatoria;END IF;
 RETURN outcome;
END $$;

-- No staff/student can use the ordinary assignment endpoint to allocate this template.
ALTER FUNCTION public.apex_assign_bank(TEXT[],TEXT) RENAME TO apex_assign_bank_pre_tecnica;
CREATE FUNCTION public.apex_assign_bank(student_ids TEXT[],template_id TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF template_id='apex-clock-technical-v1' THEN RAISE EXCEPTION 'La habilitación técnica requiere el procedimiento explícito del propietario.' USING ERRCODE='42501';END IF;
 RETURN public.apex_assign_bank_pre_tecnica(student_ids,template_id);
END $$;
ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_tecnica;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;t prueba_reloj_tecnica;data JSONB;is_technical BOOLEAN;
BEGIN
 u:=actor();
 is_technical:=asignacion_tecnica(payload->>'assignmentId') OR intento_tecnico(payload->>'attemptId') OR intento_tecnico(payload->>'resumeAttemptId');
 IF is_technical OR operation='technical_status' THEN
  PERFORM 1 FROM estudiante WHERE id_usuario=u.id FOR UPDATE;
  SELECT * INTO t FROM prueba_reloj_tecnica WHERE id FOR UPDATE;
  IF t.id IS NULL OR auth.uid() IS DISTINCT FROM t.auth_estudiante OR u.auth_user_id IS DISTINCT FROM t.auth_estudiante OR u.id IS DISTINCT FROM t.id_estudiante OR u.rol<>'estudiante' THEN
   RAISE EXCEPTION 'Evaluación no autorizada.' USING ERRCODE='42501';
  END IF;
  IF NOT t.habilitada THEN RETURN jsonb_build_object('error',jsonb_build_object('code','TECHNICAL_ACCESS_REVOKED','message','La prueba técnica ha sido retirada. Su evidencia permanece guardada.'));END IF;
  IF operation='technical_status' THEN RETURN prueba_tecnica_json(u.id);END IF;
  IF operation='start' THEN RETURN iniciar_prueba_tecnica(payload);END IF;
  IF operation NOT IN ('attempt','attempt_clock','answer','finish') THEN RAISE EXCEPTION 'Operación técnica no autorizada.' USING ERRCODE='42501';END IF;
 END IF;
 data:=public.apex_api_pre_tecnica(operation,payload);
 IF operation='me' THEN
  data:=jsonb_set(data,'{assignments}',coalesce((SELECT jsonb_agg(item ORDER BY ord) FROM jsonb_array_elements(data->'assignments') WITH ORDINALITY entries(item,ord) WHERE NOT asignacion_tecnica(item->>'id')),'[]'::jsonb));
  data:=jsonb_set(data,'{attempt}',coalesce((SELECT jsonb_build_object('id',i.id,'status',i.estado) FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id_estudiante=u.id AND NOT asignacion_tecnica(a.id) ORDER BY i.iniciado_en DESC,i.id DESC LIMIT 1),'null'::jsonb));
  data:=data||jsonb_build_object('technicalAssessment',prueba_tecnica_json(u.id));
 END IF;
 RETURN data;
END $$;
REVOKE ALL ON FUNCTION proteger_prueba_tecnica(),asignacion_tecnica(TEXT),intento_tecnico(TEXT),aislar_exposicion_tecnica(),rechazar_avance_tecnico(),registrar_avance_pre_tecnica(TEXT),registrar_avance(TEXT),guardar_reloj_intento(),resultado_json_pre_tecnica(TEXT),resultado_json(TEXT),intento_json_pre_tecnica(TEXT),intento_json(TEXT),prueba_tecnica_json(TEXT),iniciar_prueba_tecnica(JSONB),public.apex_assign_bank_pre_tecnica(TEXT[],TEXT),public.apex_api_pre_tecnica(TEXT,JSONB),public.apex_assign_bank(TEXT[],TEXT),public.apex_api(TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB),public.apex_assign_bank(TEXT[],TEXT) TO authenticated;
COMMIT;
