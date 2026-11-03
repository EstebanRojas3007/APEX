-- READ ONLY after local preparation has been reviewed and pending migrations/import applied manually.
-- No publication, activation, assignment, upload, reset, key output or remote call.
BEGIN READ ONLY;
SET LOCAL search_path TO apex_private,pg_catalog;
SELECT id_fuente,version,checksum,aprobacion,cargado_en FROM carga_banco WHERE id_fuente='apex-ingles-105-v0.2';
SELECT nivel_pedagogico,count(*) preguntas,count(*) FILTER(WHERE tipo='seleccion_unica') seleccion_unica FROM pregunta WHERE id_fuente='apex-ingles-105-v0.2' GROUP BY nivel_pedagogico ORDER BY 1;
SELECT familia_habilidad,nivel_pedagogico,dificultad_prevista,cantidad_preguntas,count(*) bloques FROM bloque_preguntas WHERE id_fuente='apex-ingles-105-v0.2' GROUP BY 1,2,3,4 ORDER BY 2,1;
SELECT count(*) AS opciones FROM opcion_respuesta o JOIN pregunta p ON p.id=o.id_pregunta WHERE p.id_fuente='apex-ingles-105-v0.2';
SELECT p.id AS pregunta_invalida FROM pregunta p WHERE p.id_fuente='apex-ingles-105-v0.2' AND ((SELECT count(*) FROM opcion_respuesta WHERE id_pregunta=p.id AND es_correcta=1)<>1 OR (SELECT count(*) FROM opcion_respuesta WHERE id_pregunta=p.id)<2);
SELECT b.id AS bloque_incompleto FROM bloque_preguntas b WHERE b.id_fuente='apex-ingles-105-v0.2' AND b.cantidad_preguntas<>(SELECT count(*) FROM pregunta p WHERE p.id_bloque=b.id);
SELECT pl.id,pl.tipo,pl.nivel,pl.cantidad,pl.habilitada,pl.politica_exposicion,(SELECT sum((s->>'size')::integer*(s->>'blocks')::integer) FROM jsonb_array_elements(pl.composicion) s) cantidad_compuesta FROM plantilla_evaluacion pl WHERE id_fuente='apex-ingles-105-v0.2';
SELECT id,ruta_archivo,sha256,paginas,contiene_soluciones,contexto_tutor_permitido FROM fuente WHERE id='apex-ingles-105-v0.2';
SELECT bucket_id,name FROM storage.objects WHERE bucket_id='materiales-estudio' AND name='Ingles/apex/banco-preguntas/v0.2/APEX_Banco_Ingles_105_Preguntas_Revision_v0_2.pdf';
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='apex_private' ORDER BY tablename;
SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema='apex_private' AND grantee IN ('anon','authenticated');
SELECT id,public FROM storage.buckets WHERE id='materiales-estudio';
SELECT count(*) convocatorias FROM convocatoria_banco;
SELECT count(*) lecciones FROM leccion_version;
SELECT count(*) reglas FROM regla_ruta_version;
SELECT count(*) rutas FROM ruta_version;
SELECT count(*) agotamientos FROM agotamiento_banco;
-- Existing diagnostic IDs/counts/publication stay unchanged by this import.
SELECT e.id,e.publicada,count(it.id) preguntas FROM evaluacion e LEFT JOIN item_evaluacion it ON it.id_evaluacion=e.id WHERE e.tipo='diagnostico' GROUP BY e.id,e.publicada ORDER BY e.id;
COMMIT;
