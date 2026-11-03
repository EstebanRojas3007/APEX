-- APEX, auditoria 13/10/2026. PREPARADO; NO EJECUTADO EN REMOTO.
-- Ejecutar A primero, como responsable con acceso autorizado de lectura.
-- B exige reconciliar nombres/columnas/constraints/funciones y privilegios en A.
-- No llamar RPC apex_*, actor(), claims, procesadores ni funciones del dominio.
-- No activar/desactivar, no DDL/DML, no FOR UPDATE, no pg_stat_reset.
-- Si falta permiso/objeto o vence el timeout: ROLLBACK y revisar ese bloque.
-- Las instrucciones generadas de recursos opcionales son texto; no se ejecutan.
-- Ejecutarlas por separado tambien dentro de BEGIN READ ONLY ... ROLLBACK.

-- BLOQUE A: catalogos, dependencias, seguridad; no presupone las 50 tablas.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
SELECT current_database() AS database_name,current_user AS reader,
       current_setting('server_version') AS postgres_version,
       current_setting('transaction_read_only') AS read_only,
       current_setting('track_functions') AS function_tracking,
       current_setting('pgrst.db_schemas',true) AS data_api_schemas_if_visible;

-- A1. Inventario real, incluyendo vistas y particiones, separado por relkind.
SELECT c.relname,c.relkind,c.relispartition,c.relrowsecurity,c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) AS owner,c.reltuples::bigint AS estimated_rows,
       CASE WHEN c.relkind IN ('r','p','m') THEN pg_total_relation_size(c.oid) END AS total_bytes
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='apex_private' AND c.relkind IN ('r','p','v','m','f')
ORDER BY c.relkind,c.relname;
SELECT c.relkind,count(*) AS objects FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='apex_private' AND c.relkind IN ('r','p','v','m','f') GROUP BY c.relkind;

-- A2. Comparacion contra los nombres LOCALES; el mismo total no basta.
WITH expected(name) AS (VALUES
 ('programa_academico'),('componente'),('programa_componente'),('competencia'),
 ('nucleo_tematico'),('usuario'),('estudiante'),('consentimiento'),('fuente'),
 ('material_estudio'),('material_nucleo'),('pregunta'),('opcion_respuesta'),
 ('evaluacion'),('evaluacion_componente'),('item_evaluacion'),('asignacion_evaluacion'),
 ('intento'),('respuesta'),('resultado'),('asignacion_docente'),('auditoria_rol'),
 ('sesion_actividad'),('bloqueo_auth'),('fragmento_documental'),('bloque_preguntas'),
 ('carga_banco'),('plantilla_evaluacion'),('convocatoria_banco'),('seleccion_intento'),
 ('exposicion_pregunta'),('agotamiento_banco'),('regla_ruta_version'),('leccion_version'),
 ('progreso_leccion'),('solicitud_ruta'),('ruta_version'),('paso_ruta'),
 ('configuracion_mvp'),('trabajo_ia'),('ruta_nivel_version'),('seccion_ruta'),
 ('progreso_seccion'),('sesion_refuerzo'),('mensaje_refuerzo'),('intento_ruta'),
 ('decision_avance'),('configuracion_reloj'),('reloj_intento'),('prueba_reloj_tecnica')
),actual AS (
 SELECT c.relname::text AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='apex_private' AND c.relkind IN ('r','p') AND NOT c.relispartition
)
SELECT coalesce(e.name,a.name) AS table_name,
 CASE WHEN e.name IS NULL THEN 'extra_remota' WHEN a.name IS NULL THEN 'falta_remota' ELSE 'nombre_coincide' END AS finding
FROM expected e FULL JOIN actual a USING(name) ORDER BY table_name;

-- A3. Columnas/tipos/default/nullability e identidades. No lee filas personales.
SELECT c.relname AS table_name,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,
       a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(ad.adbin,ad.adrelid) AS default_value
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
WHERE n.nspname='apex_private' AND c.relkind IN ('r','p') ORDER BY c.relname,a.attnum;

-- A4. PK/UQ/check y FK entrantes/salientes, tambien desde otros esquemas.
SELECT co.conname,co.contype,co.conrelid::regclass AS source_table,
       CASE WHEN co.confrelid<>0 THEN co.confrelid::regclass END AS referenced_table,
       co.convalidated,co.condeferrable,co.condeferred,pg_get_constraintdef(co.oid,true) AS definition
FROM pg_constraint co
WHERE co.conrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='apex_private')
   OR co.confrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='apex_private')
ORDER BY co.conrelid::regclass::text,co.conname;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='apex_private' ORDER BY tablename,indexname;

