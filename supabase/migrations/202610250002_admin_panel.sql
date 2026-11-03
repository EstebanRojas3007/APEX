-- Local preparation only. No real account promotion, invitations or activation.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;

ALTER TABLE auditoria_rol ADD COLUMN motivo TEXT NOT NULL DEFAULT 'Cambio histórico o procedimiento propietario dirigido';
ALTER TABLE auditoria_grupo ADD COLUMN motivo TEXT NOT NULL DEFAULT 'Cambio histórico o procedimiento dirigido';
-- A write token, not a duplicated administrator count. It serializes mutations
-- and forces stale REPEATABLE READ transactions to fail rather than lose the last admin.
CREATE TABLE administracion_guardia(id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),revision BIGINT NOT NULL DEFAULT 0);
INSERT INTO administracion_guardia(id) VALUES(true);
CREATE TABLE auditoria_administrativa(
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor UUID,entidad TEXT NOT NULL,destinatario TEXT NOT NULL,
 accion TEXT NOT NULL,motivo TEXT NOT NULL,anterior JSONB,nuevo JSONB,creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER administracion_auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria_administrativa FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
REVOKE ALL ON SEQUENCE auditoria_administrativa_id_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE invitacion_docente(
 id UUID PRIMARY KEY,correo TEXT NOT NULL CHECK(correo=lower(btrim(correo))),nombre TEXT NOT NULL,
 id_actor TEXT NOT NULL REFERENCES usuario(id),auth_actor UUID NOT NULL,motivo TEXT NOT NULL,
 estado TEXT NOT NULL DEFAULT 'pending' CHECK(estado IN ('pending','processing','sent','error','cancelled','expired','accepted')),
 creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),vence_en TIMESTAMPTZ NOT NULL DEFAULT now()+interval '24 hours',
 nonce UUID NOT NULL DEFAULT gen_random_uuid(),auth_destinatario UUID UNIQUE REFERENCES auth.users(id),
 lease UUID,lease_hasta TIMESTAMPTZ,enviada_en TIMESTAMPTZ,aceptada_en TIMESTAMPTZ,
 error_codigo TEXT
);
CREATE UNIQUE INDEX invitacion_docente_correo_pendiente ON invitacion_docente(correo) WHERE estado IN ('pending','processing','sent','error');
DO $$DECLARE t TEXT;BEGIN
 FOREACH t IN ARRAY ARRAY['administracion_guardia','auditoria_administrativa','invitacion_docente'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END$$;

CREATE FUNCTION administrador_actual() RETURNS usuario LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;BEGIN
 u:=actor();PERFORM 1 FROM usuario WHERE id=u.id FOR SHARE;
 SELECT * INTO u FROM usuario WHERE id=u.id;
 IF u.rol<>'administrador' OR u.estado<>'activo' THEN RAISE EXCEPTION 'Solo administrador activo.' USING ERRCODE='42501';END IF;
 RETURN u;
END$$;
CREATE FUNCTION motivo_administrativo(payload JSONB) RETURNS TEXT LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE reason TEXT:=btrim(payload->>'reason');BEGIN
 IF reason IS NULL OR length(reason) NOT BETWEEN 1 AND 1000 OR (payload->>'confirmed')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Motivo obligatorio (1 a 1000 caracteres) y confirmación requeridos.';
 END IF;RETURN reason;
END$$;
CREATE FUNCTION auditar_administracion(entity TEXT,target TEXT,action TEXT,reason TEXT,before_data JSONB,after_data JSONB) RETURNS VOID LANGUAGE sql SET search_path=apex_private,pg_catalog AS $$
 INSERT INTO auditoria_administrativa(actor,entidad,destinatario,accion,motivo,anterior,nuevo)
 VALUES(auth.uid(),entity,target,action,reason,before_data,after_data)
$$;
CREATE FUNCTION proteger_cuenta_administrativa() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF (new.rol,new.estado) IS NOT DISTINCT FROM (old.rol,old.estado) THEN RETURN new;END IF;
 UPDATE administracion_guardia SET revision=revision+1 WHERE id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Falta la guardia administrativa; requiere revisión del propietario.';END IF;
 PERFORM 1 FROM estudiante WHERE id_usuario=old.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id_estudiante=old.id AND i.estado='activo') THEN
  RAISE EXCEPTION 'La cuenta tiene un examen activo. Resuelve el intento por su flujo académico antes de cambiar rol o estado; no se suspende ni califica automáticamente.';
 END IF;
 IF old.rol='administrador' AND old.estado='activo' AND (new.rol<>'administrador' OR new.estado<>'activo')
  AND (SELECT count(*) FROM usuario WHERE rol='administrador' AND estado='activo')<=1 THEN
  RAISE EXCEPTION 'No se puede retirar ni desactivar al último administrador activo.';
 END IF;
 RETURN new;
