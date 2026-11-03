-- Previous five migrations were reported applied manually by the owner. Additive only.
BEGIN;
SET LOCAL search_path TO apex_private, pg_catalog;
CREATE TABLE bloque_preguntas (
 id TEXT PRIMARY KEY, id_fuente TEXT NOT NULL REFERENCES fuente(id),
 titulo TEXT NOT NULL, instrucciones TEXT NOT NULL CHECK(length(trim(instrucciones))>0),
 lectura TEXT, ejemplo TEXT,
 opciones_compartidas JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(opciones_compartidas)='array'),
 formato TEXT NOT NULL CHECK(formato IN ('vocabulario_compartido','conversacion','cloze','lectura')),
 pagina_inicio INTEGER NOT NULL CHECK(pagina_inicio>0), pagina_fin INTEGER NOT NULL CHECK(pagina_fin>=pagina_inicio),
 estado_revision TEXT NOT NULL DEFAULT 'borrador' CHECK(estado_revision IN ('borrador','revisada')),
 revisada_por UUID REFERENCES auth.users(id), revisada_en TIMESTAMPTZ
);
ALTER TABLE bloque_preguntas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bloque_preguntas FROM PUBLIC,anon,authenticated;
ALTER TABLE pregunta ADD COLUMN id_bloque TEXT REFERENCES bloque_preguntas(id);
ALTER TABLE pregunta ADD COLUMN numero_original INTEGER CHECK(numero_original>0);
ALTER TABLE pregunta ADD COLUMN pagina_clave INTEGER CHECK(pagina_clave>0);
ALTER TABLE opcion_respuesta ADD COLUMN etiqueta_original TEXT CHECK(etiqueta_original ~ '^[A-Z]$');
ALTER TABLE nucleo_tematico ADD COLUMN origen_clasificacion TEXT NOT NULL DEFAULT 'sin_documentar' CHECK(origen_clasificacion IN ('documento','propuesta_apex','sin_documentar'));
ALTER TABLE competencia ADD COLUMN origen_clasificacion TEXT NOT NULL DEFAULT 'sin_documentar' CHECK(origen_clasificacion IN ('documento','propuesta_apex','sin_documentar'));
CREATE UNIQUE INDEX pregunta_numero_fuente_version ON pregunta(id_fuente,version,numero_original) WHERE numero_original IS NOT NULL;
CREATE UNIQUE INDEX opcion_etiqueta_original ON opcion_respuesta(id_pregunta,etiqueta_original) WHERE etiqueta_original IS NOT NULL;

CREATE FUNCTION proteger_bloque() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM pregunta p JOIN item_evaluacion it ON it.id_pregunta=p.id JOIN evaluacion e ON e.id=it.id_evaluacion WHERE p.id_bloque=old.id AND (e.publicada OR EXISTS(SELECT 1 FROM asignacion_evaluacion WHERE id_evaluacion=e.id))) THEN
  RAISE EXCEPTION 'Bloque utilizado inmutable: crea una nueva versión.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END $$;
CREATE TRIGGER proteger_bloque BEFORE UPDATE OR DELETE ON bloque_preguntas FOR EACH ROW EXECUTE FUNCTION proteger_bloque();

CREATE FUNCTION validar_bloque() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(new.opciones_compartidas) o WHERE jsonb_typeof(o)<>'object' OR coalesce(o->>'label','') !~ '^[A-Z]$' OR coalesce(length(o->>'text'),0)=0 OR (o-'label'-'text')<>'{}'::jsonb)
 OR (SELECT count(*)<>count(DISTINCT o->>'label') FROM jsonb_array_elements(new.opciones_compartidas) o) THEN RAISE EXCEPTION 'Opciones compartidas: solo label/text únicos, sin claves.'; END IF;
 IF new.formato IN ('cloze','lectura') AND coalesce(length(trim(new.lectura)),0)=0 THEN RAISE EXCEPTION 'Falta la lectura del bloque.'; END IF;
 IF new.formato='vocabulario_compartido' AND jsonb_array_length(new.opciones_compartidas)<2 THEN RAISE EXCEPTION 'Faltan opciones compartidas.'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER validar_bloque BEFORE INSERT OR UPDATE ON bloque_preguntas FOR EACH ROW EXECUTE FUNCTION validar_bloque();

CREATE FUNCTION validar_bloques_publicacion() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF new.publicada AND (TG_OP='INSERT' OR NOT old.publicada) AND EXISTS(
  SELECT 1 FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta JOIN bloque_preguntas b ON b.id=p.id_bloque JOIN fuente f ON f.id=p.id_fuente
  WHERE it.id_evaluacion=new.id AND (
   b.id_fuente<>p.id_fuente OR b.estado_revision<>'revisada' OR b.revisada_por IS NULL OR b.revisada_en IS NULL
   OR p.numero_original IS NULL OR p.pagina_clave IS NULL OR p.pagina_clave>f.paginas OR b.pagina_fin>f.paginas
   OR EXISTS(SELECT 1 FROM opcion_respuesta o WHERE o.id_pregunta=p.id AND o.etiqueta_original IS NULL)
   OR (jsonb_array_length(b.opciones_compartidas)>0 AND (
    (SELECT count(*) FROM opcion_respuesta WHERE id_pregunta=p.id)<>jsonb_array_length(b.opciones_compartidas)
    OR EXISTS(SELECT 1 FROM opcion_respuesta o WHERE o.id_pregunta=p.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b.opciones_compartidas) shared WHERE shared->>'label'=o.etiqueta_original AND shared->>'text'=o.texto))
   ))
  )
 ) THEN RAISE EXCEPTION 'Bloque no revisado o referencias/opciones originales incompatibles.'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER validar_bloques_publicacion BEFORE INSERT OR UPDATE ON evaluacion FOR EACH ROW EXECUTE FUNCTION validar_bloques_publicacion();