-- A5. Triggers y definiciones actuales. Los cuerpos son evidencia de dependencias.
SELECT c.oid::regclass AS on_table,t.tgname,t.tgenabled,
       pg_get_triggerdef(t.oid,true) AS definition,t.tgfoid::regprocedure AS trigger_function
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND (n.nspname='apex_private' OR (n.nspname='auth' AND t.tgname LIKE 'apex_%'))
ORDER BY c.oid::regclass::text,t.tgname;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef,p.provolatile,pg_get_userbyid(p.proowner) AS owner,p.proconfig,p.proacl,
       md5(pg_get_functiondef(p.oid)) AS remote_definition_md5,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prokind IN ('f','p') AND (n.nspname='apex_private' OR (n.nspname='public' AND p.proname LIKE 'apex_%'))
ORDER BY n.nspname,p.proname,arguments;
-- El MD5 sirve para comparar dos lecturas remotas; no equivale al SHA256 de un archivo de migracion.
SELECT c.oid::regclass AS view_name,pg_get_viewdef(c.oid,true) AS definition,c.reloptions
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='apex_private' AND c.relkind IN ('v','m') ORDER BY c.oid::regclass::text;

-- A6. Dependencias catalogadas; insuficientes por si solas para PL/pgSQL/dinamico/externo.
SELECT pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent_object,
       pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS referenced_object,d.deptype
FROM pg_depend d
WHERE d.refclassid='pg_class'::regclass AND d.refobjid IN (
 SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='apex_private')
ORDER BY referenced_object,dependent_object;
SELECT c.relname AS mentioned_table,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_class c JOIN pg_namespace cn ON cn.oid=c.relnamespace
JOIN pg_proc p ON p.prokind IN ('f','p') AND p.prosrc ~ ('\m'||c.relname||'\M')
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE cn.nspname='apex_private' AND c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY c.relname,n.nspname,p.proname;
-- Coincidencias textuales son candidatos; revisar comentarios, literales y SQL dinamico manualmente.

-- A7. Politicas y permisos efectivos por rol, incluyendo funciones antiguas de fachada.
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname IN ('apex_private','storage') ORDER BY schemaname,tablename,policyname;
SELECT r.rolname,has_schema_privilege(r.oid,n.oid,'USAGE') AS schema_usage,
       c.relname,has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,
       has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
       has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update,
       has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete,c.relacl
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='apex_private' AND c.relkind IN ('r','p','v','m')
ORDER BY r.rolname,c.relname;
SELECT r.rolname,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege(r.oid,p.oid,'EXECUTE') AS can_execute
FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE r.rolname IN ('anon','authenticated','service_role','supabase_auth_admin') AND p.prokind IN ('f','p')
 AND (n.nspname='apex_private' OR (n.nspname='public' AND p.proname LIKE 'apex_%'))
ORDER BY r.rolname,n.nspname,p.proname,arguments;
-- NO exigir cero a service_role indiscriminadamente: cotejar grants del contrato especifico.

-- A8. Uso acumulado estadistico: no acredita falta de uso si se reinicio/no se habilito tracking.
SELECT relname,n_live_tup,n_dead_tup,seq_scan,idx_scan,n_tup_ins,n_tup_upd,n_tup_del,last_analyze,last_autoanalyze
FROM pg_stat_user_tables WHERE schemaname='apex_private' ORDER BY relname;
SELECT schemaname,funcname,calls,total_time FROM pg_stat_user_functions
WHERE schemaname IN ('apex_private','public') AND (schemaname='apex_private' OR funcname LIKE 'apex_%') ORDER BY schemaname,funcname;
SELECT stats_reset FROM pg_stat_database WHERE datname=current_database();

-- A9. Recursos opcionales: comprobar existencia; copiar SELECT generado solo si hay permiso.
SELECT name,to_regclass(name) AS existing_object FROM (VALUES
 ('supabase_migrations.schema_migrations'),('storage.buckets'),('storage.objects'),
 ('cron.job'),('cron.job_run_details')) AS optional(name);
SELECT CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;' END AS optional_history_select;
SELECT CASE WHEN to_regclass('storage.buckets') IS NOT NULL THEN
 'SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id=''materiales-estudio'';' END AS optional_bucket_select;
SELECT CASE WHEN to_regclass('cron.job') IS NOT NULL THEN
 'SELECT jobid,jobname,username,database,schedule,command,active FROM cron.job WHERE jobname=''apex-assessment-expiry-v1'';' END AS optional_job_select;
SELECT CASE WHEN to_regclass('cron.job_run_details') IS NOT NULL AND to_regclass('cron.job') IS NOT NULL THEN
 'SELECT d.jobid,d.runid,d.status,d.return_message,d.start_time,d.end_time FROM cron.job_run_details d JOIN cron.job j USING(jobid) WHERE j.jobname=''apex-assessment-expiry-v1'' ORDER BY d.start_time DESC LIMIT 50;' END AS optional_job_runs_select;
