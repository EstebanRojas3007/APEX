-- OWNER ONLY, read-only. All anomaly counters must be zero. No mutations/RPC.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT to_regprocedure('public.apex_api_pre_intervencion(text,jsonb)') IS NOT NULL AS wrapper_installed,
 to_regclass('apex_private.intervencion_docente') IS NOT NULL AS audit_installed;
SELECT p.oid::regprocedure AS function,role,
 has_function_privilege(role,p.oid,'EXECUTE') AS executable
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) role
 WHERE (n.nspname='public' AND p.proname IN ('apex_api','apex_api_pre_intervencion')) OR
 (n.nspname='apex_private' AND p.proname IN ('intervenir_docente','bloquear_ambito_docente','iniciar_reemplazo_docente','recuperacion_docente_json'))
 ORDER BY function,role;
SELECT relrowsecurity AS audit_rls FROM pg_class WHERE oid='apex_private.intervencion_docente'::regclass;
SELECT role,has_table_privilege(role,'apex_private.intervencion_docente','SELECT,INSERT,UPDATE,DELETE') AS direct_audit_access
 FROM unnest(ARRAY['anon','authenticated','service_role']) role;
SELECT count(*) AS suspended_with_academic_result FROM apex_private.intento i
 WHERE i.estado='suspendido' AND (i.finalizado_en IS NOT NULL
 OR EXISTS(SELECT 1 FROM apex_private.resultado r WHERE r.id_intento=i.id)
 OR EXISTS(SELECT 1 FROM apex_private.decision_avance d WHERE d.id_intento=i.id)
 OR EXISTS(SELECT 1 FROM apex_private.sesion_refuerzo s WHERE s.id_intento=i.id AND s.tipo='review')
 OR EXISTS(SELECT 1 FROM apex_private.reloj_intento r WHERE r.id_intento=i.id AND r.motivo_entrega IS NOT NULL));
SELECT count(*) AS suspended_without_authorization FROM apex_private.intento i
 WHERE i.estado='suspendido' AND NOT EXISTS(SELECT 1 FROM apex_private.intervencion_docente e WHERE e.id_original=i.id);
SELECT count(*) AS invalid_replacements FROM apex_private.intervencion_docente e
 JOIN apex_private.intento original ON original.id=e.id_original
 LEFT JOIN apex_private.intento replacement ON replacement.id=e.id_reemplazo
 LEFT JOIN apex_private.asignacion_evaluacion a ON a.id=replacement.id_asignacion
 WHERE original.estado<>'suspendido' OR (e.id_reemplazo IS NOT NULL AND
 (a.id_estudiante IS DISTINCT FROM e.id_estudiante OR replacement.iniciado_en<e.creada_en));
SELECT count(*) AS technical_interventions FROM apex_private.intervencion_docente e
 WHERE apex_private.intento_tecnico(e.id_original) OR apex_private.intento_tecnico(e.id_reemplazo);
SELECT accion,count(*) AS events,count(id_reemplazo) AS consumed_authorizations FROM apex_private.intervencion_docente GROUP BY accion;
-- Compare these totals to preflight immediately after migration: no academic
-- historical row should have changed merely by applying this migration.
SELECT (SELECT count(*) FROM apex_private.resultado) AS results,
 (SELECT count(*) FROM apex_private.respuesta) AS answers,
 (SELECT count(*) FROM apex_private.seleccion_intento) AS selected_questions,
 (SELECT count(*) FROM apex_private.decision_avance) AS decisions,
 (SELECT count(*) FROM apex_private.exposicion_pregunta) AS exposure;
ROLLBACK;