CREATE OR REPLACE FUNCTION intento_json(iid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('id',i.id,'status',i.estado,'lastActivity',i.ultima_actividad,'title',e.titulo,
 'questions',(SELECT jsonb_agg(jsonb_build_object('id',it.id,'text',p.enunciado,'version',p.version,'nucleus',n.nombre,'competency',c.nombre,'provenance',p.procedencia,
 'originalNumber',p.numero_original,'sourcePage',p.pagina_inicio,'sourceTitle',f.titulo,
 'classificationProposed',n.origen_clasificacion='propuesta_apex' OR c.origen_clasificacion='propuesta_apex',
 'context',CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id',b.id,'title',b.titulo,'instructions',b.instrucciones,'reading',b.lectura,'example',b.ejemplo,'sharedOptions',b.opciones_compartidas,'format',b.formato,'pageStart',b.pagina_inicio,'pageEnd',b.pagina_fin) END,
 'options',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'text',o.texto,'label',coalesce(o.etiqueta_original,chr(64+o.orden))) ORDER BY o.orden) FROM opcion_respuesta o WHERE o.id_pregunta=p.id)) ORDER BY it.orden)
 FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta JOIN fuente f ON f.id=p.id_fuente JOIN nucleo_tematico n ON n.id=p.id_nucleo JOIN competencia c ON c.id=p.id_competencia LEFT JOIN bloque_preguntas b ON b.id=p.id_bloque WHERE it.id_evaluacion=a.id_evaluacion),
 'answers',coalesce((SELECT jsonb_object_agg(id_item,id_opcion) FROM respuesta WHERE id_intento=iid),'{}'::jsonb))
 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN evaluacion e ON e.id=a.id_evaluacion WHERE i.id=iid
$$;

-- Explicit activation AFTER human review and publication. No invocation in this migration/load.
-- Existing profile RPC already assigns published diagnostics through programa_componente to new students.
CREATE FUNCTION public.apex_assign_english(program_ids TEXT[]) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario; ev evaluacion; assigned INTEGER;
BEGIN
 u:=actor(); IF u.rol<>'administrador' THEN RAISE EXCEPTION 'Solo administrador.' USING ERRCODE='42501'; END IF;
 IF coalesce(cardinality(program_ids),0)=0 OR EXISTS(SELECT 1 FROM unnest(program_ids) p WHERE p IS NULL OR NOT EXISTS(SELECT 1 FROM programa_academico WHERE id=p)) THEN RAISE EXCEPTION 'Selecciona programas académicos existentes.'; END IF;
 SELECT * INTO ev FROM evaluacion WHERE id='diagnostico-ingles-2018-v1' FOR UPDATE;
 IF ev.id IS NULL OR NOT ev.publicada THEN RAISE EXCEPTION 'Revisa y publica el diagnóstico antes de asignarlo.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM evaluacion_componente WHERE id_evaluacion=ev.id AND id_componente='ingles') OR EXISTS(SELECT 1 FROM evaluacion_componente WHERE id_evaluacion=ev.id AND id_componente<>'ingles') THEN RAISE EXCEPTION 'Componente del diagnóstico incompatible.'; END IF;
 INSERT INTO programa_componente(id_programa,id_componente) SELECT DISTINCT p,'ingles' FROM unnest(program_ids) p ON CONFLICT DO NOTHING;
 INSERT INTO asignacion_evaluacion(id,id_estudiante,id_evaluacion)
 SELECT gen_random_uuid()::text,s.id_usuario,ev.id FROM estudiante s JOIN usuario us ON us.id=s.id_usuario
 WHERE s.id_programa=ANY(program_ids) AND us.estado='activo' AND us.rol='estudiante' AND us.perfil_completo
 ON CONFLICT(id_estudiante,id_evaluacion) DO NOTHING;
 GET DIAGNOSTICS assigned=ROW_COUNT;
 RETURN jsonb_build_object('assignedExisting',assigned,'programCount',(SELECT count(DISTINCT p) FROM unnest(program_ids) p));
END $$;

-- Key pages are never eligible AI fragments, even if an operator mistakenly toggles review flags.
ALTER TABLE fragmento_documental ADD COLUMN tipo_contenido TEXT NOT NULL DEFAULT 'documental' CHECK(tipo_contenido IN ('documental','instrumento','clave'));
CREATE OR REPLACE FUNCTION public.apex_document_context(source_id TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
BEGIN
 PERFORM actor(); IF NOT material_autorizado(source_id) THEN RAISE EXCEPTION 'Fuente no autorizada.' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('fragmentId',d.id,'sourceId',f.id,'title',f.titulo,'edition',f.referencia_edicion,'url',f.url_origen,'filePath',f.ruta_archivo,'page',d.pagina,'text',d.texto) ORDER BY d.pagina,d.ordinal)
 FROM fragmento_documental d JOIN fuente f ON f.id=d.id_fuente WHERE f.id=source_id AND f.estado='revisado' AND d.revisado AND d.uso_contexto AND d.tipo_contenido='documental'
 AND NOT EXISTS(SELECT 1 FROM pregunta p WHERE p.id_fuente=f.id AND p.pagina_clave=d.pagina)),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION proteger_bloque(),validar_bloque(),validar_bloques_publicacion(),public.apex_assign_english(TEXT[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_assign_english(TEXT[]) TO authenticated;
COMMIT;
