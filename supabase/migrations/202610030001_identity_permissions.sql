-- Additive migration. Keep legacy profiles unlinked until an explicit identity reconciliation.
BEGIN;
SET LOCAL search_path TO apex_private, pg_catalog;
ALTER TABLE usuario ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE usuario ADD COLUMN rol TEXT NOT NULL DEFAULT 'estudiante' CHECK (rol IN ('estudiante','docente','administrador'));
ALTER TABLE usuario ADD COLUMN perfil_completo BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE asignacion_docente (
  id_docente TEXT REFERENCES usuario(id), id_estudiante TEXT REFERENCES estudiante(id_usuario),
  PRIMARY KEY(id_docente,id_estudiante), CHECK(id_docente <> id_estudiante)
);
CREATE TABLE auditoria_rol (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor UUID, destinatario UUID NOT NULL,
  rol_anterior TEXT NOT NULL, rol_nuevo TEXT NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sesion_actividad (
  id UUID PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
  id_usuario TEXT NOT NULL REFERENCES usuario(id), ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT now(),
  ambito TEXT NOT NULL DEFAULT 'menu' CHECK(ambito IN ('menu','exam')), cerrada BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE bloqueo_auth (
  id_usuario UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fallos INTEGER NOT NULL DEFAULT 0, ventana TIMESTAMPTZ NOT NULL DEFAULT now(), bloqueado_hasta TIMESTAMPTZ
);
CREATE FUNCTION epoch_ms() RETURNS BIGINT LANGUAGE sql VOLATILE SET search_path = pg_catalog
AS $$ SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint $$;

CREATE FUNCTION alta_auth() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
BEGIN
  -- Metadata is user-controlled: NEVER read role or account state from it.
  INSERT INTO usuario(id,proveedor_auth,uid_auth,auth_user_id,nombre,correo,fecha_nacimiento)
  VALUES(new.id::text,'supabase',new.id::text,new.id,'',new.email,'');
  RETURN new;
END $$;
CREATE TRIGGER apex_alta_auth AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION alta_auth();

CREATE FUNCTION actor() RETURNS usuario LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
DECLARE u usuario; sid UUID; s sesion_actividad; inicio TIMESTAMPTZ;
BEGIN
  SELECT * INTO u FROM usuario WHERE auth_user_id=auth.uid() AND estado='activo';
  IF u.id IS NULL THEN RAISE EXCEPTION 'Inicia sesión; perfil no vinculado o cuenta inactiva.' USING ERRCODE='28000'; END IF;
  sid := (auth.jwt()->>'session_id')::uuid;
  SELECT created_at INTO inicio FROM auth.sessions WHERE id=sid AND user_id=u.auth_user_id;
  IF inicio IS NULL THEN RAISE EXCEPTION 'Sesión revocada. Inicia sesión.' USING ERRCODE='28000'; END IF;
  -- Serializes all operations in the same Auth session, without renewing idle time on reads.
  INSERT INTO sesion_actividad(id,id_usuario,ultima_actividad) VALUES(sid,u.id,inicio) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM sesion_actividad WHERE id=sid FOR UPDATE;
  IF s.cerrada OR now()-s.ultima_actividad >= (CASE WHEN s.ambito='exam' THEN interval '8 minutes' ELSE interval '90 seconds' END) THEN
    RAISE EXCEPTION 'Sesión bloqueada por inactividad. Inicia sesión de nuevo.' USING ERRCODE='28000';
  END IF;
  RETURN u;
END $$;
CREATE FUNCTION tiene_rol(requerido TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
DECLARE u usuario;
BEGIN u:=actor(); RETURN u.rol=requerido; EXCEPTION WHEN invalid_authorization_specification THEN RETURN false; END $$;
CREATE FUNCTION puede_leer_estudiante(estudiante_id TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
DECLARE u usuario;
BEGIN
 u:=actor();
 RETURN u.id=estudiante_id OR u.rol='administrador' OR (u.rol='docente' AND EXISTS(SELECT 1 FROM asignacion_docente WHERE id_docente=u.id AND id_estudiante=estudiante_id));
EXCEPTION WHEN invalid_authorization_specification THEN RETURN false;
END $$;

-- Optional Auth hook: must be enabled in Auth configuration. No plaintext passwords stored.
CREATE FUNCTION password_verification_hook(event JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex_private, pg_catalog AS $$
DECLARE b bloqueo_auth; uid UUID := (event->>'user_id')::uuid;
BEGIN
 INSERT INTO bloqueo_auth(id_usuario) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM bloqueo_auth WHERE id_usuario=uid FOR UPDATE;
 IF b.bloqueado_hasta > now() THEN RETURN jsonb_build_object('decision','reject','message','Espera cuatro minutos desde el bloqueo.','should_logout_user',false); END IF;
 IF (event->>'valid')::boolean THEN
   DELETE FROM bloqueo_auth WHERE id_usuario=uid;
   RETURN '{"decision":"continue"}'::jsonb;
 END IF;
 IF b.ventana < now()-interval '15 minutes' OR b.bloqueado_hasta IS NOT NULL THEN b.fallos:=0; b.ventana:=now(); END IF;
 b.fallos:=b.fallos+1;
 UPDATE bloqueo_auth SET fallos=b.fallos,ventana=b.ventana,bloqueado_hasta=CASE WHEN b.fallos>=5 THEN now()+interval '4 minutes' END WHERE id_usuario=uid;
 IF b.fallos>=5 THEN RETURN '{"decision":"reject","message":"Cinco fallos. Bloqueo de cuatro minutos.","should_logout_user":false}'::jsonb; END IF;
 RETURN '{"decision":"continue"}'::jsonb;
END $$;

ALTER TABLE asignacion_docente ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_rol ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesion_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueo_auth ENABLE ROW LEVEL SECURITY;
CREATE POLICY perfil_propio ON usuario FOR SELECT TO authenticated USING(auth_user_id=auth.uid());
CREATE POLICY estudiantes_autorizados ON estudiante FOR SELECT TO authenticated USING(puede_leer_estudiante(id_usuario));
CREATE POLICY asignaciones_autorizadas ON asignacion_evaluacion FOR SELECT TO authenticated USING(puede_leer_estudiante(id_estudiante));
CREATE POLICY intentos_autorizados ON intento FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM asignacion_evaluacion a WHERE a.id=id_asignacion AND puede_leer_estudiante(a.id_estudiante)));
CREATE POLICY resultados_autorizados ON resultado FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.id=id_intento AND puede_leer_estudiante(a.id_estudiante)));
-- No direct grants to domain tables: APIs return explicit safe projections. RLS remains enabled.
REVOKE ALL ON ALL TABLES IN SCHEMA apex_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA apex_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA apex_private TO authenticated, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION tiene_rol(TEXT),puede_leer_estudiante(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION password_verification_hook(JSONB) TO supabase_auth_admin;
COMMIT;
