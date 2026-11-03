-- OWNER ONLY, read-only. Save output before applying the pending migration.
-- No JWT impersonation, RPC calls, grading, fixtures or remote activation.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT name,to_regprocedure(name) AS installed FROM unnest(ARRAY[
 'public.apex_api(text,jsonb)','public.apex_api_pre_intervencion(text,jsonb)',
 'apex_private.intervenir_docente(text,jsonb)','apex_private.calificar_intento(text,boolean)',
 'apex_private.cerrar_intentos_vencidos(integer)','apex_private.ingles_con_historial(text)',
 'apex_private.docente_grupo(text,uuid)','apex_private.integrante_grupo(uuid,text)',
 'apex_private.seleccionar_forma(text,text,text,text,text)']) name;
SELECT p.oid::regprocedure AS function,md5(pg_get_functiondef(p.oid)) AS definition_md5
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='public' AND p.proname='apex_api') OR (n.nspname='apex_private' AND p.proname IN
 ('calificar_intento','cerrar_intentos_vencidos','validar_plazo_respuesta','validar_respuesta','iniciar_banco','seguimiento_intentos','identidad_intento'));
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='apex_private.intento'::regclass;
SELECT estado,count(*) AS attempts FROM apex_private.intento GROUP BY estado;
SELECT (SELECT count(*) FROM apex_private.resultado) AS results,
 (SELECT count(*) FROM apex_private.respuesta) AS answers,
 (SELECT count(*) FROM apex_private.seleccion_intento) AS selected_questions,
 (SELECT count(*) FROM apex_private.decision_avance) AS decisions,
 (SELECT count(*) FROM apex_private.exposicion_pregunta) AS exposure;
SELECT r.tipo,r.politica,count(*) AS open_attempts,
 count(*) FILTER(WHERE r.vence_en<=apex_private.epoch_ms()) AS expired_open
 FROM apex_private.intento i JOIN apex_private.reloj_intento r ON r.id_intento=i.id WHERE i.estado='activo'
 GROUP BY r.tipo,r.politica ORDER BY r.tipo,r.politica;
SELECT diagnostico FROM apex_private.configuracion_mvp;
SELECT p.id,p.habilitada,p.tipo,p.cantidad,b.id_fuente IS NOT NULL AS bank_loaded
 FROM apex_private.plantilla_evaluacion p LEFT JOIN apex_private.carga_banco b ON b.id_fuente=p.id_fuente
 WHERE p.id=(SELECT diagnostico FROM apex_private.configuracion_mvp);
ROLLBACK;
