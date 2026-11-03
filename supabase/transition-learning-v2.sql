-- OPTIONAL EXPLICIT CUTOVER. Review in the correct project after preflight,
-- pending migrations, bank verification and apex-learning-v2-templates.sql.
-- Never replay historical seeds. No existing assignment/attempt is replaced.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
DO $$ BEGIN
 IF (SELECT count(*) FROM plantilla_evaluacion WHERE version=2 AND politica_exposicion='no_vistas_lru_bloques-v2' AND id IN ('apex-ingles-diagnostico-v2','apex-ingles-control-1-v2','apex-ingles-control-2-v2','apex-ingles-control-3-v2','apex-ingles-final-v2'))<>5 THEN RAISE EXCEPTION 'Prepare all five v2 templates first.'; END IF;
 IF (SELECT count(*) FROM pregunta WHERE id_fuente='apex-ingles-105-v0.2')<>105 THEN RAISE EXCEPTION 'Verify the existing bank first.'; END IF;
END $$;
UPDATE plantilla_evaluacion SET habilitada=true WHERE id IN ('apex-ingles-diagnostico-v2','apex-ingles-control-1-v2','apex-ingles-control-2-v2','apex-ingles-control-3-v2','apex-ingles-final-v2');
UPDATE configuracion_mvp SET diagnostico='apex-ingles-diagnostico-v2' WHERE id;
-- Interpret completed controls/finals under the newly authorized advancement rule.
-- Historical scores, result.detail and selection remain unchanged.
INSERT INTO decision_avance(id_intento,tipo,nivel,aciertos,total,umbral,aprobada)
 SELECT i.id,p.tipo,p.nivel,r.aciertos,r.total_preguntas,CASE p.tipo WHEN 'control' THEN 7 ELSE 22 END,r.aciertos>=CASE p.tipo WHEN 'control' THEN 7 ELSE 22 END
 FROM resultado r JOIN intento i ON i.id=r.id_intento JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN evaluacion e ON e.id=a.id_evaluacion JOIN plantilla_evaluacion p ON p.id=e.id_plantilla
 WHERE i.estado='finalizado' AND p.tipo IN ('control','final') ON CONFLICT(id_intento) DO NOTHING;
-- Only registrations completed AFTER this transaction use the new diagnostic.
-- Already registered students require an explicit administrator call to
-- apex_transition_diagnostic(student_ids), which skips any English diagnostic history.
COMMIT;