END$$;
CREATE TRIGGER usuario_guardia_administrativa BEFORE UPDATE OF rol,estado ON usuario FOR EACH ROW EXECUTE FUNCTION proteger_cuenta_administrativa();
CREATE OR REPLACE FUNCTION auditar_grupo() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='grupo' AND TG_OP='UPDATE' AND (to_jsonb(new)-'revision')=(to_jsonb(old)-'revision') THEN RETURN new;END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(new)-'actualizada_en')=(to_jsonb(old)-'actualizada_en') THEN RETURN new;END IF;
 INSERT INTO auditoria_grupo(actor,operador,tabla,operacion,anterior,nuevo,motivo)
 VALUES(auth.uid(),session_user,TG_TABLE_NAME,TG_OP,CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(old) END,
  CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(new) END,coalesce(nullif(current_setting('apex.admin_reason',true),''),'Operación de grupo dirigida por mecanismo existente'));
 RETURN coalesce(new,old);
END$$;

CREATE FUNCTION admin_usuario_json(uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('id',u.id,'authId',u.auth_user_id,'name',u.nombre,'email',u.correo,'role',u.rol,'status',u.estado,
  'programId',e.id_programa,'program',p.nombre,'semester',e.semestre,
  'identityVerified',au.id IS NOT NULL AND lower(btrim(au.email))=lower(btrim(u.correo)) AND u.proveedor_auth='supabase' AND u.uid_auth=au.id::text,
  'emailConfirmed',au.email_confirmed_at IS NOT NULL,
  'lastSignInAt',to_jsonb(au)->>'last_sign_in_at','lastActivityAt',(SELECT max(ultima_actividad) FROM sesion_actividad WHERE id_usuario=u.id),
  'activeExams',(SELECT count(*) FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id_estudiante=u.id AND i.estado='activo'))
 FROM usuario u LEFT JOIN auth.users au ON au.id=u.auth_user_id LEFT JOIN estudiante e ON e.id_usuario=u.id
 LEFT JOIN programa_academico p ON p.id=e.id_programa WHERE u.id=uid
$$;
CREATE FUNCTION administrar_usuario(payload JSONB) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;target usuario;before_data JSONB;reason TEXT;next_role TEXT;next_status TEXT;
BEGIN
 UPDATE administracion_guardia SET revision=revision+1 WHERE id;
 u:=administrador_actual();reason:=motivo_administrativo(payload);
 PERFORM 1 FROM estudiante WHERE id_usuario=payload->>'userId' FOR UPDATE;
 SELECT * INTO target FROM usuario WHERE id=payload->>'userId' FOR UPDATE;
 IF target.id IS NULL OR target.auth_user_id IS DISTINCT FROM (payload->>'authId')::uuid
  OR (admin_usuario_json(target.id)->>'identityVerified')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Identidad no verificada o discrepante; revisa UUID Auth y perfil de dominio.';
 END IF;
 next_role:=coalesce(payload->>'role',target.rol);next_status:=coalesce(payload->>'status',target.estado);
 IF next_role NOT IN ('estudiante','docente','administrador') OR next_status NOT IN ('activo','inactivo') THEN RAISE EXCEPTION 'Rol o estado inválido.';END IF;
 IF next_role<>target.rol AND next_role IN ('docente','administrador') AND (admin_usuario_json(target.id)->>'emailConfirmed')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'La cuenta debe confirmar su correo en Auth antes de recibir un rol de personal.';
 END IF;
 IF target.id=u.id AND next_role<>target.rol THEN RAISE EXCEPTION 'No cambies tu propio rol.';END IF;
 IF EXISTS(SELECT 1 FROM invitacion_docente WHERE auth_destinatario=target.auth_user_id AND estado<>'accepted') THEN
  RAISE EXCEPTION 'Esta identidad pertenece a una invitación no aceptada. Gestiona la invitación; no actives su cuenta manualmente.';
 END IF;
 IF (target.rol,target.estado) IS NOT DISTINCT FROM (next_role,next_status) THEN RETURN jsonb_build_object('message','La cuenta ya tiene el rol y estado solicitados.');END IF;
 IF target.rol IS DISTINCT FROM payload->>'expectedRole' OR target.estado IS DISTINCT FROM payload->>'expectedStatus' THEN
  RAISE EXCEPTION 'La cuenta cambió desde la consulta. Actualiza antes de confirmar.';
 END IF;
 before_data:=admin_usuario_json(target.id);
 UPDATE usuario SET rol=next_role,estado=next_status WHERE id=target.id;
 IF next_role<>target.rol THEN
  INSERT INTO auditoria_rol(actor,destinatario,rol_anterior,rol_nuevo,motivo,origen,operador_bd)
   VALUES(u.auth_user_id,target.auth_user_id,target.rol,next_role,reason,'panel_administrador',session_user);
 END IF;
 IF next_status<>target.estado THEN PERFORM auditar_administracion('usuario',target.id,'cambiar_estado',reason,
  jsonb_build_object('status',target.estado),jsonb_build_object('status',next_status));END IF;
 RETURN jsonb_build_object('message','Cuenta actualizada; perfil, relaciones e historial conservados.');
END$$;

CREATE FUNCTION impacto_asociacion(pid TEXT,cid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('students',(SELECT count(*) FROM estudiante WHERE id_programa=pid),
 'memberships',(SELECT count(*) FROM grupo_integrante m JOIN estudiante e ON e.id_usuario=m.id_estudiante JOIN grupo g ON g.id=m.id_grupo WHERE e.id_programa=pid AND g.id_componente=cid),
 'routes',(SELECT count(*) FROM ruta_nivel_version r JOIN estudiante e ON e.id_usuario=r.id_estudiante WHERE e.id_programa=pid AND cid='ingles'),
 'assignments',(SELECT count(*) FROM asignacion_evaluacion a JOIN estudiante e ON e.id_usuario=a.id_estudiante JOIN evaluacion_componente ec ON ec.id_evaluacion=a.id_evaluacion WHERE e.id_programa=pid AND ec.id_componente=cid),
 'activeExams',(SELECT count(*) FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN estudiante e ON e.id_usuario=a.id_estudiante
  JOIN evaluacion_componente ec ON ec.id_evaluacion=a.id_evaluacion WHERE e.id_programa=pid AND ec.id_componente=cid AND i.estado='activo'),
 'canRemove',cid<>'ingles' AND NOT EXISTS(SELECT 1 FROM estudiante WHERE id_programa=pid),
 'reason',CASE WHEN cid='ingles' THEN 'Se conserva Inglés como componente principal del MVP; no se retira en esta entrega.'
  WHEN EXISTS(SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN estudiante e ON e.id_usuario=a.id_estudiante
   JOIN evaluacion_componente ec ON ec.id_evaluacion=a.id_evaluacion WHERE e.id_programa=pid AND ec.id_componente=cid AND i.estado='activo') THEN 'Hay exámenes activos del componente; no se retira la asociación ni se altera el intento.'
  WHEN EXISTS(SELECT 1 FROM estudiante WHERE id_programa=pid) THEN 'Hay perfiles vinculados. Falta definir una política de retirada que conserve grupos, rutas y evaluaciones; no se cambia la autorización.'
  ELSE 'Asociación sin perfiles afectados; su retirada no borra historial ni publica módulos.' END)
$$;
CREATE FUNCTION administrar_catalogo(operation TEXT,payload JSONB) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;reason TEXT;before_data JSONB;entity TEXT:=payload->>'entity';key TEXT:=btrim(payload->>'id');name TEXT:=btrim(payload->>'name');impact JSONB;
BEGIN
 UPDATE administracion_guardia SET revision=revision+1 WHERE id;
 u:=administrador_actual();reason:=motivo_administrativo(payload);
 IF operation='admin_catalog_save' THEN
  IF entity NOT IN ('program','component') OR key IS NULL OR key !~ '^[a-z0-9][a-z0-9_-]{0,59}$' OR name IS NULL OR length(name) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Revisa tipo, ID estable y nombre del catálogo.';END IF;
  IF entity='program' THEN
   SELECT to_jsonb(p) INTO before_data FROM programa_academico p WHERE id=key FOR UPDATE;
   INSERT INTO programa_academico VALUES(key,name) ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre;
  ELSE
   SELECT to_jsonb(c) INTO before_data FROM componente c WHERE id=key FOR UPDATE;
   INSERT INTO componente VALUES(key,name) ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre;
  END IF;
  IF before_data IS DISTINCT FROM jsonb_build_object('id',key,'nombre',name) THEN
   PERFORM auditar_administracion(entity,key,'guardar_catalogo',reason,before_data,jsonb_build_object('id',key,'nombre',name));
  END IF;
 ELSE
  -- Block profile movement into/out of this program while evaluating impact.
  -- Student profile changes already lock the student before updating program.
  PERFORM 1 FROM estudiante WHERE id_programa=payload->>'programId' ORDER BY id_usuario FOR UPDATE;
  PERFORM 1 FROM programa_academico WHERE id=payload->>'programId' FOR UPDATE;
  PERFORM 1 FROM componente WHERE id=payload->>'componentId' FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM programa_academico WHERE id=payload->>'programId') THEN RAISE EXCEPTION 'Programa o componente inexistente.';END IF;
  IF operation='admin_association_remove' THEN
   impact:=impacto_asociacion(payload->>'programId',payload->>'componentId');
   IF (impact->>'canRemove')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION '%',impact->>'reason';END IF;
   DELETE FROM programa_componente WHERE id_programa=payload->>'programId' AND id_componente=payload->>'componentId';
  ELSE
   INSERT INTO programa_componente VALUES(payload->>'programId',payload->>'componentId') ON CONFLICT DO NOTHING;
  END IF;
  IF FOUND THEN PERFORM auditar_administracion('asociacion',(payload->>'programId')||'/'||(payload->>'componentId'),operation,reason,NULL,
   jsonb_build_object('programId',payload->>'programId','componentId',payload->>'componentId','active',operation<>'admin_association_remove'));END IF;
 END IF;
 RETURN jsonb_build_object('message','Catálogo actualizado sin cambiar carreras, historiales ni publicar módulos.');
END$$;

CREATE FUNCTION invitacion_publica(i invitacion_docente) RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',i.id,'email',i.correo,'name',i.nombre,'status',CASE WHEN i.estado IN ('pending','processing','sent','error') AND i.vence_en<=clock_timestamp() THEN 'expired' ELSE i.estado END,
 'createdAt',i.creada_en,'expiresAt',i.vence_en,'sentAt',i.enviada_en,'acceptedAt',i.aceptada_en,'errorCode',i.error_codigo)
