-- Additive correction. Does not activate templates, change configuration or backfill users.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;

CREATE FUNCTION ingles_con_historial(uid TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT EXISTS(
  SELECT 1 FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion JOIN evaluacion_componente ec ON ec.id_evaluacion=e.id
  WHERE a.id_estudiante=uid AND ec.id_componente='ingles'
   AND (e.tipo='diagnostico' OR EXISTS(SELECT 1 FROM intento i WHERE i.id_asignacion=a.id))
 ) OR EXISTS(
  SELECT 1 FROM convocatoria_banco c JOIN plantilla_evaluacion p ON p.id=c.id_plantilla
  WHERE c.id_estudiante=uid AND p.tipo='diagnostico'
 )
$$;

CREATE FUNCTION estado_diagnostico(uid TEXT) RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;tid TEXT;code TEXT;message TEXT;
BEGIN
 SELECT * INTO u FROM usuario WHERE id=uid;
 SELECT diagnostico INTO tid FROM configuracion_mvp WHERE id;
 IF u.rol<>'estudiante' THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM convocatoria_banco c JOIN plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=uid AND p.tipo='diagnostico')
  OR EXISTS(SELECT 1 FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion JOIN evaluacion_componente ec ON ec.id_evaluacion=e.id WHERE a.id_estudiante=uid AND e.tipo='diagnostico' AND ec.id_componente='ingles') THEN
  code:='assigned';message:='Tu diagnóstico de Inglés y su historial están disponibles en tus evaluaciones.';
 ELSIF ingles_con_historial(uid) THEN
  code:='english_history';message:='Tienes historial de Inglés. Se conserva y no se te asignará otro diagnóstico. Solicita revisión de tu ruta al administrador.';
 ELSIF NOT u.perfil_completo OR NOT datos_perfil_guardados_validos(uid) THEN
  code:='profile_pending';message:='Completa los datos guardados de tu perfil y acepta el aviso para habilitar el diagnóstico.';
 ELSIF NOT EXISTS(SELECT 1 FROM estudiante e JOIN programa_componente pc ON pc.id_programa=e.id_programa WHERE e.id_usuario=uid AND pc.id_componente='ingles') THEN
  code:='program_not_authorized';message:='Inglés aún no está autorizado para tu programa. Solicita revisión al administrador.';
 ELSIF tid IS NULL THEN
  code:='not_activated';message:='El diagnóstico de Inglés aún no está activado. Solicita revisión al administrador.';
 ELSIF NOT EXISTS(SELECT 1 FROM plantilla_evaluacion p JOIN carga_banco b ON b.id_fuente=p.id_fuente WHERE p.id=tid AND p.tipo='diagnostico' AND p.cantidad=7 AND p.habilitada) THEN
  code:='template_unavailable';message:='El diagnóstico configurado aún no está disponible. Solicita revisión al administrador.';
 ELSE
  code:='needs_transition';message:='Tu perfil está completo, pero falta la asignación del diagnóstico de Inglés. Solicita al administrador la transición de tu cuenta; editar el perfil no la crea.';
 END IF;
 RETURN jsonb_build_object('code',code,'message',message);
END $$;