SELECT pg_get_userbyid(p.proowner) AS expected_scheduler_owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='apex_private' AND p.proname='cerrar_intentos_vencidos' AND pg_get_function_identity_arguments(p.oid) LIKE '%integer%';
ROLLBACK;

-- BLOQUE B: SOLO despues de confirmar A y columnas/grants compatibles con local.
-- Si falta una tabla, NO aplicar migraciones para conseguir resultados: ejecutar solo bloques compatibles.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

-- B1. Conteos exactos de las 50 tablas locales. No inferir retirada por un conteo cero.
SELECT 'programa_academico' AS table_name,count(*) AS exact_rows FROM apex_private.programa_academico
UNION ALL
SELECT 'componente' AS table_name,count(*) AS exact_rows FROM apex_private.componente
UNION ALL
SELECT 'programa_componente' AS table_name,count(*) AS exact_rows FROM apex_private.programa_componente
UNION ALL
SELECT 'competencia' AS table_name,count(*) AS exact_rows FROM apex_private.competencia
UNION ALL
SELECT 'nucleo_tematico' AS table_name,count(*) AS exact_rows FROM apex_private.nucleo_tematico
UNION ALL
SELECT 'usuario' AS table_name,count(*) AS exact_rows FROM apex_private.usuario
UNION ALL
SELECT 'estudiante' AS table_name,count(*) AS exact_rows FROM apex_private.estudiante
UNION ALL
SELECT 'consentimiento' AS table_name,count(*) AS exact_rows FROM apex_private.consentimiento
UNION ALL
SELECT 'fuente' AS table_name,count(*) AS exact_rows FROM apex_private.fuente
UNION ALL
SELECT 'material_estudio' AS table_name,count(*) AS exact_rows FROM apex_private.material_estudio
UNION ALL
SELECT 'material_nucleo' AS table_name,count(*) AS exact_rows FROM apex_private.material_nucleo
UNION ALL
SELECT 'pregunta' AS table_name,count(*) AS exact_rows FROM apex_private.pregunta
UNION ALL
SELECT 'opcion_respuesta' AS table_name,count(*) AS exact_rows FROM apex_private.opcion_respuesta
UNION ALL
SELECT 'evaluacion' AS table_name,count(*) AS exact_rows FROM apex_private.evaluacion
UNION ALL
SELECT 'evaluacion_componente' AS table_name,count(*) AS exact_rows FROM apex_private.evaluacion_componente
UNION ALL
SELECT 'item_evaluacion' AS table_name,count(*) AS exact_rows FROM apex_private.item_evaluacion
UNION ALL
SELECT 'asignacion_evaluacion' AS table_name,count(*) AS exact_rows FROM apex_private.asignacion_evaluacion
UNION ALL
SELECT 'intento' AS table_name,count(*) AS exact_rows FROM apex_private.intento
UNION ALL
SELECT 'respuesta' AS table_name,count(*) AS exact_rows FROM apex_private.respuesta
UNION ALL
SELECT 'resultado' AS table_name,count(*) AS exact_rows FROM apex_private.resultado
UNION ALL
SELECT 'asignacion_docente' AS table_name,count(*) AS exact_rows FROM apex_private.asignacion_docente
UNION ALL
SELECT 'auditoria_rol' AS table_name,count(*) AS exact_rows FROM apex_private.auditoria_rol
UNION ALL
SELECT 'sesion_actividad' AS table_name,count(*) AS exact_rows FROM apex_private.sesion_actividad
UNION ALL
SELECT 'bloqueo_auth' AS table_name,count(*) AS exact_rows FROM apex_private.bloqueo_auth
UNION ALL
SELECT 'fragmento_documental' AS table_name,count(*) AS exact_rows FROM apex_private.fragmento_documental
UNION ALL
SELECT 'bloque_preguntas' AS table_name,count(*) AS exact_rows FROM apex_private.bloque_preguntas
UNION ALL
SELECT 'carga_banco' AS table_name,count(*) AS exact_rows FROM apex_private.carga_banco
UNION ALL
SELECT 'plantilla_evaluacion' AS table_name,count(*) AS exact_rows FROM apex_private.plantilla_evaluacion
UNION ALL
SELECT 'convocatoria_banco' AS table_name,count(*) AS exact_rows FROM apex_private.convocatoria_banco
UNION ALL
SELECT 'seleccion_intento' AS table_name,count(*) AS exact_rows FROM apex_private.seleccion_intento
UNION ALL
SELECT 'exposicion_pregunta' AS table_name,count(*) AS exact_rows FROM apex_private.exposicion_pregunta
UNION ALL
SELECT 'agotamiento_banco' AS table_name,count(*) AS exact_rows FROM apex_private.agotamiento_banco
UNION ALL
SELECT 'regla_ruta_version' AS table_name,count(*) AS exact_rows FROM apex_private.regla_ruta_version
UNION ALL
SELECT 'leccion_version' AS table_name,count(*) AS exact_rows FROM apex_private.leccion_version
UNION ALL
SELECT 'progreso_leccion' AS table_name,count(*) AS exact_rows FROM apex_private.progreso_leccion
UNION ALL
SELECT 'solicitud_ruta' AS table_name,count(*) AS exact_rows FROM apex_private.solicitud_ruta
UNION ALL
SELECT 'ruta_version' AS table_name,count(*) AS exact_rows FROM apex_private.ruta_version
UNION ALL
SELECT 'paso_ruta' AS table_name,count(*) AS exact_rows FROM apex_private.paso_ruta
UNION ALL
SELECT 'configuracion_mvp' AS table_name,count(*) AS exact_rows FROM apex_private.configuracion_mvp
UNION ALL
SELECT 'trabajo_ia' AS table_name,count(*) AS exact_rows FROM apex_private.trabajo_ia
UNION ALL
SELECT 'ruta_nivel_version' AS table_name,count(*) AS exact_rows FROM apex_private.ruta_nivel_version
UNION ALL
SELECT 'seccion_ruta' AS table_name,count(*) AS exact_rows FROM apex_private.seccion_ruta
UNION ALL
SELECT 'progreso_seccion' AS table_name,count(*) AS exact_rows FROM apex_private.progreso_seccion
UNION ALL
SELECT 'sesion_refuerzo' AS table_name,count(*) AS exact_rows FROM apex_private.sesion_refuerzo
UNION ALL
SELECT 'mensaje_refuerzo' AS table_name,count(*) AS exact_rows FROM apex_private.mensaje_refuerzo
UNION ALL
SELECT 'intento_ruta' AS table_name,count(*) AS exact_rows FROM apex_private.intento_ruta
UNION ALL
SELECT 'decision_avance' AS table_name,count(*) AS exact_rows FROM apex_private.decision_avance
UNION ALL
SELECT 'configuracion_reloj' AS table_name,count(*) AS exact_rows FROM apex_private.configuracion_reloj
UNION ALL
SELECT 'reloj_intento' AS table_name,count(*) AS exact_rows FROM apex_private.reloj_intento
UNION ALL
SELECT 'prueba_reloj_tecnica' AS table_name,count(*) AS exact_rows FROM apex_private.prueba_reloj_tecnica
ORDER BY table_name;

