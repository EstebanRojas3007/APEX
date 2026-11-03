-- Explicit operational step, as database owner, AFTER 202610120001.
-- Enables only this scheduler; does NOT activate clocks or alter existing attempts.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
DECLARE existing RECORD;job_id BIGINT;owner_name TEXT;installed_version TEXT;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO owner_name FROM pg_proc WHERE oid='apex_private.cerrar_intentos_vencidos(integer)'::regprocedure;
 IF current_user<>owner_name THEN RAISE EXCEPTION 'Configure the job as the owner of the expiry processor (%).',owner_name;END IF;
 SELECT extversion INTO installed_version FROM pg_extension WHERE extname='pg_cron';
 IF split_part(installed_version,'.',1)::integer<1 OR
  (split_part(installed_version,'.',1)::integer=1 AND substring(split_part(installed_version,'.',2) FROM '^\d+')::integer<5) THEN
  RAISE EXCEPTION 'Sub-minute schedules require pg_cron 1.5 or newer; verify the installed version.';
 END IF;
 SELECT * INTO existing FROM cron.job WHERE jobname='apex-assessment-expiry-v1' AND username=current_user;
 IF existing.jobid IS NOT NULL AND (existing.command<>'SELECT apex_private.cerrar_intentos_vencidos(100);' OR existing.database<>current_database()) THEN
  RAISE EXCEPTION 'An existing job with this name has a different command/database. Inspect it before changing anything.';
 END IF;
 job_id:=cron.schedule('apex-assessment-expiry-v1','30 seconds','SELECT apex_private.cerrar_intentos_vencidos(100);');
 PERFORM cron.alter_job(job_id,active:=true);
END $$;
COMMIT;
