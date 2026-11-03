-- Preparación PostgreSQL 15+/Supabase. No aplicada ni conectada.
-- Esquema privado: no exponer claves ni habilitar acceso cliente antes de implementar operaciones autorizadas.
BEGIN;
CREATE SCHEMA IF NOT EXISTS apex_private;
REVOKE ALL ON SCHEMA apex_private FROM PUBLIC, anon, authenticated;
SET LOCAL search_path TO apex_private, pg_catalog;
-- Subconjunto de la propuesta relacional. Identificadores y fechas civiles TEXT;
-- instantes UTC como epoch milisegundos BIGINT. SQL común a SQLite y PostgreSQL.
CREATE TABLE IF NOT EXISTS programa_academico (id TEXT PRIMARY KEY, nombre TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS componente (id TEXT PRIMARY KEY, nombre TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS programa_componente (id_programa TEXT REFERENCES programa_academico(id), id_componente TEXT REFERENCES componente(id), PRIMARY KEY(id_programa,id_componente));
CREATE TABLE IF NOT EXISTS competencia (id TEXT PRIMARY KEY, id_componente TEXT NOT NULL REFERENCES componente(id), nombre TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS nucleo_tematico (id TEXT PRIMARY KEY, id_componente TEXT NOT NULL REFERENCES componente(id), nombre TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usuario (id TEXT PRIMARY KEY, proveedor_auth TEXT NOT NULL, uid_auth TEXT NOT NULL, nombre TEXT NOT NULL, correo TEXT NOT NULL UNIQUE, fecha_nacimiento TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo','inactivo')), UNIQUE(proveedor_auth,uid_auth));
CREATE TABLE IF NOT EXISTS estudiante (id_usuario TEXT PRIMARY KEY REFERENCES usuario(id), id_programa TEXT NOT NULL REFERENCES programa_academico(id), semestre INTEGER NOT NULL CHECK(semestre >= 1));
CREATE TABLE IF NOT EXISTS consentimiento (id TEXT PRIMARY KEY, id_usuario TEXT NOT NULL REFERENCES usuario(id), finalidad TEXT NOT NULL, version_aviso TEXT NOT NULL, otorgado_en BIGINT NOT NULL, revocado_en BIGINT);
CREATE TABLE IF NOT EXISTS fuente (id TEXT PRIMARY KEY, titulo TEXT NOT NULL, organismo TEXT NOT NULL, referencia_edicion TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS material_estudio (id TEXT PRIMARY KEY, id_fuente TEXT NOT NULL REFERENCES fuente(id), titulo TEXT NOT NULL, contenido TEXT NOT NULL, version INTEGER NOT NULL CHECK(version >= 1));
CREATE TABLE IF NOT EXISTS material_nucleo (id_material TEXT REFERENCES material_estudio(id), id_nucleo TEXT REFERENCES nucleo_tematico(id), PRIMARY KEY(id_material,id_nucleo));
CREATE TABLE IF NOT EXISTS pregunta (id TEXT PRIMARY KEY, id_fuente TEXT NOT NULL REFERENCES fuente(id), id_nucleo TEXT NOT NULL REFERENCES nucleo_tematico(id), id_competencia TEXT NOT NULL REFERENCES competencia(id), enunciado TEXT NOT NULL, version INTEGER NOT NULL CHECK(version >= 1));
CREATE TABLE IF NOT EXISTS opcion_respuesta (id TEXT PRIMARY KEY, id_pregunta TEXT NOT NULL REFERENCES pregunta(id), texto TEXT NOT NULL, orden INTEGER NOT NULL CHECK(orden > 0), es_correcta INTEGER NOT NULL CHECK(es_correcta IN (0,1)), UNIQUE(id_pregunta,orden));
CREATE TABLE IF NOT EXISTS evaluacion (id TEXT PRIMARY KEY, titulo TEXT NOT NULL, version INTEGER NOT NULL CHECK(version >= 1));
CREATE TABLE IF NOT EXISTS evaluacion_componente (id_evaluacion TEXT REFERENCES evaluacion(id), id_componente TEXT REFERENCES componente(id), PRIMARY KEY(id_evaluacion,id_componente));
CREATE TABLE IF NOT EXISTS item_evaluacion (id TEXT PRIMARY KEY, id_evaluacion TEXT NOT NULL REFERENCES evaluacion(id), id_pregunta TEXT NOT NULL REFERENCES pregunta(id), orden INTEGER NOT NULL CHECK(orden > 0), UNIQUE(id_evaluacion,orden), UNIQUE(id_evaluacion,id_pregunta));
CREATE TABLE IF NOT EXISTS asignacion_evaluacion (id TEXT PRIMARY KEY, id_estudiante TEXT NOT NULL REFERENCES estudiante(id_usuario), id_evaluacion TEXT NOT NULL REFERENCES evaluacion(id), UNIQUE(id_estudiante,id_evaluacion));
CREATE TABLE IF NOT EXISTS intento (id TEXT PRIMARY KEY, id_asignacion TEXT NOT NULL UNIQUE REFERENCES asignacion_evaluacion(id), estado TEXT NOT NULL CHECK(estado IN ('activo','finalizado')), iniciado_en BIGINT NOT NULL, ultima_actividad BIGINT NOT NULL, finalizado_en BIGINT);
CREATE TABLE IF NOT EXISTS respuesta (id_intento TEXT REFERENCES intento(id), id_item TEXT REFERENCES item_evaluacion(id), id_opcion TEXT REFERENCES opcion_respuesta(id), guardada_en BIGINT NOT NULL, PRIMARY KEY(id_intento,id_item));
CREATE TABLE IF NOT EXISTS resultado (id_intento TEXT PRIMARY KEY REFERENCES intento(id), calculado_en BIGINT NOT NULL, aciertos INTEGER NOT NULL, total_preguntas INTEGER NOT NULL CHECK(total_preguntas > 0), version_regla TEXT NOT NULL, CHECK(aciertos >= 0 AND aciertos <= total_preguntas));
CREATE OR REPLACE VIEW v_historial_academico WITH (security_invoker = true) AS SELECT a.id_estudiante, r.*, 100.0*r.aciertos/r.total_preguntas AS porcentaje FROM resultado r JOIN intento i ON i.id=r.id_intento JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.estado='finalizado';
CREATE OR REPLACE VIEW v_progreso_nucleo WITH (security_invoker = true) AS SELECT a.id_estudiante, r.id_intento, p.id_nucleo AS categoria, n.nombre AS etiqueta, COUNT(*) AS total, SUM(CASE WHEN o.es_correcta=1 THEN 1 ELSE 0 END) AS aciertos FROM resultado r JOIN intento i ON i.id=r.id_intento JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion JOIN pregunta p ON p.id=it.id_pregunta JOIN nucleo_tematico n ON n.id=p.id_nucleo LEFT JOIN respuesta res ON res.id_intento=i.id AND res.id_item=it.id LEFT JOIN opcion_respuesta o ON o.id=res.id_opcion WHERE i.estado='finalizado' GROUP BY a.id_estudiante,r.id_intento,p.id_nucleo,n.nombre;
CREATE OR REPLACE VIEW v_progreso_competencia WITH (security_invoker = true) AS SELECT a.id_estudiante, r.id_intento, p.id_competencia AS categoria, c.nombre AS etiqueta, COUNT(*) AS total, SUM(CASE WHEN o.es_correcta=1 THEN 1 ELSE 0 END) AS aciertos FROM resultado r JOIN intento i ON i.id=r.id_intento JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion JOIN pregunta p ON p.id=it.id_pregunta JOIN competencia c ON c.id=p.id_competencia LEFT JOIN respuesta res ON res.id_intento=i.id AND res.id_item=it.id LEFT JOIN opcion_respuesta o ON o.id=res.id_opcion WHERE i.estado='finalizado' GROUP BY a.id_estudiante,r.id_intento,p.id_competencia,c.nombre;

ALTER TABLE programa_academico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE programa_academico FROM PUBLIC, anon, authenticated;

ALTER TABLE componente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE componente FROM PUBLIC, anon, authenticated;

ALTER TABLE programa_componente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE programa_componente FROM PUBLIC, anon, authenticated;

ALTER TABLE competencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE competencia FROM PUBLIC, anon, authenticated;

ALTER TABLE nucleo_tematico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE nucleo_tematico FROM PUBLIC, anon, authenticated;

ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE usuario FROM PUBLIC, anon, authenticated;

ALTER TABLE estudiante ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE estudiante FROM PUBLIC, anon, authenticated;

ALTER TABLE consentimiento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE consentimiento FROM PUBLIC, anon, authenticated;

ALTER TABLE fuente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fuente FROM PUBLIC, anon, authenticated;

ALTER TABLE material_estudio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE material_estudio FROM PUBLIC, anon, authenticated;

ALTER TABLE material_nucleo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE material_nucleo FROM PUBLIC, anon, authenticated;

ALTER TABLE pregunta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pregunta FROM PUBLIC, anon, authenticated;

ALTER TABLE opcion_respuesta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE opcion_respuesta FROM PUBLIC, anon, authenticated;

ALTER TABLE evaluacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE evaluacion FROM PUBLIC, anon, authenticated;

ALTER TABLE evaluacion_componente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE evaluacion_componente FROM PUBLIC, anon, authenticated;

ALTER TABLE item_evaluacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE item_evaluacion FROM PUBLIC, anon, authenticated;

ALTER TABLE asignacion_evaluacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE asignacion_evaluacion FROM PUBLIC, anon, authenticated;

ALTER TABLE intento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE intento FROM PUBLIC, anon, authenticated;

ALTER TABLE respuesta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE respuesta FROM PUBLIC, anon, authenticated;

ALTER TABLE resultado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE resultado FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE v_historial_academico FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE v_progreso_nucleo FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE v_progreso_competencia FROM PUBLIC, anon, authenticated;

COMMIT;