-- B2. Configuraciones y versiones/habilitacion de plantillas. No activa nada.
SELECT id,diagnostico FROM apex_private.configuracion_mvp;
SELECT id,activa,activada_en,politica FROM apex_private.configuracion_reloj;
SELECT p.id,p.version,p.tipo,p.nivel,p.cantidad,p.politica_exposicion,p.habilitada,
       EXISTS(SELECT 1 FROM apex_private.carga_banco b WHERE b.id_fuente=p.id_fuente) AS has_approved_load,
       p.composicion
FROM apex_private.plantilla_evaluacion p ORDER BY p.id;
SELECT f.id,f.estado,f.paginas,f.contiene_soluciones,f.contexto_tutor_permitido,
       count(DISTINCT p.id) AS questions,count(DISTINCT b.id) AS blocks
FROM apex_private.fuente f LEFT JOIN apex_private.pregunta p ON p.id_fuente=f.id
LEFT JOIN apex_private.bloque_preguntas b ON b.id_fuente=f.id GROUP BY f.id ORDER BY f.id;

-- B3. Rutas v1, uso del catalogo y solicitudes sin propuesta. No devuelve contexto ni PII.
SELECT aprobada,nivel,count(*) FROM apex_private.leccion_version GROUP BY aprobada,nivel ORDER BY nivel,aprobada;
SELECT r.estado,count(*) AS routes,min(r.version),max(r.version),count(*) FILTER(WHERE r.id_anterior IS NOT NULL) AS with_predecessor
FROM apex_private.ruta_version r GROUP BY r.estado;
SELECT count(*) AS requests,count(*) FILTER(WHERE r.id IS NULL) AS requests_without_proposal
FROM apex_private.solicitud_ruta q LEFT JOIN apex_private.ruta_version r ON r.id_solicitud=q.id;
SELECT count(*) AS different_predecessor_owner FROM apex_private.ruta_version r JOIN apex_private.ruta_version old ON old.id=r.id_anterior
WHERE r.id_estudiante<>old.id_estudiante OR r.version<=old.version;
SELECT count(*) AS lesson_completions,count(DISTINCT id_estudiante) AS students FROM apex_private.progreso_leccion;

