-- Additive MVP v2. No assignments, activation, remote calls or historical rewrites.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
ALTER TABLE plantilla_evaluacion DROP CONSTRAINT plantilla_evaluacion_tipo_check;
ALTER TABLE plantilla_evaluacion DROP CONSTRAINT plantilla_evaluacion_check;
ALTER TABLE plantilla_evaluacion DROP CONSTRAINT plantilla_evaluacion_politica_exposicion_check;
ALTER TABLE plantilla_evaluacion ADD CHECK(tipo IN ('diagnostico','control','final'));
ALTER TABLE plantilla_evaluacion ADD CHECK((tipo='diagnostico' AND cantidad=7 AND nivel IS NULL) OR (tipo='control' AND cantidad=10 AND nivel IS NOT NULL) OR (tipo='final' AND cantidad=25 AND nivel IS NULL));
ALTER TABLE plantilla_evaluacion ADD CHECK(politica_exposicion IN ('solo_no_vistas-v1','no_vistas_lru_bloques-v2'));
CREATE TABLE configuracion_mvp(id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),diagnostico TEXT REFERENCES plantilla_evaluacion(id));
INSERT INTO configuracion_mvp(id) VALUES(true);
CREATE TABLE trabajo_ia (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),id_estudiante TEXT NOT NULL REFERENCES estudiante(id_usuario),
 tipo TEXT NOT NULL CHECK(tipo IN ('sections','chat')),nivel INTEGER CHECK(nivel BETWEEN 1 AND 3),
 clave TEXT NOT NULL UNIQUE,estado TEXT NOT NULL DEFAULT 'pending' CHECK(estado IN ('pending','running','ready','error','unavailable')),
 contexto JSONB, respuesta JSONB,error TEXT,lease UUID,vence_en TIMESTAMPTZ,intentos INTEGER NOT NULL DEFAULT 0,
 creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ruta_nivel_version (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),id_estudiante TEXT NOT NULL REFERENCES estudiante(id_usuario),nivel INTEGER NOT NULL CHECK(nivel BETWEEN 1 AND 3),
 version INTEGER NOT NULL CHECK(version>0),id_anterior UUID REFERENCES ruta_nivel_version(id),id_trabajo UUID NOT NULL UNIQUE REFERENCES trabajo_ia(id),
 motivo TEXT NOT NULL,agente JSONB NOT NULL,creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(id_estudiante,nivel,version)
);
CREATE TABLE seccion_ruta (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),id_ruta UUID NOT NULL REFERENCES ruta_nivel_version(id),orden INTEGER NOT NULL CHECK(orden BETWEEN 1 AND 7),
 titulo TEXT NOT NULL,id_competencia TEXT NOT NULL REFERENCES competencia(id),objetivo TEXT NOT NULL,explicacion TEXT NOT NULL,
 ejemplos JSONB NOT NULL,practica JSONB NOT NULL,referencias JSONB NOT NULL,motivo TEXT NOT NULL,prerrequisitos INTEGER[] NOT NULL,
 UNIQUE(id_ruta,orden)
);
CREATE TABLE progreso_seccion (
 id_estudiante TEXT REFERENCES estudiante(id_usuario),id_seccion UUID REFERENCES seccion_ruta(id),
 iniciada_en TIMESTAMPTZ NOT NULL DEFAULT now(),completada_en TIMESTAMPTZ,
 PRIMARY KEY(id_estudiante,id_seccion)
);
CREATE TABLE sesion_refuerzo (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),id_estudiante TEXT NOT NULL REFERENCES estudiante(id_usuario),
 tipo TEXT NOT NULL CHECK(tipo IN ('section','review')),id_seccion UUID REFERENCES seccion_ruta(id),id_intento TEXT UNIQUE REFERENCES intento(id),
 estado TEXT NOT NULL DEFAULT 'pending' CHECK(estado IN ('pending','running','ready','error','unavailable')),
 completada_en TIMESTAMPTZ,id_nuevo_intento TEXT UNIQUE REFERENCES intento(id),creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((tipo='section' AND id_seccion IS NOT NULL AND id_intento IS NULL AND completada_en IS NULL AND id_nuevo_intento IS NULL) OR (tipo='review' AND id_intento IS NOT NULL AND id_seccion IS NULL)),
 UNIQUE(id_estudiante,id_seccion)
);
CREATE TABLE mensaje_refuerzo (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),id_sesion UUID NOT NULL REFERENCES sesion_refuerzo(id),
 rol TEXT NOT NULL CHECK(rol IN ('user','assistant')),texto TEXT NOT NULL CHECK(length(trim(texto)) BETWEEN 1 AND 12000),
 clave TEXT NOT NULL,id_trabajo UUID REFERENCES trabajo_ia(id),creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(id_sesion,rol,clave)
);
CREATE TABLE intento_ruta (
 id_intento TEXT PRIMARY KEY REFERENCES intento(id),id_convocatoria TEXT NOT NULL REFERENCES convocatoria_banco(id),
 numero INTEGER NOT NULL CHECK(numero>0),id_repaso UUID UNIQUE REFERENCES sesion_refuerzo(id),politica_seleccion TEXT NOT NULL CHECK(politica_seleccion IN ('solo_no_vistas-v1','no_vistas_lru_bloques-v2')),UNIQUE(id_convocatoria,numero)
);
CREATE TABLE decision_avance (
 id_intento TEXT PRIMARY KEY REFERENCES intento(id),tipo TEXT NOT NULL CHECK(tipo IN ('diagnostico','control','final')),nivel INTEGER,
 aciertos INTEGER NOT NULL,total INTEGER NOT NULL,umbral INTEGER,aprobada BOOLEAN,
 regla TEXT NOT NULL DEFAULT 'avance-apex-v2',CHECK((tipo='diagnostico' AND umbral IS NULL AND aprobada IS NULL) OR (tipo<>'diagnostico' AND umbral IS NOT NULL AND aprobada IS NOT NULL))
);
CREATE INDEX trabajo_ia_cola ON trabajo_ia(estado,creado_en);
CREATE INDEX exposicion_lru ON exposicion_pregunta(id_estudiante,id_original,registrada_en DESC);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['configuracion_mvp','trabajo_ia','ruta_nivel_version','seccion_ruta','progreso_seccion','sesion_refuerzo','mensaje_refuerzo','intento_ruta','decision_avance'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['ruta_nivel_version','seccion_ruta','mensaje_refuerzo','intento_ruta','decision_avance'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION registro_inmutable()',t||'_inmutable',t);
 END LOOP;
END $$;
COMMIT;
