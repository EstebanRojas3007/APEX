-- Data/validation contract only. No n8n/Gemini connection, lessons, thresholds or completions seeded.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
CREATE TABLE regla_ruta_version (
 id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0),
 transiciones_nivel JSONB NOT NULL CHECK(jsonb_typeof(transiciones_nivel)='array'),
 permite_refuerzo BOOLEAN NOT NULL, aprobacion JSONB NOT NULL CHECK((aprobacion->>'authority'='responsable del proyecto') IS TRUE)
);
CREATE TABLE leccion_version (
 id TEXT PRIMARY KEY, codigo TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
 titulo TEXT NOT NULL, nivel INTEGER NOT NULL CHECK(nivel BETWEEN 1 AND 3),
 id_competencia TEXT NOT NULL REFERENCES competencia(id), objetivo TEXT NOT NULL CHECK(length(trim(objetivo))>0),
 explicacion TEXT NOT NULL CHECK(length(trim(explicacion))>0), ejemplos JSONB NOT NULL CHECK(jsonb_typeof(ejemplos)='array' AND jsonb_array_length(ejemplos)>0),
 practica_propia JSONB NOT NULL CHECK(jsonb_typeof(practica_propia)='array' AND jsonb_array_length(practica_propia)>0),
 referencias JSONB NOT NULL CHECK(jsonb_typeof(referencias)='array' AND jsonb_array_length(referencias)>0),
 prerrequisitos TEXT[] NOT NULL DEFAULT '{}', procedencia TEXT NOT NULL CHECK(procedencia='propia_apex'),
 aprobada BOOLEAN NOT NULL DEFAULT false, aprobacion JSONB,
 UNIQUE(codigo,version), CHECK(NOT aprobada OR (aprobacion->>'authority'='responsable del proyecto') IS TRUE)
);
CREATE TABLE progreso_leccion (
 id_estudiante TEXT REFERENCES estudiante(id_usuario), id_leccion TEXT REFERENCES leccion_version(id),
 completada_en TIMESTAMPTZ NOT NULL, id_regla TEXT NOT NULL REFERENCES regla_ruta_version(id),
 evidencia JSONB NOT NULL CHECK(jsonb_typeof(evidencia)='object' AND evidencia<>'{}'::jsonb),
 PRIMARY KEY(id_estudiante,id_leccion)
);
CREATE TABLE solicitud_ruta (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), id_estudiante TEXT NOT NULL REFERENCES estudiante(id_usuario),
 contexto JSONB NOT NULL, creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ruta_version (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), id_estudiante TEXT NOT NULL REFERENCES estudiante(id_usuario),
 version INTEGER NOT NULL CHECK(version>0), id_anterior UUID REFERENCES ruta_version(id),
 id_solicitud UUID NOT NULL UNIQUE REFERENCES solicitud_ruta(id), id_regla TEXT NOT NULL REFERENCES regla_ruta_version(id),
 propuesta JSONB NOT NULL, creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 estado TEXT NOT NULL DEFAULT 'validada_pendiente_conexion' CHECK(estado='validada_pendiente_conexion'), UNIQUE(id_estudiante,version)
);
CREATE TABLE paso_ruta (
 id_ruta UUID REFERENCES ruta_version(id), orden INTEGER NOT NULL CHECK(orden>0),
 id_leccion TEXT NOT NULL REFERENCES leccion_version(id), tipo TEXT NOT NULL CHECK(tipo IN ('lesson','reinforcement')),
 motivo TEXT NOT NULL CHECK(length(trim(motivo))>0), prerrequisitos TEXT[] NOT NULL,
 PRIMARY KEY(id_ruta,orden), UNIQUE(id_ruta,id_leccion)
);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['regla_ruta_version','leccion_version','progreso_leccion','solicitud_ruta','ruta_version','paso_ruta'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
CREATE TRIGGER regla_ruta_inmutable BEFORE UPDATE OR DELETE ON regla_ruta_version FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE TRIGGER progreso_leccion_inmutable BEFORE UPDATE OR DELETE ON progreso_leccion FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE TRIGGER solicitud_ruta_inmutable BEFORE UPDATE OR DELETE ON solicitud_ruta FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE TRIGGER ruta_version_inmutable BEFORE UPDATE OR DELETE ON ruta_version FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE TRIGGER paso_ruta_inmutable BEFORE UPDATE OR DELETE ON paso_ruta FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE FUNCTION validar_leccion_propia() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE ref JSONB;
BEGIN
 IF TG_OP<>'INSERT' AND old.aprobada THEN RAISE EXCEPTION 'Lección aprobada inmutable: crea otra versión.'; END IF;
 IF TG_OP='DELETE' THEN RETURN old; END IF;
 IF NOT EXISTS(SELECT 1 FROM competencia WHERE id=new.id_competencia AND id_componente='ingles') THEN RAISE EXCEPTION 'Habilidad no autorizada.'; END IF;
 IF new.aprobada THEN
  IF new.aprobacion IS NULL OR new.aprobacion->>'authority' IS DISTINCT FROM 'responsable del proyecto' THEN RAISE EXCEPTION 'Falta aprobación interna.'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(new.prerrequisitos) p WHERE p=new.id OR NOT EXISTS(SELECT 1 FROM leccion_version WHERE id=p AND aprobada)) OR cardinality(new.prerrequisitos)<>(SELECT count(DISTINCT p) FROM unnest(new.prerrequisitos) p) THEN RAISE EXCEPTION 'Prerrequisitos no autorizados o repetidos.'; END IF;
  FOR ref IN SELECT value FROM jsonb_array_elements(new.referencias) LOOP
   IF (ref-'sourceId'-'page')<>'{}'::jsonb OR NOT EXISTS(SELECT 1 FROM fuente WHERE id=ref->>'sourceId' AND estado='revisado' AND NOT contiene_soluciones AND contexto_tutor_permitido AND (ref->>'page')::integer BETWEEN 1 AND paginas) THEN RAISE EXCEPTION 'Referencia didáctica no autorizada; el banco con soluciones está excluido.'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(new.ejemplos||new.practica_propia) e WHERE jsonb_typeof(e)<>'object' OR (e-'prompt'-'response'-'explanation')<>'{}'::jsonb OR coalesce(length(trim(e->>'prompt')),0)=0 OR coalesce(length(trim(e->>'response')),0)=0 OR coalesce(length(trim(e->>'explanation')),0)=0
   OR EXISTS(SELECT 1 FROM pregunta p JOIN carga_banco b ON b.id_fuente=p.id_fuente WHERE p.enunciado=e->>'prompt' OR p.id=e->>'prompt')) THEN RAISE EXCEPTION 'Se requiere práctica propia, separada del banco.'; END IF;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER validar_leccion_propia BEFORE INSERT OR UPDATE OR DELETE ON leccion_version FOR EACH ROW EXECUTE FUNCTION validar_leccion_propia();

