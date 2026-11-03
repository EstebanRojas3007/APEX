BEGIN;
SET LOCAL search_path TO apex_private, pg_catalog;
CREATE FUNCTION perfil_json(uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path = apex_private, pg_catalog AS $$
 SELECT jsonb_build_object('id',u.id,'name',u.nombre,'email',u.correo,'birthDate',u.fecha_nacimiento,'program',coalesce(e.id_programa,''),'semester',coalesce(e.semestre,1),'role',u.rol,'complete',u.perfil_completo)
 FROM usuario u LEFT JOIN estudiante e ON e.id_usuario=u.id WHERE u.id=uid
$$;
CREATE FUNCTION resultado_json(iid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path = apex_private, pg_catalog AS $$
 SELECT coalesce(r.detalle,jsonb_build_object('attemptId',r.id_intento,'correct',r.aciertos,'total',r.total_preguntas,'percentage',100.0*r.aciertos/r.total_preguntas,'completedAt',r.calculado_en,'rule',r.version_regla,
 'nuclei',coalesce((SELECT jsonb_agg(jsonb_build_object('label',etiqueta,'correct',aciertos,'total',total,'percentage',100.0*aciertos/total) ORDER BY categoria) FROM v_progreso_nucleo WHERE id_intento=iid),'[]'::jsonb),
 'competencies',coalesce((SELECT jsonb_agg(jsonb_build_object('label',etiqueta,'correct',aciertos,'total',total,'percentage',100.0*aciertos/total) ORDER BY categoria) FROM v_progreso_competencia WHERE id_intento=iid),'[]'::jsonb)))
 FROM resultado r WHERE r.id_intento=iid
$$;
-- Preserve the observable legacy breakdown, without claiming it reconstructs past edits.
UPDATE resultado SET detalle=resultado_json(id_intento) WHERE detalle IS NULL;
CREATE FUNCTION intento_json(iid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path = apex_private, pg_catalog AS $$
 SELECT jsonb_build_object('id',i.id,'status',i.estado,'lastActivity',i.ultima_actividad,
 'questions',(SELECT jsonb_agg(jsonb_build_object('id',it.id,'text',p.enunciado,'version',p.version,'nucleus',n.nombre,'competency',c.nombre,'provenance',p.procedencia,
 'options',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'text',o.texto) ORDER BY o.orden) FROM opcion_respuesta o WHERE o.id_pregunta=p.id)) ORDER BY it.orden)
 FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta JOIN nucleo_tematico n ON n.id=p.id_nucleo JOIN competencia c ON c.id=p.id_competencia WHERE it.id_evaluacion=a.id_evaluacion),
 'answers',coalesce((SELECT jsonb_object_agg(id_item,id_opcion) FROM respuesta WHERE id_intento=iid),'{}'::jsonb))
 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.id=iid
$$;
CREATE FUNCTION historial_json(uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path = apex_private, pg_catalog AS $$
 SELECT coalesce(jsonb_agg(resultado_json(i.id) ORDER BY i.finalizado_en,i.id),'[]'::jsonb) FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id_estudiante=uid AND i.estado='finalizado'
$$;
CREATE FUNCTION public.apex_catalog() RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
 SELECT jsonb_build_object('programs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',nombre) ORDER BY nombre) FROM programa_academico),'[]'::jsonb))
$$;

