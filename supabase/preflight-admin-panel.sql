-- OWNER ONLY. Read-only inventory before 202610250002; never calls mutating RPC.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT name,to_regprocedure(name) AS installed FROM unnest(ARRAY[
 'public.apex_api(text,jsonb)','public.apex_api_pre_admin(text,jsonb)',
 'apex_private.administrar_grupo(text,jsonb)','apex_private.intervenir_docente(text,jsonb)',
 'apex_private.calificar_intento(text,boolean)','public.apex_accept_teacher_invitation()',
 'public.apex_admin_invitation_dispatch(uuid,uuid,text,uuid,uuid,text)']) name;
SELECT p.oid::regprocedure AS function,md5(pg_get_functiondef(p.oid)) AS definition_md5
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='public' AND p.proname='apex_api') OR (n.nspname='apex_private' AND p.proname IN ('actor','alta_auth','auditar_grupo','administrar_grupo','calificar_intento','cerrar_intentos_vencidos'));
SELECT rol,estado,count(*) AS accounts FROM apex_private.usuario GROUP BY rol,estado ORDER BY rol,estado;
SELECT estado,count(*) AS groups FROM apex_private.grupo GROUP BY estado;
SELECT (SELECT count(*) FROM apex_private.intento) AS attempts,(SELECT count(*) FROM apex_private.resultado) AS results,
 (SELECT count(*) FROM apex_private.respuesta) AS answers,(SELECT count(*) FROM apex_private.seleccion_intento) AS selections,
 (SELECT count(*) FROM apex_private.grupo_docente) AS teacher_links,(SELECT count(*) FROM apex_private.grupo_integrante) AS memberships;
SELECT count(*) AS active_accounts_with_exam FROM apex_private.usuario u WHERE EXISTS(SELECT 1 FROM apex_private.intento i
 JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion WHERE a.id_estudiante=u.id AND i.estado='activo');
SELECT count(*) AS active_administrators FROM apex_private.usuario WHERE rol='administrador' AND estado='activo';
-- Verify the designated identity separately with verify-first-admin.sql.
ROLLBACK;
