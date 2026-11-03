-- EJEMPLO: revisar en una base local desechable y con autorización independiente.
-- REEMPLAZAR_* son marcadores obligatorios. Sin sustituirlos falla antes de escribir.
-- No es una migración ni un procedimiento automático de instalación.
-- EXPLICIT OWNER-ONLY initialization. Verificar primero la identidad autorizada y
-- apply 202610220001. This file is NOT a migration and is never run by the app.
-- In a normal authenticated admin session use apex_api('set_role',...) instead.
-- No JWT, auth.uid or actor() is forged. The SQL owner is a separate trust boundary.
BEGIN;
DO $$
DECLARE target apex_private.usuario;auth_id CONSTANT UUID:='REEMPLAZAR_UUID_AUTH';
BEGIN
 IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='apex_private.usuario'::regclass)) THEN
  RAISE EXCEPTION 'Solo el propietario SQL de usuario puede ejecutar esta inicialización.' USING ERRCODE='42501';
 END IF;
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Usa la RPC set_role con tu sesión administrativa real.';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth_id) THEN RAISE EXCEPTION 'La cuenta Auth indicada no existe.';END IF;
 SELECT * INTO target FROM apex_private.usuario WHERE auth_user_id=auth_id FOR UPDATE;
 IF target.id IS NULL OR target.estado<>'activo' THEN RAISE EXCEPTION 'Perfil sin vincular o cuenta inactiva: revisión manual requerida.';END IF;
 IF target.rol='docente' THEN RETURN;END IF;
 IF target.rol<>'estudiante' THEN RAISE EXCEPTION 'El rol actual requiere revisión; no se degrada un administrador.';END IF;
 INSERT INTO apex_private.auditoria_rol(actor,destinatario,rol_anterior,rol_nuevo,origen,operador_bd)
 VALUES(NULL,auth_id,target.rol,'docente','inicializacion_propietario_20261022',session_user);
 UPDATE apex_private.usuario SET rol='docente' WHERE id=target.id;
END $$;
COMMIT;
