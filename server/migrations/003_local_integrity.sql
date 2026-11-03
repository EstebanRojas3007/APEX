-- Protecciones SQLite adicionales a las operaciones autorizadas del servidor.
CREATE TRIGGER IF NOT EXISTS respuesta_insert_guard BEFORE INSERT ON respuesta BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
    JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion
    WHERE i.id=NEW.id_intento AND i.estado='activo' AND it.id=NEW.id_item
    AND (NEW.id_opcion IS NULL OR EXISTS (SELECT 1 FROM opcion_respuesta o WHERE o.id=NEW.id_opcion AND o.id_pregunta=it.id_pregunta))
  ) THEN RAISE(ABORT,'Respuesta incompatible con intento o pregunta') END;
END;
CREATE TRIGGER IF NOT EXISTS respuesta_update_guard BEFORE UPDATE ON respuesta BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
    JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion
    WHERE i.id=NEW.id_intento AND i.estado='activo' AND it.id=NEW.id_item
    AND (NEW.id_opcion IS NULL OR EXISTS (SELECT 1 FROM opcion_respuesta o WHERE o.id=NEW.id_opcion AND o.id_pregunta=it.id_pregunta))
  ) OR EXISTS (SELECT 1 FROM intento WHERE id=OLD.id_intento AND estado='finalizado')
  THEN RAISE(ABORT,'Respuesta incompatible con intento o pregunta') END;
END;
CREATE TRIGGER IF NOT EXISTS respuesta_delete_guard BEFORE DELETE ON respuesta WHEN EXISTS (SELECT 1 FROM intento WHERE id=OLD.id_intento AND estado='finalizado') BEGIN SELECT RAISE(ABORT,'Respuesta histórica inmutable'); END;
CREATE TRIGGER IF NOT EXISTS pregunta_update_guard BEFORE UPDATE ON pregunta WHEN EXISTS (SELECT 1 FROM item_evaluacion it JOIN asignacion_evaluacion a ON a.id_evaluacion=it.id_evaluacion WHERE it.id_pregunta=OLD.id) BEGIN SELECT RAISE(ABORT,'Pregunta asignada inmutable; crear una nueva versión'); END;
CREATE TRIGGER IF NOT EXISTS opcion_update_guard BEFORE UPDATE ON opcion_respuesta WHEN EXISTS (SELECT 1 FROM item_evaluacion it JOIN asignacion_evaluacion a ON a.id_evaluacion=it.id_evaluacion WHERE it.id_pregunta=OLD.id_pregunta) BEGIN SELECT RAISE(ABORT,'Opciones asignadas inmutables'); END;
CREATE TRIGGER IF NOT EXISTS opcion_insert_guard BEFORE INSERT ON opcion_respuesta WHEN EXISTS (SELECT 1 FROM item_evaluacion it JOIN asignacion_evaluacion a ON a.id_evaluacion=it.id_evaluacion WHERE it.id_pregunta=NEW.id_pregunta) BEGIN SELECT RAISE(ABORT,'Opciones asignadas inmutables'); END;
CREATE TRIGGER IF NOT EXISTS opcion_delete_guard BEFORE DELETE ON opcion_respuesta WHEN EXISTS (SELECT 1 FROM item_evaluacion it JOIN asignacion_evaluacion a ON a.id_evaluacion=it.id_evaluacion WHERE it.id_pregunta=OLD.id_pregunta) BEGIN SELECT RAISE(ABORT,'Opciones asignadas inmutables'); END;
CREATE TRIGGER IF NOT EXISTS item_update_guard BEFORE UPDATE ON item_evaluacion WHEN EXISTS (SELECT 1 FROM asignacion_evaluacion WHERE id_evaluacion IN (OLD.id_evaluacion,NEW.id_evaluacion)) BEGIN SELECT RAISE(ABORT,'Instrumento asignado inmutable'); END;
CREATE TRIGGER IF NOT EXISTS item_insert_guard BEFORE INSERT ON item_evaluacion WHEN EXISTS (SELECT 1 FROM asignacion_evaluacion WHERE id_evaluacion=NEW.id_evaluacion) BEGIN SELECT RAISE(ABORT,'Instrumento asignado inmutable'); END;
CREATE TRIGGER IF NOT EXISTS item_delete_guard BEFORE DELETE ON item_evaluacion WHEN EXISTS (SELECT 1 FROM asignacion_evaluacion WHERE id_evaluacion=OLD.id_evaluacion) BEGIN SELECT RAISE(ABORT,'Instrumento asignado inmutable'); END;