CREATE FUNCTION historial_ingles_json(uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT coalesce(jsonb_agg(resultado_json(i.id) ORDER BY i.finalizado_en,i.id),'[]'::jsonb) FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
 WHERE a.id_estudiante=uid AND i.estado='finalizado' AND EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=a.id_evaluacion AND ec.id_componente='ingles')
$$;
CREATE FUNCTION contexto_ruta(uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('contractVersion',1,'baseVersion',coalesce((SELECT max(version) FROM ruta_version WHERE id_estudiante=uid),0),
 'diagnosticBySkill',coalesce((SELECT jsonb_agg(row ORDER BY row->>'skillId') FROM (
  SELECT jsonb_build_object('skillId',p.id_competencia,'skill',c.nombre,'correct',count(*) FILTER(WHERE o.es_correcta=1),'total',count(*)) row
  FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN evaluacion ev ON ev.id=a.id_evaluacion JOIN item_evaluacion it ON it.id_evaluacion=ev.id JOIN pregunta p ON p.id=it.id_pregunta JOIN competencia c ON c.id=p.id_competencia LEFT JOIN respuesta r ON r.id_intento=i.id AND r.id_item=it.id LEFT JOIN opcion_respuesta o ON o.id=r.id_opcion
  WHERE a.id_estudiante=uid AND i.estado='finalizado' AND ev.tipo='diagnostico' AND c.id_componente='ingles' GROUP BY p.id_competencia,c.nombre
 ) skills),'[]'::jsonb),
 'catalog',coalesce((SELECT jsonb_agg(jsonb_build_object('lessonVersionId',l.id,'code',l.codigo,'version',l.version,'title',l.titulo,'level',l.nivel,'skillId',l.id_competencia,'objective',l.objetivo,'prerequisites',to_jsonb(l.prerrequisitos)) ORDER BY l.id) FROM leccion_version l WHERE l.aprobada),'[]'::jsonb),
 'progress',jsonb_build_object('completedLessons',coalesce((SELECT jsonb_agg(jsonb_build_object('lessonVersionId',id_leccion,'completedAt',completada_en,'ruleVersionId',id_regla) ORDER BY id_leccion) FROM progreso_leccion WHERE id_estudiante=uid),'[]'::jsonb),'assessmentResults',historial_ingles_json(uid)),
 'rules',coalesce((SELECT jsonb_agg(jsonb_build_object('ruleVersionId',id,'version',version,'allowedLevelTransitions',transiciones_nivel,'allowReinforcement',permite_refuerzo) ORDER BY id) FROM regla_ruta_version),'[]'::jsonb))
$$;
-- Future backend only. Credentials, PII, questions, options, justifications and PDF never enter this contract.
CREATE FUNCTION public.apex_route_agent_context(student_id TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE request_id UUID; ctx JSONB;
BEGIN
 PERFORM 1 FROM estudiante e JOIN usuario u ON u.id=e.id_usuario JOIN programa_componente pc ON pc.id_programa=e.id_programa AND pc.id_componente='ingles' WHERE e.id_usuario=student_id AND u.rol='estudiante' AND u.estado='activo' AND u.perfil_completo FOR UPDATE OF e;
 IF NOT FOUND THEN RAISE EXCEPTION 'Estudiante no autorizado.'; END IF;
 ctx:=contexto_ruta(student_id);
 INSERT INTO solicitud_ruta(id_estudiante,contexto) VALUES(student_id,ctx) RETURNING id INTO request_id;
 RETURN jsonb_build_object('contextId',request_id,'input',ctx);
END $$;
CREATE FUNCTION public.apex_save_route_proposal(proposal JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE req solicitud_ruta; rule regla_ruta_version; previous ruta_version; existing ruta_version; route_id UUID;
 step JSONB; lesson leccion_version; processed TEXT[]:='{}'; required TEXT[]; ord INTEGER:=0; last_level INTEGER; item RECORD;
BEGIN
 IF jsonb_typeof(proposal) IS DISTINCT FROM 'object' OR (proposal-'contractVersion'-'contextId'-'baseVersion'-'ruleVersionId'-'reason'-'agent'-'steps')<>'{}'::jsonb OR (proposal->>'contractVersion')::integer IS DISTINCT FROM 1
  OR coalesce(length(trim(proposal->>'reason')),0)=0 OR jsonb_typeof(proposal->'agent') IS DISTINCT FROM 'object' OR ((proposal->'agent')-'provider'-'model'-'promptVersion')<>'{}'::jsonb
  OR coalesce(length(proposal->'agent'->>'provider'),0)=0 OR coalesce(length(proposal->'agent'->>'model'),0)=0 OR coalesce(length(proposal->'agent'->>'promptVersion'),0)=0
  OR jsonb_typeof(proposal->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(proposal->'steps')=0 THEN RAISE EXCEPTION 'Contrato de ruta inválido.'; END IF;
 SELECT * INTO req FROM solicitud_ruta WHERE id=(proposal->>'contextId')::uuid;
 IF req.id IS NULL THEN RAISE EXCEPTION 'Contexto de ruta no autorizado.'; END IF;
 PERFORM 1 FROM estudiante WHERE id_usuario=req.id_estudiante FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM usuario u JOIN estudiante e ON e.id_usuario=u.id JOIN programa_componente pc ON pc.id_programa=e.id_programa AND pc.id_componente='ingles' WHERE u.id=req.id_estudiante AND u.rol='estudiante' AND u.estado='activo' AND u.perfil_completo) THEN RAISE EXCEPTION 'Estudiante no autorizado.'; END IF;
 SELECT * INTO existing FROM ruta_version WHERE id_solicitud=req.id;
 IF existing.id IS NOT NULL THEN
  IF existing.propuesta<>proposal THEN RAISE EXCEPTION 'La solicitud ya tiene una propuesta diferente.'; END IF;
  RETURN jsonb_build_object('routeId',existing.id,'version',existing.version,'status',existing.estado);
 END IF;
 SELECT * INTO previous FROM ruta_version WHERE id_estudiante=req.id_estudiante ORDER BY version DESC LIMIT 1;
 IF (proposal->>'baseVersion')::integer IS DISTINCT FROM coalesce(previous.version,0) OR req.contexto<>contexto_ruta(req.id_estudiante) THEN RAISE EXCEPTION 'Contexto o versión desactualizados; genera una nueva propuesta.'; END IF;
 SELECT * INTO rule FROM regla_ruta_version WHERE id=proposal->>'ruleVersionId';
 IF rule.id IS NULL THEN RAISE EXCEPTION 'Reglas pedagógicas aún no aprobadas.'; END IF;
 FOR step IN SELECT value FROM jsonb_array_elements(proposal->'steps') LOOP
  ord:=ord+1;
  IF jsonb_typeof(step) IS DISTINCT FROM 'object' OR (step-'lessonVersionId'-'order'-'prerequisites'-'kind'-'reason')<>'{}'::jsonb OR (step->>'order')::integer IS DISTINCT FROM ord OR coalesce(step->>'kind','') NOT IN ('lesson','reinforcement') OR coalesce(length(trim(step->>'reason')),0)=0 OR jsonb_typeof(step->'prerequisites') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Paso de ruta inválido.'; END IF;
  SELECT * INTO lesson FROM leccion_version WHERE id=step->>'lessonVersionId' AND aprobada;
  IF lesson.id IS NULL OR lesson.id=ANY(processed) THEN RAISE EXCEPTION 'Contenido no autorizado o repetido.'; END IF;
  SELECT coalesce(array_agg(value ORDER BY value),'{}') INTO required FROM jsonb_array_elements_text(step->'prerequisites');
  IF required IS DISTINCT FROM ARRAY(SELECT p FROM unnest(lesson.prerrequisitos) p ORDER BY p) THEN RAISE EXCEPTION 'Prerrequisitos del contrato no coinciden con el catálogo.'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(lesson.prerrequisitos) p WHERE NOT p=ANY(processed) AND NOT EXISTS(SELECT 1 FROM progreso_leccion WHERE id_estudiante=req.id_estudiante AND id_leccion=p)) THEN RAISE EXCEPTION 'Orden de prerrequisitos inválido.'; END IF;
  IF last_level IS NOT NULL AND NOT rule.transiciones_nivel @> jsonb_build_array(jsonb_build_array(last_level,lesson.nivel)) THEN RAISE EXCEPTION 'Transición pedagógica no autorizada.'; END IF;
  IF step->>'kind'='reinforcement' AND NOT rule.permite_refuerzo THEN RAISE EXCEPTION 'Refuerzo no autorizado por la regla.'; END IF;
  IF step->>'kind'='lesson' AND EXISTS(SELECT 1 FROM progreso_leccion WHERE id_estudiante=req.id_estudiante AND id_leccion=lesson.id) THEN RAISE EXCEPTION 'Conserva lo realizado; indica refuerzo para una lección completada.'; END IF;
  processed:=processed||lesson.id;last_level:=lesson.nivel;
 END LOOP;
 INSERT INTO ruta_version(id_estudiante,version,id_anterior,id_solicitud,id_regla,propuesta) VALUES(req.id_estudiante,coalesce(previous.version,0)+1,previous.id,req.id,rule.id,proposal) RETURNING id INTO route_id;
 FOR step IN SELECT value FROM jsonb_array_elements(proposal->'steps') LOOP
  INSERT INTO paso_ruta VALUES(route_id,(step->>'order')::integer,step->>'lessonVersionId',step->>'kind',step->>'reason',ARRAY(SELECT value FROM jsonb_array_elements_text(step->'prerequisites')));
 END LOOP;
 -- Completed work survives each route, including lessons omitted from the new proposal.
 RETURN jsonb_build_object('routeId',route_id,'version',coalesce(previous.version,0)+1,'status','validada_pendiente_conexion');
END $$;
CREATE FUNCTION public.apex_my_route() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;
BEGIN
 u:=actor(); IF u.rol<>'estudiante' THEN RAISE EXCEPTION 'Solo estudiante.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('status','pending','message','generación de ruta pendiente','integrationConnected',false,
 'validatedVersion',coalesce((SELECT max(version) FROM ruta_version WHERE id_estudiante=u.id),0),
 'completedLessons',coalesce((SELECT jsonb_agg(id_leccion ORDER BY id_leccion) FROM progreso_leccion WHERE id_estudiante=u.id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION validar_leccion_propia(),historial_ingles_json(TEXT),contexto_ruta(TEXT),public.apex_route_agent_context(TEXT),public.apex_save_route_proposal(JSONB),public.apex_my_route() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_my_route() TO authenticated;
-- service_role is a server credential; never place it in Expo. No invocation/deployment here.
GRANT EXECUTE ON FUNCTION public.apex_route_agent_context(TEXT),public.apex_save_route_proposal(JSONB) TO service_role;
COMMIT;
