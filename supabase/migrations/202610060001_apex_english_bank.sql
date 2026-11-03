-- Additive. Keeps all prior instruments, migrations, identities and results.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
ALTER TABLE fuente ADD COLUMN contiene_soluciones BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE fuente ADD COLUMN contexto_tutor_permitido BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE pregunta ADD COLUMN id_original TEXT;
ALTER TABLE pregunta ADD COLUMN habilidad_descripcion TEXT;
ALTER TABLE pregunta ADD COLUMN justificacion_privada TEXT;
ALTER TABLE pregunta ADD COLUMN referencias_pedagogicas TEXT;
ALTER TABLE pregunta ADD COLUMN nivel_pedagogico INTEGER CHECK(nivel_pedagogico BETWEEN 1 AND 3);
ALTER TABLE pregunta ADD COLUMN dificultad_prevista INTEGER CHECK(dificultad_prevista BETWEEN 1 AND 3);
ALTER TABLE bloque_preguntas ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE bloque_preguntas ADD COLUMN codigo_original TEXT;
ALTER TABLE bloque_preguntas ADD COLUMN familia_habilidad TEXT;
ALTER TABLE bloque_preguntas ADD COLUMN nivel_pedagogico INTEGER CHECK(nivel_pedagogico BETWEEN 1 AND 3);
ALTER TABLE bloque_preguntas ADD COLUMN dificultad_prevista INTEGER CHECK(dificultad_prevista BETWEEN 1 AND 3);
ALTER TABLE bloque_preguntas ADD COLUMN cantidad_preguntas INTEGER CHECK(cantidad_preguntas>0);

