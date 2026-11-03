-- Local preparation. No remote calls, role changes, assignments or clock activation.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;

ALTER TABLE intento DROP CONSTRAINT intento_estado_check;
ALTER TABLE intento ADD CONSTRAINT intento_estado_check CHECK(estado IN ('activo','finalizado','suspendido'));

-- Group/role audit tables describe administrative mutations, not academic incidents.
-- This record is also the single-use authorization; only its replacement reference
-- may be filled once, in the same transaction that actually starts that attempt.
CREATE TABLE intervencion_docente (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 id_actor TEXT NOT NULL REFERENCES usuario(id),auth_actor UUID NOT NULL,
 id_estudiante TEXT NOT NULL REFERENCES estudiante(id_usuario),id_grupo UUID NOT NULL REFERENCES grupo(id),
 accion TEXT NOT NULL CHECK(accion IN ('regularizar_diagnostico','suspender_intento')),
 motivo TEXT NOT NULL CHECK(length(trim(motivo)) BETWEEN 1 AND 1000),creada_en BIGINT NOT NULL,
 id_convocatoria TEXT REFERENCES convocatoria_banco(id),
 id_original TEXT UNIQUE REFERENCES intento(id),id_reemplazo TEXT UNIQUE REFERENCES intento(id),
 CHECK((accion='regularizar_diagnostico' AND id_convocatoria IS NOT NULL AND id_original IS NULL AND id_reemplazo IS NULL)
  OR (accion='suspender_intento' AND id_original IS NOT NULL AND id_original IS DISTINCT FROM id_reemplazo))
);
ALTER TABLE intervencion_docente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON intervencion_docente FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION proteger_intervencion_docente() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'La intervención y su autorización son inmutables.';END IF;
 IF old.accion<>'suspender_intento' OR old.id_reemplazo IS NOT NULL OR new.id_reemplazo IS NULL
  OR (to_jsonb(new)-'id_reemplazo') IS DISTINCT FROM (to_jsonb(old)-'id_reemplazo')
  OR NOT EXISTS(SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
   WHERE i.id=new.id_reemplazo AND a.id_estudiante=old.id_estudiante AND i.estado='activo') THEN
  RAISE EXCEPTION 'La autorización admite un único reemplazo del mismo estudiante.';
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER intervencion_inmutable BEFORE UPDATE OR DELETE ON intervencion_docente FOR EACH ROW EXECUTE FUNCTION proteger_intervencion_docente();
CREATE OR REPLACE FUNCTION identidad_intento() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='intento' THEN
  IF new.id<>old.id OR new.id_asignacion<>old.id_asignacion OR old.estado IN ('finalizado','suspendido') THEN
   RAISE EXCEPTION 'Intento finalizado/suspendido o identidad inmutable.';
  END IF;
 ELSE RAISE EXCEPTION 'Asignación inmutable: crea una nueva evaluación.';END IF;
 RETURN new;
END $$;
CREATE FUNCTION impedir_resultado_suspendido() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 PERFORM 1 FROM intento WHERE id=new.id_intento FOR UPDATE;
 IF EXISTS(SELECT 1 FROM intento WHERE id=new.id_intento AND estado='suspendido') THEN
  RAISE EXCEPTION 'Un intento suspendido no produce calificación ni decisión académica.';
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER resultado_no_suspendido BEFORE INSERT OR UPDATE ON resultado FOR EACH ROW EXECUTE FUNCTION impedir_resultado_suspendido();
CREATE TRIGGER decision_no_suspendida BEFORE INSERT OR UPDATE ON decision_avance FOR EACH ROW EXECUTE FUNCTION impedir_resultado_suspendido();

