-- READ ONLY. Run as the project owner in the intended Supabase SQL Editor.
-- Replace only this Auth UUID with the affected account's ID. No email matching/backfill.
-- A zero UUID returns global checks and no account. Never paste tokens or service keys.
BEGIN READ ONLY;
SET LOCAL apex.inspect_auth_id='00000000-0000-0000-0000-000000000000';

-- Enabling five templates is distinct from activating the registration diagnostic.
SELECT c.id,c.diagnostico,p.tipo,p.cantidad,p.version,p.habilitada,p.politica_exposicion,
 EXISTS(SELECT 1 FROM apex_private.carga_banco b WHERE b.id_fuente=p.id_fuente) AS bank_loaded
 FROM apex_private.configuracion_mvp c LEFT JOIN apex_private.plantilla_evaluacion p ON p.id=c.diagnostico;
SELECT id,tipo,nivel,cantidad,version,habilitada FROM apex_private.plantilla_evaluacion
 WHERE politica_exposicion='no_vistas_lru_bloques-v2' ORDER BY id;

-- Stored profile is authoritative. Metadata is used only during initial Auth INSERT.
-- The schema has no profile-completion timestamp; Auth/consent/call times are evidence,
-- not a substitute for a missing audit timestamp. Do not infer the cutover date from them.
SELECT a.id AS auth_id,to_jsonb(a)->>'created_at' AS auth_created_at,a.email_confirmed_at,
 u.id AS profile_id,u.auth_user_id,u.rol,u.estado,u.perfil_completo,
 apex_private.datos_perfil_guardados_validos(u.id) AS stored_profile_valid,
 e.id_programa,e.semestre,a.raw_user_meta_data->>'program' AS registration_program,
 EXISTS(SELECT 1 FROM apex_private.programa_componente pc WHERE pc.id_programa=e.id_programa AND pc.id_componente='ingles') AS english_authorized,
 (SELECT min(co.otorgado_en) FROM apex_private.consentimiento co WHERE co.id_usuario=u.id AND co.finalidad='perfil-y-evaluacion' AND co.version_aviso='apex-v1' AND co.revocado_en IS NULL) AS valid_consent_epoch_ms
 FROM auth.users a LEFT JOIN apex_private.usuario u ON u.auth_user_id=a.id
 LEFT JOIN apex_private.estudiante e ON e.id_usuario=u.id
 WHERE a.id=current_setting('apex.inspect_auth_id')::uuid;

-- Exact pending-call branch used by me: no filter by program/template enabled status.
SELECT c.id AS listed_assignment_id,c.id_estudiante,c.id_plantilla,c.creada_en,c.id_evaluacion,p.tipo,p.habilitada,
 (c.id_evaluacion IS NULL) AS pending_call_listed_by_me
 FROM apex_private.convocatoria_banco c JOIN apex_private.plantilla_evaluacion p ON p.id=c.id_plantilla
 JOIN apex_private.usuario u ON u.id=c.id_estudiante
 WHERE u.auth_user_id=current_setting('apex.inspect_auth_id')::uuid ORDER BY c.creada_en,c.id;
SELECT a.id AS assignment_id,a.id_estudiante,e.id AS evaluation_id,e.tipo,e.id_plantilla,
 NOT EXISTS(SELECT 1 FROM apex_private.intento_ruta ir JOIN apex_private.intento i ON i.id=ir.id_intento WHERE i.id_asignacion=a.id AND ir.numero>1) AS root_assignment_listed_by_me,
 EXISTS(SELECT 1 FROM apex_private.evaluacion_componente ec WHERE ec.id_evaluacion=e.id AND ec.id_componente='ingles') AS english,
 i.id AS attempt_id,i.estado,i.iniciado_en,r.aciertos,r.total_preguntas
 FROM apex_private.asignacion_evaluacion a JOIN apex_private.evaluacion e ON e.id=a.id_evaluacion
 JOIN apex_private.usuario u ON u.id=a.id_estudiante LEFT JOIN apex_private.intento i ON i.id_asignacion=a.id
 LEFT JOIN apex_private.resultado r ON r.id_intento=i.id
 WHERE u.auth_user_id=current_setting('apex.inspect_auth_id')::uuid ORDER BY a.id,i.iniciado_en;

-- Any English attempt protects the existing history; a prior diagnostic call/assignment
-- also protects the account even when not started. No new assignment here.
SELECT u.id,
 (SELECT count(*) FROM apex_private.intento i JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion JOIN apex_private.evaluacion_componente ec ON ec.id_evaluacion=a.id_evaluacion WHERE a.id_estudiante=u.id AND ec.id_componente='ingles') AS english_attempts,
 (SELECT count(*) FROM apex_private.asignacion_evaluacion a JOIN apex_private.evaluacion e ON e.id=a.id_evaluacion JOIN apex_private.evaluacion_componente ec ON ec.id_evaluacion=e.id WHERE a.id_estudiante=u.id AND e.tipo='diagnostico' AND ec.id_componente='ingles') AS english_diagnostic_assignments,
 (SELECT count(*) FROM apex_private.convocatoria_banco c JOIN apex_private.plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=u.id AND p.tipo='diagnostico') AS diagnostic_calls
 FROM apex_private.usuario u WHERE u.auth_user_id=current_setting('apex.inspect_auth_id')::uuid;

-- A failed session/permission raises an RPC error; it does not yield assignments: [].
-- These are database session IDs/activity, never JWTs/refresh tokens.
SELECT s.id,s.created_at,sa.ambito,sa.ultima_actividad,sa.cerrada
 FROM auth.sessions s LEFT JOIN apex_private.sesion_actividad sa ON sa.id=s.id
 WHERE s.user_id=current_setting('apex.inspect_auth_id')::uuid ORDER BY s.created_at DESC;
SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anonymous_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='public' AND p.proname IN ('apex_api','apex_api_pre_diagnostico','apex_api_pre_aprendizaje','apex_catalog','apex_my_route','apex_transition_diagnostic'))
 OR (n.nspname='apex_private' AND p.proname IN ('alta_auth','guardar_perfil_registro','completar_perfil_guardado','ingles_con_historial','estado_diagnostico')) ORDER BY n.nspname,p.proname;
SELECT t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
 FROM pg_trigger t WHERE t.tgrelid='auth.users'::regclass AND NOT t.tgisinternal;
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='apex_private'
 AND tablename IN ('usuario','estudiante','convocatoria_banco','asignacion_evaluacion','intento','resultado');
SELECT n.nspname,p.proname,md5(pg_get_functiondef(p.oid)) AS definition_hash,pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='apex_private' AND p.proname IN ('alta_auth','completar_perfil_guardado','actor'))
 OR (n.nspname='public' AND p.proname IN ('apex_api','apex_api_pre_diagnostico','apex_transition_diagnostic')) ORDER BY n.nspname,p.proname;
COMMIT;
