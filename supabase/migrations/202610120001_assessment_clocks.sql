-- Additive preparation only. Existing attempts remain untimed; activation is separate.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
LOCK TABLE intento IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE configuracion_reloj (
 id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
 activa BOOLEAN NOT NULL DEFAULT false,
 activada_en TIMESTAMPTZ,
 politica TEXT NOT NULL DEFAULT 'total-apex-v1' CHECK(politica='total-apex-v1')
);
INSERT INTO configuracion_reloj(id) VALUES(true);
CREATE TABLE reloj_intento (
 id_intento TEXT PRIMARY KEY REFERENCES intento(id),
 tipo TEXT NOT NULL CHECK(tipo IN ('diagnostico','control','final','otro')),
 politica TEXT NOT NULL CHECK(politica IN ('diagnostico-sin-limite-v1','anterior-sin-limite-v1','total-apex-v1')),
 iniciado_en BIGINT NOT NULL,
 limite_segundos INTEGER,
 vence_en BIGINT,
 motivo_entrega TEXT CHECK(motivo_entrega IN ('manual','tiempo_agotado')),
 procesado_en BIGINT,
 ultimo_error TEXT,
 fallos INTEGER NOT NULL DEFAULT 0 CHECK(fallos>=0),
 CHECK(
  (politica='diagnostico-sin-limite-v1' AND tipo='diagnostico' AND limite_segundos IS NULL AND vence_en IS NULL)
  OR (politica='anterior-sin-limite-v1' AND limite_segundos IS NULL AND vence_en IS NULL)
  OR (politica='total-apex-v1' AND limite_segundos IS NOT NULL AND vence_en IS NOT NULL AND
      ((tipo='control' AND limite_segundos=900) OR (tipo='final' AND limite_segundos=2250))
      AND vence_en=iniciado_en+limite_segundos::bigint*1000)
 ),
 CHECK((motivo_entrega IS NULL AND procesado_en IS NULL) OR (motivo_entrega IS NOT NULL AND procesado_en IS NOT NULL))
);
CREATE INDEX reloj_vencimientos ON reloj_intento(vence_en,id_intento) WHERE politica='total-apex-v1' AND motivo_entrega IS NULL;
ALTER TABLE configuracion_reloj ENABLE ROW LEVEL SECURITY;
ALTER TABLE reloj_intento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON configuracion_reloj,reloj_intento FROM PUBLIC,anon,authenticated,service_role;

-- Preserve every previous start, selection, answer, attempt status and stored result.
INSERT INTO reloj_intento(id_intento,tipo,politica,iniciado_en)
 SELECT i.id,CASE WHEN coalesce(p.tipo,e.tipo) IN ('diagnostico','control','final') THEN coalesce(p.tipo,e.tipo) ELSE 'otro' END,
 CASE WHEN coalesce(p.tipo,e.tipo)='diagnostico' THEN 'diagnostico-sin-limite-v1' ELSE 'anterior-sin-limite-v1' END,i.iniciado_en
 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion
 JOIN evaluacion e ON e.id=a.id_evaluacion LEFT JOIN plantilla_evaluacion p ON p.id=e.id_plantilla;

CREATE FUNCTION fijar_inicio_intento() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF new.estado='activo' THEN
  -- Capture the actual insertion time, after selection and any preceding lock waits.
  new.iniciado_en:=epoch_ms();new.ultima_actividad:=new.iniciado_en;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER reloj_inicio BEFORE INSERT ON intento FOR EACH ROW EXECUTE FUNCTION fijar_inicio_intento();
