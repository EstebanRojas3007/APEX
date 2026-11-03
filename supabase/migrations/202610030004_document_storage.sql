BEGIN;
SET LOCAL search_path TO apex_private, pg_catalog;
ALTER TABLE fragmento_documental ADD COLUMN uso_contexto BOOLEAN NOT NULL DEFAULT false;
CREATE FUNCTION material_autorizado(fid TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
DECLARE u usuario;
BEGIN
 u:=actor();
 -- A complete PDF may contain a correction key. Do not serve its material/context during its attempt.
 IF u.rol='estudiante' AND EXISTS(SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion JOIN pregunta p ON p.id=it.id_pregunta WHERE a.id_estudiante=u.id AND i.estado='activo' AND p.id_fuente=fid) THEN RETURN false; END IF;
 RETURN u.rol='administrador' OR EXISTS(
 SELECT 1 FROM material_estudio m JOIN material_nucleo mn ON mn.id_material=m.id JOIN nucleo_tematico n ON n.id=mn.id_nucleo JOIN programa_componente pc ON pc.id_componente=n.id_componente JOIN estudiante e ON e.id_programa=pc.id_programa
 WHERE m.id_fuente=fid AND m.publicado AND (e.id_usuario=u.id OR (u.rol='docente' AND EXISTS(SELECT 1 FROM asignacion_docente ad WHERE ad.id_docente=u.id AND ad.id_estudiante=e.id_usuario))));
EXCEPTION WHEN invalid_authorization_specification THEN RETURN false;
END $$;
CREATE FUNCTION public.apex_materials() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
BEGIN
 PERFORM actor();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'title',m.titulo,'body',m.contenido,'nucleus',n.nombre,'source',f.titulo,'filePath',f.ruta_archivo,'sourceUrl',f.url_origen,'edition',f.referencia_edicion,'version',m.version))
 FROM material_estudio m JOIN fuente f ON f.id=m.id_fuente JOIN material_nucleo mn ON mn.id_material=m.id JOIN nucleo_tematico n ON n.id=mn.id_nucleo WHERE m.publicado AND material_autorizado(f.id)),'[]'::jsonb);
END $$;
CREATE FUNCTION public.apex_document_context(source_id TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
BEGIN
 PERFORM actor();
 IF NOT material_autorizado(source_id) THEN RAISE EXCEPTION 'Fuente no autorizada.' USING ERRCODE='42501'; END IF;
 -- Explicit reviewed, educational-use fragments only. Never expose draft questions or answer keys.
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('fragmentId',d.id,'sourceId',f.id,'title',f.titulo,'edition',f.referencia_edicion,'url',f.url_origen,'filePath',f.ruta_archivo,'page',d.pagina,'text',d.texto) ORDER BY d.pagina,d.ordinal)
 FROM fragmento_documental d JOIN fuente f ON f.id=d.id_fuente WHERE f.id=source_id AND f.estado='revisado' AND d.revisado AND d.uso_contexto),'[]'::jsonb);
END $$;
CREATE FUNCTION validar_fragmento() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = apex_private, pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM fuente WHERE id=new.id_fuente AND ruta_archivo IS NOT NULL AND sha256 IS NOT NULL AND paginas>=new.pagina) THEN RAISE EXCEPTION 'Página sin PDF verificable.'; END IF;
 IF new.uso_contexto AND NOT new.revisado THEN RAISE EXCEPTION 'Revisa el fragmento antes de habilitar contexto IA.'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER validar_fragmento BEFORE INSERT OR UPDATE ON fragmento_documental FOR EACH ROW EXECUTE FUNCTION validar_fragmento();

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('materiales-estudio','materiales-estudio',false,52428800,ARRAY['application/pdf'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
CREATE POLICY apex_pdf_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='materiales-estudio' AND apex_private.tiene_rol('administrador') AND lower(name) LIKE '%.pdf');
CREATE POLICY apex_pdf_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='materiales-estudio' AND (apex_private.tiene_rol('administrador') OR EXISTS(SELECT 1 FROM apex_private.fuente f WHERE f.ruta_archivo=name AND apex_private.material_autorizado(f.id))));
-- Resolve object authorization through a definer helper so private source rows need no SELECT grant.
CREATE FUNCTION archivo_autorizado(ruta TEXT) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
 SELECT tiene_rol('administrador') OR EXISTS(SELECT 1 FROM fuente WHERE ruta_archivo=ruta AND material_autorizado(id))
$$;
ALTER POLICY apex_pdf_read ON storage.objects USING(bucket_id='materiales-estudio' AND apex_private.archivo_autorizado(name));
-- Restrictive guards prevent pre-existing permissive policies for other buckets from opening APEX.
CREATE POLICY apex_pdf_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'materiales-estudio' OR apex_private.archivo_autorizado(name));
CREATE POLICY apex_pdf_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'materiales-estudio' OR (apex_private.tiene_rol('administrador') AND lower(name) LIKE '%.pdf'));
CREATE POLICY apex_pdf_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'materiales-estudio') WITH CHECK(bucket_id<>'materiales-estudio');
CREATE POLICY apex_pdf_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'materiales-estudio');
CREATE POLICY apex_pdf_anon_guard ON storage.objects AS RESTRICTIVE FOR ALL TO anon
 USING(bucket_id<>'materiales-estudio') WITH CHECK(bucket_id<>'materiales-estudio');
-- No UPDATE/DELETE policies: use a new path for each PDF version; never overwrite cited files.
REVOKE ALL ON FUNCTION material_autorizado(TEXT),archivo_autorizado(TEXT),validar_fragmento(),public.apex_materials(),public.apex_document_context(TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION archivo_autorizado(TEXT),public.apex_materials(),public.apex_document_context(TEXT) TO authenticated;
COMMIT;