CREATE OR REPLACE FUNCTION completar_perfil_guardado(user_id TEXT) RETURNS VOID LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;tid TEXT;
BEGIN
 SELECT * INTO u FROM usuario WHERE id=user_id FOR UPDATE;
 IF u.id IS NULL OR u.perfil_completo OR NOT datos_perfil_guardados_validos(user_id) OR NOT EXISTS(SELECT 1 FROM consentimiento WHERE id_usuario=user_id AND finalidad='perfil-y-evaluacion' AND version_aviso='apex-v1' AND revocado_en IS NULL) THEN RETURN; END IF;
 UPDATE usuario SET perfil_completo=true WHERE id=user_id;
 SELECT diagnostico INTO tid FROM configuracion_mvp WHERE id;
 IF u.rol='estudiante' THEN
  IF tid IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM estudiante e JOIN programa_componente pc ON pc.id_programa=e.id_programa WHERE e.id_usuario=user_id AND pc.id_componente='ingles')
    AND EXISTS(SELECT 1 FROM plantilla_evaluacion p JOIN carga_banco b ON b.id_fuente=p.id_fuente WHERE p.id=tid AND p.tipo='diagnostico' AND p.cantidad=7 AND p.habilitada)
    AND NOT ingles_con_historial(user_id) THEN
    INSERT INTO convocatoria_banco(id_estudiante,id_plantilla) VALUES(user_id,tid) ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING;
   END IF;
  ELSE
   -- Preserve initial legacy allocation before the explicit cutover.
   INSERT INTO asignacion_evaluacion(id,id_estudiante,id_evaluacion)
   SELECT gen_random_uuid()::text,user_id,ev.id FROM evaluacion ev WHERE ev.publicada AND ev.tipo='diagnostico' AND ev.id_plantilla IS NULL
    AND EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=ev.id)
    AND NOT EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=ev.id AND NOT EXISTS(SELECT 1 FROM estudiante e JOIN programa_componente pc ON pc.id_programa=e.id_programa WHERE e.id_usuario=user_id AND pc.id_componente=ec.id_componente))
    AND (NOT EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=ev.id AND ec.id_componente='ingles') OR NOT ingles_con_historial(user_id))
   ON CONFLICT(id_estudiante,id_evaluacion) DO NOTHING;
  END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apex_transition_diagnostic(student_ids TEXT[]) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;tid TEXT;n INTEGER;
BEGIN
 u:=actor();IF u.rol<>'administrador' THEN RAISE EXCEPTION 'Solo administrador.' USING ERRCODE='42501'; END IF;
 SELECT diagnostico INTO tid FROM configuracion_mvp WHERE id;
 IF tid IS NULL OR NOT EXISTS(SELECT 1 FROM plantilla_evaluacion p JOIN carga_banco b ON b.id_fuente=p.id_fuente WHERE p.id=tid AND p.habilitada AND p.tipo='diagnostico' AND p.cantidad=7) THEN RAISE EXCEPTION 'Transición aún no habilitada.'; END IF;
 IF coalesce(cardinality(student_ids),0)=0 OR EXISTS(SELECT 1 FROM unnest(student_ids) sid WHERE sid IS NULL OR NOT EXISTS(SELECT 1 FROM usuario us JOIN estudiante e ON e.id_usuario=us.id JOIN programa_componente pc ON pc.id_programa=e.id_programa WHERE us.id=sid AND us.estado='activo' AND us.rol='estudiante' AND us.perfil_completo AND datos_perfil_guardados_validos(us.id) AND pc.id_componente='ingles')) THEN RAISE EXCEPTION 'Destinatarios inválidos.'; END IF;
 PERFORM 1 FROM estudiante WHERE id_usuario=ANY(student_ids) ORDER BY id_usuario FOR UPDATE;
 INSERT INTO convocatoria_banco(id_estudiante,id_plantilla) SELECT DISTINCT sid,tid FROM unnest(student_ids) sid WHERE NOT ingles_con_historial(sid) ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN jsonb_build_object('assigned',n,'requested',cardinality(student_ids));
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
 WHERE pl.tipo<>'diagnostico' OR NOT ingles_con_historial(sid) ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN jsonb_build_object('assigned',n);
END $$;

-- Retain all existing assignment filters, ownership, attempt recovery and session permissions.
ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_diagnostico;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE data JSONB;status JSONB;
BEGIN
 data:=public.apex_api_pre_diagnostico(operation,payload);
 IF operation='me' THEN
  status:=estado_diagnostico(data->'profile'->>'id');
  IF status IS NOT NULL THEN data:=data||jsonb_build_object('diagnosticAvailability',status); END IF;
 END IF;
 RETURN data;
END $$;
REVOKE ALL ON FUNCTION ingles_con_historial(TEXT),estado_diagnostico(TEXT),public.apex_api_pre_diagnostico(TEXT,JSONB),public.apex_api(TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB) TO authenticated;
COMMIT;