CREATE FUNCTION guardar_reloj_intento() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE kind TEXT;policy TEXT;duration INTEGER;
BEGIN
 SELECT coalesce(p.tipo,e.tipo) INTO kind FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion
 LEFT JOIN plantilla_evaluacion p ON p.id=e.id_plantilla WHERE a.id=new.id_asignacion;
 kind:=CASE WHEN kind IN ('diagnostico','control','final') THEN kind ELSE 'otro' END;
 IF kind='diagnostico' THEN policy:='diagnostico-sin-limite-v1';
 ELSIF kind IN ('control','final') AND new.estado='activo' AND (SELECT activa FROM configuracion_reloj WHERE id) THEN
  policy:='total-apex-v1';duration:=CASE kind WHEN 'control' THEN 900 ELSE 2250 END;
 ELSE policy:='anterior-sin-limite-v1';END IF;
 INSERT INTO reloj_intento(id_intento,tipo,politica,iniciado_en,limite_segundos,vence_en)
 VALUES(new.id,kind,policy,new.iniciado_en,duration,CASE WHEN duration IS NOT NULL THEN new.iniciado_en+duration::bigint*1000 END);
 RETURN new;
END $$;
CREATE TRIGGER reloj_snapshot AFTER INSERT ON intento FOR EACH ROW EXECUTE FUNCTION guardar_reloj_intento();
CREATE FUNCTION proteger_reloj_intento() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'La política temporal del intento es inmutable.';END IF;
 IF (to_jsonb(new)-ARRAY['motivo_entrega','procesado_en','ultimo_error','fallos']) IS DISTINCT FROM
    (to_jsonb(old)-ARRAY['motivo_entrega','procesado_en','ultimo_error','fallos'])
    OR old.motivo_entrega IS NOT NULL THEN RAISE EXCEPTION 'No renueves ni modifiques el plazo del intento.';END IF;
 RETURN new;
END $$;
CREATE TRIGGER reloj_inmutable BEFORE UPDATE OR DELETE ON reloj_intento FOR EACH ROW EXECUTE FUNCTION proteger_reloj_intento();

CREATE FUNCTION reloj_intento_json(iid TEXT) RETURNS JSONB LANGUAGE sql VOLATILE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('policy',r.politica,'startedAt',r.iniciado_en,'durationSeconds',r.limite_segundos,
  'expiresAt',r.vence_en,'serverNow',at.ms,'remainingMs',CASE WHEN r.vence_en IS NOT NULL THEN greatest(0,r.vence_en-at.ms) END,
  'expired',r.politica='total-apex-v1' AND r.vence_en<=at.ms,'submissionReason',r.motivo_entrega)
 FROM reloj_intento r CROSS JOIN (SELECT epoch_ms() ms) at WHERE r.id_intento=iid
$$;
ALTER FUNCTION intento_json(TEXT) RENAME TO intento_json_pre_reloj;
CREATE FUNCTION intento_json(iid TEXT) RETURNS JSONB LANGUAGE sql VOLATILE SET search_path=apex_private,pg_catalog AS $$
 SELECT intento_json_pre_reloj(iid)||jsonb_build_object('clock',reloj_intento_json(iid),
  'result',CASE WHEN EXISTS(SELECT 1 FROM intento WHERE id=iid AND estado='finalizado') THEN resultado_json(iid) END)
$$;

