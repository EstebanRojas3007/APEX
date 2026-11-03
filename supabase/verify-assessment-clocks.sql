-- READ ONLY, database owner, AFTER migration. Does not process or activate anything.
BEGIN READ ONLY;
SELECT activa,activada_en,politica FROM apex_private.configuracion_reloj;
SELECT r.politica,r.tipo,i.estado,count(*) AS attempts FROM apex_private.reloj_intento r JOIN apex_private.intento i ON i.id=r.id_intento GROUP BY r.politica,r.tipo,i.estado ORDER BY r.politica,r.tipo,i.estado;
-- Each anomaly count must be zero.
SELECT count(*) AS missing_time_policy FROM apex_private.intento i LEFT JOIN apex_private.reloj_intento r ON r.id_intento=i.id WHERE r.id_intento IS NULL;
SELECT count(*) AS changed_start FROM apex_private.reloj_intento r JOIN apex_private.intento i ON i.id=r.id_intento WHERE r.iniciado_en<>i.iniciado_en;
SELECT count(*) AS invalid_diagnostic_clock FROM apex_private.reloj_intento WHERE tipo='diagnostico' AND (politica<>'diagnostico-sin-limite-v1' OR vence_en IS NOT NULL OR limite_segundos IS NOT NULL OR motivo_entrega='tiempo_agotado');
SELECT count(*) AS invalid_total_duration FROM apex_private.reloj_intento WHERE politica='total-apex-v1' AND (vence_en IS NULL OR limite_segundos IS NULL OR vence_en<>iniciado_en+limite_segundos::bigint*1000 OR limite_segundos<>CASE tipo WHEN 'control' THEN 900 WHEN 'final' THEN 2250 ELSE -1 END);
SELECT count(*) AS late_confirmed_answers FROM apex_private.respuesta a JOIN apex_private.reloj_intento r ON r.id_intento=a.id_intento WHERE r.politica='total-apex-v1' AND a.guardada_en>=r.vence_en;
SELECT count(*) AS completed_without_result FROM apex_private.intento i LEFT JOIN apex_private.resultado r ON r.id_intento=i.id WHERE i.estado='finalizado' AND r.id_intento IS NULL;
SELECT i.id,r.tipo,r.vence_en,greatest(0,apex_private.epoch_ms()-r.vence_en)/1000 AS overdue_seconds,r.fallos,r.ultimo_error
 FROM apex_private.intento i JOIN apex_private.reloj_intento r ON r.id_intento=i.id
 WHERE i.estado='activo' AND r.politica='total-apex-v1' AND r.vence_en<=apex_private.epoch_ms() ORDER BY r.vence_en;
SELECT count(*) AS result_count,sum(aciertos) AS correct_total,sum(total_preguntas) AS question_total FROM apex_private.resultado;
SELECT has_function_privilege('authenticated','public.apex_api(text,jsonb)','EXECUTE') AS client_api,
 has_function_privilege('authenticated','apex_private.cerrar_intentos_vencidos(integer)','EXECUTE') AS client_processor_must_be_false,
 has_function_privilege('anon','apex_private.cerrar_intentos_vencidos(integer)','EXECUTE') AS anon_processor_must_be_false,
 has_function_privilege('authenticated','public.apex_api_pre_reloj(text,jsonb)','EXECUTE') AS bypass_api_must_be_false;
COMMIT;
