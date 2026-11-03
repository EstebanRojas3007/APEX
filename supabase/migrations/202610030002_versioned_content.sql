BEGIN;
SET LOCAL search_path TO apex_private, pg_catalog;
ALTER TABLE fuente ALTER COLUMN referencia_edicion DROP NOT NULL;
ALTER TABLE fuente ADD COLUMN url_origen TEXT CHECK(url_origen IS NULL OR url_origen ~ '^https://');
ALTER TABLE fuente ADD COLUMN ruta_archivo TEXT UNIQUE;
ALTER TABLE fuente ADD COLUMN sha256 TEXT CHECK(sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$');
ALTER TABLE fuente ADD COLUMN paginas INTEGER CHECK(paginas>0);
ALTER TABLE fuente ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','extraido','revisado'));
ALTER TABLE pregunta ADD COLUMN tipo TEXT NOT NULL DEFAULT 'seleccion_unica' CHECK(tipo IN ('seleccion_unica','multiple','abierta'));
ALTER TABLE pregunta ADD COLUMN procedencia TEXT NOT NULL DEFAULT 'sin_clasificar' CHECK(procedencia IN ('original_pdf','adaptada','generada','propia_demo','sin_clasificar'));
ALTER TABLE pregunta ADD COLUMN pagina_inicio INTEGER CHECK(pagina_inicio>0);
ALTER TABLE pregunta ADD COLUMN pagina_fin INTEGER CHECK(pagina_fin>=pagina_inicio);
ALTER TABLE pregunta ADD COLUMN estado_revision TEXT NOT NULL DEFAULT 'borrador' CHECK(estado_revision IN ('borrador','revisada'));
ALTER TABLE pregunta ADD COLUMN revisada_por UUID REFERENCES auth.users(id);
ALTER TABLE pregunta ADD COLUMN revisada_en TIMESTAMPTZ;
ALTER TABLE pregunta ADD COLUMN origen_generacion JSONB;
ALTER TABLE evaluacion ADD COLUMN tipo TEXT NOT NULL DEFAULT 'diagnostico' CHECK(tipo IN ('diagnostico','cuestionario','simulacro'));
ALTER TABLE evaluacion ADD COLUMN publicada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE evaluacion ADD COLUMN duracion_segundos INTEGER CHECK(duracion_segundos>0);
ALTER TABLE resultado ADD COLUMN detalle JSONB;
CREATE TABLE fragmento_documental (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), id_fuente TEXT NOT NULL REFERENCES fuente(id),
 pagina INTEGER NOT NULL CHECK(pagina>0), ordinal INTEGER NOT NULL CHECK(ordinal>0),
 texto TEXT NOT NULL CHECK(length(trim(texto))>0), metodo_extraccion TEXT NOT NULL,
 version_extractor TEXT NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 revisado BOOLEAN NOT NULL DEFAULT false, UNIQUE(id_fuente,pagina,ordinal)
);
ALTER TABLE fragmento_documental ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_estudio ADD COLUMN publicado BOOLEAN NOT NULL DEFAULT false;