-- Same academic order as save/manual submission/scheduler: student -> attempt.
-- Lock scope rows too. Membership triggers lock the membership before the group;
-- use that order so an in-flight revocation cannot be bypassed after waiting.
CREATE FUNCTION bloquear_ambito_docente(gid UUID,uid TEXT) RETURNS usuario LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;
BEGIN
 u:=actor();
 IF u.rol<>'docente' THEN RAISE EXCEPTION 'Solo docente.' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM estudiante WHERE id_usuario=uid FOR UPDATE;
 PERFORM 1 FROM usuario WHERE id IN (u.id,uid) ORDER BY id FOR SHARE;
 SELECT * INTO u FROM usuario WHERE id=u.id;
 PERFORM 1 FROM grupo_docente WHERE id_grupo=gid AND id_docente=u.id FOR SHARE;
 PERFORM 1 FROM grupo_integrante WHERE id_grupo=gid AND id_estudiante=uid FOR SHARE;
 PERFORM 1 FROM grupo WHERE id=gid FOR SHARE;
 PERFORM 1 FROM programa_componente pc JOIN estudiante e ON e.id_programa=pc.id_programa
  JOIN grupo g ON g.id=gid AND g.id_componente=pc.id_componente WHERE e.id_usuario=uid FOR SHARE OF pc;
 IF NOT docente_grupo(u.id,gid) THEN RAISE EXCEPTION 'Grupo no asignado.' USING ERRCODE='42501';END IF;
 IF NOT integrante_grupo(gid,uid) THEN RAISE EXCEPTION 'Estudiante no asignado.' USING ERRCODE='42501';END IF;
 RETURN u;
END $$;

CREATE FUNCTION diagnostico_docente_json(uid TEXT) RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=apex_private,pg_catalog AS $$
DECLARE state TEXT;availability JSONB;attempts JSONB;
BEGIN
 attempts:=seguimiento_intentos(uid,'ingles');availability:=estado_diagnostico(uid);
 state:=CASE
  WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(attempts) a WHERE a->>'kind'='diagnostico' AND a->>'status'='finalizado') THEN 'completed'
  WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(attempts) a WHERE a->>'kind'='diagnostico' AND a->>'status'='activo') THEN 'in_progress'
  WHEN availability->>'code'='assigned' THEN 'assigned' ELSE 'not_assigned' END;
 RETURN jsonb_build_object('state',state,'canAssign',state='not_assigned' AND availability->>'code'='needs_transition',
  'reason',CASE WHEN state='completed' THEN 'Diagnóstico finalizado; se conserva el historial.'
   WHEN state='in_progress' THEN 'Diagnóstico en progreso; no se puede reasignar.'
   WHEN state='assigned' THEN 'Diagnóstico asignado sin iniciar o con reinicio autorizado; no se puede duplicar.'
   WHEN availability->>'code'='needs_transition' THEN 'Falta asignar el diagnóstico de Inglés.'
   ELSE availability->>'message' END);
END $$;

CREATE FUNCTION recuperacion_docente_json(iid TEXT) RETURNS JSONB LANGUAGE plpgsql VOLATILE SET search_path=apex_private,pg_catalog AS $$
DECLARE it intento;r reloj_intento;at BIGINT:=epoch_ms();threshold BIGINT;reason TEXT;event intervencion_docente;
BEGIN
 SELECT * INTO it FROM intento WHERE id=iid;SELECT * INTO r FROM reloj_intento WHERE id_intento=iid;
 threshold:=CASE r.tipo WHEN 'diagnostico' THEN 1800000 WHEN 'control' THEN 2700000 WHEN 'final' THEN 3600000 END;
 SELECT * INTO event FROM intervencion_docente WHERE id_original=iid;
 reason:=CASE
  WHEN it.id IS NULL OR intento_tecnico(iid) OR threshold IS NULL THEN 'Instrumento no recuperable por seguimiento académico.'
  WHEN it.estado='finalizado' OR EXISTS(SELECT 1 FROM resultado WHERE id_intento=iid) THEN 'El intento ya fue calificado o cerrado; no se puede suspender.'
  WHEN it.estado='suspendido' THEN 'Intento suspendido sin calificación; se conserva como historial.'
  WHEN it.estado<>'activo' THEN 'El intento no está abierto.'
  WHEN EXISTS(SELECT 1 FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion
   WHERE a.id=it.id_asignacion AND e.id_plantilla IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM intento_ruta WHERE id_intento=iid)
   AND NOT EXISTS(SELECT 1 FROM convocatoria_banco WHERE id=it.id_asignacion) THEN 'Falta la convocatoria histórica; requiere conciliación administrativa antes de recuperar.'
  WHEN at<it.iniciado_en+threshold THEN 'Aún no se cumple el umbral desde el inicio del intento.'
  WHEN r.tipo IN ('control','final') AND (r.vence_en IS NULL OR r.vence_en>at) THEN 'La recuperación de control/final exige vencimiento persistido; no se imponen plazos retroactivos.'
  ELSE NULL END;
 RETURN jsonb_build_object('attemptId',iid,'serverNow',at,'eligibleAt',it.iniciado_en+threshold,
  'canSuspend',reason IS NULL,'reason',reason,'suspendedAt',event.creada_en,'replacementId',event.id_reemplazo,
  'replacementStatus',(SELECT estado FROM intento WHERE id=event.id_reemplazo));