$$;
CREATE FUNCTION administrar_invitacion(operation TEXT,payload JSONB) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;reason TEXT;i invitacion_docente;invite_email TEXT:=lower(btrim(payload->>'email'));name TEXT:=btrim(payload->>'name');
BEGIN
 u:=administrador_actual();reason:=motivo_administrativo(payload);
 IF operation='admin_invite_prepare' THEN
  IF invite_email IS NULL OR length(invite_email)>254 OR invite_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR name IS NULL OR length(name) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Revisa el nombre y correo de invitación.';END IF;
  UPDATE invitacion_docente SET estado='expired',lease=NULL,lease_hasta=NULL WHERE correo=invite_email AND vence_en<=clock_timestamp() AND estado IN ('pending','processing','sent','error');
  SELECT * INTO i FROM invitacion_docente WHERE id=(payload->>'invitationId')::uuid FOR UPDATE;
  IF i.id IS NOT NULL THEN
   IF i.correo<>invite_email OR i.nombre<>name THEN RAISE EXCEPTION 'El identificador ya pertenece a otra solicitud.';END IF;
   RETURN invitacion_publica(i);
  END IF;
  IF EXISTS(SELECT 1 FROM auth.users WHERE lower(btrim(auth.users.email))=invite_email) OR EXISTS(SELECT 1 FROM usuario WHERE lower(btrim(correo))=invite_email) THEN
   RAISE EXCEPTION 'Ya existe una cuenta con ese correo. Verifica su identidad en Usuarios; no se vincula ni eleva por correo.';
  END IF;
  INSERT INTO invitacion_docente(id,correo,nombre,id_actor,auth_actor,motivo) VALUES((payload->>'invitationId')::uuid,invite_email,name,u.id,u.auth_user_id,reason)
   ON CONFLICT DO NOTHING;
  SELECT * INTO i FROM invitacion_docente WHERE id=(payload->>'invitationId')::uuid;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Ya hay una invitación pendiente para ese correo; consulta Profesores.';END IF;
  PERFORM auditar_administracion('invitacion',i.id::text,'preparar_invitacion',reason,NULL,invitacion_publica(i));
 ELSIF operation='admin_invite_resend' THEN
  SELECT * INTO i FROM invitacion_docente WHERE id=(payload->>'invitationId')::uuid FOR UPDATE;
  IF i.id IS NULL OR i.estado<>'sent' OR i.vence_en<=clock_timestamp() THEN RAISE EXCEPTION 'Solo se puede reenviar una invitación enviada, vigente y sin aceptar.';END IF;
  UPDATE invitacion_docente SET estado='pending',lease=NULL,lease_hasta=NULL WHERE id=i.id RETURNING * INTO i;
  PERFORM auditar_administracion('invitacion',i.id::text,'reenviar_invitacion',reason,NULL,invitacion_publica(i));
 ELSE
  SELECT * INTO i FROM invitacion_docente WHERE id=(payload->>'invitationId')::uuid FOR UPDATE;
  IF i.id IS NULL OR i.estado='accepted' THEN RAISE EXCEPTION 'Invitación inexistente o ya aceptada; gestiona la cuenta desde Usuarios.';END IF;
  IF i.estado<>'cancelled' THEN
   UPDATE invitacion_docente SET estado='cancelled',lease=NULL,lease_hasta=NULL WHERE id=i.id RETURNING * INTO i;
   PERFORM auditar_administracion('invitacion',i.id::text,'cancelar_invitacion',reason,NULL,invitacion_publica(i));
  END IF;
 END IF;
 RETURN invitacion_publica(i);
