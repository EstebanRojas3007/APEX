-- READ ONLY, database owner. Inspect actual attempts BEFORE applying the new migration.
BEGIN READ ONLY;
SELECT current_database(),current_user,version();
SELECT to_regclass('apex_private.reloj_intento') AS time_policy_table,
 to_regprocedure('apex_private.cerrar_intentos_vencidos(integer)') AS expiry_processor;
SELECT extname,extversion FROM pg_extension WHERE extname='pg_cron';
SELECT coalesce(p.tipo,e.tipo) AS kind,i.estado,count(*) AS attempts,min(i.iniciado_en) AS earliest_start
 FROM apex_private.intento i JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion
 JOIN apex_private.evaluacion e ON e.id=a.id_evaluacion LEFT JOIN apex_private.plantilla_evaluacion p ON p.id=e.id_plantilla
 GROUP BY coalesce(p.tipo,e.tipo),i.estado ORDER BY kind,i.estado;
SELECT i.id,a.id_estudiante,coalesce(p.tipo,e.tipo) AS kind,i.iniciado_en,
 to_timestamp(i.iniciado_en/1000.0) AS started_at,i.ultima_actividad,
 greatest(0,apex_private.epoch_ms()-i.iniciado_en)/1000 AS elapsed_seconds,
 (SELECT count(*) FROM apex_private.respuesta r WHERE r.id_intento=i.id AND r.id_opcion IS NOT NULL) AS confirmed_answers
 FROM apex_private.intento i JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion
 JOIN apex_private.evaluacion e ON e.id=a.id_evaluacion LEFT JOIN apex_private.plantilla_evaluacion p ON p.id=e.id_plantilla
 WHERE i.estado='activo' ORDER BY i.iniciado_en,i.id;
-- Record these counts before/after migration; no completed attempt should be regraded.
SELECT count(*) AS result_count,sum(aciertos) AS correct_total,sum(total_preguntas) AS question_total FROM apex_private.resultado;
COMMIT;
