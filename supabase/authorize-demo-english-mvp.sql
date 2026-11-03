-- Approved decision: demo includes English for the MVP. Owner SQL Editor only.
-- Real IDs confirmed by the owner: demo / ingles / rc. No account is assigned here.
-- Apply pending learning corrections first; do not replay the applied demo seed.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
SELECT pg_advisory_xact_lock(hashtext('apex-demo-english-mvp'));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM programa_academico WHERE id='demo' AND nombre='Programa de demostración')
  OR NOT EXISTS(SELECT 1 FROM componente WHERE id='ingles' AND nombre='Inglés')
  OR NOT EXISTS(SELECT 1 FROM componente WHERE id='rc' AND nombre='Razonamiento Cuantitativo') THEN
  RAISE EXCEPTION 'Los IDs/nombres confirmados no coinciden con este proyecto. No se cambió la autorización.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM programa_componente WHERE id_programa='demo' AND id_componente='rc') THEN
  RAISE EXCEPTION 'Falta la asociación histórica demo/rc informada. Revisa el proyecto antes de continuar.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM configuracion_mvp c JOIN plantilla_evaluacion p ON p.id=c.diagnostico JOIN carga_banco b ON b.id_fuente=p.id_fuente
  WHERE c.id AND c.diagnostico='apex-ingles-diagnostico-v2' AND p.id_fuente='apex-ingles-105-v0.2'
   AND p.tipo='diagnostico' AND p.cantidad=7 AND p.habilitada AND p.politica_exposicion='no_vistas_lru_bloques-v2') THEN
  RAISE EXCEPTION 'El diagnóstico APEX v2 debe estar configurado, habilitado y con banco cargado. Este SQL no cambia la configuración.';
 END IF;
END $$;
INSERT INTO programa_componente(id_programa,id_componente) VALUES('demo','ingles')
 ON CONFLICT(id_programa,id_componente) DO NOTHING;
SELECT pc.id_programa,pc.id_componente,c.nombre FROM programa_componente pc JOIN componente c ON c.id=pc.id_componente
 WHERE pc.id_programa='demo' ORDER BY pc.id_componente;
COMMIT;