END$$;

-- Only a newly INSERTed Auth identity carrying the private dispatch nonce can
-- bind the invitation. Existing accounts and editable email metadata cannot.
CREATE FUNCTION vincular_invitacion_auth() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE i invitacion_docente;token TEXT:=new.raw_user_meta_data->>'apex_invite_nonce';BEGIN
 IF token IS NULL THEN RETURN new;END IF;
 SELECT * INTO i FROM invitacion_docente WHERE nonce::text=token AND correo=lower(btrim(new.email)) FOR UPDATE;
 IF i.id IS NULL OR i.estado<>'processing' OR i.vence_en<=clock_timestamp() OR i.lease_hasta<=clock_timestamp() OR i.auth_destinatario IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM usuario WHERE id=i.id_actor AND rol='administrador' AND estado='activo') THEN RAISE EXCEPTION 'Invitación inválida, vencida o cancelada.';END IF;
 UPDATE usuario SET estado='inactivo',nombre=i.nombre WHERE auth_user_id=new.id;
 UPDATE invitacion_docente SET auth_destinatario=new.id WHERE id=i.id;
 RETURN new;
END$$;
CREATE TRIGGER zz_apex_vincular_invitacion AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION vincular_invitacion_auth();

-- Narrow server-only dispatch protocol. Never exposes service credentials or
-- a generic Auth-administration capability to clients.
CREATE FUNCTION public.apex_admin_invitation_dispatch(invitation_id UUID,actor_auth UUID,step TEXT,lease_token UUID DEFAULT NULL,auth_id UUID DEFAULT NULL,failure_code TEXT DEFAULT NULL)
 RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE i invitacion_docente;BEGIN
 SELECT * INTO i FROM invitacion_docente WHERE id=invitation_id FOR UPDATE;
 IF i.id IS NULL OR NOT EXISTS(SELECT 1 FROM usuario WHERE auth_user_id=actor_auth AND rol='administrador' AND estado='activo') THEN RAISE EXCEPTION 'Administrador o invitación no autorizado.' USING ERRCODE='42501';END IF;
 IF i.vence_en<=clock_timestamp() OR i.estado IN ('cancelled','expired','accepted') THEN RAISE EXCEPTION 'Invitación vencida, cancelada o ya utilizada.';END IF;
 IF step='claim' THEN
  IF i.estado='sent' THEN RETURN jsonb_build_object('status','sent','dispatch',false);END IF;
  IF i.estado='processing' AND i.lease_hasta>clock_timestamp() THEN RETURN jsonb_build_object('status','processing','dispatch',false);END IF;
  UPDATE invitacion_docente SET estado='processing',lease=gen_random_uuid(),lease_hasta=clock_timestamp()+interval '2 minutes',error_codigo=NULL
   WHERE id=i.id RETURNING * INTO i;
  RETURN jsonb_build_object('status','processing','dispatch',true,'id',i.id,'email',i.correo,'name',i.nombre,'nonce',i.nonce,'lease',i.lease,'authId',i.auth_destinatario);
 END IF;
 IF i.lease IS DISTINCT FROM lease_token OR i.estado<>'processing' OR i.lease_hasta<=clock_timestamp() THEN RAISE EXCEPTION 'Respuesta de envío obsoleta; vuelve a consultar la invitación.';END IF;
 IF step='sent' THEN
  IF auth_id IS NULL OR auth_id IS DISTINCT FROM i.auth_destinatario OR NOT EXISTS(SELECT 1 FROM auth.users a JOIN usuario u ON u.auth_user_id=a.id
   WHERE a.id=auth_id AND lower(btrim(a.email))=i.correo AND u.estado='inactivo' AND u.rol='estudiante') THEN RAISE EXCEPTION 'Identidad de invitación no vinculada por alta Auth; no se eleva una cuenta existente.';END IF;
  UPDATE invitacion_docente SET estado='sent',enviada_en=clock_timestamp(),lease=NULL,lease_hasta=NULL WHERE id=i.id RETURNING * INTO i;
  INSERT INTO auditoria_administrativa(actor,entidad,destinatario,accion,motivo,nuevo) VALUES(actor_auth,'invitacion',i.id::text,'enviar_invitacion',i.motivo,invitacion_publica(i));
 ELSE
  UPDATE invitacion_docente SET estado='error',lease=NULL,lease_hasta=NULL,error_codigo=CASE WHEN failure_code='AUTH_EXISTS' THEN 'AUTH_EXISTS' ELSE 'DELIVERY_FAILED' END WHERE id=i.id RETURNING * INTO i;
 END IF;
 RETURN invitacion_publica(i);
