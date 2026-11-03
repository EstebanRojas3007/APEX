-- READ ONLY. Run on the chosen project BEFORE any migration, after authorizing connection.
BEGIN READ ONLY;
SELECT current_database(), current_user, version();
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_history;
DO $$ DECLARE row RECORD; BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
  FOR row IN EXECUTE 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version' LOOP
   RAISE NOTICE 'Applied migration: %',row.version;
  END LOOP;
 ELSE RAISE NOTICE 'No migration history: absence does NOT prove SQL was never applied manually.';
 END IF;
END $$;
SELECT table_name,table_type FROM information_schema.tables WHERE table_schema='apex_private' ORDER BY table_name;
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='apex_private';
SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='apex_private' AND table_name='usuario';
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('apex_private','storage');
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='materiales-estudio';
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'apex_%';
COMMIT;