-- B4. Rutas v2 y hechos de avance por version; detectar suposiciones de regeneracion.
SELECT r.nivel,r.version,count(*) AS routes,count(*) FILTER(WHERE r.id_anterior IS NOT NULL) AS with_predecessor
FROM apex_private.ruta_nivel_version r GROUP BY r.nivel,r.version ORDER BY r.nivel,r.version;
SELECT count(*) AS routes_not_seven FROM apex_private.ruta_nivel_version r
WHERE (SELECT count(*) FROM apex_private.seccion_ruta s WHERE s.id_ruta=r.id)<>7;
SELECT count(*) AS inconsistent_route_jobs FROM apex_private.ruta_nivel_version r JOIN apex_private.trabajo_ia j ON j.id=r.id_trabajo
WHERE r.id_estudiante<>j.id_estudiante OR j.tipo<>'sections' OR r.nivel IS DISTINCT FROM j.nivel OR j.estado<>'ready';
SELECT count(*) AS predecessor_mismatch FROM apex_private.ruta_nivel_version r JOIN apex_private.ruta_nivel_version old ON old.id=r.id_anterior
WHERE r.id_estudiante<>old.id_estudiante OR r.nivel<>old.nivel OR r.version<=old.version;
SELECT r.nivel,r.version,count(*) AS started,count(*) FILTER(WHERE p.completada_en IS NOT NULL) AS declared_complete
FROM apex_private.progreso_seccion p JOIN apex_private.seccion_ruta s ON s.id=p.id_seccion
JOIN apex_private.ruta_nivel_version r ON r.id=s.id_ruta GROUP BY r.nivel,r.version ORDER BY r.nivel,r.version;
SELECT count(*) AS wrong_progress_owner FROM apex_private.progreso_seccion p JOIN apex_private.seccion_ruta s ON s.id=p.id_seccion
JOIN apex_private.ruta_nivel_version r ON r.id=s.id_ruta WHERE p.id_estudiante<>r.id_estudiante;
SELECT count(*) AS bad_prerequisites FROM apex_private.seccion_ruta s
WHERE EXISTS(SELECT 1 FROM unnest(s.prerrequisitos) ord WHERE ord>=s.orden OR NOT EXISTS(
 SELECT 1 FROM apex_private.seccion_ruta req WHERE req.id_ruta=s.id_ruta AND req.orden=ord));

-- B5. Trabajo IA: estadisticas y contratos; no ejecutar claim/finish ni imprimir mensajes.
SELECT tipo,nivel,estado,count(*),max(intentos) AS max_claims,min(creado_en) AS oldest,max(actualizado_en) AS latest
FROM apex_private.trabajo_ia GROUP BY tipo,nivel,estado ORDER BY tipo,nivel,estado;
SELECT count(*) FILTER(WHERE estado='running' AND vence_en<now()) AS expired_leases,
       count(*) FILTER(WHERE estado='running' AND (lease IS NULL OR vence_en IS NULL)) AS missing_lease,
       count(*) FILTER(WHERE estado='ready' AND respuesta IS NULL) AS ready_without_response,
       count(*) FILTER(WHERE tipo='chat' AND NOT EXISTS(SELECT 1 FROM apex_private.sesion_refuerzo s WHERE s.id::text=split_part(j.clave,':',2))) AS chat_key_without_session
FROM apex_private.trabajo_ia j;
SELECT tipo,contexto->>'contractVersion' AS input_contract,respuesta->>'contractVersion' AS output_contract,
       respuesta ? 'agent' AS returns_agent_metadata,count(*)
FROM apex_private.trabajo_ia WHERE contexto IS NOT NULL GROUP BY tipo,input_contract,output_contract,returns_agent_metadata;
SELECT count(*) AS assistant_messages_without_ready_job
FROM apex_private.mensaje_refuerzo m LEFT JOIN apex_private.trabajo_ia j ON j.id=m.id_trabajo
WHERE m.rol='assistant' AND (j.id IS NULL OR j.estado<>'ready');
SELECT count(*) AS completed_reviews_without_answered_user_context
FROM apex_private.sesion_refuerzo s WHERE s.tipo='review' AND s.completada_en IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM apex_private.mensaje_refuerzo m JOIN apex_private.trabajo_ia j ON j.id=m.id_trabajo
 WHERE m.id_sesion=s.id AND m.rol='assistant' AND j.estado='ready' AND EXISTS(
  SELECT 1 FROM jsonb_array_elements(j.contexto->'messages') msg WHERE msg->>'role'='user'));
