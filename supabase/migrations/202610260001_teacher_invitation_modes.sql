-- Local preparation only. Extend the existing invitation saga; no mail or role backfill.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
ALTER TABLE usuario ADD COLUMN revision_cuenta BIGINT NOT NULL DEFAULT 0;
CREATE FUNCTION revisar_cuenta_invitacion() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (new.rol,new.estado,new.correo,new.auth_user_id,new.uid_auth,new.proveedor_auth) IS DISTINCT FROM
    (old.rol,old.estado,old.correo,old.auth_user_id,old.uid_auth,old.proveedor_auth) THEN
  new.revision_cuenta:=old.revision_cuenta+1;
 END IF;
 RETURN new;
END$$;
CREATE TRIGGER usuario_revision_invitacion BEFORE UPDATE ON usuario FOR EACH ROW EXECUTE FUNCTION revisar_cuenta_invitacion();
ALTER TABLE invitacion_docente
 ADD COLUMN modalidad TEXT NOT NULL DEFAULT 'new' CHECK(modalidad IN ('new','existing')),
 ADD COLUMN id_destinatario TEXT REFERENCES usuario(id),
 ADD COLUMN rol_esperado TEXT NOT NULL DEFAULT 'estudiante',
 ADD COLUMN estado_esperado TEXT NOT NULL DEFAULT 'inactivo',
 ADD COLUMN revision_esperada BIGINT NOT NULL DEFAULT 0,
 ADD COLUMN rol_propuesto TEXT NOT NULL DEFAULT 'docente' CHECK(rol_propuesto='docente');
ALTER TABLE invitacion_docente DROP CONSTRAINT invitacion_docente_auth_destinatario_key;
CREATE UNIQUE INDEX invitacion_docente_auth_pendiente ON invitacion_docente(auth_destinatario)
 WHERE estado IN ('pending','processing','sent','error');
-- Capture already-bound requests without changing any account, role or history.
UPDATE invitacion_docente i SET id_destinatario=u.id,revision_esperada=u.revision_cuenta
 FROM usuario u WHERE i.auth_destinatario=u.auth_user_id;

CREATE OR REPLACE FUNCTION vincular_invitacion_auth() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE i invitacion_docente;t usuario;token TEXT:=new.raw_user_meta_data->>'apex_invite_nonce';BEGIN
 IF token IS NULL THEN RETURN new;END IF;
 SELECT * INTO i FROM invitacion_docente WHERE nonce::text=token AND correo=lower(btrim(new.email)) FOR UPDATE;
 IF i.id IS NULL OR i.modalidad<>'new' OR i.estado<>'processing' OR i.vence_en<=clock_timestamp() OR i.lease_hasta<=clock_timestamp() OR i.auth_destinatario IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM usuario WHERE id=i.id_actor AND auth_user_id=i.auth_actor AND rol='administrador' AND estado='activo') THEN RAISE EXCEPTION 'Invitación inválida, vencida o cancelada.';END IF;
 UPDATE usuario SET estado='inactivo',nombre=i.nombre WHERE auth_user_id=new.id RETURNING * INTO t;
 IF t.id IS NULL THEN RAISE EXCEPTION 'No se pudo vincular el perfil de invitación.';END IF;
 UPDATE invitacion_docente SET auth_destinatario=new.id,id_destinatario=t.id,revision_esperada=t.revision_cuenta WHERE id=i.id;
 RETURN new;
END$$;

-- Preserve the existing mutation implementation, limiting its quarantine to new
-- Auth identities. Existing recipients remain ordinary active accounts and can
-- be managed; any intervening change makes their invitation snapshot obsolete.
DO $migration$
DECLARE definition TEXT;old_clause TEXT:='WHERE auth_destinatario=target.auth_user_id AND estado<>''accepted''';BEGIN
 definition:=pg_get_functiondef('apex_private.administrar_usuario(jsonb)'::regprocedure);
 IF position(old_clause IN definition)=0 THEN RAISE EXCEPTION 'Unexpected administrar_usuario definition; inspect preflight before migration.';END IF;
 EXECUTE replace(definition,old_clause,old_clause||' AND modalidad=''new''');
END$migration$;

CREATE OR REPLACE FUNCTION invitacion_publica(i invitacion_docente) RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',i.id,'email',i.correo,'name',i.nombre,'mode',i.modalidad,'userId',i.id_destinatario,
 'currentRole',i.rol_esperado,'proposedRole',i.rol_propuesto,'reason',i.motivo,
 'status',CASE WHEN i.estado IN ('pending','processing','sent','error') AND i.vence_en<=clock_timestamp() THEN 'expired' ELSE i.estado END,
 'createdAt',i.creada_en,'expiresAt',i.vence_en,'sentAt',i.enviada_en,'acceptedAt',i.aceptada_en,'errorCode',i.error_codigo)