-- All grading paths share this lock order: student -> attempt. Scheduler never locks Auth sessions.
-- A future administrative suspension must acquire these same locks and require estado='activo'.
CREATE FUNCTION calificar_intento(iid TEXT,automatic BOOLEAN DEFAULT false) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE it intento;clock reloj_intento;uid TEXT;at BIGINT;total INTEGER;correct INTEGER;reason TEXT;data JSONB;
BEGIN
 SELECT a.id_estudiante INTO uid FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.id=iid;
 PERFORM 1 FROM estudiante WHERE id_usuario=uid FOR UPDATE;
 SELECT * INTO it FROM intento WHERE id=iid FOR UPDATE;
 IF it.id IS NULL THEN RAISE EXCEPTION 'Intento inexistente.';END IF;
 IF it.estado='finalizado' THEN RETURN resultado_json(iid);END IF;
 IF it.estado<>'activo' THEN RETURN NULL;END IF;
 SELECT * INTO clock FROM reloj_intento WHERE id_intento=iid;
 at:=epoch_ms();
 IF automatic AND (clock.politica IS DISTINCT FROM 'total-apex-v1' OR clock.tipo NOT IN ('control','final') OR clock.vence_en>at) THEN RETURN NULL;END IF;
 reason:=CASE WHEN clock.politica='total-apex-v1' AND clock.vence_en<=at THEN 'tiempo_agotado' ELSE 'manual' END;
 SELECT count(*),count(*) FILTER(WHERE o.es_correcta=1) INTO total,correct
 FROM item_evaluacion item JOIN asignacion_evaluacion a ON a.id_evaluacion=item.id_evaluacion
 LEFT JOIN respuesta answer ON answer.id_item=item.id AND answer.id_intento=iid AND (clock.vence_en IS NULL OR answer.guardada_en<clock.vence_en)
 LEFT JOIN opcion_respuesta o ON o.id=answer.id_opcion WHERE a.id=it.id_asignacion;
 INSERT INTO resultado(id_intento,calculado_en,aciertos,total_preguntas,version_regla) VALUES(iid,at,correct,total,'aciertos-v1');
 UPDATE intento SET estado='finalizado',finalizado_en=at WHERE id=iid;
 -- Existing server advancement and linked-review rules; no AI call is needed for grading.
 PERFORM registrar_avance(iid);
 data:=resultado_json(iid)||jsonb_build_object('submissionReason',reason,'timePolicy',clock.politica);
 UPDATE resultado SET detalle=data WHERE id_intento=iid;
 UPDATE reloj_intento SET motivo_entrega=reason,procesado_en=at,ultimo_error=NULL WHERE id_intento=iid;
 RETURN resultado_json(iid);
END $$;

CREATE FUNCTION cerrar_vencidos_estudiante(uid TEXT,maximum INTEGER DEFAULT 100) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE row RECORD;data JSONB;processed INTEGER:=0;failed INTEGER:=0;
BEGIN
 PERFORM 1 FROM estudiante WHERE id_usuario=uid FOR UPDATE;
 FOR row IN SELECT i.id FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN reloj_intento r ON r.id_intento=i.id
  WHERE a.id_estudiante=uid AND i.estado='activo' AND r.politica='total-apex-v1' AND r.tipo IN ('control','final') AND r.vence_en<=epoch_ms()
  ORDER BY r.vence_en,i.id LIMIT maximum FOR UPDATE OF i SKIP LOCKED
 LOOP
  BEGIN
   data:=calificar_intento(row.id,true);
   IF data IS NOT NULL THEN processed:=processed+1;END IF;
  EXCEPTION WHEN OTHERS THEN
   -- A failed grade rolls back atomically; retain a private failure record and retry next run.
   UPDATE reloj_intento SET ultimo_error=left(SQLERRM,500),fallos=fallos+1 WHERE id_intento=row.id;
   failed:=failed+1;
  END;
 END LOOP;
 RETURN jsonb_build_object('processed',processed,'failed',failed);
END $$;
CREATE FUNCTION cerrar_intentos_vencidos(batch_size INTEGER DEFAULT 100) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE row RECORD;report JSONB;processed INTEGER:=0;failed INTEGER:=0;remaining INTEGER:=batch_size;
BEGIN
 IF batch_size NOT BETWEEN 1 AND 1000 OR batch_size IS NULL THEN RAISE EXCEPTION 'Lote inválido: 1 a 1000.';END IF;
 FOR row IN SELECT e.id_usuario FROM estudiante e WHERE EXISTS(
   SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN reloj_intento r ON r.id_intento=i.id
   WHERE a.id_estudiante=e.id_usuario AND i.estado='activo' AND r.politica='total-apex-v1' AND r.tipo IN ('control','final') AND r.vence_en<=epoch_ms())
  ORDER BY e.id_usuario LIMIT batch_size FOR UPDATE OF e SKIP LOCKED
 LOOP
  report:=cerrar_vencidos_estudiante(row.id_usuario,remaining);
  processed:=processed+(report->>'processed')::integer;failed:=failed+(report->>'failed')::integer;
  remaining:=batch_size-processed-failed;EXIT WHEN remaining<=0;
 END LOOP;
 RETURN jsonb_build_object('processed',processed,'failed',failed);