-- Referencias persistidas de chat: existen en job.respuesta, no en proyeccion texto de mensaje.
SELECT count(*) AS assistant_messages_with_reference_array FROM apex_private.mensaje_refuerzo m
JOIN apex_private.trabajo_ia j ON j.id=m.id_trabajo
WHERE m.rol='assistant' AND jsonb_typeof(j.respuesta->'references')='array';

-- B6. Intentos, resultados y seleccion: agregados, sin exponer opciones correctas.
SELECT i.estado,count(*) AS attempts,count(*) FILTER(WHERE g.id_intento IS NOT NULL) AS with_result,
       count(*) FILTER(WHERE r.id_intento IS NOT NULL) AS with_clock
FROM apex_private.intento i LEFT JOIN apex_private.resultado g ON g.id_intento=i.id
LEFT JOIN apex_private.reloj_intento r ON r.id_intento=i.id GROUP BY i.estado;
SELECT count(*) AS inconsistent_attempt_result FROM apex_private.intento i LEFT JOIN apex_private.resultado g ON g.id_intento=i.id
WHERE (i.estado='finalizado' AND g.id_intento IS NULL) OR (i.estado<>'finalizado' AND g.id_intento IS NOT NULL);
SELECT count(*) AS snapshot_item_count_mismatch FROM apex_private.intento i JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion
WHERE (SELECT count(*) FROM apex_private.seleccion_intento s WHERE s.id_intento=i.id)<>
      (SELECT count(*) FROM apex_private.item_evaluacion it WHERE it.id_evaluacion=a.id_evaluacion);
SELECT count(*) AS snapshot_relation_mismatch FROM apex_private.seleccion_intento s
JOIN apex_private.intento i ON i.id=s.id_intento JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion
JOIN apex_private.item_evaluacion it ON it.id=s.id_item JOIN apex_private.pregunta p ON p.id=s.id_pregunta
LEFT JOIN apex_private.bloque_preguntas b ON b.id=s.id_bloque
WHERE it.id_evaluacion<>a.id_evaluacion OR it.id_pregunta<>s.id_pregunta OR s.version_pregunta<>p.version
 OR s.id_bloque IS DISTINCT FROM p.id_bloque OR s.version_bloque IS DISTINCT FROM b.version;
SELECT count(*) AS incompatible_answers FROM apex_private.respuesta r
JOIN apex_private.intento i ON i.id=r.id_intento JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion
JOIN apex_private.item_evaluacion it ON it.id=r.id_item LEFT JOIN apex_private.opcion_respuesta o ON o.id=r.id_opcion
WHERE it.id_evaluacion<>a.id_evaluacion OR (r.id_opcion IS NOT NULL AND o.id_pregunta<>it.id_pregunta);
SELECT count(*) AS incomplete_selected_blocks FROM (
 SELECT s.id_intento,s.id_bloque,count(*) AS selected_members,
        coalesce(b.cantidad_preguntas,(SELECT count(*) FROM apex_private.pregunta q WHERE q.id_bloque=b.id)) AS expected_members
 FROM apex_private.seleccion_intento s JOIN apex_private.bloque_preguntas b ON b.id=s.id_bloque
 GROUP BY s.id_intento,s.id_bloque,b.id
) block_counts WHERE selected_members<>expected_members;
SELECT count(*) AS broken_snapshot_order FROM (
 SELECT id_intento,min(orden) AS first_item,max(orden) AS last_item,count(*) AS amount
 FROM apex_private.seleccion_intento GROUP BY id_intento
) order_counts WHERE first_item<>1 OR last_item<>amount;
SELECT count(*) AS missing_academic_exposure FROM apex_private.seleccion_intento s
JOIN apex_private.intento i ON i.id=s.id_intento JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion
JOIN apex_private.pregunta p ON p.id=s.id_pregunta
WHERE NOT EXISTS(SELECT 1 FROM apex_private.prueba_reloj_tecnica t WHERE t.id_convocatoria=a.id)
 AND NOT EXISTS(SELECT 1 FROM apex_private.exposicion_pregunta x WHERE x.id_estudiante=a.id_estudiante
 AND x.id_intento=i.id AND x.id_original=coalesce(p.id_original,p.id));

