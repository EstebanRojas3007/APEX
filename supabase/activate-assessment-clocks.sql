-- EXPLICIT CUTOVER, as database owner. Apply only after frontend rollout and
-- verifying that the configured scheduler actually runs successfully in THIS project.
-- Only subsequently CREATED attempts use the total-time policy. Resumes do not change policy.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
DO $$
DECLARE job RECORD;owner_name TEXT;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO owner_name FROM pg_proc WHERE oid='apex_private.cerrar_intentos_vencidos(integer)'::regprocedure;
 IF current_user<>owner_name THEN RAISE EXCEPTION 'Activate as the expiry processor owner (%).',owner_name;END IF;
 IF NOT EXISTS(SELECT 1 FROM configuracion_mvp c JOIN plantilla_evaluacion p ON p.id=c.diagnostico WHERE c.id AND p.habilitada AND p.tipo='diagnostico') THEN
  RAISE EXCEPTION 'Verify the existing learning-v2 cutover first; do not activate time limits over an unconfigured learning policy.';
 END IF;
 SELECT * INTO job FROM cron.job WHERE jobname='apex-assessment-expiry-v1' AND username=current_user;
 IF job.jobid IS NULL OR NOT job.active OR job.schedule<>'30 seconds' OR job.database<>current_database()
  OR job.command<>'SELECT apex_private.cerrar_intentos_vencidos(100);' THEN
  RAISE EXCEPTION 'Configure and verify the 30-second expiry job in this database before activation.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM cron.job_run_details WHERE jobid=job.jobid AND status='succeeded' AND end_time>now()-interval '5 minutes') THEN
  RAISE EXCEPTION 'No recent successful scheduler execution. Verify its actual execution before activation.';
 END IF;
 IF EXISTS(SELECT 1 FROM intento i LEFT JOIN reloj_intento r ON r.id_intento=i.id WHERE r.id_intento IS NULL) THEN
  RAISE EXCEPTION 'An attempt is missing its persisted time policy. Inspect before activation.';
 END IF;
END $$;
UPDATE configuracion_reloj SET activa=true,activada_en=coalesce(activada_en,now()) WHERE id;
COMMIT;