CREATE TABLE carga_banco (
 id_fuente TEXT PRIMARY KEY REFERENCES fuente(id), version TEXT NOT NULL, checksum TEXT NOT NULL,
 aprobacion JSONB NOT NULL, contenido_original JSONB NOT NULL, claves_originales JSONB NOT NULL,
 cargado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE plantilla_evaluacion (
 id TEXT PRIMARY KEY, id_fuente TEXT NOT NULL REFERENCES fuente(id), version INTEGER NOT NULL CHECK(version>0),
 titulo TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('control','final')), nivel INTEGER CHECK(nivel BETWEEN 1 AND 3),
 cantidad INTEGER NOT NULL CHECK((tipo='control' AND cantidad=10 AND nivel IS NOT NULL) OR (tipo='final' AND cantidad=25 AND nivel IS NULL)),
 composicion JSONB NOT NULL CHECK(jsonb_typeof(composicion)='array'),
 politica_exposicion TEXT NOT NULL DEFAULT 'solo_no_vistas-v1' CHECK(politica_exposicion='solo_no_vistas-v1'),
 habilitada BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE convocatoria_banco (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, id_estudiante TEXT NOT NULL REFERENCES estudiante(id_usuario),
 id_plantilla TEXT NOT NULL REFERENCES plantilla_evaluacion(id), id_evaluacion TEXT UNIQUE REFERENCES evaluacion(id),
 creada_en TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(id_estudiante,id_plantilla)
);
ALTER TABLE evaluacion ADD COLUMN id_plantilla TEXT REFERENCES plantilla_evaluacion(id);
CREATE TABLE seleccion_intento (
 id_intento TEXT REFERENCES intento(id), id_item TEXT REFERENCES item_evaluacion(id),
 orden INTEGER NOT NULL, id_pregunta TEXT NOT NULL REFERENCES pregunta(id), version_pregunta INTEGER NOT NULL,
 id_bloque TEXT REFERENCES bloque_preguntas(id), version_bloque INTEGER, dto JSONB NOT NULL,
 PRIMARY KEY(id_intento,id_item), UNIQUE(id_intento,orden)
);
CREATE TABLE exposicion_pregunta (
 id_estudiante TEXT REFERENCES estudiante(id_usuario), id_original TEXT NOT NULL,
 id_pregunta TEXT REFERENCES pregunta(id), id_intento TEXT REFERENCES intento(id),
 registrada_en TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(id_estudiante,id_original,id_intento)
);
CREATE TABLE agotamiento_banco (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id_convocatoria TEXT REFERENCES convocatoria_banco(id),
 detalle JSONB NOT NULL, registrado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['carga_banco','plantilla_evaluacion','convocatoria_banco','seleccion_intento','exposicion_pregunta','agotamiento_banco'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;

CREATE FUNCTION registro_inmutable() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Registro versionado inmutable: crea una versión nueva.'; END $$;
CREATE TRIGGER carga_inmutable BEFORE UPDATE OR DELETE ON carga_banco FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE TRIGGER plantilla_inmutable BEFORE UPDATE OR DELETE ON plantilla_evaluacion FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE TRIGGER seleccion_inmutable BEFORE UPDATE OR DELETE ON seleccion_intento FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE TRIGGER exposicion_inmutable BEFORE UPDATE OR DELETE ON exposicion_pregunta FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE FUNCTION proteger_banco_aprobado() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE fid TEXT;
BEGIN
 IF TG_TABLE_NAME='fuente' THEN fid:=old.id;
 ELSIF TG_TABLE_NAME IN ('pregunta','bloque_preguntas') THEN
  IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM carga_banco WHERE id_fuente=old.id_fuente) THEN RAISE EXCEPTION 'Banco aprobado inmutable.'; END IF;
  IF TG_OP<>'DELETE' THEN fid:=new.id_fuente; END IF;
 ELSIF TG_TABLE_NAME='opcion_respuesta' THEN
  IF EXISTS(SELECT 1 FROM pregunta p JOIN carga_banco b ON b.id_fuente=p.id_fuente WHERE p.id=CASE WHEN TG_OP<>'INSERT' THEN old.id_pregunta END OR p.id=CASE WHEN TG_OP<>'DELETE' THEN new.id_pregunta END) THEN RAISE EXCEPTION 'Banco aprobado inmutable.'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM pregunta p JOIN carga_banco b ON b.id_fuente=p.id_fuente WHERE CASE TG_TABLE_NAME WHEN 'competencia' THEN p.id_competencia=old.id ELSE p.id_nucleo=old.id END) THEN RAISE EXCEPTION 'Taxonomía de banco aprobado inmutable.'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM carga_banco WHERE id_fuente=fid) THEN RAISE EXCEPTION 'Banco aprobado inmutable.'; END IF;
 IF TG_OP='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END $$;
CREATE TRIGGER banco_fuente BEFORE UPDATE OR DELETE ON fuente FOR EACH ROW EXECUTE FUNCTION proteger_banco_aprobado();
CREATE TRIGGER banco_pregunta BEFORE INSERT OR UPDATE OR DELETE ON pregunta FOR EACH ROW EXECUTE FUNCTION proteger_banco_aprobado();
CREATE TRIGGER banco_bloque BEFORE INSERT OR UPDATE OR DELETE ON bloque_preguntas FOR EACH ROW EXECUTE FUNCTION proteger_banco_aprobado();
CREATE TRIGGER banco_opcion BEFORE INSERT OR UPDATE OR DELETE ON opcion_respuesta FOR EACH ROW EXECUTE FUNCTION proteger_banco_aprobado();
CREATE TRIGGER banco_competencia BEFORE UPDATE OR DELETE ON competencia FOR EACH ROW EXECUTE FUNCTION proteger_banco_aprobado();
CREATE TRIGGER banco_nucleo BEFORE UPDATE OR DELETE ON nucleo_tematico FOR EACH ROW EXECUTE FUNCTION proteger_banco_aprobado();

