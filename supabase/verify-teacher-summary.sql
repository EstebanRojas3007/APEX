-- OWNER post-migration verification, read-only. No Auth impersonation or writes.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$
DECLARE signature TEXT;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.apex_api_pre_resumen_docente(text,jsonb)',
  'apex_private.evidencia_habilidades_docente(text)','apex_private.resumen_grupo_docente(uuid)',
  'apex_private.seguimiento_intentos(text,text)','apex_private.seguimiento_estudiante(text,text)'] LOOP
  IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'Missing function: %',signature;END IF;
  IF has_function_privilege('authenticated',signature,'EXECUTE') OR has_function_privilege('anon',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'Private function exposed: %',signature;
  END IF;
 END LOOP;
 IF NOT has_function_privilege('authenticated','public.apex_api(text,jsonb)','EXECUTE') OR has_function_privilege('anon','public.apex_api(text,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Unexpected apex_api privileges';
 END IF;
END $$;
SELECT p.oid::regprocedure AS function,p.prosecdef AS security_definer,p.provolatile AS volatility,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('apex_api','apex_api_pre_resumen_docente')) OR
 (n.nspname='apex_private' AND p.proname IN ('evidencia_habilidades_docente','resumen_grupo_docente','seguimiento_estudiante','seguimiento_intentos'));
-- Private projection reads only, without sending individual data to a client.
-- Each eligible member contributes once, regardless of the number of teachers.
WITH population AS MATERIALIZED (
 SELECT g.id,g.codigo,m.id_estudiante,apex_private.seguimiento_estudiante(m.id_estudiante,g.id_componente) s
 FROM apex_private.grupo g JOIN apex_private.grupo_integrante m ON m.id_grupo=g.id
 WHERE g.estado='activo' AND apex_private.integrante_grupo(g.id,m.id_estudiante)
)
SELECT id,codigo,count(*) AS eligible,count(DISTINCT id_estudiante) AS unique_eligible,
 count(*) FILTER(WHERE s->>'diagnosticStatus'='completado') AS diagnostic_completed,
 count(*) FILTER(WHERE s->>'diagnosticStatus'='en progreso') AS diagnostic_active,
 count(*) FILTER(WHERE s->>'diagnosticStatus'='pendiente') AS diagnostic_pending,
 count(*) FILTER(WHERE (s->>'reviewRequired')::boolean) AS review_pending
FROM population GROUP BY id,codigo ORDER BY codigo;
-- Expected zero rows: no technical attempt leaks into the teacher projection.
SELECT m.id_grupo,m.id_estudiante,a->>'id' AS unexpected_attempt
FROM apex_private.grupo_integrante m JOIN apex_private.grupo g ON g.id=m.id_grupo
CROSS JOIN LATERAL jsonb_array_elements(apex_private.seguimiento_intentos(m.id_estudiante,g.id_componente)) a
WHERE m.activa AND apex_private.asignacion_tecnica(a->>'assignmentId');
ROLLBACK;
