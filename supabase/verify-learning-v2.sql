-- READ ONLY. Inspect, do not activate or assign.
BEGIN READ ONLY;
SELECT id,tipo,nivel,cantidad,version,politica_exposicion,habilitada,composicion FROM apex_private.plantilla_evaluacion WHERE politica_exposicion='no_vistas_lru_bloques-v2' ORDER BY id;
SELECT * FROM apex_private.configuracion_mvp;
-- Each slot must have enough complete approved blocks. Diagnostic totals must be 2/2/3.
SELECT pl.id,s.value->>'family' AS family,(s.value->>'level')::integer AS level,(s.value->>'blocks')::integer AS required,
 (SELECT count(*) FROM apex_private.bloque_preguntas b WHERE b.id_fuente=pl.id_fuente AND b.estado_revision='revisada' AND b.familia_habilidad=s.value->>'family' AND b.nivel_pedagogico=(s.value->>'level')::integer AND b.dificultad_prevista=(s.value->>'difficulty')::integer AND b.cantidad_preguntas=(s.value->>'size')::integer AND (SELECT count(*) FROM apex_private.pregunta q WHERE q.id_bloque=b.id)=b.cantidad_preguntas) AS available
 FROM apex_private.plantilla_evaluacion pl CROSS JOIN LATERAL jsonb_array_elements(pl.composicion) s WHERE pl.politica_exposicion='no_vistas_lru_bloques-v2' ORDER BY pl.id,level,family;
SELECT p.id,(s.value->>'level')::integer AS level,sum((s.value->>'size')::integer*(s.value->>'blocks')::integer) AS questions FROM apex_private.plantilla_evaluacion p CROSS JOIN LATERAL jsonb_array_elements(p.composicion) s WHERE p.tipo='diagnostico' AND p.politica_exposicion='no_vistas_lru_bloques-v2' GROUP BY p.id,level ORDER BY p.id,level;
SELECT estado,tipo,count(*) FROM apex_private.trabajo_ia GROUP BY estado,tipo;
SELECT r.id,r.nivel,r.version,count(s.id) AS sections FROM apex_private.ruta_nivel_version r LEFT JOIN apex_private.seccion_ruta s ON s.id_ruta=r.id GROUP BY r.id;
SELECT n.nspname,p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') AS student_execute,has_function_privilege('service_role',p.oid,'EXECUTE') AS worker_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('apex_api','apex_my_route','apex_ai_claim','apex_ai_finish','apex_transition_diagnostic','apex_assign_english_pre_mvp');
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='apex_private' AND tablename IN ('trabajo_ia','ruta_nivel_version','seccion_ruta','progreso_seccion','sesion_refuerzo','mensaje_refuerzo','intento_ruta','decision_avance');
COMMIT;