END$$;

CREATE FUNCTION public.apex_accept_teacher_invitation() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE i invitacion_docente;target usuario;sid UUID:=(auth.jwt()->>'session_id')::uuid;BEGIN
 UPDATE administracion_guardia SET revision=revision+1 WHERE id;
 SELECT * INTO i FROM invitacion_docente WHERE auth_destinatario=auth.uid() FOR UPDATE;
 IF i.id IS NULL OR i.estado<>'sent' OR i.vence_en<=clock_timestamp() THEN RAISE EXCEPTION 'Invitación inválida, pendiente, vencida, cancelada o ya utilizada.' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=sid AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Sesión de invitación no válida.' USING ERRCODE='28000';END IF;
 IF NOT EXISTS(SELECT 1 FROM usuario WHERE id=i.id_actor AND rol='administrador' AND estado='activo') THEN RAISE EXCEPTION 'El administrador que autorizó la invitación ya no está habilitado.' USING ERRCODE='42501';END IF;
 SELECT * INTO target FROM usuario WHERE auth_user_id=auth.uid() FOR UPDATE;
 IF target.rol<>'estudiante' OR target.estado<>'inactivo' OR NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=auth.uid() AND lower(btrim(a.email))=i.correo
  AND length(coalesce(to_jsonb(a)->>'encrypted_password',''))>0) THEN RAISE EXCEPTION 'Establece tu propia contraseña y verifica la identidad de invitación.';END IF;
 UPDATE usuario SET rol='docente',estado='activo' WHERE id=target.id;
 UPDATE invitacion_docente SET estado='accepted',aceptada_en=clock_timestamp() WHERE id=i.id;
 INSERT INTO auditoria_rol(actor,destinatario,rol_anterior,rol_nuevo,motivo,origen,operador_bd)
  VALUES(i.auth_actor,target.auth_user_id,'estudiante','docente',i.motivo,'invitacion_aceptada',session_user);
 INSERT INTO auditoria_administrativa(actor,entidad,destinatario,accion,motivo,nuevo)
  VALUES(i.auth_actor,'invitacion',i.id::text,'aceptar_invitacion',i.motivo,jsonb_build_object('authId',target.auth_user_id,'role','docente'));
 RETURN '{"accepted":true}'::jsonb;