CREATE FUNCTION public.apex_api(operation TEXT, payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
DECLARE u usuario; a asignacion_evaluacion; i intento; ev evaluacion; target usuario;
 iid TEXT:=payload->>'attemptId'; sid UUID:=(auth.jwt()->>'session_id')::uuid;
 at BIGINT:=epoch_ms(); total INTEGER; correct INTEGER; dob DATE; old_program TEXT;
BEGIN
 -- Repair a missing profile for an existing Auth identity. Never attach an old profile by email.
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión.' USING ERRCODE='28000'; END IF;
 IF NOT EXISTS(SELECT 1 FROM usuario WHERE auth_user_id=auth.uid()) THEN
  INSERT INTO usuario(id,proveedor_auth,uid_auth,auth_user_id,nombre,correo,fecha_nacimiento)
   SELECT id::text,'supabase',id::text,id,'',email,'' FROM auth.users WHERE id=auth.uid()
   ON CONFLICT(auth_user_id) DO NOTHING;
 END IF;
 u:=actor();
 IF operation='me' THEN
  RETURN jsonb_build_object('profile',perfil_json(u.id),'results',historial_json(u.id),
   'attempt',(SELECT jsonb_build_object('id',it.id,'status',it.estado) FROM intento it JOIN asignacion_evaluacion ae ON ae.id=it.id_asignacion WHERE ae.id_estudiante=u.id ORDER BY it.iniciado_en DESC LIMIT 1),
   'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ae.id,'title',e.titulo,'version',e.version,'status',it.estado,'attemptId',it.id) ORDER BY e.id) FROM asignacion_evaluacion ae JOIN evaluacion e ON e.id=ae.id_evaluacion LEFT JOIN intento it ON it.id_asignacion=ae.id WHERE ae.id_estudiante=u.id),'[]'::jsonb));
 ELSIF operation='profile' THEN
  IF length(trim(coalesce(payload->>'name','')))<2 OR length(payload->>'name')>100 THEN RAISE EXCEPTION 'Nombre: 2 a 100 caracteres.'; END IF;
  IF coalesce(payload->>'birthDate','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Fecha inválida: AAAA-MM-DD.'; END IF;
  dob:=(payload->>'birthDate')::date;
  IF dob<date '1900-01-01' OR dob>current_date THEN RAISE EXCEPTION 'Fecha de nacimiento inválida.'; END IF;
  IF NOT u.perfil_completo AND coalesce((payload->>'consent')::boolean,false)<>true THEN RAISE EXCEPTION 'Acepta el aviso de uso de datos.'; END IF;
  IF u.rol='estudiante' THEN
   IF NOT EXISTS(SELECT 1 FROM programa_academico WHERE id=payload->>'program') OR coalesce((payload->>'semester')::integer,0) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Programa o semestre inválido.'; END IF;
   SELECT id_programa INTO old_program FROM estudiante WHERE id_usuario=u.id;
   IF old_program IS NOT NULL AND old_program<>payload->>'program' THEN RAISE EXCEPTION 'El cambio de programa requiere revisión administrativa.'; END IF;
   INSERT INTO estudiante VALUES(u.id,payload->>'program',(payload->>'semester')::integer) ON CONFLICT(id_usuario) DO UPDATE SET semestre=excluded.semestre;
   INSERT INTO asignacion_evaluacion(id,id_estudiante,id_evaluacion)
    SELECT gen_random_uuid()::text,u.id,e.id FROM evaluacion e WHERE e.publicada AND e.tipo='diagnostico'
    AND EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=e.id)
    AND NOT EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=e.id AND NOT EXISTS(SELECT 1 FROM programa_componente pc WHERE pc.id_programa=payload->>'program' AND pc.id_componente=ec.id_componente))
    ON CONFLICT(id_estudiante,id_evaluacion) DO NOTHING;
  END IF;
  UPDATE usuario SET nombre=trim(payload->>'name'),fecha_nacimiento=dob::text,perfil_completo=true WHERE id=u.id;
  IF NOT u.perfil_completo THEN INSERT INTO consentimiento VALUES(gen_random_uuid()::text,u.id,'perfil-y-evaluacion','apex-v1',at,NULL); END IF;
  UPDATE sesion_actividad SET ultima_actividad=now() WHERE id=sid;
  RETURN perfil_json(u.id);
 ELSIF operation='activity' THEN
  IF coalesce(payload->>'scope','') NOT IN ('','menu') THEN RAISE EXCEPTION 'Ámbito inválido; usa iniciar/retomar.'; END IF;
  UPDATE sesion_actividad SET ultima_actividad=now(),ambito=coalesce(nullif(payload->>'scope',''),ambito) WHERE id=sid;
  IF (SELECT ambito FROM sesion_actividad WHERE id=sid)='exam' THEN
   UPDATE intento SET ultima_actividad=at WHERE estado='activo' AND id_asignacion IN (SELECT id FROM asignacion_evaluacion WHERE id_estudiante=u.id);
  END IF;
  RETURN '{"ok":true}'::jsonb;
 ELSIF operation='logout' THEN
  UPDATE sesion_actividad SET cerrada=true WHERE id=sid; RETURN '{"ok":true}'::jsonb;
 ELSIF operation='set_role' THEN
  IF u.rol<>'administrador' THEN RAISE EXCEPTION 'Solo administrador.' USING ERRCODE='42501'; END IF;
  SELECT * INTO target FROM usuario WHERE auth_user_id=(payload->>'userId')::uuid FOR UPDATE;
  IF target.id IS NULL OR coalesce(payload->>'role','') NOT IN ('estudiante','docente','administrador') THEN RAISE EXCEPTION 'Usuario o rol inválido.'; END IF;
  IF target.id=u.id THEN RAISE EXCEPTION 'No cambies tu propio rol.'; END IF;
  INSERT INTO auditoria_rol(actor,destinatario,rol_anterior,rol_nuevo) VALUES(u.auth_user_id,target.auth_user_id,target.rol,payload->>'role');
  UPDATE usuario SET rol=payload->>'role' WHERE id=target.id;
  RETURN '{"ok":true}'::jsonb;
 ELSIF operation='assign_teacher' THEN
  IF u.rol<>'administrador' THEN RAISE EXCEPTION 'Solo administrador.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM usuario WHERE id=payload->>'teacherId' AND rol='docente' AND estado='activo') THEN RAISE EXCEPTION 'Docente inválido.'; END IF;
  INSERT INTO asignacion_docente VALUES(payload->>'teacherId',payload->>'studentId') ON CONFLICT DO NOTHING;
  RETURN '{"ok":true}'::jsonb;
 ELSIF operation='students' THEN
  IF u.rol NOT IN ('docente','administrador') THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',us.id,'name',us.nombre,'program',e.id_programa,'semester',e.semestre)) FROM estudiante e JOIN usuario us ON us.id=e.id_usuario WHERE puede_leer_estudiante(us.id)),'[]'::jsonb);
 ELSIF operation='student_results' THEN
  IF NOT puede_leer_estudiante(payload->>'studentId') THEN RAISE EXCEPTION 'Estudiante no asignado.' USING ERRCODE='42501'; END IF;
  RETURN historial_json(payload->>'studentId');
 ELSIF operation='start' THEN
  IF u.rol<>'estudiante' OR NOT u.perfil_completo THEN RAISE EXCEPTION 'Completa tu perfil de estudiante.' USING ERRCODE='42501'; END IF;
  IF coalesce((payload->>'confirmed')::boolean,false)<>true THEN RAISE EXCEPTION 'Confirma las condiciones.'; END IF;
  SELECT * INTO a FROM asignacion_evaluacion WHERE id_estudiante=u.id AND id=payload->>'assignmentId' FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Evaluación no asignada.' USING ERRCODE='42501'; END IF;
  SELECT * INTO ev FROM evaluacion WHERE id=a.id_evaluacion;
  -- Previously started legacy attempts remain resumable; this does not publish their instrument.
  IF (NOT ev.publicada AND NOT EXISTS(SELECT 1 FROM intento WHERE id_asignacion=a.id)) OR ev.tipo<>'diagnostico' OR ev.duracion_segundos IS NOT NULL THEN RAISE EXCEPTION 'Instrumento aún no habilitado.'; END IF;
  INSERT INTO intento(id,id_asignacion,estado,iniciado_en,ultima_actividad) VALUES(gen_random_uuid()::text,a.id,'activo',at,at) ON CONFLICT(id_asignacion) DO NOTHING;
  SELECT * INTO i FROM intento WHERE id_asignacion=a.id FOR UPDATE;
  IF i.estado='activo' THEN
   UPDATE intento SET ultima_actividad=at WHERE id=i.id;
   UPDATE sesion_actividad SET ultima_actividad=now(),ambito='exam' WHERE id=sid;
  END IF;
  RETURN intento_json(i.id);
 ELSIF operation IN ('attempt','answer','finish') THEN
  SELECT it.* INTO i FROM intento it JOIN asignacion_evaluacion ae ON ae.id=it.id_asignacion WHERE it.id=iid AND ae.id_estudiante=u.id FOR UPDATE OF it;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Intento no autorizado.' USING ERRCODE='42501'; END IF;
  IF operation='attempt' THEN RETURN intento_json(i.id); END IF;
  IF operation='finish' AND i.estado='finalizado' THEN RETURN resultado_json(i.id); END IF;
  IF u.rol<>'estudiante' OR i.estado<>'activo' OR (SELECT ambito FROM sesion_actividad WHERE id=sid)<>'exam' OR at-i.ultima_actividad>=480000 THEN RAISE EXCEPTION 'Retoma el intento activo antes de continuar.'; END IF;
  IF operation='answer' THEN
   IF NOT payload ? 'option' OR jsonb_typeof(payload->'option') NOT IN ('string','null') THEN RAISE EXCEPTION 'Opción inválida.'; END IF;
   INSERT INTO respuesta VALUES(i.id,payload->>'item',payload->>'option',at) ON CONFLICT(id_intento,id_item) DO UPDATE SET id_opcion=excluded.id_opcion,guardada_en=excluded.guardada_en;
   UPDATE intento SET ultima_actividad=at WHERE id=i.id;
   UPDATE sesion_actividad SET ultima_actividad=now() WHERE id=sid;
   RETURN jsonb_build_object('savedAt',at,'option',payload->>'option');
  END IF;
  SELECT count(*),count(*) FILTER(WHERE o.es_correcta=1) INTO total,correct FROM item_evaluacion it JOIN asignacion_evaluacion ae ON ae.id_evaluacion=it.id_evaluacion LEFT JOIN respuesta r ON r.id_item=it.id AND r.id_intento=i.id LEFT JOIN opcion_respuesta o ON o.id=r.id_opcion WHERE ae.id=i.id_asignacion;
  INSERT INTO resultado(id_intento,calculado_en,aciertos,total_preguntas,version_regla) VALUES(i.id,at,correct,total,'aciertos-v1');
  UPDATE intento SET estado='finalizado',finalizado_en=at WHERE id=i.id;
  UPDATE resultado SET detalle=resultado_json(i.id) WHERE id_intento=i.id;
  UPDATE sesion_actividad SET ultima_actividad=now(),ambito='menu' WHERE id=sid;
  RETURN resultado_json(i.id);
 ELSE RAISE EXCEPTION 'Operación desconocida.';
 END IF;
END $$;
REVOKE ALL ON FUNCTION perfil_json(TEXT),resultado_json(TEXT),intento_json(TEXT),historial_json(TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apex_api(TEXT,JSONB),public.apex_catalog() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apex_catalog() TO anon,authenticated;
COMMIT;
