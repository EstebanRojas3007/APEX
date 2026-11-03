-- Prepared from the immutable v0.2 validator. All integrity checks retained.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
CREATE OR REPLACE FUNCTION validar_publicacion() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE pl plantilla_evaluacion; expected INTEGER;
BEGIN
 IF new.publicada AND (TG_OP='INSERT' OR NOT old.publicada) THEN
  expected:=7;
  IF new.id_plantilla IS NOT NULL THEN
   SELECT * INTO pl FROM plantilla_evaluacion WHERE id=new.id_plantilla;
   IF NOT pl.habilitada OR NOT EXISTS(SELECT 1 FROM carga_banco WHERE id_fuente=pl.id_fuente) OR new.tipo<>(CASE pl.tipo WHEN 'control' THEN 'cuestionario' WHEN 'final' THEN 'simulacro' ELSE 'diagnostico' END) THEN RAISE EXCEPTION 'Plantilla aún no habilitada.'; END IF;
   expected:=pl.cantidad;
  ELSIF new.tipo<>'diagnostico' THEN RAISE EXCEPTION 'Instrumento sin plantilla autorizada.';
  END IF;
  IF new.duracion_segundos IS NOT NULL THEN RAISE EXCEPTION 'No se ha definido duración total para este instrumento.'; END IF;
  IF (SELECT count(*) FROM item_evaluacion WHERE id_evaluacion=new.id)<>expected THEN RAISE EXCEPTION 'Cantidad de ítems incompatible: se requieren %.',expected; END IF;
  IF EXISTS(SELECT 1 FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta JOIN fuente f ON f.id=p.id_fuente JOIN nucleo_tematico n ON n.id=p.id_nucleo JOIN competencia c ON c.id=p.id_competencia WHERE it.id_evaluacion=new.id AND (
   p.tipo<>'seleccion_unica' OR p.estado_revision<>'revisada' OR p.procedencia='sin_clasificar'
   OR (SELECT count(*) FROM opcion_respuesta o WHERE o.id_pregunta=p.id)<2 OR (SELECT count(*) FROM opcion_respuesta o WHERE o.id_pregunta=p.id AND es_correcta=1)<>1
   OR n.id_componente<>c.id_componente OR NOT EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=new.id AND ec.id_componente=n.id_componente)
   OR (p.procedencia<>'propia_demo' AND (f.estado<>'revisado' OR f.ruta_archivo IS NULL OR f.sha256 IS NULL OR f.paginas IS NULL OR p.pagina_inicio IS NULL OR p.pagina_fin IS NULL OR p.pagina_fin>f.paginas
    OR (NOT EXISTS(SELECT 1 FROM carga_banco WHERE id_fuente=p.id_fuente) AND (p.revisada_por IS NULL OR p.revisada_en IS NULL OR f.url_origen IS NULL))))
   OR (new.id_plantilla IS NOT NULL AND p.id_fuente<>pl.id_fuente)
  )) THEN RAISE EXCEPTION 'Contenido no revisado, clave, clasificación o aprobación incompatible.'; END IF;
  IF new.id_plantilla IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta WHERE it.id_evaluacion=new.id AND (p.id_bloque IS NULL OR (SELECT count(*) FROM item_evaluacion other JOIN pregunta op ON op.id=other.id_pregunta WHERE other.id_evaluacion=new.id AND op.id_bloque=p.id_bloque)<>(SELECT count(*) FROM pregunta bp WHERE bp.id_bloque=p.id_bloque))) THEN RAISE EXCEPTION 'No se permite fragmentar bloques.'; END IF;
   IF (SELECT min(orden)<>1 OR max(orden)<>expected FROM item_evaluacion WHERE id_evaluacion=new.id)
    OR EXISTS(SELECT 1 FROM (SELECT p.id_bloque,max(it.orden)-min(it.orden)+1 span,count(*) amount FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta WHERE it.id_evaluacion=new.id GROUP BY p.id_bloque) b WHERE b.span<>b.amount)
    OR EXISTS(SELECT 1 FROM (SELECT p.numero_original,lag(p.numero_original) OVER(PARTITION BY p.id_bloque ORDER BY it.orden) previous FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta WHERE it.id_evaluacion=new.id) ordered WHERE numero_original<=previous) THEN RAISE EXCEPTION 'Orden de bloques o preguntas incompatible.'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(pl.composicion) s WHERE (SELECT count(DISTINCT b.id) FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta JOIN bloque_preguntas b ON b.id=p.id_bloque WHERE it.id_evaluacion=new.id AND b.familia_habilidad=s->>'family' AND b.nivel_pedagogico=(s->>'level')::integer AND b.dificultad_prevista=(s->>'difficulty')::integer AND b.cantidad_preguntas=(s->>'size')::integer)<>(s->>'blocks')::integer) THEN RAISE EXCEPTION 'Composición pedagógica incompatible.'; END IF;
  END IF;
 END IF;
 RETURN new;
END $$;
COMMIT;