END $$;

CREATE FUNCTION intervenir_docente(operation TEXT,payload JSONB) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE gid UUID:=(payload->>'groupId')::uuid;uid TEXT:=payload->>'studentId';u usuario;tid TEXT;cid TEXT;
 it intento;event intervencion_docente;eligibility JSONB;motivo TEXT:=btrim(payload->>'reason');
BEGIN
 u:=bloquear_ambito_docente(gid,uid);
 IF operation='teacher_assign_diagnostic' THEN
  PERFORM 1 FROM configuracion_mvp WHERE id FOR SHARE;
  SELECT diagnostico INTO tid FROM configuracion_mvp WHERE id;
  PERFORM 1 FROM plantilla_evaluacion WHERE id=tid FOR SHARE;
  -- Reuse the existing English-history guard under its student lock. Never
  -- call or broaden an administrator RPC on behalf of a teacher.
  IF ingles_con_historial(uid) THEN
   RETURN jsonb_build_object('code','already_protected','assigned',0,'message','El diagnóstico o historial de Inglés ya existe; se conserva sin cambios.');
  END IF;
  IF (diagnostico_docente_json(uid)->>'canAssign')::boolean IS DISTINCT FROM true THEN
   RAISE EXCEPTION '%',diagnostico_docente_json(uid)->>'reason';
  END IF;
  INSERT INTO convocatoria_banco(id_estudiante,id_plantilla) VALUES(uid,tid) ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING RETURNING id INTO cid;
  IF cid IS NULL THEN RETURN jsonb_build_object('code','already_protected','assigned',0,'message','La asignación ya existe.');END IF;
  INSERT INTO intervencion_docente(id_actor,auth_actor,id_estudiante,id_grupo,accion,motivo,creada_en,id_convocatoria)
   VALUES(u.id,u.auth_user_id,uid,gid,'regularizar_diagnostico','Regularización de asignación faltante del diagnóstico de Inglés',epoch_ms(),cid);
  RETURN jsonb_build_object('code','assigned','assigned',1,'message','Diagnóstico de Inglés asignado sin iniciar un intento.');
 ELSIF operation='teacher_suspend_attempt' THEN
  SELECT i.* INTO it FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
   WHERE i.id=payload->>'attemptId' AND a.id_estudiante=uid FOR UPDATE OF i;
  IF it.id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(seguimiento_intentos(uid,'ingles')) a WHERE a->>'id'=it.id) THEN
   RAISE EXCEPTION 'Intento no autorizado.' USING ERRCODE='42501';
  END IF;
  IF motivo IS NULL OR length(motivo) NOT BETWEEN 1 AND 1000 OR (payload->>'confirmed')::boolean IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Escribe un motivo de 1 a 1000 caracteres y confirma la suspensión.';
  END IF;
  SELECT * INTO event FROM intervencion_docente WHERE id_original=it.id;
  IF it.estado='suspendido' AND event.id IS NOT NULL THEN
   RETURN jsonb_build_object('code','already_suspended','message','El intento ya está suspendido. Se conserva su única autorización de reemplazo.','replacementId',event.id_reemplazo);
  END IF;
  eligibility:=recuperacion_docente_json(it.id);
  IF (eligibility->>'canSuspend')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION '%',eligibility->>'reason';END IF;
  UPDATE intento SET estado='suspendido' WHERE id=it.id;
  INSERT INTO intervencion_docente(id_actor,auth_actor,id_estudiante,id_grupo,accion,motivo,creada_en,id_original)
   VALUES(u.id,u.auth_user_id,uid,gid,'suspender_intento',motivo,epoch_ms(),it.id);
  RETURN jsonb_build_object('code','suspended','message','Intento suspendido sin calificación ni repaso. El estudiante dispone de un único reinicio; su reloj comenzará cuando lo abra.');
 END IF;
 RAISE EXCEPTION 'Operación docente desconocida.';
