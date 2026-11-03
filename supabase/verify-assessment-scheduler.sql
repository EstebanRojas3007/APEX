-- READ ONLY, database owner, AFTER enabling pg_cron/configuring the job.
BEGIN READ ONLY;
SELECT extname,extversion FROM pg_extension WHERE extname='pg_cron';
SELECT jobid,jobname,schedule,active,database,username,command FROM cron.job WHERE jobname='apex-assessment-expiry-v1';
SELECT d.jobid,d.runid,d.status,d.start_time,d.end_time,d.return_message
 FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
 WHERE j.jobname='apex-assessment-expiry-v1' ORDER BY d.start_time DESC LIMIT 20;
-- The most recent runs must succeed, in the intended database, with an active 30-second job.
-- A successful job alone does not prove all grades succeeded; also inspect overdue attempts/errors.
SELECT i.id,r.tipo,r.vence_en,r.fallos,r.ultimo_error FROM apex_private.intento i JOIN apex_private.reloj_intento r ON r.id_intento=i.id
 WHERE i.estado='activo' AND r.politica='total-apex-v1' AND r.vence_en<=apex_private.epoch_ms() ORDER BY r.vence_en;
COMMIT;