-- Published instruments are immutable. A new version must use new IDs, including options/items.
CREATE FUNCTION proteger_instrumento() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = apex_private, pg_catalog AS $$
DECLARE protegido BOOLEAN := false; ref TEXT;
BEGIN
 IF TG_TABLE_NAME='evaluacion' THEN
   IF TG_OP <> 'INSERT' THEN protegido:=old.publicada OR EXISTS(SELECT 1 FROM asignacion_evaluacion WHERE id_evaluacion=old.id); END IF;
 ELSIF TG_TABLE_NAME IN ('item_evaluacion','evaluacion_componente') THEN
   IF TG_OP <> 'INSERT' THEN SELECT publicada OR EXISTS(SELECT 1 FROM asignacion_evaluacion WHERE id_evaluacion=old.id_evaluacion) INTO protegido FROM evaluacion WHERE id=old.id_evaluacion; END IF;
   IF TG_OP <> 'DELETE' THEN protegido:=protegido OR EXISTS(SELECT 1 FROM evaluacion WHERE id=new.id_evaluacion AND (publicada OR EXISTS(SELECT 1 FROM asignacion_evaluacion WHERE id_evaluacion=new.id_evaluacion))); END IF;
 ELSIF TG_TABLE_NAME='opcion_respuesta' THEN
   protegido:=EXISTS(SELECT 1 FROM item_evaluacion it JOIN evaluacion e ON e.id=it.id_evaluacion WHERE (it.id_pregunta=CASE WHEN TG_OP<>'INSERT' THEN old.id_pregunta END OR it.id_pregunta=CASE WHEN TG_OP<>'DELETE' THEN new.id_pregunta END) AND (e.publicada OR EXISTS(SELECT 1 FROM asignacion_evaluacion WHERE id_evaluacion=e.id)));
 ELSIF TG_OP<>'INSERT' THEN
   ref:=old.id;
   protegido:=EXISTS(SELECT 1 FROM pregunta p JOIN item_evaluacion it ON it.id_pregunta=p.id JOIN evaluacion e ON e.id=it.id_evaluacion WHERE
     CASE TG_TABLE_NAME WHEN 'pregunta' THEN p.id=ref WHEN 'fuente' THEN p.id_fuente=ref WHEN 'nucleo_tematico' THEN p.id_nucleo=ref WHEN 'competencia' THEN p.id_competencia=ref END
     AND (e.publicada OR EXISTS(SELECT 1 FROM asignacion_evaluacion WHERE id_evaluacion=e.id)));
 END IF;
 IF protegido THEN RAISE EXCEPTION 'Instrumento publicado/asignado inmutable: crea otra versión.'; END IF;
 IF TG_OP='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END $$;
CREATE TRIGGER proteger_evaluacion BEFORE UPDATE OR DELETE ON evaluacion FOR EACH ROW EXECUTE FUNCTION proteger_instrumento();
CREATE TRIGGER proteger_item BEFORE INSERT OR UPDATE OR DELETE ON item_evaluacion FOR EACH ROW EXECUTE FUNCTION proteger_instrumento();
CREATE TRIGGER proteger_evaluacion_componente BEFORE INSERT OR UPDATE OR DELETE ON evaluacion_componente FOR EACH ROW EXECUTE FUNCTION proteger_instrumento();
CREATE TRIGGER proteger_pregunta BEFORE UPDATE OR DELETE ON pregunta FOR EACH ROW EXECUTE FUNCTION proteger_instrumento();
CREATE TRIGGER proteger_opcion BEFORE INSERT OR UPDATE OR DELETE ON opcion_respuesta FOR EACH ROW EXECUTE FUNCTION proteger_instrumento();
CREATE TRIGGER proteger_fuente BEFORE UPDATE OR DELETE ON fuente FOR EACH ROW EXECUTE FUNCTION proteger_instrumento();
CREATE TRIGGER proteger_nucleo BEFORE UPDATE OR DELETE ON nucleo_tematico FOR EACH ROW EXECUTE FUNCTION proteger_instrumento();
CREATE TRIGGER proteger_competencia BEFORE UPDATE OR DELETE ON competencia FOR EACH ROW EXECUTE FUNCTION proteger_instrumento();