-- B7. Decisiones son distintas de notas: reportar incoherencia, no repararla.
SELECT d.tipo,d.nivel,d.regla,d.umbral,d.aprobada,count(*) FROM apex_private.decision_avance d
GROUP BY d.tipo,d.nivel,d.regla,d.umbral,d.aprobada ORDER BY d.tipo,d.nivel;
SELECT count(*) AS decisions_without_matching_score FROM apex_private.decision_avance d
LEFT JOIN apex_private.resultado r ON r.id_intento=d.id_intento
WHERE r.id_intento IS NULL OR d.aciertos<>r.aciertos OR d.total<>r.total_preguntas;
SELECT count(*) AS decision_policy_mismatch FROM apex_private.decision_avance d
WHERE d.regla='avance-apex-v2' AND (
 (d.tipo='control' AND (d.umbral IS DISTINCT FROM 7 OR d.total<>10 OR d.nivel IS NULL OR d.nivel NOT BETWEEN 1 AND 3 OR d.aprobada IS DISTINCT FROM (d.aciertos>=7)))
 OR (d.tipo='final' AND (d.umbral IS DISTINCT FROM 22 OR d.total<>25 OR d.aprobada IS DISTINCT FROM (d.aciertos>=22)))
 OR (d.tipo='diagnostico' AND (d.umbral IS NOT NULL OR d.aprobada IS NOT NULL)));
SELECT count(*) AS retry_review_mismatch FROM apex_private.intento_ruta ir
JOIN apex_private.intento i ON i.id=ir.id_intento JOIN apex_private.asignacion_evaluacion a ON a.id=i.id_asignacion
JOIN apex_private.convocatoria_banco c ON c.id=ir.id_convocatoria LEFT JOIN apex_private.sesion_refuerzo s ON s.id=ir.id_repaso
LEFT JOIN apex_private.intento old ON old.id=s.id_intento LEFT JOIN apex_private.asignacion_evaluacion old_a ON old_a.id=old.id_asignacion
WHERE a.id_estudiante<>c.id_estudiante OR (ir.numero>1 AND (s.id IS NULL OR s.tipo<>'review' OR s.completada_en IS NULL
 OR s.id_estudiante<>a.id_estudiante OR s.id_nuevo_intento IS DISTINCT FROM i.id OR old_a.id_estudiante IS DISTINCT FROM a.id_estudiante));

-- B8. Plazos: comparar campos originales sin ejecutar cierres ni usar epoch_ms del dominio.
SELECT politica,tipo,count(*) AS attempts,count(*) FILTER(WHERE vence_en IS NOT NULL) AS timed,
       count(*) FILTER(WHERE ultimo_error IS NOT NULL) AS with_error,max(fallos) AS maximum_failures
FROM apex_private.reloj_intento GROUP BY politica,tipo ORDER BY politica,tipo;
SELECT count(*) AS changed_start_or_invalid_deadline FROM apex_private.reloj_intento r JOIN apex_private.intento i ON i.id=r.id_intento
WHERE r.iniciado_en<>i.iniciado_en OR (r.politica='total-apex-v1' AND (r.vence_en IS NULL
 OR r.vence_en<>r.iniciado_en+r.limite_segundos::bigint*1000));
SELECT count(*) AS overdue_active,count(*) FILTER(WHERE r.ultimo_error IS NOT NULL) AS with_error
FROM apex_private.reloj_intento r JOIN apex_private.intento i ON i.id=r.id_intento
WHERE r.politica='total-apex-v1' AND i.estado='activo' AND r.vence_en<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
SELECT count(*) AS confirmed_at_or_after_deadline FROM apex_private.respuesta a JOIN apex_private.reloj_intento r ON r.id_intento=a.id_intento
WHERE r.vence_en IS NOT NULL AND a.guardada_en>=r.vence_en;
SELECT count(*) AS closure_timestamp_mismatch FROM apex_private.reloj_intento r JOIN apex_private.intento i ON i.id=r.id_intento
LEFT JOIN apex_private.resultado g ON g.id_intento=i.id WHERE r.motivo_entrega IS NOT NULL AND (
 i.estado<>'finalizado' OR g.id_intento IS NULL OR r.procesado_en IS DISTINCT FROM i.finalizado_en
 OR r.procesado_en IS DISTINCT FROM g.calculado_en OR (r.motivo_entrega='tiempo_agotado' AND r.procesado_en<r.vence_en));

-- B9. Prueba retirada: marker permanente, evidencia y cero contaminacion.
-- Omitir este bloque si A demuestra que la extension tecnica no existe; no instalarla.
SELECT t.habilitada,t.habilitada_en,t.retirada_en,p.habilitada AS technical_template_enabled,
       i.id AS technical_attempt,i.estado,r.politica,r.limite_segundos,r.vence_en,r.motivo_entrega,r.procesado_en,r.fallos,
       g.calculado_en,g.aciertos,g.total_preguntas,g.detalle->>'technical' AS technical_result,
       (SELECT count(*) FROM apex_private.seleccion_intento s WHERE s.id_intento=i.id) AS snapshot_questions,
       (SELECT count(*) FROM apex_private.respuesta a WHERE a.id_intento=i.id) AS confirmed_answers
