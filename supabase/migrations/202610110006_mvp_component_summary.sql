-- Presentation metadata only. No authorizations, assignments or historical writes.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
ALTER FUNCTION resultado_json(TEXT) RENAME TO resultado_json_pre_componente;
CREATE FUNCTION resultado_json(iid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT resultado_json_pre_componente(iid)||jsonb_build_object('componentIds',coalesce((
  SELECT jsonb_agg(ec.id_componente ORDER BY ec.id_componente) FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
  JOIN evaluacion_componente ec ON ec.id_evaluacion=a.id_evaluacion WHERE i.id=iid),'[]'::jsonb))
$$;
ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_componente;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE data JSONB;uid TEXT;primary_component TEXT;
BEGIN
 data:=public.apex_api_pre_componente(operation,payload);
 IF operation='me' THEN
  uid:=data->'profile'->>'id';
  IF EXISTS(SELECT 1 FROM estudiante e JOIN programa_componente pc ON pc.id_programa=e.id_programa
   JOIN configuracion_mvp c ON c.id AND c.diagnostico IS NOT NULL
   WHERE e.id_usuario=uid AND pc.id_componente='ingles') THEN primary_component:='ingles'; END IF;
  data:=data||jsonb_build_object('primaryComponent',primary_component);
  data:=jsonb_set(data,'{assignments}',coalesce((SELECT jsonb_agg(item||jsonb_build_object('componentIds',coalesce((
   SELECT jsonb_agg(component ORDER BY component) FROM (
    SELECT ec.id_componente AS component FROM asignacion_evaluacion a JOIN evaluacion_componente ec ON ec.id_evaluacion=a.id_evaluacion WHERE a.id=item->>'id' AND a.id_estudiante=uid
    UNION SELECT 'ingles' FROM convocatoria_banco c WHERE c.id=item->>'id' AND c.id_estudiante=uid
   ) components),'[]'::jsonb)) ORDER BY ord)
   FROM jsonb_array_elements(data->'assignments') WITH ORDINALITY entries(item,ord)),'[]'::jsonb));
 END IF;
 RETURN data;
END $$;
REVOKE ALL ON FUNCTION resultado_json_pre_componente(TEXT),resultado_json(TEXT),public.apex_api_pre_componente(TEXT,JSONB),public.apex_api(TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB) TO authenticated;
COMMIT;