CREATE FUNCTION validar_publicacion() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = apex_private, pg_catalog AS $$
BEGIN
 IF new.publicada AND (TG_OP='INSERT' OR NOT old.publicada) THEN
   IF new.tipo<>'diagnostico' OR new.duracion_segundos IS NOT NULL THEN RAISE EXCEPTION 'Solo diagnóstico sin límite total habilitado en esta entrega.'; END IF;
   IF (SELECT count(*) FROM item_evaluacion WHERE id_evaluacion=new.id)<>7 THEN RAISE EXCEPTION 'El diagnóstico requiere siete ítems revisados.'; END IF;
   IF EXISTS(SELECT 1 FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta JOIN fuente f ON f.id=p.id_fuente JOIN nucleo_tematico n ON n.id=p.id_nucleo JOIN competencia c ON c.id=p.id_competencia WHERE it.id_evaluacion=new.id AND (
      p.tipo<>'seleccion_unica' OR p.estado_revision<>'revisada' OR p.procedencia='sin_clasificar'
      OR (SELECT count(*) FROM opcion_respuesta o WHERE o.id_pregunta=p.id)<2
      OR (SELECT count(*) FROM opcion_respuesta o WHERE o.id_pregunta=p.id AND es_correcta=1)<>1
      OR n.id_componente<>c.id_componente OR NOT EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=new.id AND ec.id_componente=n.id_componente)
      OR (p.procedencia<>'propia_demo' AND (p.revisada_por IS NULL OR p.revisada_en IS NULL OR f.estado<>'revisado' OR f.url_origen IS NULL OR f.ruta_archivo IS NULL OR f.sha256 IS NULL OR f.paginas IS NULL OR p.pagina_inicio IS NULL OR p.pagina_fin IS NULL OR p.pagina_fin>f.paginas))
   )) THEN RAISE EXCEPTION 'Contenido no revisado, formato incompatible, clasificación o referencia PDF incompleta.'; END IF;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER validar_publicacion BEFORE INSERT OR UPDATE ON evaluacion FOR EACH ROW EXECUTE FUNCTION validar_publicacion();

CREATE FUNCTION validar_respuesta() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = apex_private, pg_catalog AS $$
DECLARE evaluacion_id TEXT; estado_intento TEXT;
BEGIN
 IF TG_OP='UPDATE' AND (old.id_intento<>new.id_intento OR old.id_item<>new.id_item) THEN RAISE EXCEPTION 'La identidad de la respuesta es inmutable.'; END IF;
 SELECT a.id_evaluacion,i.estado INTO evaluacion_id,estado_intento FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.id=CASE WHEN TG_OP='DELETE' THEN old.id_intento ELSE new.id_intento END FOR UPDATE OF i;
 IF estado_intento IS DISTINCT FROM 'activo' THEN RAISE EXCEPTION 'Intento no activo.'; END IF;
 IF TG_OP='DELETE' THEN RETURN old; END IF;
 IF NOT EXISTS(SELECT 1 FROM item_evaluacion it WHERE it.id=new.id_item AND it.id_evaluacion=evaluacion_id AND (new.id_opcion IS NULL OR EXISTS(SELECT 1 FROM opcion_respuesta o WHERE o.id=new.id_opcion AND o.id_pregunta=it.id_pregunta))) THEN RAISE EXCEPTION 'Opción, pregunta o evaluación incompatible.'; END IF;
 RETURN new;
END $$;
-- Fail safely if legacy answers already violate the invariant; never silently repair/delete them.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM respuesta r JOIN intento i ON i.id=r.id_intento JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id=r.id_item LEFT JOIN opcion_respuesta o ON o.id=r.id_opcion WHERE it.id_evaluacion<>a.id_evaluacion OR (r.id_opcion IS NOT NULL AND o.id_pregunta<>it.id_pregunta)) THEN RAISE EXCEPTION 'Respuestas previas incompatibles: reconciliar antes de migrar.'; END IF;
END $$;
CREATE TRIGGER validar_respuesta BEFORE INSERT OR UPDATE OR DELETE ON respuesta FOR EACH ROW EXECUTE FUNCTION validar_respuesta();
CREATE FUNCTION identidad_intento() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = apex_private, pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='intento' THEN
  IF new.id<>old.id OR new.id_asignacion<>old.id_asignacion OR old.estado='finalizado' THEN RAISE EXCEPTION 'Intento finalizado o identidad inmutable.'; END IF;
 ELSE RAISE EXCEPTION 'Asignación inmutable: crea una nueva evaluación.';
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER identidad_intento BEFORE UPDATE ON intento FOR EACH ROW EXECUTE FUNCTION identidad_intento();
CREATE TRIGGER identidad_asignacion BEFORE UPDATE ON asignacion_evaluacion FOR EACH ROW EXECUTE FUNCTION identidad_intento();
REVOKE ALL ON ALL TABLES IN SCHEMA apex_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION proteger_instrumento(),validar_publicacion(),validar_respuesta(),identidad_intento() FROM PUBLIC,anon,authenticated;
COMMIT;