END$$;

CREATE FUNCTION public.apex_teacher_invitation_status() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE i invitacion_docente;BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=(auth.jwt()->>'session_id')::uuid AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE='28000';END IF;
 SELECT * INTO i FROM invitacion_docente WHERE auth_destinatario=auth.uid();
 RETURN jsonb_build_object('required',i.id IS NOT NULL AND i.estado<>'accepted','status',i.estado);
END$$;

CREATE FUNCTION administrar_lectura(operation TEXT,payload JSONB) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;data JSONB;total INTEGER;page INTEGER:=coalesce((payload->>'page')::integer,0);size INTEGER:=coalesce((payload->>'pageSize')::integer,20);
 query TEXT:=lower(btrim(coalesce(payload->>'search','')));role_filter TEXT:=nullif(payload->>'role','');state_filter TEXT:=nullif(payload->>'status','');gid UUID;
BEGIN
 u:=administrador_actual();
 IF page NOT BETWEEN 0 AND 100000 OR size NOT BETWEEN 1 AND 50 OR length(query)>200 THEN RAISE EXCEPTION 'Paginación o búsqueda inválida.';END IF;
 IF operation='admin_overview' THEN
  RETURN jsonb_build_object('students',jsonb_build_object('active',(SELECT count(*) FROM usuario WHERE rol='estudiante' AND estado='activo'),'inactive',(SELECT count(*) FROM usuario WHERE rol='estudiante' AND estado='inactivo')),
   'teachers',jsonb_build_object('active',(SELECT count(*) FROM usuario WHERE rol='docente' AND estado='activo'),'inactive',(SELECT count(*) FROM usuario WHERE rol='docente' AND estado='inactivo')),
   'groups',jsonb_build_object('active',(SELECT count(*) FROM grupo WHERE estado='activo'),'inactive',(SELECT count(*) FROM grupo WHERE estado='inactivo')));
 ELSIF operation='admin_users' THEN
  IF role_filter IS NOT NULL AND role_filter NOT IN ('estudiante','docente','administrador') OR state_filter IS NOT NULL AND state_filter NOT IN ('activo','inactivo') THEN RAISE EXCEPTION 'Filtro inválido.';END IF;
  SELECT count(*) INTO total FROM usuario us WHERE (role_filter IS NULL OR us.rol=role_filter) AND (state_filter IS NULL OR us.estado=state_filter) AND lower(us.nombre||' '||us.correo||' '||us.id) LIKE '%'||query||'%';
  SELECT coalesce(jsonb_agg(admin_usuario_json(id) ORDER BY nombre,id),'[]'::jsonb) INTO data FROM (
   SELECT us.id,us.nombre FROM usuario us WHERE (role_filter IS NULL OR us.rol=role_filter) AND (state_filter IS NULL OR us.estado=state_filter)
    AND lower(us.nombre||' '||us.correo||' '||us.id) LIKE '%'||query||'%' ORDER BY us.nombre,us.id LIMIT size OFFSET page*size) rows;
 ELSIF operation='admin_groups' THEN
  SELECT count(*) INTO total FROM grupo WHERE lower(codigo||' '||nombre) LIKE '%'||query||'%' AND (state_filter IS NULL OR estado=state_filter);
  SELECT coalesce(jsonb_agg(grupo_json(id) ORDER BY codigo,id),'[]'::jsonb) INTO data FROM (SELECT id,codigo FROM grupo WHERE lower(codigo||' '||nombre) LIKE '%'||query||'%'
   AND (state_filter IS NULL OR estado=state_filter) ORDER BY codigo,id LIMIT size OFFSET page*size) rows;
 ELSIF operation='admin_group_detail' THEN
  gid:=(payload->>'groupId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM grupo WHERE id=gid) THEN RAISE EXCEPTION 'Salón inexistente.';END IF;
  RETURN jsonb_build_object('group',grupo_json(gid),
   'teachers',coalesce((SELECT jsonb_agg(admin_usuario_json(d.id_docente)||jsonb_build_object('assigned',d.activa) ORDER BY d.id_docente) FROM grupo_docente d WHERE d.id_grupo=gid),'[]'::jsonb),
   'students',coalesce((SELECT jsonb_agg(admin_usuario_json(m.id_estudiante)||jsonb_build_object('assigned',m.activa) ORDER BY m.id_estudiante) FROM grupo_integrante m WHERE m.id_grupo=gid),'[]'::jsonb));
 ELSIF operation='admin_catalog' THEN
  RETURN jsonb_build_object('programs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nombre) ORDER BY nombre,id),'[]'::jsonb) FROM programa_academico),
   'components',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nombre) ORDER BY nombre,id),'[]'::jsonb) FROM componente),
   'associations',(SELECT coalesce(jsonb_agg(jsonb_build_object('programId',id_programa,'componentId',id_componente,'impact',impacto_asociacion(id_programa,id_componente)) ORDER BY id_programa,id_componente),'[]'::jsonb) FROM programa_componente));
 ELSIF operation='admin_invitations' THEN
  SELECT count(*) INTO total FROM invitacion_docente WHERE lower(correo||' '||nombre) LIKE '%'||query||'%';
  SELECT coalesce(jsonb_agg(invitacion_publica(i) ORDER BY creada_en DESC,id),'[]'::jsonb) INTO data FROM (SELECT * FROM invitacion_docente
   WHERE lower(correo||' '||nombre) LIKE '%'||query||'%' ORDER BY creada_en DESC,id LIMIT size OFFSET page*size) i;
 ELSIF operation='admin_audit' THEN
  WITH events AS (
   SELECT 'rol-'||id id,actor,creado_en fecha,destinatario::text target,'usuario' entity,'cambiar_rol' action,motivo reason,
    jsonb_build_object('role',rol_anterior) before_data,jsonb_build_object('role',rol_nuevo) after_data FROM auditoria_rol
   UNION ALL SELECT 'grupo-'||id,actor,creado_en,coalesce(nuevo->>'id',anterior->>'id',nuevo->>'id_grupo',anterior->>'id_grupo'),tabla,operacion,motivo,
    anterior-ARRAY['revision','actualizada_en'],nuevo-ARRAY['revision','actualizada_en'] FROM auditoria_grupo
   UNION ALL SELECT 'admin-'||id,actor,creado_en,destinatario,entidad,accion,motivo,anterior,nuevo FROM auditoria_administrativa),
  filtered AS (SELECT * FROM events WHERE lower(coalesce(target,'')||' '||entity||' '||action||' '||reason||' '||coalesce(actor::text,'')) LIKE '%'||query||'%'
   AND (nullif(payload->>'entity','') IS NULL OR entity=payload->>'entity') AND (nullif(payload->>'action','') IS NULL OR action=payload->>'action')
   AND (nullif(payload->>'fromDate','') IS NULL OR (fecha AT TIME ZONE 'America/Bogota')::date>=(payload->>'fromDate')::date)
   AND (nullif(payload->>'toDate','') IS NULL OR (fecha AT TIME ZONE 'America/Bogota')::date<=(payload->>'toDate')::date)),
  selected AS (SELECT * FROM filtered ORDER BY fecha DESC,id DESC LIMIT size OFFSET page*size)
  SELECT (SELECT count(*) FROM filtered),coalesce(jsonb_agg(jsonb_build_object('id',id,'actor',actor,'createdAt',fecha,'target',target,'entity',entity,'action',action,'reason',reason,'before',before_data,'after',after_data) ORDER BY fecha DESC,id DESC),'[]'::jsonb)
   INTO total,data FROM selected;
 ELSE RAISE EXCEPTION 'Consulta administrativa desconocida.';END IF;
 RETURN jsonb_build_object('rows',data,'total',total,'page',page,'pageSize',size);