END $$;

CREATE FUNCTION validar_plazo_respuesta() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE iid TEXT;uid TEXT;deadline BIGINT;at BIGINT;
BEGIN
 iid:=CASE WHEN TG_OP='DELETE' THEN old.id_intento ELSE new.id_intento END;
 SELECT a.id_estudiante INTO uid FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.id=iid;
 PERFORM 1 FROM estudiante WHERE id_usuario=uid FOR UPDATE;
 PERFORM 1 FROM intento WHERE id=iid FOR UPDATE;
 -- Evaluate real server time AFTER every lock wait, also on an UPSERT's UPDATE path.
 at:=epoch_ms();SELECT vence_en INTO deadline FROM reloj_intento WHERE id_intento=iid AND politica='total-apex-v1';
 IF deadline IS NOT NULL AND at>=deadline THEN RAISE EXCEPTION 'APEX_ATTEMPT_EXPIRED';END IF;
 IF TG_OP='DELETE' THEN RETURN old;END IF;
 new.guardada_en:=at;RETURN new;
END $$;
CREATE TRIGGER apex_reloj_respuesta BEFORE INSERT OR UPDATE OR DELETE ON respuesta FOR EACH ROW EXECUTE FUNCTION validar_plazo_respuesta();

ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_reloj;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;it intento;clock reloj_intento;data JSONB;expired BOOLEAN:=false;
 iid TEXT:=payload->>'attemptId';sid UUID:=(auth.jwt()->>'session_id')::uuid;was_expired BOOLEAN:=false;
