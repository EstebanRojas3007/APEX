-- OWNER ONLY / READ ONLY. No token/nonce selection and no dispatch.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT p.oid::regprocedure AS function,role,has_function_privilege(role,p.oid,'EXECUTE') AS executable
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) role
 WHERE (n.nspname='public' AND p.proname IN ('apex_api','apex_api_pre_invitation_modes','apex_api_pre_admin','apex_admin_invitation_dispatch','apex_accept_teacher_invitation','apex_teacher_invitation_status','apex_accept_teacher_invitation_v2','apex_teacher_invitation_review'))
 OR (n.nspname='apex_private' AND p.proname IN ('administrar_invitacion','destinatario_invitacion','revisar_cuenta_invitacion')) ORDER BY function,role;
SELECT c.relname,c.relrowsecurity,role,has_table_privilege(role,c.oid,'SELECT,INSERT,UPDATE,DELETE') AS direct_access
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) role
 WHERE n.nspname='apex_private' AND c.relname IN ('invitacion_docente','auditoria_administrativa','usuario') ORDER BY c.relname,role;
SELECT count(*) AS unaccepted_new_accounts_with_access FROM apex_private.invitacion_docente i JOIN apex_private.usuario u ON u.auth_user_id=i.auth_destinatario
 WHERE i.modalidad='new' AND i.estado<>'accepted' AND u.estado='activo';
SELECT count(*) AS invalid_existing_snapshots FROM apex_private.invitacion_docente WHERE modalidad='existing' AND
 (id_destinatario IS NULL OR auth_destinatario IS NULL OR rol_esperado<>'estudiante' OR estado_esperado<>'activo' OR rol_propuesto<>'docente');
SELECT modalidad,estado,count(*) FROM apex_private.invitacion_docente GROUP BY modalidad,estado;
SELECT count(*) AS active_administrators FROM apex_private.usuario WHERE rol='administrador' AND estado='activo';
SELECT (SELECT count(*) FROM apex_private.usuario) AS accounts,(SELECT count(*) FROM auth.users) AS auth_accounts,
 (SELECT count(*) FROM apex_private.estudiante) AS profiles,(SELECT count(*) FROM apex_private.intento) AS attempts,
 (SELECT count(*) FROM apex_private.resultado) AS results,(SELECT count(*) FROM apex_private.respuesta) AS answers,
 (SELECT count(*) FROM apex_private.grupo_integrante) AS memberships,(SELECT count(*) FROM apex_private.grupo_docente) AS teacher_links;
ROLLBACK;
