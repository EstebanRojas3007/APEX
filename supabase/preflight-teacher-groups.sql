-- OWNER, READ ONLY. Run before deciding which migrations are pending.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT current_database(),current_user;
SELECT to_regprocedure('apex_private.actor()') AS actor,
 to_regprocedure('apex_private.asignacion_tecnica(text)') AS filtro_tecnico,
 to_regprocedure('public.apex_api(text,jsonb)') AS rpc,
 to_regclass('apex_private.decision_avance') AS decisiones,
 to_regclass('apex_private.ruta_nivel_version') AS rutas,
 to_regclass('apex_private.grupo') AS grupos;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname IN ('apex_api','apex_api_pre_tecnica','asignacion_tecnica','actor','puede_leer_estudiante');
SELECT u.id,u.auth_user_id,u.rol,u.estado,count(ad.id_estudiante) AS vinculos_previos
FROM apex_private.usuario u LEFT JOIN apex_private.asignacion_docente ad ON ad.id_docente=u.id
WHERE u.rol IN ('docente','administrador') GROUP BY u.id ORDER BY u.id;
SELECT id,nombre FROM apex_private.componente WHERE id='ingles';
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='apex_private' AND table_name IN ('asignacion_docente','auditoria_rol','usuario') ORDER BY table_name,ordinal_position;
ROLLBACK;