FROM apex_private.prueba_reloj_tecnica t JOIN apex_private.convocatoria_banco c ON c.id=t.id_convocatoria
JOIN apex_private.plantilla_evaluacion p ON p.id=c.id_plantilla
LEFT JOIN apex_private.intento i ON i.id_asignacion=t.id_convocatoria
LEFT JOIN apex_private.reloj_intento r ON r.id_intento=i.id LEFT JOIN apex_private.resultado g ON g.id_intento=i.id;
WITH technical AS (
 SELECT i.id FROM apex_private.prueba_reloj_tecnica t JOIN apex_private.intento i ON i.id_asignacion=t.id_convocatoria
)
SELECT
 (SELECT count(*) FROM apex_private.exposicion_pregunta x JOIN technical t ON t.id=x.id_intento) AS academic_exposure,
 (SELECT count(*) FROM apex_private.decision_avance d JOIN technical t ON t.id=d.id_intento) AS advancement,
 (SELECT count(*) FROM apex_private.intento_ruta r JOIN technical t ON t.id=r.id_intento) AS route_attempts,
 (SELECT count(*) FROM apex_private.sesion_refuerzo s WHERE s.id_intento IN (SELECT id FROM technical) OR s.id_nuevo_intento IN (SELECT id FROM technical)) AS reviews,
 (SELECT count(*) FROM apex_private.trabajo_ia j WHERE EXISTS(SELECT 1 FROM technical t WHERE strpos(coalesce(j.contexto::text,'')||coalesce(j.respuesta::text,''),t.id)>0)) AS jobs_mentioning_technical_id,
 (SELECT count(*) FROM apex_private.solicitud_ruta s WHERE EXISTS(SELECT 1 FROM technical t WHERE strpos(s.contexto::text,t.id)>0)) AS v1_requests_mentioning_technical_id;
-- B10. Vistas: ejecutar SOLO despues de revisar definiciones/funciones de A5.
-- No llamar funciones de historial/contexto para comparar: leer proyecciones existentes.
SELECT v.name,format('SELECT count(*) AS technical_rows FROM apex_private.%I h JOIN apex_private.intento i ON i.id=h.id_intento JOIN apex_private.prueba_reloj_tecnica t ON t.id_convocatoria=i.id_asignacion;',v.name) AS optional_pure_view_select
FROM (VALUES ('v_historial_academico'),('v_progreso_nucleo'),('v_progreso_competencia')) AS v(name)
WHERE to_regclass('apex_private.'||v.name) IS NOT NULL;

-- B11. Permisos de contenido/citas: disponibilidad no significa contenido emitido o aprovado por docente.
SELECT count(*) AS reviewed_educational_fragments FROM apex_private.fragmento_documental d JOIN apex_private.fuente f ON f.id=d.id_fuente
WHERE d.revisado AND d.uso_contexto AND d.tipo_contenido='documental' AND f.estado='revisado'
 AND NOT f.contiene_soluciones AND f.contexto_tutor_permitido;
SELECT count(*) AS risky_context_flags FROM apex_private.fragmento_documental d JOIN apex_private.fuente f ON f.id=d.id_fuente
WHERE d.uso_contexto AND (NOT d.revisado OR d.tipo_contenido<>'documental' OR f.contiene_soluciones OR NOT f.contexto_tutor_permitido
 OR EXISTS(SELECT 1 FROM apex_private.pregunta p WHERE p.id_fuente=f.id AND p.pagina_clave=d.pagina));
SELECT count(*) AS broken_section_reference FROM apex_private.seccion_ruta s
CROSS JOIN LATERAL jsonb_array_elements(s.referencias) ref
WHERE NOT EXISTS(SELECT 1 FROM apex_private.fragmento_documental d JOIN apex_private.fuente f ON f.id=d.id_fuente
 WHERE d.id::text=ref->>'fragmentId' AND f.id=ref->>'sourceId' AND to_jsonb(d.pagina)=ref->'page');
-- No borrar cita historica si despues se revoca la fuente: distinguir integridad historica de autorizacion vigente.

-- B12. Ambito docente y perfiles: controles agregados, no lista de correos/nacimientos.
SELECT u.rol,u.estado,u.perfil_completo,count(*) FROM apex_private.usuario u GROUP BY u.rol,u.estado,u.perfil_completo;
SELECT count(*) AS assigned_teachers_without_current_teacher_role FROM apex_private.asignacion_docente a
JOIN apex_private.usuario u ON u.id=a.id_docente WHERE u.rol<>'docente' OR u.estado<>'activo';
SELECT count(*) AS role_audits_with_missing_auth_target FROM apex_private.auditoria_rol a
WHERE NOT EXISTS(SELECT 1 FROM apex_private.usuario u WHERE u.auth_user_id=a.destinatario);
-- Conteo no autoriza reparar/borrar: puede ser historia valida tras cambios de rol/retencion.
ROLLBACK;
