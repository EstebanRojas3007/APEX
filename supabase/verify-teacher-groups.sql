-- Post-migration checks, OWNER, read-only. No actor(), login or closure processor.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT g.id,g.codigo,g.nombre,g.estado,g.id_componente,
 count(m.id_estudiante) FILTER(WHERE m.activa) AS cupos_ocupados
FROM apex_private.grupo g LEFT JOIN apex_private.grupo_integrante m ON m.id_grupo=g.id GROUP BY g.id ORDER BY g.codigo;
-- Must return zero rows:
SELECT id_grupo,count(*) AS exceso FROM apex_private.grupo_integrante WHERE activa GROUP BY id_grupo HAVING count(*)>20;
SELECT d.* FROM apex_private.grupo_docente d JOIN apex_private.usuario u ON u.id=d.id_docente WHERE d.activa AND (u.rol<>'docente' OR u.estado<>'activo');
-- Review reserved memberships that no longer appear in the active teaching roster:
SELECT m.* FROM apex_private.grupo_integrante m WHERE m.activa AND NOT apex_private.integrante_grupo(m.id_grupo,m.id_estudiante);
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='apex_private' AND tablename IN ('grupo','grupo_docente','grupo_integrante','auditoria_grupo');
SELECT p.oid::regprocedure,has_function_privilege('authenticated',p.oid,'EXECUTE') AS cliente_puede_ejecutar
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('apex_api','apex_api_pre_docente')) OR (n.nspname='apex_private' AND p.proname IN ('administrar_grupo','seguimiento_estudiante','seguimiento_intentos','docente_grupo','grupo_json'));
SELECT * FROM apex_private.auditoria_grupo ORDER BY id DESC LIMIT 50;
-- Reconcile these historical pairs manually; do not turn them into automatic groups:
SELECT * FROM apex_private.asignacion_docente ORDER BY id_docente,id_estudiante;
ROLLBACK;