$$;

CREATE FUNCTION destinatario_invitacion(uid TEXT) RETURNS usuario LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE t usuario;BEGIN
 SELECT * INTO t FROM usuario WHERE id=uid;
 IF t.id IS NULL OR (admin_usuario_json(t.id)->>'identityVerified')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'ID APEX no encontrado o identidad sin verificar.';
 END IF;
 IF t.rol<>'estudiante' OR t.estado<>'activo' THEN RAISE EXCEPTION 'La cuenta debe ser un estudiante activo para proponer el rol Profesor.';END IF;
 IF (admin_usuario_json(t.id)->>'emailConfirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'La cuenta debe confirmar su correo antes de recibir la invitación.';END IF;
 RETURN t;
END$$;

CREATE OR REPLACE FUNCTION administrar_invitacion(operation TEXT,payload JSONB) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;t usuario;i invitacion_docente;reason TEXT;mode TEXT:=coalesce(payload->>'mode','new');
 recipient_email TEXT:=lower(btrim(payload->>'email'));name TEXT:=btrim(payload->>'name');BEGIN
 UPDATE administracion_guardia SET revision=revision+1 WHERE id;
 u:=administrador_actual();reason:=motivo_administrativo(payload);
 IF operation='admin_invite_prepare' THEN
  IF mode NOT IN ('new','existing') OR coalesce(payload->>'role','docente')<>'docente' THEN RAISE EXCEPTION 'Solo se permite invitar con rol Profesor (docente).';END IF;
  SELECT * INTO i FROM invitacion_docente WHERE id=(payload->>'invitationId')::uuid FOR UPDATE;
  IF i.id IS NOT NULL THEN
   IF i.modalidad<>mode OR i.motivo<>reason OR i.auth_actor<>u.auth_user_id OR
    (mode='existing' AND i.id_destinatario IS DISTINCT FROM payload->>'userId') OR
    (mode='new' AND (i.correo IS DISTINCT FROM recipient_email OR i.nombre IS DISTINCT FROM name)) THEN
    RAISE EXCEPTION 'El identificador ya pertenece a otra solicitud.';END IF;
   RETURN invitacion_publica(i);
  END IF;
  IF mode='existing' THEN
   t:=destinatario_invitacion(payload->>'userId');
   IF payload->>'expectedRole' IS DISTINCT FROM t.rol OR payload->>'expectedStatus' IS DISTINCT FROM t.estado OR
    (payload->>'expectedRevision')::bigint IS DISTINCT FROM t.revision_cuenta THEN RAISE EXCEPTION 'La cuenta cambió desde la consulta. Consulta otra vez el ID APEX.';END IF;
   IF EXISTS(SELECT 1 FROM intento x JOIN asignacion_evaluacion a ON a.id=x.id_asignacion WHERE a.id_estudiante=t.id AND x.estado='activo') THEN
    RAISE EXCEPTION 'La cuenta tiene un examen activo. Resuélvelo por su flujo académico.';END IF;
   recipient_email:=lower(btrim(t.correo));name:=t.nombre;
  ELSE
   IF recipient_email IS NULL OR length(recipient_email)>254 OR recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR name IS NULL OR length(name) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Revisa el nombre y correo de invitación.';END IF;
   IF EXISTS(SELECT 1 FROM auth.users a WHERE lower(btrim(a.email))=recipient_email) OR EXISTS(SELECT 1 FROM usuario WHERE lower(btrim(correo))=recipient_email) THEN
    RAISE EXCEPTION 'Ya existe una cuenta con ese correo. Utiliza Invitar profesor con cuenta existente y su ID APEX.';END IF;
  END IF;
  -- Expiration is terminal and audited; do not recycle the old authorization.
  FOR i IN SELECT * FROM invitacion_docente WHERE correo=recipient_email AND vence_en<=clock_timestamp() AND estado IN ('pending','processing','sent','error') FOR UPDATE LOOP
   UPDATE invitacion_docente SET estado='expired',nonce=gen_random_uuid(),lease=NULL,lease_hasta=NULL WHERE id=i.id;
   PERFORM auditar_administracion('invitacion',i.id::text,'vencer_invitacion',i.motivo,NULL,jsonb_build_object('status','expired'));
  END LOOP;
  INSERT INTO invitacion_docente(id,correo,nombre,id_actor,auth_actor,motivo,modalidad,id_destinatario,auth_destinatario,rol_esperado,estado_esperado,revision_esperada)
   VALUES((payload->>'invitationId')::uuid,recipient_email,name,u.id,u.auth_user_id,reason,mode,t.id,t.auth_user_id,coalesce(t.rol,'estudiante'),coalesce(t.estado,'inactivo'),coalesce(t.revision_cuenta,0)) ON CONFLICT DO NOTHING;
  SELECT * INTO i FROM invitacion_docente WHERE id=(payload->>'invitationId')::uuid;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Ya hay una invitación pendiente para esa cuenta; consulta Profesores.';END IF;
  PERFORM auditar_administracion('invitacion',i.id::text,'preparar_invitacion',reason,NULL,invitacion_publica(i));
 ELSE
  SELECT * INTO i FROM invitacion_docente WHERE id=(payload->>'invitationId')::uuid FOR UPDATE;
  IF operation='admin_invite_resend' THEN
   IF i.id IS NULL OR i.estado<>'sent' OR i.vence_en<=clock_timestamp() THEN RAISE EXCEPTION 'Solo se puede reenviar una invitación enviada, vigente y sin aceptar.';END IF;
   UPDATE invitacion_docente SET estado='pending',nonce=gen_random_uuid(),lease=NULL,lease_hasta=NULL WHERE id=i.id RETURNING * INTO i;
   PERFORM auditar_administracion('invitacion',i.id::text,'reenviar_invitacion',reason,NULL,invitacion_publica(i));
  ELSE
   IF i.id IS NULL OR i.estado='accepted' THEN RAISE EXCEPTION 'Invitación inexistente o ya aceptada; gestiona la cuenta desde Usuarios.';END IF;
   IF i.estado<>'cancelled' THEN
    UPDATE invitacion_docente SET estado='cancelled',nonce=gen_random_uuid(),lease=NULL,lease_hasta=NULL WHERE id=i.id RETURNING * INTO i;
    PERFORM auditar_administracion('invitacion',i.id::text,'cancelar_invitacion',reason,NULL,invitacion_publica(i));
   END IF;
  END IF;
 END IF;
 RETURN invitacion_publica(i);
END$$;

-- Keep every legacy account operation and its guards, but close both promotion entry points.
ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_invitation_modes;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE t usuario;u usuario;BEGIN
 IF operation='admin_invite_lookup' THEN
  u:=administrador_actual();t:=destinatario_invitacion(payload->>'userId');
  RETURN admin_usuario_json(t.id)||jsonb_build_object('revision',t.revision_cuenta);
 END IF;
 IF operation IN ('admin_user_update','set_role') THEN
  UPDATE administracion_guardia SET revision=revision+1 WHERE id;
  u:=administrador_actual();
  IF operation='set_role' THEN SELECT * INTO t FROM usuario WHERE auth_user_id=(payload->>'userId')::uuid;
  ELSE SELECT * INTO t FROM usuario WHERE id=payload->>'userId';END IF;
  IF t.rol='estudiante' AND payload->>'role'='docente' THEN
   RAISE EXCEPTION 'Para pasar de Estudiante a Profesor utiliza la invitación con cuenta existente en Profesores; requiere aceptación del destinatario.';
  END IF;
 END IF;
 RETURN public.apex_api_pre_invitation_modes(operation,payload);
END$$;

CREATE OR REPLACE FUNCTION public.apex_admin_invitation_dispatch(invitation_id UUID,actor_auth UUID,step TEXT,lease_token UUID DEFAULT NULL,auth_id UUID DEFAULT NULL,failure_code TEXT DEFAULT NULL)
 RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE i invitacion_docente;BEGIN
 UPDATE administracion_guardia SET revision=revision+1 WHERE id;
 SELECT * INTO i FROM invitacion_docente WHERE id=invitation_id FOR UPDATE;
 IF i.id IS NULL OR NOT EXISTS(SELECT 1 FROM usuario WHERE auth_user_id=actor_auth AND rol='administrador' AND estado='activo') OR
  NOT EXISTS(SELECT 1 FROM usuario WHERE id=i.id_actor AND auth_user_id=i.auth_actor AND rol='administrador' AND estado='activo') THEN
  RAISE EXCEPTION 'Administrador o invitación no autorizado.' USING ERRCODE='42501';END IF;
 IF i.vence_en<=clock_timestamp() OR i.estado IN ('cancelled','expired','accepted') THEN RAISE EXCEPTION 'Invitación vencida, cancelada o ya utilizada.';END IF;
 IF step='claim' THEN
  IF i.estado='sent' THEN RETURN jsonb_build_object('status','sent','dispatch',false);END IF;
  IF i.estado='processing' AND i.lease_hasta>clock_timestamp() THEN RETURN jsonb_build_object('status','processing','dispatch',false);END IF;
  IF i.modalidad='existing' AND NOT EXISTS(SELECT 1 FROM usuario u JOIN auth.users a ON a.id=u.auth_user_id WHERE u.id=i.id_destinatario AND u.auth_user_id=i.auth_destinatario
   AND u.rol=i.rol_esperado AND u.estado=i.estado_esperado AND u.revision_cuenta=i.revision_esperada AND lower(btrim(a.email))=i.correo) THEN RAISE EXCEPTION 'La cuenta cambió desde la invitación; cancela y revisa su identidad.';END IF;
  UPDATE invitacion_docente SET estado='processing',lease=gen_random_uuid(),lease_hasta=clock_timestamp()+interval '2 minutes',error_codigo=NULL WHERE id=i.id RETURNING * INTO i;
  RETURN jsonb_build_object('status','processing','dispatch',true,'id',i.id,'email',i.correo,'name',i.nombre,'mode',i.modalidad,'nonce',i.nonce,'lease',i.lease,'authId',i.auth_destinatario);
 END IF;
 IF i.lease IS DISTINCT FROM lease_token OR i.estado<>'processing' OR i.lease_hasta<=clock_timestamp() THEN RAISE EXCEPTION 'Respuesta de envío obsoleta; vuelve a consultar la invitación.';END IF;
 IF step='sent' THEN
  IF auth_id IS NULL OR auth_id IS DISTINCT FROM i.auth_destinatario OR NOT EXISTS(SELECT 1 FROM auth.users a JOIN usuario u ON u.auth_user_id=a.id
   WHERE a.id=auth_id AND lower(btrim(a.email))=i.correo AND u.rol=i.rol_esperado AND u.estado=i.estado_esperado) THEN RAISE EXCEPTION 'Identidad de invitación no vinculada o modificada.';END IF;
  UPDATE invitacion_docente SET estado='sent',enviada_en=clock_timestamp(),lease=NULL,lease_hasta=NULL WHERE id=i.id RETURNING * INTO i;
 ELSE
  IF step<>'error' THEN RAISE EXCEPTION 'Operación de envío inválida.';END IF;
  UPDATE invitacion_docente SET estado='error',lease=NULL,lease_hasta=NULL,error_codigo=CASE WHEN failure_code IN ('AUTH_EXISTS','AUTH_FAILED','AUTH_UNAVAILABLE','MAIL_NOT_CONFIGURED','MAIL_REJECTED','AUTH_RATE_LIMIT','AUTH_MAIL_REJECTED','SERVICE_CONFIG','INVITATION_CONFLICT','DELIVERY_FAILED') THEN failure_code ELSE 'DELIVERY_FAILED' END WHERE id=i.id RETURNING * INTO i;
 END IF;
 INSERT INTO auditoria_administrativa(actor,entidad,destinatario,accion,motivo,nuevo)
 VALUES(actor_auth,'invitacion',i.id::text,CASE WHEN step='sent' THEN 'enviar_invitacion' ELSE 'error_envio_invitacion' END,i.motivo,invitacion_publica(i));
 RETURN invitacion_publica(i);
END$$;

CREATE FUNCTION public.apex_teacher_invitation_review(invitation_id UUID DEFAULT NULL,invitation_token UUID DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE i invitacion_docente;BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=(auth.jwt()->>'session_id')::uuid AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Inicia sesión con la cuenta destinataria.' USING ERRCODE='28000';END IF;
 IF invitation_id IS NULL THEN
  SELECT * INTO i FROM invitacion_docente WHERE auth_destinatario=auth.uid() AND modalidad='new' ORDER BY creada_en DESC LIMIT 1;
 ELSE SELECT * INTO i FROM invitacion_docente WHERE id=invitation_id;END IF;
 IF i.id IS NULL OR i.auth_destinatario IS DISTINCT FROM auth.uid() OR (i.modalidad='existing' AND i.nonce IS DISTINCT FROM invitation_token) THEN
  RAISE EXCEPTION 'Enlace inválido o cuenta destinataria incorrecta.';END IF;
 RETURN invitacion_publica(i);
END$$;

CREATE FUNCTION public.apex_accept_teacher_invitation_v2(invitation_id UUID DEFAULT NULL,invitation_token UUID DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE i invitacion_docente;t usuario;BEGIN
 UPDATE administracion_guardia SET revision=revision+1 WHERE id;
 -- Verify authenticated recipient and private capability without exposing either to audit.
 PERFORM public.apex_teacher_invitation_review(invitation_id,invitation_token);
 IF invitation_id IS NULL THEN SELECT * INTO i FROM invitacion_docente WHERE auth_destinatario=auth.uid() AND modalidad='new' ORDER BY creada_en DESC LIMIT 1 FOR UPDATE;
 ELSE SELECT * INTO i FROM invitacion_docente WHERE id=invitation_id FOR UPDATE;END IF;
 IF i.estado='accepted' THEN RETURN '{"accepted":true,"alreadyAccepted":true}'::jsonb;END IF;
 IF i.estado<>'sent' OR i.vence_en<=clock_timestamp() THEN RAISE EXCEPTION 'Invitación inválida, pendiente, vencida, cancelada o ya utilizada.';END IF;
 IF NOT EXISTS(SELECT 1 FROM usuario WHERE id=i.id_actor AND auth_user_id=i.auth_actor AND rol='administrador' AND estado='activo') THEN RAISE EXCEPTION 'El administrador que autorizó la invitación ya no está habilitado.';END IF;
 PERFORM 1 FROM estudiante WHERE id_usuario=(SELECT id FROM usuario WHERE auth_user_id=auth.uid()) FOR UPDATE;
 SELECT * INTO t FROM usuario WHERE auth_user_id=auth.uid() FOR UPDATE;
 IF t.id IS NULL OR t.rol<>i.rol_esperado OR t.estado<>i.estado_esperado OR i.rol_propuesto<>'docente' OR
  (t.id IS DISTINCT FROM i.id_destinatario OR t.revision_cuenta<>i.revision_esperada) OR
  (admin_usuario_json(t.id)->>'identityVerified')::boolean IS DISTINCT FROM true OR
  NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=auth.uid() AND lower(btrim(a.email))=i.correo AND a.email_confirmed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'La identidad, el rol o el estado cambiaron desde la invitación. Solicita una revisión al administrador.';END IF;
 IF i.modalidad='new' AND NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=auth.uid() AND length(coalesce(to_jsonb(a)->>'encrypted_password',''))>0) THEN RAISE EXCEPTION 'Establece tu propia contraseña antes de aceptar.';END IF;
 UPDATE usuario SET rol='docente',estado='activo' WHERE id=t.id;
 UPDATE invitacion_docente SET estado='accepted',aceptada_en=clock_timestamp() WHERE id=i.id;
 INSERT INTO auditoria_rol(actor,destinatario,rol_anterior,rol_nuevo,motivo,origen,operador_bd)
 VALUES(i.auth_actor,t.auth_user_id,t.rol,'docente',i.motivo,'invitacion_aceptada',session_user);
 INSERT INTO auditoria_administrativa(actor,entidad,destinatario,accion,motivo,nuevo)
 VALUES(i.auth_actor,'invitacion',i.id::text,'aceptar_invitacion',i.motivo,jsonb_build_object('userId',t.id,'role','docente'));
 RETURN '{"accepted":true}'::jsonb;
END$$;
-- Older clients called this automatically after saving a password. Refuse that
-- path so a staggered deployment cannot silently bypass explicit acceptance.
CREATE OR REPLACE FUNCTION public.apex_accept_teacher_invitation() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'Actualiza APEX para revisar y aceptar explícitamente la invitación de Profesor. Guardar una contraseña no acepta el rol.';
END
$$;
CREATE OR REPLACE FUNCTION public.apex_teacher_invitation_status() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE i invitacion_docente;BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=(auth.jwt()->>'session_id')::uuid AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE='28000';END IF;
 SELECT * INTO i FROM invitacion_docente WHERE auth_destinatario=auth.uid() AND modalidad='new' ORDER BY creada_en DESC LIMIT 1;
 RETURN jsonb_build_object('required',i.id IS NOT NULL AND i.estado<>'accepted','status',i.estado);
END$$;
REVOKE ALL ON FUNCTION revisar_cuenta_invitacion(),destinatario_invitacion(TEXT),public.apex_api_pre_invitation_modes(TEXT,JSONB),public.apex_api(TEXT,JSONB),public.apex_teacher_invitation_review(UUID,UUID),public.apex_accept_teacher_invitation_v2(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB),public.apex_teacher_invitation_review(UUID,UUID),public.apex_accept_teacher_invitation_v2(UUID,UUID) TO authenticated;
COMMIT;
