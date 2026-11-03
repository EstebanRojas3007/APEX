-- OWNER ONLY / READ ONLY. Run after preflight-admin-panel and before 202610260001.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT to_regclass('apex_private.invitacion_docente') AS invitation_table,
 to_regprocedure('apex_private.administrar_usuario(jsonb)') AS account_mutation,
 to_regprocedure('public.apex_api_pre_invitation_modes(text,jsonb)') AS already_installed;
SELECT pg_get_functiondef('apex_private.administrar_usuario(jsonb)'::regprocedure) AS inspect_account_quarantine;
SELECT estado,count(*) FROM apex_private.invitacion_docente GROUP BY estado;
SELECT count(*) AS active_administrators FROM apex_private.usuario WHERE rol='administrador' AND estado='activo';
SELECT count(*) AS invalid_bindings FROM apex_private.invitacion_docente i LEFT JOIN auth.users a ON a.id=i.auth_destinatario
 LEFT JOIN apex_private.usuario u ON u.auth_user_id=a.id WHERE i.auth_destinatario IS NOT NULL AND
 (a.id IS NULL OR u.id IS NULL OR lower(btrim(a.email))<>i.correo OR u.uid_auth<>a.id::text OR u.proveedor_auth<>'supabase');
SELECT (SELECT count(*) FROM apex_private.usuario) AS accounts,(SELECT count(*) FROM auth.users) AS auth_accounts,
 (SELECT count(*) FROM apex_private.estudiante) AS profiles,(SELECT count(*) FROM apex_private.intento) AS attempts,
 (SELECT count(*) FROM apex_private.resultado) AS results,(SELECT count(*) FROM apex_private.respuesta) AS answers,
 (SELECT count(*) FROM apex_private.grupo_integrante) AS memberships,(SELECT count(*) FROM apex_private.grupo_docente) AS teacher_links;
ROLLBACK;
