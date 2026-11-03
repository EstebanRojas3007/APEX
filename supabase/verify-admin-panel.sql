-- OWNER ONLY. Read-only. Do not call Auth, dispatch, actor(), grading or mutations.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT p.oid::regprocedure AS function,role,has_function_privilege(role,p.oid,'EXECUTE') AS executable
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) role
 WHERE (n.nspname='public' AND p.proname IN ('apex_api','apex_api_pre_admin','apex_admin_invitation_dispatch','apex_accept_teacher_invitation','apex_teacher_invitation_status'))
 OR (n.nspname='apex_private' AND p.proname IN ('administrar_usuario','administrar_lectura','administrar_invitacion','administrar_catalogo','admin_usuario_json')) ORDER BY function,role;
SELECT c.relname,c.relrowsecurity,role,has_table_privilege(role,c.oid,'SELECT,INSERT,UPDATE,DELETE') AS direct_access
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) role
 WHERE n.nspname='apex_private' AND c.relname IN ('administracion_guardia','auditoria_administrativa','invitacion_docente') ORDER BY c.relname,role;
SELECT count(*) AS active_administrators FROM apex_private.usuario WHERE rol='administrador' AND estado='activo';
SELECT count(*) AS administrative_guard_rows FROM apex_private.administracion_guardia;
SELECT count(*) AS invalid_invitation_bindings FROM apex_private.invitacion_docente i LEFT JOIN auth.users a ON a.id=i.auth_destinatario
 LEFT JOIN apex_private.usuario u ON u.auth_user_id=a.id WHERE i.auth_destinatario IS NOT NULL AND
 (a.id IS NULL OR u.id IS NULL OR lower(btrim(a.email))<>i.correo OR u.proveedor_auth<>'supabase' OR u.uid_auth<>a.id::text);
SELECT count(*) AS unaccepted_invitations_with_access FROM apex_private.invitacion_docente i JOIN apex_private.usuario u ON u.auth_user_id=i.auth_destinatario
 WHERE i.estado<>'accepted' AND u.estado='activo';
SELECT estado,count(*) AS invitations FROM apex_private.invitacion_docente GROUP BY estado;
SELECT count(*) AS groups_over_capacity FROM apex_private.grupo g WHERE (SELECT count(*) FROM apex_private.grupo_integrante m WHERE m.id_grupo=g.id AND m.activa)>20;
SELECT (SELECT count(*) FROM apex_private.intento) AS attempts,(SELECT count(*) FROM apex_private.resultado) AS results,
 (SELECT count(*) FROM apex_private.respuesta) AS answers,(SELECT count(*) FROM apex_private.seleccion_intento) AS selections,
 (SELECT count(*) FROM apex_private.grupo_docente) AS teacher_links,(SELECT count(*) FROM apex_private.grupo_integrante) AS memberships;
ROLLBACK;