BEGIN
 u:=actor();
 IF u.rol='estudiante' THEN PERFORM 1 FROM estudiante WHERE id_usuario=u.id FOR UPDATE;END IF;
 IF operation IN ('attempt','attempt_clock','answer','finish') THEN
  SELECT i.* INTO it FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE i.id=iid AND a.id_estudiante=u.id FOR UPDATE OF i;
  IF it.id IS NULL THEN RAISE EXCEPTION 'Intento no autorizado.' USING ERRCODE='42501';END IF;
 ELSIF operation='start' THEN
  SELECT i.* INTO it FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion LEFT JOIN intento_ruta ir ON ir.id_intento=i.id
   WHERE a.id_estudiante=u.id AND (i.id_asignacion=payload->>'assignmentId' OR ir.id_convocatoria=payload->>'assignmentId')
   ORDER BY ir.numero DESC NULLS LAST,i.iniciado_en DESC,i.id DESC LIMIT 1 FOR UPDATE OF i;
  IF payload ? 'resumeAttemptId' AND (it.id IS NULL OR it.id IS DISTINCT FROM payload->>'resumeAttemptId') THEN
   RAISE EXCEPTION 'Intento de recuperación no autorizado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO clock FROM reloj_intento WHERE id_intento=it.id;
  was_expired:=it.estado='activo' AND clock.politica='total-apex-v1' AND clock.vence_en<=epoch_ms();
 END IF;
 -- Every student API operation observes due attempts, without renewing the deadline or idle session.
 IF u.rol='estudiante' THEN PERFORM cerrar_vencidos_estudiante(u.id);END IF;
 IF operation IN ('attempt','attempt_clock','answer','finish') THEN
  SELECT * INTO it FROM intento WHERE id=iid FOR UPDATE;
  SELECT * INTO clock FROM reloj_intento WHERE id_intento=iid;
  expired:=clock.politica='total-apex-v1' AND clock.vence_en<=epoch_ms();
  IF operation='attempt' THEN RETURN intento_json(iid);END IF;
  IF operation='attempt_clock' THEN RETURN jsonb_build_object('attemptId',iid,'status',it.estado,'clock',reloj_intento_json(iid),'result',CASE WHEN it.estado='finalizado' THEN resultado_json(iid) END);END IF;
  IF operation='answer' AND expired THEN
   RETURN jsonb_build_object('error',jsonb_build_object('code','ATTEMPT_EXPIRED','message','La respuesta no se guardó: terminó el plazo.'),'result',resultado_json(iid));
  END IF;
  IF operation='finish' THEN
   IF it.estado='finalizado' THEN RETURN resultado_json(iid);END IF;
   IF expired THEN RETURN jsonb_build_object('error',jsonb_build_object('code','ATTEMPT_EXPIRED','message','Tiempo agotado, procesando resultado'),'result',NULL);END IF;
   IF u.rol<>'estudiante' OR it.estado<>'activo' OR (SELECT ambito FROM sesion_actividad WHERE id=sid)<>'exam' OR epoch_ms()-it.ultima_actividad>=480000 THEN
    RAISE EXCEPTION 'Retoma el intento activo antes de continuar.';
   END IF;
   data:=calificar_intento(iid,false);
   UPDATE sesion_actividad SET ultima_actividad=now(),ambito='menu' WHERE id=sid;
   RETURN data;
  END IF;
 ELSIF operation='start' AND (was_expired OR (payload ? 'resumeAttemptId' AND it.estado='finalizado')) THEN
  RETURN intento_json(it.id);
 END IF;
 BEGIN
  data:=public.apex_api_pre_reloj(operation,payload);
 EXCEPTION WHEN raise_exception THEN
  IF operation<>'answer' OR SQLERRM<>'APEX_ATTEMPT_EXPIRED' THEN RAISE;END IF;
  -- Keep the rejected write rolled back, but commit the due grade in the outer RPC transaction.
  PERFORM cerrar_vencidos_estudiante(u.id);
  RETURN jsonb_build_object('error',jsonb_build_object('code','ATTEMPT_EXPIRED','message','La respuesta no se guardó: terminó el plazo.'),'result',resultado_json(iid));
 END;
 IF operation='start' AND data ? 'id' THEN RETURN intento_json(data->>'id');END IF;
 IF operation='me' AND data ? 'assignments' THEN
  data:=jsonb_set(data,'{assignments}',coalesce((
   SELECT jsonb_agg(entry||jsonb_build_object(
    'timePolicy',CASE WHEN entry->>'status'='activo' THEN r.politica
      WHEN entry->>'kind'='diagnostico' THEN 'diagnostico-sin-limite-v1'
      WHEN entry->>'kind' IN ('control','final') AND (SELECT activa FROM configuracion_reloj WHERE id) THEN 'total-apex-v1'
      ELSE 'anterior-sin-limite-v1' END,
    'durationSeconds',CASE WHEN entry->>'status'='activo' THEN r.limite_segundos
      WHEN entry->>'kind' IN ('control','final') AND (SELECT activa FROM configuracion_reloj WHERE id) THEN CASE entry->>'kind' WHEN 'control' THEN 900 ELSE 2250 END END) ORDER BY ordinal)
   FROM jsonb_array_elements(data->'assignments') WITH ORDINALITY items(entry,ordinal)
   LEFT JOIN reloj_intento r ON r.id_intento=entry->>'attemptId'
  ),'[]'::jsonb));
 END IF;
 RETURN data;
END $$;

REVOKE ALL ON FUNCTION fijar_inicio_intento(),guardar_reloj_intento(),proteger_reloj_intento(),reloj_intento_json(TEXT),intento_json_pre_reloj(TEXT),intento_json(TEXT),calificar_intento(TEXT,BOOLEAN),cerrar_vencidos_estudiante(TEXT,INTEGER),cerrar_intentos_vencidos(INTEGER),validar_plazo_respuesta(),public.apex_api_pre_reloj(TEXT,JSONB),public.apex_api(TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB) TO authenticated;
COMMIT;
