-- EJEMPLO: revisar en una base local desechable y con autorización independiente.
-- REEMPLAZAR_* son marcadores obligatorios. Sin sustituirlos falla antes de escribir.
-- No es una migración ni un procedimiento automático de instalación.
-- EXPLICIT OWNER INITIALIZATION. NOT a migration; never run by the client/service.
-- Requiere verificación independiente de identidad y migración administrativa existente.
BEGIN;
DO $$
DECLARE target apex_private.usuario;
 auth_id CONSTANT UUID:='REEMPLAZAR_UUID_AUTH';
 expected_email CONSTANT TEXT:='REEMPLAZAR_CORREO_AUTORIZADO';
BEGIN
 IF expected_email LIKE '%REEMPLAZAR_%' THEN RAISE EXCEPTION 'Sustituye el marcador de correo autorizado antes de ejecutar.'; END IF;
 IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='apex_private.usuario'::regclass)) THEN
  RAISE EXCEPTION 'Solo el propietario SQL de usuario puede ejecutar esta inicialización.' USING ERRCODE='42501';
 END IF;
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'No suplantes una sesión; ejecuta como propietario sin identidad Auth de aplicación.';END IF;
 UPDATE apex_private.administracion_guardia SET revision=revision+1 WHERE id;
 PERFORM 1 FROM auth.users WHERE id=auth_id AND lower(btrim(email))=expected_email FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UUID Auth y correo designados no coinciden; no se promueve por correo.';END IF;
 SELECT * INTO target FROM apex_private.usuario WHERE auth_user_id=auth_id;
 PERFORM 1 FROM apex_private.estudiante WHERE id_usuario=target.id FOR UPDATE;
 SELECT * INTO target FROM apex_private.usuario WHERE auth_user_id=auth_id FOR UPDATE;
 IF target.id IS NULL OR target.estado<>'activo' OR target.proveedor_auth<>'supabase' OR target.uid_auth<>auth_id::text
  OR lower(btrim(target.correo))<>expected_email THEN RAISE EXCEPTION 'Identidad de dominio discrepante, sin vincular o inactiva: revisión manual requerida.';END IF;
 IF EXISTS(SELECT 1 FROM apex_private.invitacion_docente WHERE auth_destinatario=auth_id AND estado<>'accepted') THEN RAISE EXCEPTION 'La cuenta tiene una invitación pendiente de resolver.';END IF;
 IF target.rol='administrador' THEN RETURN;END IF;
 IF EXISTS(SELECT 1 FROM apex_private.intento i JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id_estudiante=target.id AND i.estado='activo') THEN
  RAISE EXCEPTION 'La cuenta tiene un examen activo; la promoción no lo suspende ni califica.';
 END IF;
 INSERT INTO apex_private.auditoria_rol(actor,destinatario,rol_anterior,rol_nuevo,origen,operador_bd,motivo)
 VALUES(NULL,auth_id,target.rol,'administrador','inicializacion_propietario_20261025',session_user,'Primer administrador designado por el responsable del proyecto');
 UPDATE apex_private.usuario SET rol='administrador' WHERE id=target.id;
END$$;
COMMIT;