END$$;

ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_admin;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;data JSONB;target usuario;BEGIN
 IF operation='set_role' THEN
  -- Preserve the existing Auth-UUID endpoint, now with the same safeguards and
  -- mandatory reason/confirmation as the new domain-ID operation.
  u:=actor();IF u.rol<>'administrador' THEN RAISE EXCEPTION 'Solo administrador activo.' USING ERRCODE='42501';END IF;
  SELECT * INTO target FROM usuario WHERE auth_user_id=(payload->>'userId')::uuid;
  RETURN administrar_usuario(payload||jsonb_build_object('userId',target.id,'authId',target.auth_user_id,'expectedRole',coalesce(payload->>'expectedRole',target.rol),'expectedStatus',coalesce(payload->>'expectedStatus',target.estado)));
 END IF;
 IF operation LIKE 'admin_%' THEN
  IF operation='admin_user_update' THEN RETURN administrar_usuario(payload);END IF;
  IF operation IN ('admin_catalog_save','admin_association_add','admin_association_remove') THEN RETURN administrar_catalogo(operation,payload);END IF;
  IF operation IN ('admin_invite_prepare','admin_invite_cancel','admin_invite_resend') THEN RETURN administrar_invitacion(operation,payload);END IF;
  u:=administrador_actual();
  IF operation LIKE 'admin_group_%' AND operation IN ('admin_group_save','admin_group_teacher','admin_group_member') THEN
   PERFORM set_config('apex.admin_reason',coalesce(nullif(btrim(payload->>'reason'),''),'Operación de grupo dirigida por mecanismo existente'),true);
   RETURN public.apex_api_pre_admin(operation,payload);
  END IF;
  RETURN administrar_lectura(operation,payload);
 END IF;
 RETURN public.apex_api_pre_admin(operation,payload);
END$$;
REVOKE ALL ON FUNCTION administrador_actual(),motivo_administrativo(JSONB),auditar_administracion(TEXT,TEXT,TEXT,TEXT,JSONB,JSONB),proteger_cuenta_administrativa(),
 auditar_grupo(),admin_usuario_json(TEXT),administrar_usuario(JSONB),impacto_asociacion(TEXT,TEXT),administrar_catalogo(TEXT,JSONB),invitacion_publica(invitacion_docente),
 administrar_invitacion(TEXT,JSONB),vincular_invitacion_auth(),administrar_lectura(TEXT,JSONB),public.apex_api_pre_admin(TEXT,JSONB),public.apex_api(TEXT,JSONB),
 public.apex_admin_invitation_dispatch(UUID,UUID,TEXT,UUID,UUID,TEXT),public.apex_accept_teacher_invitation(),public.apex_teacher_invitation_status() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB),public.apex_accept_teacher_invitation(),public.apex_teacher_invitation_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apex_admin_invitation_dispatch(UUID,UUID,TEXT,UUID,UUID,TEXT) TO service_role;
COMMIT;