END $$;

CREATE FUNCTION ultimo_reemplazo(iid TEXT) RETURNS TEXT LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 WITH RECURSIVE chain(id,depth) AS (SELECT iid,0 UNION ALL SELECT e.id_reemplazo,c.depth+1
  FROM chain c JOIN intervencion_docente e ON e.id_original=c.id WHERE e.id_reemplazo IS NOT NULL)
 SELECT id FROM chain ORDER BY depth DESC LIMIT 1
$$;
CREATE FUNCTION raiz_reemplazo(iid TEXT) RETURNS TEXT LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 WITH RECURSIVE chain(id,depth) AS (SELECT iid,0 UNION ALL SELECT e.id_original,c.depth+1
  FROM chain c JOIN intervencion_docente e ON e.id_reemplazo=c.id)
 SELECT id FROM chain ORDER BY depth DESC LIMIT 1
$$;
ALTER FUNCTION seguimiento_intentos(TEXT,TEXT) RENAME TO seguimiento_intentos_pre_intervencion;
CREATE FUNCTION seguimiento_intentos(uid TEXT,component_id TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT coalesce(jsonb_agg(a||jsonb_build_object('chainId',coalesce(ir.id_convocatoria,original.id_asignacion),
  'suspendedAt',event.creada_en,'replacementId',event.id_reemplazo) ORDER BY (a->>'startedAt')::bigint,a->>'id'),'[]'::jsonb)
 FROM jsonb_array_elements(seguimiento_intentos_pre_intervencion(uid,component_id)) a
 JOIN intento original ON original.id=raiz_reemplazo(a->>'id') LEFT JOIN intento_ruta ir ON ir.id_intento=original.id
 LEFT JOIN intervencion_docente event ON event.id_original=a->>'id'
$$;

CREATE FUNCTION iniciar_reemplazo_docente(iid TEXT,confirmed BOOLEAN) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;it intento;event intervencion_docente;ev evaluacion;pl plantilla_evaluacion;
 cid TEXT;aid TEXT:=gen_random_uuid()::text;eid TEXT;policy TEXT;outcome JSONB;number INTEGER;
BEGIN
 u:=actor();
 IF u.rol<>'estudiante' OR NOT u.perfil_completo OR NOT datos_perfil_guardados_validos(u.id) THEN RAISE EXCEPTION 'Completa tu perfil de estudiante.' USING ERRCODE='42501';END IF;
 IF confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirma las condiciones del reinicio.';END IF;
 PERFORM 1 FROM estudiante WHERE id_usuario=u.id FOR UPDATE;
 SELECT i.* INTO it FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.id=iid AND a.id_estudiante=u.id FOR UPDATE OF i;
 SELECT * INTO event FROM intervencion_docente WHERE id_original=it.id FOR UPDATE;
 IF it.estado IS DISTINCT FROM 'suspendido' OR event.id IS NULL THEN RAISE EXCEPTION 'Reinicio no autorizado.' USING ERRCODE='42501';END IF;
 IF event.id_reemplazo IS NOT NULL THEN RETURN intento_json(event.id_reemplazo);END IF;
 SELECT e.* INTO ev FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion WHERE a.id=it.id_asignacion;
 IF EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=ev.id AND NOT EXISTS(
  SELECT 1 FROM estudiante s JOIN programa_componente pc ON pc.id_programa=s.id_programa WHERE s.id_usuario=u.id AND pc.id_componente=ec.id_componente)) THEN
  RAISE EXCEPTION 'Componente no autorizado para el programa actual.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO pl FROM plantilla_evaluacion WHERE id=ev.id_plantilla;
 IF pl.id IS NOT NULL THEN
  SELECT ir.id_convocatoria,ir.politica_seleccion INTO cid,policy FROM intento_ruta ir WHERE ir.id_intento=it.id;
  cid:=coalesce(cid,(SELECT id FROM convocatoria_banco WHERE id=it.id_asignacion));
  IF cid IS NULL THEN RAISE EXCEPTION 'Falta la convocatoria histórica; requiere conciliación administrativa.';END IF;
  PERFORM 1 FROM convocatoria_banco WHERE id=cid FOR UPDATE;
  policy:=coalesce(policy,CASE WHEN pl.politica_exposicion='no_vistas_lru_bloques-v2' OR EXISTS(SELECT 1 FROM configuracion_mvp WHERE diagnostico IS NOT NULL)
   THEN 'no_vistas_lru_bloques-v2' ELSE pl.politica_exposicion END);
  -- Register the old first attempt once; its immutable selection is untouched.
  INSERT INTO intento_ruta(id_intento,id_convocatoria,numero,politica_seleccion)
   SELECT it.id,cid,1,policy WHERE NOT EXISTS(SELECT 1 FROM intento_ruta WHERE id_convocatoria=cid) ON CONFLICT(id_intento) DO NOTHING;
  outcome:=seleccionar_forma(u.id,pl.id,aid,cid,policy);
  IF outcome ? 'error' THEN RETURN outcome;END IF;
  SELECT coalesce(max(numero),0)+1 INTO number FROM intento_ruta WHERE id_convocatoria=cid;
  INSERT INTO intento_ruta(id_intento,id_convocatoria,numero,politica_seleccion) VALUES(outcome->>'id',cid,number,policy);
 ELSE
  -- Published pre-bank forms have a fixed selection. Copy that version, never
  -- mutate it or silently substitute the currently configured bank/template.
  eid:=gen_random_uuid()::text;
  INSERT INTO evaluacion(id,titulo,version,tipo,duracion_segundos) VALUES(eid,ev.titulo,ev.version,ev.tipo,ev.duracion_segundos);
  INSERT INTO evaluacion_componente SELECT eid,id_componente FROM evaluacion_componente WHERE id_evaluacion=ev.id;
  INSERT INTO item_evaluacion SELECT gen_random_uuid()::text,eid,id_pregunta,orden FROM item_evaluacion WHERE id_evaluacion=ev.id;
  UPDATE evaluacion SET publicada=true WHERE id=eid;
  INSERT INTO asignacion_evaluacion VALUES(aid,u.id,eid);
  INSERT INTO intento(id,id_asignacion,estado,iniciado_en,ultima_actividad) VALUES(gen_random_uuid()::text,aid,'activo',epoch_ms(),epoch_ms()) RETURNING * INTO it;
  UPDATE sesion_actividad SET ultima_actividad=now(),ambito='exam' WHERE id=(auth.jwt()->>'session_id')::uuid;
  outcome:=intento_json(it.id);
 END IF;
 UPDATE intervencion_docente SET id_reemplazo=outcome->>'id' WHERE id=event.id;
 RETURN outcome;