-- The review PDF stays inaccessible to students even after an attempt is finished.
CREATE OR REPLACE FUNCTION material_autorizado(fid TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;
BEGIN
 u:=actor();
 IF EXISTS(SELECT 1 FROM fuente WHERE id=fid AND contiene_soluciones) THEN RETURN u.rol='administrador'; END IF;
 IF u.rol='estudiante' AND EXISTS(SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion JOIN pregunta p ON p.id=it.id_pregunta WHERE a.id_estudiante=u.id AND i.estado='activo' AND p.id_fuente=fid) THEN RETURN false; END IF;
 RETURN u.rol='administrador' OR EXISTS(SELECT 1 FROM material_estudio m JOIN material_nucleo mn ON mn.id_material=m.id JOIN nucleo_tematico n ON n.id=mn.id_nucleo JOIN programa_componente pc ON pc.id_componente=n.id_componente JOIN estudiante e ON e.id_programa=pc.id_programa
 WHERE m.id_fuente=fid AND m.publicado AND (e.id_usuario=u.id OR (u.rol='docente' AND EXISTS(SELECT 1 FROM asignacion_docente ad WHERE ad.id_docente=u.id AND ad.id_estudiante=e.id_usuario))));
EXCEPTION WHEN invalid_authorization_specification THEN RETURN false;
END $$;
CREATE OR REPLACE FUNCTION archivo_autorizado(ruta TEXT) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
 SELECT CASE WHEN ruta LIKE 'Ingles/apex/banco-preguntas/%' OR EXISTS(SELECT 1 FROM fuente WHERE ruta_archivo=ruta AND contiene_soluciones) THEN tiene_rol('administrador')
 ELSE tiene_rol('administrador') OR EXISTS(SELECT 1 FROM fuente WHERE ruta_archivo=ruta AND material_autorizado(id)) END
$$;
CREATE OR REPLACE FUNCTION public.apex_document_context(source_id TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
BEGIN
 PERFORM actor();
 IF EXISTS(SELECT 1 FROM fuente WHERE id=source_id AND (contiene_soluciones OR NOT contexto_tutor_permitido)) THEN RETURN '[]'::jsonb; END IF;
 IF NOT material_autorizado(source_id) THEN RAISE EXCEPTION 'Fuente no autorizada.' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('fragmentId',d.id,'sourceId',f.id,'title',f.titulo,'edition',f.referencia_edicion,'url',f.url_origen,'filePath',f.ruta_archivo,'page',d.pagina,'text',d.texto) ORDER BY d.pagina,d.ordinal)
 FROM fragmento_documental d JOIN fuente f ON f.id=d.id_fuente WHERE f.id=source_id AND f.estado='revisado' AND d.revisado AND d.uso_contexto AND d.tipo_contenido='documental' AND NOT f.contiene_soluciones AND f.contexto_tutor_permitido
 AND NOT EXISTS(SELECT 1 FROM pregunta p WHERE p.id_fuente=f.id AND p.pagina_clave=d.pagina)),'[]'::jsonb);
END $$;

CREATE FUNCTION pregunta_dto(qid TEXT,item_id TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('id',item_id,'questionId',p.id,'text',p.enunciado,'version',p.version,'nucleus',n.nombre,'competency',c.nombre,'provenance',p.procedencia,
 'level',p.nivel_pedagogico,'skill',p.habilidad_descripcion,'originalNumber',p.numero_original,'sourcePage',p.pagina_inicio,'sourceTitle',f.titulo,
 'classificationProposed',n.origen_clasificacion='propuesta_apex' OR c.origen_clasificacion='propuesta_apex',
 'context',CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id',b.id,'version',b.version,'title',b.titulo,'instructions',b.instrucciones,'reading',b.lectura,'example',b.ejemplo,'sharedOptions',b.opciones_compartidas,'format',b.formato,'pageStart',b.pagina_inicio,'pageEnd',b.pagina_fin) END,
 'options',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'text',o.texto,'label',coalesce(o.etiqueta_original,chr(64+o.orden))) ORDER BY o.orden) FROM opcion_respuesta o WHERE o.id_pregunta=p.id))
 FROM pregunta p JOIN fuente f ON f.id=p.id_fuente JOIN nucleo_tematico n ON n.id=p.id_nucleo JOIN competencia c ON c.id=p.id_competencia LEFT JOIN bloque_preguntas b ON b.id=p.id_bloque WHERE p.id=qid
