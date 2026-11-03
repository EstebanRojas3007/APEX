-- Additive: atomic registration, optional restricted editing, conservative recovery.
BEGIN;
SET LOCAL search_path TO apex_private, pg_catalog;

CREATE FUNCTION fecha_perfil_valida(value TEXT) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE dob DATE;
BEGIN
 IF value IS NULL OR value !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
 dob:=value::date;
 RETURN dob::text=value AND dob>=date '1900-01-01' AND dob<=current_date;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;

CREATE FUNCTION validar_nombre_perfil(value JSONB) RETURNS VOID LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'string' OR length(trim(value#>>'{}')) NOT BETWEEN 2 AND 100 THEN
  RAISE EXCEPTION 'Nombre: 2 a 100 caracteres.' USING ERRCODE='22023';
 END IF;
END $$;
CREATE FUNCTION validar_estudios_perfil(data JSONB) RETURNS VOID LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF jsonb_typeof(data->'program') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM programa_academico WHERE id=data->>'program') THEN
  RAISE EXCEPTION 'Selecciona una carrera válida.' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(data->'semester') IS DISTINCT FROM 'number' OR coalesce(data->>'semester','') !~ '^([1-9]|1[0-9]|20)$' THEN
  RAISE EXCEPTION 'Semestre: un entero entre 1 y 20.' USING ERRCODE='22023';
 END IF;
END $$;

CREATE FUNCTION datos_perfil_guardados_validos(user_id TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT coalesce((SELECT length(trim(u.nombre)) BETWEEN 2 AND 100 AND fecha_perfil_valida(u.fecha_nacimiento)
  AND (u.rol<>'estudiante' OR EXISTS(SELECT 1 FROM estudiante e JOIN programa_academico p ON p.id=e.id_programa WHERE e.id_usuario=u.id AND e.semestre BETWEEN 1 AND 20))
  FROM usuario u WHERE u.id=user_id),false)
$$;

CREATE FUNCTION completar_perfil_guardado(user_id TEXT) RETURNS VOID LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;
BEGIN
 SELECT * INTO u FROM usuario WHERE id=user_id FOR UPDATE;
 IF u.id IS NULL OR u.perfil_completo OR NOT datos_perfil_guardados_validos(user_id)
  OR NOT EXISTS(SELECT 1 FROM consentimiento WHERE id_usuario=user_id AND finalidad='perfil-y-evaluacion' AND version_aviso='apex-v1' AND revocado_en IS NULL) THEN RETURN; END IF;
 UPDATE usuario SET perfil_completo=true WHERE id=user_id;
 IF u.rol='estudiante' THEN
  -- Allocate once at initial completion. Editing never changes or adds assignments.
  INSERT INTO asignacion_evaluacion(id,id_estudiante,id_evaluacion)
  SELECT gen_random_uuid()::text,user_id,ev.id FROM evaluacion ev WHERE ev.publicada AND ev.tipo='diagnostico'
   AND ev.id_plantilla IS NULL
   AND EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=ev.id)
   AND NOT EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=ev.id AND NOT EXISTS(
    SELECT 1 FROM estudiante e JOIN programa_componente pc ON pc.id_programa=e.id_programa WHERE e.id_usuario=user_id AND pc.id_componente=ec.id_componente))
  ON CONFLICT(id_estudiante,id_evaluacion) DO NOTHING;
 END IF;
END $$;

-- Private bootstrap, used only by the INSERT trigger and the one-time migration recovery.
-- Stored values take precedence; later Auth metadata changes never replay registration.
CREATE FUNCTION guardar_perfil_registro(user_id TEXT,metadata JSONB,require_consent BOOLEAN) RETURNS VOID LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario; e estudiante; data JSONB;
BEGIN
 SELECT * INTO u FROM usuario WHERE id=user_id FOR UPDATE;
 IF u.id IS NULL OR u.perfil_completo THEN RETURN; END IF;
 SELECT * INTO e FROM estudiante WHERE id_usuario=user_id;
 data:=jsonb_build_object('name',coalesce(to_jsonb(nullif(u.nombre,'')),metadata->'name'),
  'birthDate',coalesce(to_jsonb(nullif(u.fecha_nacimiento,'')),metadata->'birthDate'),
  'program',coalesce(to_jsonb(e.id_programa),metadata->'program'),'semester',coalesce(to_jsonb(e.semestre),metadata->'semester'));
 PERFORM validar_nombre_perfil(data->'name');
 IF NOT fecha_perfil_valida(data->>'birthDate') THEN RAISE EXCEPTION 'Fecha de nacimiento inválida: AAAA-MM-DD.' USING ERRCODE='22023'; END IF;
 IF u.rol='estudiante' THEN PERFORM validar_estudios_perfil(data); END IF;
 IF require_consent AND metadata->'consent' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Acepta el aviso de uso de datos.' USING ERRCODE='22023'; END IF;
 UPDATE usuario SET nombre=trim(data->>'name'),fecha_nacimiento=data->>'birthDate' WHERE id=user_id;
 IF u.rol='estudiante' THEN
  INSERT INTO estudiante(id_usuario,id_programa,semestre) VALUES(user_id,data->>'program',(data->>'semester')::integer) ON CONFLICT(id_usuario) DO NOTHING;
 END IF;
 IF metadata->'consent'='true'::jsonb AND NOT EXISTS(SELECT 1 FROM consentimiento WHERE id_usuario=user_id AND finalidad='perfil-y-evaluacion' AND version_aviso='apex-v1' AND revocado_en IS NULL) THEN
  INSERT INTO consentimiento VALUES(gen_random_uuid()::text,user_id,'perfil-y-evaluacion','apex-v1',epoch_ms(),NULL);
 END IF;
 PERFORM completar_perfil_guardado(user_id);