END $$;

ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_intervencion;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;it intento;root TEXT;data JSONB;items JSONB:='[]'::jsonb;entry JSONB;latest TEXT;
BEGIN
 u:=actor();
 IF operation IN ('teacher_assign_diagnostic','teacher_suspend_attempt') THEN RETURN intervenir_docente(operation,payload);END IF;
 IF u.rol='estudiante' AND operation IN ('start','attempt','attempt_clock','answer','finish') THEN
  PERFORM 1 FROM estudiante WHERE id_usuario=u.id FOR UPDATE;
  IF operation='start' THEN
   SELECT i.id INTO root FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion LEFT JOIN intento_ruta ir ON ir.id_intento=i.id
    WHERE (a.id=payload->>'assignmentId' OR ir.id_convocatoria=payload->>'assignmentId') AND a.id_estudiante=u.id
    ORDER BY ir.numero DESC NULLS LAST,i.iniciado_en DESC,i.id DESC LIMIT 1;
   SELECT * INTO it FROM intento WHERE id=ultimo_reemplazo(root) FOR UPDATE;
   IF payload ? 'resumeAttemptId' THEN
    IF EXISTS(SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.id=payload->>'resumeAttemptId' AND a.id_estudiante=u.id AND i.estado='suspendido') THEN
     RETURN jsonb_build_object('error',jsonb_build_object('code','ATTEMPT_SUSPENDED','message','El profesor suspendió este intento. Vuelve a Mis evaluaciones para preparar el reinicio autorizado.'));
    END IF;
   END IF;
   IF it.estado='suspendido' THEN RETURN iniciar_reemplazo_docente(it.id,(payload->>'confirmed')::boolean);END IF;
   IF it.id IS NOT NULL AND raiz_reemplazo(it.id) IS DISTINCT FROM it.id THEN
    IF payload ? 'resumeAttemptId' AND payload->>'resumeAttemptId' IS DISTINCT FROM it.id THEN RAISE EXCEPTION 'Intento de recuperación no autorizado.' USING ERRCODE='42501';END IF;
    PERFORM cerrar_vencidos_estudiante(u.id);
    SELECT * INTO it FROM intento WHERE id=it.id FOR UPDATE;
    IF it.estado='activo' THEN
     IF (payload->>'confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirma las condiciones.';END IF;
     UPDATE intento SET ultima_actividad=epoch_ms() WHERE id=it.id;
     UPDATE sesion_actividad SET ultima_actividad=now(),ambito='exam' WHERE id=(auth.jwt()->>'session_id')::uuid;
     RETURN intento_json(it.id);
    END IF;
    -- Bank chains retain the ordinary linked-review retry flow. Legacy forms
    -- return their one graded replacement, without opening another attempt.
    IF NOT EXISTS(SELECT 1 FROM convocatoria_banco WHERE id=payload->>'assignmentId') THEN RETURN intento_json(it.id);END IF;
   END IF;
  ELSE
   SELECT i.* INTO it FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
    WHERE i.id=payload->>'attemptId' AND a.id_estudiante=u.id FOR UPDATE OF i;
   IF it.estado='suspendido' THEN
    RETURN jsonb_build_object('error',jsonb_build_object('code','ATTEMPT_SUSPENDED','message','El profesor suspendió este intento. Su historial se conserva; prepara el reinicio autorizado desde Mis evaluaciones.'));
   END IF;
  END IF;
 END IF;
 data:=public.apex_api_pre_intervencion(operation,payload);
 IF operation='teacher_student' THEN
  RETURN data||jsonb_build_object('teacherActions',jsonb_build_object('diagnostic',diagnostico_docente_json(data->>'id'),
   'exams',coalesce((SELECT jsonb_agg(a||recuperacion_docente_json(a->>'id') ORDER BY (a->>'startedAt')::bigint,a->>'id')
    FROM jsonb_array_elements(data->'attempts') a WHERE a->>'status' IN ('activo','suspendido')),'[]'::jsonb)));
 END IF;
 IF operation='me' AND u.rol='estudiante' THEN
  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(data->'assignments','[]'::jsonb)) LOOP
   IF EXISTS(SELECT 1 FROM intervencion_docente e JOIN intento i ON i.id=e.id_reemplazo WHERE i.id_asignacion=entry->>'id') THEN CONTINUE;END IF;
   SELECT i.id INTO root FROM intento i WHERE i.id_asignacion=entry->>'id';
   latest:=ultimo_reemplazo(coalesce(entry->>'attemptId',root));
   IF latest IS DISTINCT FROM root OR EXISTS(SELECT 1 FROM intervencion_docente WHERE id_original=root) THEN
    SELECT * INTO it FROM intento WHERE id=latest;
    entry:=entry||jsonb_build_object('status',it.estado,'attemptId',it.id,'restartAvailable',it.estado='suspendido');
   END IF;
   items:=items||jsonb_build_array(entry);
  END LOOP;
  data:=jsonb_set(data,'{assignments}',items);
 END IF;
 RETURN data;
END $$;

REVOKE ALL ON FUNCTION proteger_intervencion_docente(),identidad_intento(),impedir_resultado_suspendido(),bloquear_ambito_docente(UUID,TEXT),
 diagnostico_docente_json(TEXT),recuperacion_docente_json(TEXT),intervenir_docente(TEXT,JSONB),ultimo_reemplazo(TEXT),raiz_reemplazo(TEXT),
 seguimiento_intentos_pre_intervencion(TEXT,TEXT),seguimiento_intentos(TEXT,TEXT),iniciar_reemplazo_docente(TEXT,BOOLEAN),
 public.apex_api_pre_intervencion(TEXT,JSONB),public.apex_api(TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB) TO authenticated;
COMMIT;