$$;
CREATE OR REPLACE FUNCTION intento_json(iid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('id',i.id,'status',i.estado,'lastActivity',i.ultima_actividad,'title',e.titulo,
 'kind',coalesce(pl.tipo,e.tipo),'questions',coalesce((SELECT jsonb_agg(dto ORDER BY orden) FROM seleccion_intento WHERE id_intento=iid),
 (SELECT jsonb_agg(pregunta_dto(it.id_pregunta,it.id) ORDER BY it.orden) FROM item_evaluacion it WHERE it.id_evaluacion=a.id_evaluacion)),
 'answers',coalesce((SELECT jsonb_object_agg(id_item,id_opcion) FROM respuesta WHERE id_intento=iid),'{}'::jsonb))
 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN evaluacion e ON e.id=a.id_evaluacion LEFT JOIN plantilla_evaluacion pl ON pl.id=e.id_plantilla WHERE i.id=iid
$$;

-- Preserve legacy publication semantics; extend only instruments linked to an approved template.
CREATE OR REPLACE FUNCTION validar_publicacion() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE pl plantilla_evaluacion; expected INTEGER;
BEGIN
 IF new.publicada AND (TG_OP='INSERT' OR NOT old.publicada) THEN
  expected:=7;
  IF new.id_plantilla IS NOT NULL THEN
   SELECT * INTO pl FROM plantilla_evaluacion WHERE id=new.id_plantilla;
   IF NOT pl.habilitada OR NOT EXISTS(SELECT 1 FROM carga_banco WHERE id_fuente=pl.id_fuente) OR new.tipo<>(CASE pl.tipo WHEN 'control' THEN 'cuestionario' ELSE 'simulacro' END) THEN RAISE EXCEPTION 'Plantilla aún no habilitada.'; END IF;
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
CREATE OR REPLACE FUNCTION validar_bloques_publicacion() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF new.publicada AND (TG_OP='INSERT' OR NOT old.publicada) AND EXISTS(SELECT 1 FROM item_evaluacion it JOIN pregunta p ON p.id=it.id_pregunta JOIN bloque_preguntas b ON b.id=p.id_bloque JOIN fuente f ON f.id=p.id_fuente WHERE it.id_evaluacion=new.id AND (
  b.id_fuente<>p.id_fuente OR b.estado_revision<>'revisada' OR (NOT EXISTS(SELECT 1 FROM carga_banco WHERE id_fuente=p.id_fuente) AND (b.revisada_por IS NULL OR b.revisada_en IS NULL))
  OR p.numero_original IS NULL OR p.pagina_clave IS NULL OR p.pagina_clave>f.paginas OR b.pagina_fin>f.paginas
  OR EXISTS(SELECT 1 FROM opcion_respuesta o WHERE o.id_pregunta=p.id AND o.etiqueta_original IS NULL)
  OR (jsonb_array_length(b.opciones_compartidas)>0 AND ((SELECT count(*) FROM opcion_respuesta WHERE id_pregunta=p.id)<>jsonb_array_length(b.opciones_compartidas) OR EXISTS(SELECT 1 FROM opcion_respuesta o WHERE o.id_pregunta=p.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b.opciones_compartidas) shared WHERE shared->>'label'=o.etiqueta_original AND shared->>'text'=o.texto))))
 )) THEN RAISE EXCEPTION 'Bloque no revisado, aprobación o referencias incompatibles.'; END IF;
 RETURN new;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA apex_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION registro_inmutable(),proteger_banco_aprobado(),pregunta_dto(TEXT,TEXT) FROM PUBLIC,anon,authenticated;
COMMIT;