END $$;

CREATE OR REPLACE FUNCTION alta_auth() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
BEGIN
 -- NEVER read roles, ownership, state or completion flags from user metadata.
 INSERT INTO usuario(id,proveedor_auth,uid_auth,auth_user_id,nombre,correo,fecha_nacimiento)
 VALUES(new.id::text,'supabase',new.id::text,new.id,'',new.email,'');
 IF coalesce(new.raw_user_meta_data,'{}'::jsonb) ?| ARRAY['birthDate','program','semester','consent'] THEN
  PERFORM guardar_perfil_registro(new.id::text,new.raw_user_meta_data,true);
 END IF;
 -- Auth invitations without registration fields remain pending as before.
 RETURN new;
END $$;

-- Recover only explicitly linked, incomplete identities. No email matching and no
-- invented dates or consent. Invalid/partial metadata leaves the profile pending.
DO $$
DECLARE row RECORD;
BEGIN
 FOR row IN SELECT u.id,a.raw_user_meta_data FROM usuario u JOIN auth.users a ON a.id=u.auth_user_id WHERE NOT u.perfil_completo LOOP
  BEGIN
   PERFORM guardar_perfil_registro(row.id,coalesce(row.raw_user_meta_data,'{}'::jsonb),false);
  EXCEPTION WHEN SQLSTATE '22023' THEN
   RAISE NOTICE 'Perfil % pendiente: %',row.id,SQLERRM;
  END;
 END LOOP;
END $$;

ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_perfil;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;
BEGIN
 IF operation IN ('profile','profile_consent') THEN
  u:=actor();
  SELECT * INTO u FROM usuario WHERE id=u.id FOR UPDATE;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Datos de perfil inválidos.' USING ERRCODE='22023'; END IF;
  IF operation='profile' THEN
   IF (payload-'name'-'semester'-'program')<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Solo puedes editar nombre, semestre y carrera.' USING ERRCODE='22023';
   END IF;
   PERFORM validar_nombre_perfil(payload->'name');
   IF u.rol='estudiante' THEN
    PERFORM validar_estudios_perfil(payload);
    INSERT INTO estudiante(id_usuario,id_programa,semestre) VALUES(u.id,payload->>'program',(payload->>'semester')::integer)
     ON CONFLICT(id_usuario) DO UPDATE SET id_programa=excluded.id_programa,semestre=excluded.semestre;
   ELSIF payload ?| ARRAY['program','semester'] THEN
    RAISE EXCEPTION 'Solo el estudiante edita carrera y semestre.' USING ERRCODE='42501';
   END IF;
   UPDATE usuario SET nombre=trim(payload->>'name') WHERE id=u.id;
   PERFORM completar_perfil_guardado(u.id);
  ELSE
   -- Separate explicit acceptance only for previously saved legacy registration data.
   IF (payload-'consent')<>'{}'::jsonb OR payload->'consent' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Acepta el aviso de uso de datos.' USING ERRCODE='22023'; END IF;
   IF NOT datos_perfil_guardados_validos(u.id) THEN RAISE EXCEPTION 'Faltan datos válidos del registro. Solicita revisión de tu cuenta.' USING ERRCODE='22023'; END IF;
   IF NOT u.perfil_completo THEN
    IF NOT EXISTS(SELECT 1 FROM consentimiento WHERE id_usuario=u.id AND finalidad='perfil-y-evaluacion' AND version_aviso='apex-v1' AND revocado_en IS NULL) THEN
     INSERT INTO consentimiento VALUES(gen_random_uuid()::text,u.id,'perfil-y-evaluacion','apex-v1',epoch_ms(),NULL);
    END IF;
    PERFORM completar_perfil_guardado(u.id);
   END IF;
  END IF;
  UPDATE sesion_actividad SET ultima_actividad=now() WHERE id=(auth.jwt()->>'session_id')::uuid;
  RETURN perfil_json(u.id);
 END IF;
 IF operation='start' THEN
  u:=actor();
  IF NOT datos_perfil_guardados_validos(u.id) THEN RAISE EXCEPTION 'Faltan datos válidos del registro. Solicita revisión de tu cuenta.' USING ERRCODE='42501'; END IF;
 END IF;
 -- Preserve the bank API, session enforcement, roles, RLS and all other operations.
 RETURN public.apex_api_pre_perfil(operation,payload);
END $$;

REVOKE ALL ON FUNCTION fecha_perfil_valida(TEXT),validar_nombre_perfil(JSONB),validar_estudios_perfil(JSONB),datos_perfil_guardados_validos(TEXT),completar_perfil_guardado(TEXT),guardar_perfil_registro(TEXT,JSONB,BOOLEAN),alta_auth(),public.apex_api_pre_perfil(TEXT,JSONB),public.apex_api(TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB) TO authenticated;
COMMIT;
