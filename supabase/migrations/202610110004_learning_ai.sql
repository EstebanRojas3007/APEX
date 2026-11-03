BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;
CREATE FUNCTION objeto_ia(value JSONB,keys TEXT[]) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_typeof(value)='object' AND value ?& keys AND (value-keys)='{}'::jsonb
$$;
CREATE FUNCTION fuentes_ia(uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('fragmentId',d.id,'sourceId',f.id,'title',f.titulo,'page',d.pagina,'text',d.texto,'sha256',f.sha256,'edition',f.referencia_edicion,'url',f.url_origen) ORDER BY f.id,d.pagina,d.ordinal),'[]'::jsonb)
 FROM fragmento_documental d JOIN fuente f ON f.id=d.id_fuente
 WHERE f.estado='revisado' AND NOT f.contiene_soluciones AND f.contexto_tutor_permitido AND d.revisado AND d.uso_contexto AND d.tipo_contenido='documental'
 AND NOT EXISTS(SELECT 1 FROM pregunta p WHERE p.id_fuente=f.id AND p.pagina_clave=d.pagina)
 AND NOT EXISTS(SELECT 1 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN item_evaluacion it ON it.id_evaluacion=a.id_evaluacion JOIN pregunta p ON p.id=it.id_pregunta WHERE a.id_estudiante=uid AND i.estado='activo' AND p.id_fuente=f.id)
 AND EXISTS(SELECT 1 FROM material_estudio m JOIN material_nucleo mn ON mn.id_material=m.id JOIN nucleo_tematico n ON n.id=mn.id_nucleo JOIN programa_componente pc ON pc.id_componente=n.id_componente JOIN estudiante e ON e.id_programa=pc.id_programa WHERE e.id_usuario=uid AND m.id_fuente=f.id AND m.publicado AND n.id_componente='ingles')
$$;
CREATE FUNCTION solicitar_nivel(uid TEXT,lvl INTEGER) RETURNS UUID LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE jid UUID;
BEGIN
 IF NOT nivel_habilitado(uid,lvl) THEN RAISE EXCEPTION 'Nivel aún bloqueado.'; END IF;
 INSERT INTO trabajo_ia(id_estudiante,tipo,nivel,clave) VALUES(uid,'sections',lvl,'sections:'||uid||':'||lvl||':v1') ON CONFLICT(clave) DO NOTHING;
 SELECT id INTO jid FROM trabajo_ia WHERE clave='sections:'||uid||':'||lvl||':v1';
 RETURN jid;
END $$;
CREATE FUNCTION seccion_json(section_id UUID,uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('id',s.id,'title',s.titulo,'level',r.nivel,'order',s.orden,'skillId',s.id_competencia,'skill',c.nombre,'objective',s.objetivo,'explanation',s.explicacion,'examples',s.ejemplos,'practice',s.practica,'references',s.referencias,'reason',s.motivo,'version',r.version,'generationStatus','ready','origin','original_ai_apex','prerequisites',to_jsonb(s.prerrequisitos),'startedAt',p.iniciada_en,'completedAt',p.completada_en,
 'available',nivel_habilitado(uid,r.nivel) AND NOT EXISTS(SELECT 1 FROM unnest(s.prerrequisitos) ord WHERE NOT EXISTS(SELECT 1 FROM seccion_ruta req JOIN progreso_seccion pr ON pr.id_seccion=req.id AND pr.id_estudiante=uid WHERE req.id_ruta=r.id AND req.orden=ord AND pr.completada_en IS NOT NULL)))
 FROM seccion_ruta s JOIN ruta_nivel_version r ON r.id=s.id_ruta JOIN competencia c ON c.id=s.id_competencia LEFT JOIN progreso_seccion p ON p.id_seccion=s.id AND p.id_estudiante=uid WHERE s.id=section_id AND r.id_estudiante=uid
$$;
CREATE FUNCTION contexto_generacion(uid TEXT,lvl INTEGER) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('contractVersion',2,'kind','sections','level',lvl,'sectionCount',7,
 'diagnosticBySkill',contexto_ruta(uid)->'diagnosticBySkill','assessmentResults',historial_ingles_json(uid),
 'skills',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',nombre) ORDER BY id) FROM competencia WHERE id_componente='ingles'),'[]'::jsonb),
 'progress',coalesce((SELECT jsonb_agg(jsonb_build_object('level',r.nivel,'order',s.orden,'skillId',s.id_competencia,'completedAt',p.completada_en) ORDER BY r.nivel,s.orden) FROM progreso_seccion p JOIN seccion_ruta s ON s.id=p.id_seccion JOIN ruta_nivel_version r ON r.id=s.id_ruta WHERE p.id_estudiante=uid AND p.completada_en IS NOT NULL),'[]'::jsonb),
 'references',fuentes_ia(uid))
$$;
CREATE FUNCTION chat_json(session_id UUID,uid TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('id',s.id,'kind',s.tipo,'sectionId',s.id_seccion,'attemptId',s.id_intento,'status',s.estado,'completedAt',s.completada_en,'retryAttemptId',s.id_nuevo_intento,
 'canComplete',s.tipo='review' AND s.estado='ready' AND s.completada_en IS NULL AND EXISTS(SELECT 1 FROM mensaje_refuerzo WHERE id_sesion=s.id AND rol='user') AND EXISTS(SELECT 1 FROM mensaje_refuerzo m JOIN trabajo_ia j ON j.id=m.id_trabajo WHERE m.id_sesion=s.id AND m.rol='assistant' AND j.estado='ready' AND EXISTS(SELECT 1 FROM jsonb_array_elements(j.contexto->'messages') msg WHERE msg->>'role'='user')),
 'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'role',m.rol,'text',m.texto,'createdAt',m.creado_en) ORDER BY m.creado_en,m.id) FROM mensaje_refuerzo m WHERE m.id_sesion=s.id),'[]'::jsonb))
 FROM sesion_refuerzo s WHERE s.id=session_id AND s.id_estudiante=uid
$$;
CREATE FUNCTION contexto_chat(session_id UUID) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE s sesion_refuerzo;ctx JSONB;
BEGIN
 SELECT * INTO s FROM sesion_refuerzo WHERE id=session_id;
 IF s.tipo='section' THEN
  ctx:=jsonb_build_object('section',seccion_json(s.id_seccion,s.id_estudiante));
 ELSE
  ctx:=jsonb_build_object('attemptId',s.id_intento,'result',resultado_json(s.id_intento),'errors',coalesce((
   SELECT jsonb_agg(jsonb_build_object('question',sel.dto,'selectedOptionId',ans.id_opcion,'omitted',ans.id_opcion IS NULL) ORDER BY sel.orden)
   FROM seleccion_intento sel LEFT JOIN respuesta ans ON ans.id_intento=sel.id_intento AND ans.id_item=sel.id_item LEFT JOIN opcion_respuesta o ON o.id=ans.id_opcion
   WHERE sel.id_intento=s.id_intento AND coalesce(o.es_correcta,0)=0),'[]'::jsonb));
 END IF;
 RETURN jsonb_build_object('contractVersion',2,'kind','chat','contextKind',s.tipo,'context',ctx,'references',fuentes_ia(s.id_estudiante),
  'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('role',rol,'text',texto) ORDER BY creado_en,id) FROM mensaje_refuerzo WHERE id_sesion=s.id),'[]'::jsonb));
END $$;
CREATE FUNCTION validar_referencias_ia(refs JSONB,allowed JSONB,uid TEXT) RETURNS VOID LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE ref JSONB;
BEGIN
 IF jsonb_typeof(refs) IS DISTINCT FROM 'array' OR jsonb_array_length(refs)=0 OR jsonb_array_length(refs)>12 THEN RAISE EXCEPTION 'Referencias educativas requeridas.'; END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(refs) LOOP
  IF NOT coalesce(objeto_ia(ref,ARRAY['fragmentId','sourceId','page']),false) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(allowed) a WHERE a->>'fragmentId'=ref->>'fragmentId' AND a->>'sourceId'=ref->>'sourceId' AND a->'page'=ref->'page')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(fuentes_ia(uid)) a WHERE a->>'fragmentId'=ref->>'fragmentId' AND a->>'sourceId'=ref->>'sourceId' AND a->'page'=ref->'page' AND allowed @> jsonb_build_array(a)) THEN RAISE EXCEPTION 'Referencia no autorizada o desactualizada.'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION validar_secciones_ia(data JSONB,ctx JSONB,uid TEXT) RETURNS VOID LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE s JSONB;e JSONB;ord INTEGER:=0;
BEGIN
 IF NOT coalesce(objeto_ia(data,ARRAY['contractVersion','kind','level','reason','agent','sections']),false) OR data->'contractVersion'<>'2'::jsonb OR data->>'kind' IS DISTINCT FROM 'sections' OR data->'level' IS DISTINCT FROM ctx->'level'
  OR jsonb_typeof(data->'sections') IS DISTINCT FROM 'array' OR jsonb_array_length(data->'sections')<>7 OR jsonb_typeof(data->'reason') IS DISTINCT FROM 'string' OR length(trim(data->>'reason')) NOT BETWEEN 1 AND 2000
  OR NOT coalesce(objeto_ia(data->'agent',ARRAY['provider','model','promptVersion']),false) OR EXISTS(SELECT 1 FROM jsonb_each(data->'agent') a WHERE jsonb_typeof(a.value)<>'string' OR length(trim(a.value#>>'{}')) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'Contrato de generación inválido.'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(data->'sections') LOOP
  ord:=ord+1;
  IF NOT coalesce(objeto_ia(s,ARRAY['title','order','skillId','objective','explanation','examples','practice','references','reason','prerequisites','origin']),false) OR s->'order' IS DISTINCT FROM to_jsonb(ord) OR s->>'origin' IS DISTINCT FROM 'original_ai_apex'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['title','objective','explanation','reason']) k WHERE jsonb_typeof(s->k) IS DISTINCT FROM 'string' OR length(trim(s->>k)) NOT BETWEEN 1 AND 12000)
   OR NOT EXISTS(SELECT 1 FROM competencia WHERE id=s->>'skillId' AND id_componente='ingles') OR jsonb_typeof(s->'prerequisites') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Sección IA inválida.'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'prerequisites') v WHERE jsonb_typeof(v)<>'number' OR v::text !~ '^[1-7]$' OR v::text::integer>=ord) OR (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(s->'prerequisites')) THEN RAISE EXCEPTION 'Prerrequisitos de sección inválidos.'; END IF;
  PERFORM validar_referencias_ia(s->'references',ctx->'references',uid);
  IF jsonb_typeof(s->'examples') IS DISTINCT FROM 'array' OR jsonb_typeof(s->'practice') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'examples') NOT BETWEEN 1 AND 8 OR jsonb_array_length(s->'practice') NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Ejemplos y práctica original requeridos.'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements((s->'examples')||(s->'practice')) LOOP
   IF NOT coalesce(objeto_ia(e,ARRAY['prompt','response','explanation']),false) OR EXISTS(SELECT 1 FROM jsonb_each(e) a WHERE jsonb_typeof(a.value)<>'string' OR length(trim(a.value#>>'{}')) NOT BETWEEN 1 AND 5000)
    OR EXISTS(SELECT 1 FROM pregunta q JOIN carga_banco b ON b.id_fuente=q.id_fuente WHERE lower(trim(q.enunciado))=lower(trim(e->>'prompt')) OR q.id=e->>'prompt') THEN RAISE EXCEPTION 'La práctica debe ser propia y separada de evaluaciones.'; END IF;
  END LOOP;
 END LOOP;
END $$;

CREATE FUNCTION aprender_operacion(operation TEXT,payload JSONB) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;section_data JSONB;s seccion_ruta;rv ruta_nivel_version;chat sesion_refuerzo;jid UUID;key TEXT;existing mensaje_refuerzo;lvl INTEGER;
BEGIN
 u:=actor();
 IF u.rol<>'estudiante' OR NOT u.perfil_completo THEN RAISE EXCEPTION 'Solo estudiante con perfil completo.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM estudiante WHERE id_usuario=u.id FOR UPDATE;
 IF operation='route_retry' THEN
  lvl:=(payload->>'level')::integer;
  IF lvl NOT BETWEEN 1 AND 3 OR lvl IS NULL THEN RAISE EXCEPTION 'Nivel inválido.'; END IF;
  jid:=solicitar_nivel(u.id,lvl);
  UPDATE trabajo_ia SET estado='pending',error=NULL,intentos=0,actualizado_en=now() WHERE id=jid AND estado IN ('error','unavailable');
  RETURN jsonb_build_object('jobId',jid);
 ELSIF operation IN ('section','section_complete') OR (operation='chat_open' AND payload->>'kind'='section') THEN
  SELECT * INTO s FROM seccion_ruta WHERE id=(payload->>'sectionId')::uuid;
  SELECT * INTO rv FROM ruta_nivel_version WHERE id=s.id_ruta AND id_estudiante=u.id;
  section_data:=seccion_json(s.id,u.id);
  IF rv.id IS NULL OR (section_data->>'available')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sección no autorizada o bloqueada.' USING ERRCODE='42501'; END IF;
  INSERT INTO progreso_seccion(id_estudiante,id_seccion) VALUES(u.id,s.id) ON CONFLICT DO NOTHING;
  IF operation='section' THEN RETURN seccion_json(s.id,u.id); END IF;
  IF operation='section_complete' THEN
   UPDATE progreso_seccion SET completada_en=now() WHERE id_estudiante=u.id AND id_seccion=s.id AND completada_en IS NULL;
   IF control_habilitado(u.id,rv.nivel) THEN
    INSERT INTO convocatoria_banco(id_estudiante,id_plantilla) SELECT u.id,id FROM plantilla_evaluacion WHERE id='apex-ingles-control-'||rv.nivel||'-v2' AND habilitada ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING;
   END IF;
   RETURN seccion_json(s.id,u.id);
  END IF;
  INSERT INTO sesion_refuerzo(id_estudiante,tipo,id_seccion) VALUES(u.id,'section',s.id) ON CONFLICT(id_estudiante,id_seccion) DO NOTHING;
  SELECT * INTO chat FROM sesion_refuerzo WHERE id_estudiante=u.id AND id_seccion=s.id;
 ELSIF operation='chat_open' AND payload->>'kind'='review' THEN
  IF NOT EXISTS(SELECT 1 FROM decision_avance d JOIN intento i ON i.id=d.id_intento JOIN asignacion_evaluacion a ON a.id=i.id_asignacion WHERE d.id_intento=payload->>'attemptId' AND a.id_estudiante=u.id AND i.estado='finalizado' AND d.tipo IN ('control','final') AND d.aprobada=false) THEN RAISE EXCEPTION 'Repaso requiere una evaluación propia reprobada.' USING ERRCODE='42501'; END IF;
  INSERT INTO sesion_refuerzo(id_estudiante,tipo,id_intento) VALUES(u.id,'review',payload->>'attemptId') ON CONFLICT(id_intento) DO NOTHING;
  SELECT * INTO chat FROM sesion_refuerzo WHERE id_intento=payload->>'attemptId' AND id_estudiante=u.id;
 ELSE
  SELECT * INTO chat FROM sesion_refuerzo WHERE id=(payload->>'sessionId')::uuid AND id_estudiante=u.id FOR UPDATE;
  IF chat.id IS NULL THEN RAISE EXCEPTION 'Chat no autorizado.' USING ERRCODE='42501'; END IF;
 END IF;
 IF operation='review_complete' THEN
  IF chat.tipo<>'review' OR NOT EXISTS(SELECT 1 FROM decision_avance WHERE id_intento=chat.id_intento AND aprobada=false AND tipo IN ('control','final')) THEN RAISE EXCEPTION 'Repaso no vinculado a una evaluación reprobada.'; END IF;
  IF chat.completada_en IS NULL THEN
   IF (chat_json(chat.id,u.id)->>'canComplete')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'El tutor debe estar disponible y el repaso tener un intercambio completado.'; END IF;
   UPDATE sesion_refuerzo SET completada_en=now() WHERE id=chat.id;
  END IF;
 ELSIF operation IN ('chat_open','chat_send') THEN
  IF operation='chat_send' THEN
   key:=payload->>'key';
   IF jsonb_typeof(payload->'text') IS DISTINCT FROM 'string' OR length(trim(payload->>'text')) NOT BETWEEN 1 AND 2000 OR key IS NULL OR key !~ '^[A-Za-z0-9_-]{8,100}$' THEN RAISE EXCEPTION 'Mensaje o clave inválidos.'; END IF;
   SELECT * INTO existing FROM mensaje_refuerzo WHERE id_sesion=chat.id AND rol='user' AND clave=key;
   IF existing.id IS NOT NULL THEN
    IF existing.texto<>trim(payload->>'text') THEN RAISE EXCEPTION 'Clave de mensaje usada con contenido diferente.'; END IF;
    RETURN chat_json(chat.id,u.id);
   END IF;
   IF chat.completada_en IS NOT NULL OR chat.estado IN ('pending','running') THEN RAISE EXCEPTION 'Espera la respuesta actual antes de enviar otro mensaje.'; END IF;
   INSERT INTO mensaje_refuerzo(id_sesion,rol,texto,clave) VALUES(chat.id,'user',trim(payload->>'text'),key);
  ELSE
   key:='opening';
  END IF;
  IF operation='chat_open' THEN SELECT id INTO jid FROM trabajo_ia WHERE clave LIKE 'chat:'||chat.id||':%' ORDER BY creado_en DESC,id DESC LIMIT 1; END IF;
  IF jid IS NULL THEN
   INSERT INTO trabajo_ia(id_estudiante,tipo,clave) VALUES(u.id,'chat','chat:'||chat.id||':'||key) ON CONFLICT(clave) DO NOTHING;
   SELECT id INTO jid FROM trabajo_ia WHERE clave='chat:'||chat.id||':'||key;
  END IF;
  IF operation='chat_open' AND chat.estado IN ('error','unavailable') THEN UPDATE trabajo_ia SET estado='pending',error=NULL,intentos=0 WHERE id=jid AND estado IN ('error','unavailable'); END IF;
  IF EXISTS(SELECT 1 FROM trabajo_ia WHERE id=jid AND estado='pending') THEN UPDATE sesion_refuerzo SET estado='pending' WHERE id=chat.id; END IF;
 END IF;
 UPDATE sesion_actividad SET ultima_actividad=now(),ambito='menu' WHERE id=(auth.jwt()->>'session_id')::uuid;
 RETURN chat_json(chat.id,u.id);
END $$;

CREATE OR REPLACE FUNCTION public.apex_my_route() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;levels JSONB;
BEGIN
 u:=actor();IF u.rol<>'estudiante' THEN RAISE EXCEPTION 'Solo estudiante.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('level',lvl,'available',nivel_habilitado(u.id,lvl),'status',coalesce(j.estado,'pending'),'error',j.error,'version',coalesce(r.version,0),
  'completed',coalesce((SELECT count(*) FROM seccion_ruta s JOIN progreso_seccion p ON p.id_seccion=s.id AND p.id_estudiante=u.id WHERE s.id_ruta=r.id AND p.completada_en IS NOT NULL),0),
  'controlAvailable',control_habilitado(u.id,lvl),'controlPassed',control_aprobado(u.id,lvl),
  'sections',coalesce((SELECT jsonb_agg(seccion_json(s.id,u.id) ORDER BY s.orden) FROM seccion_ruta s WHERE s.id_ruta=r.id),'[]'::jsonb)) ORDER BY lvl) INTO levels
 FROM generate_series(1,3) lvl LEFT JOIN LATERAL(SELECT * FROM trabajo_ia WHERE id_estudiante=u.id AND tipo='sections' AND nivel=lvl ORDER BY creado_en DESC LIMIT 1) j ON true
 LEFT JOIN LATERAL(SELECT * FROM ruta_nivel_version WHERE id_estudiante=u.id AND nivel=lvl ORDER BY version DESC LIMIT 1) r ON true;
 RETURN jsonb_build_object('status',CASE WHEN EXISTS(SELECT 1 FROM ruta_nivel_version WHERE id_estudiante=u.id) THEN 'ready' ELSE 'pending' END,'message',CASE WHEN EXISTS(SELECT 1 FROM ruta_nivel_version WHERE id_estudiante=u.id) THEN 'Ruta personalizada disponible' ELSE 'generación de ruta pendiente' END,
 'integrationConnected',EXISTS(SELECT 1 FROM trabajo_ia WHERE id_estudiante=u.id AND estado='ready'),'validatedVersion',coalesce((SELECT max(version) FROM ruta_version WHERE id_estudiante=u.id),0),
 'completedLessons',coalesce((SELECT jsonb_agg(id_leccion ORDER BY id_leccion) FROM progreso_leccion WHERE id_estudiante=u.id),'[]'::jsonb),'levels',levels,'finalAvailable',control_aprobado(u.id,3));
END $$;

-- Service-only queue operations. Opaque leases fence late/duplicate workers.
CREATE FUNCTION public.apex_ai_claim() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE j trabajo_ia;ctx JSONB;chat_id UUID;token UUID:=gen_random_uuid();
BEGIN
 UPDATE trabajo_ia SET estado='error',error='Se agotaron las recuperaciones del servicio IA.',actualizado_en=now() WHERE estado='running' AND vence_en<now() AND intentos>=3;
 UPDATE sesion_refuerzo sr SET estado='error' WHERE sr.estado='running' AND EXISTS(SELECT 1 FROM trabajo_ia expired WHERE expired.tipo='chat' AND expired.clave LIKE 'chat:'||sr.id||':%' AND expired.estado='error' AND expired.intentos>=3);
 SELECT * INTO j FROM trabajo_ia WHERE (estado='pending' OR (estado='running' AND vence_en<now())) AND intentos<3 ORDER BY creado_en,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF j.id IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM usuario u JOIN estudiante e ON e.id_usuario=u.id JOIN programa_componente pc ON pc.id_programa=e.id_programa WHERE u.id=j.id_estudiante AND u.estado='activo' AND u.rol='estudiante' AND u.perfil_completo AND pc.id_componente='ingles') THEN
  UPDATE trabajo_ia SET estado='error',error='Estudiante o programa ya no autorizado.' WHERE id=j.id;RETURN NULL;
 END IF;
 IF j.tipo='sections' THEN ctx:=contexto_generacion(j.id_estudiante,j.nivel);
 ELSE
  chat_id:=split_part(j.clave,':',2)::uuid;ctx:=contexto_chat(chat_id);
  UPDATE sesion_refuerzo SET estado='running' WHERE id=chat_id;
 END IF;
 UPDATE trabajo_ia SET estado='running',contexto=ctx,lease=token,vence_en=now()+interval '3 minutes',intentos=intentos+1,actualizado_en=now() WHERE id=j.id;
 RETURN jsonb_build_object('jobId',j.id,'requestId',j.id||':'||md5(ctx::text),'lease',token,'input',ctx);
END $$;
CREATE FUNCTION public.apex_ai_finish(job_id UUID,lease_token UUID,data JSONB DEFAULT NULL,failure TEXT DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE j trabajo_ia;rid UUID;sid UUID;s JSONB;refs JSONB;key TEXT;state TEXT;
BEGIN
 SELECT * INTO j FROM trabajo_ia WHERE id=job_id;
 PERFORM 1 FROM estudiante WHERE id_usuario=j.id_estudiante FOR UPDATE;
 SELECT * INTO j FROM trabajo_ia WHERE id=job_id FOR UPDATE;
 IF j.id IS NULL OR j.lease IS DISTINCT FROM lease_token THEN RAISE EXCEPTION 'Lease IA no autorizado.'; END IF;
 IF j.estado='ready' THEN
  IF j.respuesta IS DISTINCT FROM data THEN RAISE EXCEPTION 'Respuesta diferente para trabajo completado.'; END IF;
  RETURN jsonb_build_object('status','ready');
 END IF;
 IF j.estado<>'running' OR j.vence_en<=now() THEN RAISE EXCEPTION 'Trabajo IA vencido o inactivo.'; END IF;
 IF failure IS NOT NULL THEN
  state:=CASE WHEN failure IN ('AI_NOT_CONFIGURED','NO_AUTHORIZED_REFERENCES','AI_UNAVAILABLE') THEN 'unavailable' ELSE 'error' END;
  UPDATE trabajo_ia SET estado=state,error=CASE failure WHEN 'AI_NOT_CONFIGURED' THEN 'Falta configurar el servicio IA.' WHEN 'NO_AUTHORIZED_REFERENCES' THEN 'Faltan fragmentos educativos revisados y autorizados.' WHEN 'AI_UNAVAILABLE' THEN 'El tutor no está disponible. El repaso sigue bloqueado.' ELSE 'Respuesta IA inválida o error del servicio. Reintenta después.' END,actualizado_en=now() WHERE id=job_id;
  IF j.tipo='chat' THEN UPDATE sesion_refuerzo SET estado=state WHERE id=split_part(j.clave,':',2)::uuid; END IF;
  RETURN jsonb_build_object('status',state);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM usuario WHERE id=j.id_estudiante AND estado='activo' AND rol='estudiante' AND perfil_completo) THEN RAISE EXCEPTION 'Estudiante no autorizado.'; END IF;
 IF j.tipo='sections' THEN
  IF NOT nivel_habilitado(j.id_estudiante,j.nivel) OR j.contexto IS DISTINCT FROM contexto_generacion(j.id_estudiante,j.nivel) THEN RAISE EXCEPTION 'Contexto de generación desactualizado.'; END IF;
  PERFORM validar_secciones_ia(data,j.contexto,j.id_estudiante);
  INSERT INTO ruta_nivel_version(id_estudiante,nivel,version,id_trabajo,motivo,agente) VALUES(j.id_estudiante,j.nivel,1,j.id,data->>'reason',data->'agent') RETURNING id INTO rid;
  FOR s IN SELECT value FROM jsonb_array_elements(data->'sections') LOOP
   SELECT jsonb_agg(a||jsonb_build_object('origin','reference')) INTO refs FROM jsonb_array_elements(j.contexto->'references') a WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(s->'references') r WHERE r->>'fragmentId'=a->>'fragmentId');
   INSERT INTO seccion_ruta(id_ruta,orden,titulo,id_competencia,objetivo,explicacion,ejemplos,practica,referencias,motivo,prerrequisitos) VALUES(rid,(s->>'order')::integer,s->>'title',s->>'skillId',s->>'objective',s->>'explanation',s->'examples',s->'practice',refs,s->>'reason',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(s->'prerequisites')));
  END LOOP;
 ELSE
  IF NOT coalesce(objeto_ia(data,ARRAY['contractVersion','kind','text','references']),false) OR data->'contractVersion'<>'2'::jsonb OR data->>'kind' IS DISTINCT FROM 'chat' OR jsonb_typeof(data->'text') IS DISTINCT FROM 'string' OR length(trim(data->>'text')) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'Contrato de tutor inválido.'; END IF;
  PERFORM validar_referencias_ia(data->'references',j.contexto->'references',j.id_estudiante);
  sid:=split_part(j.clave,':',2)::uuid;key:=split_part(j.clave,':',3);
  -- The model has no operation to grade, complete sections or grant repetitions.
  INSERT INTO mensaje_refuerzo(id_sesion,rol,texto,clave,id_trabajo) VALUES(sid,'assistant',data->>'text',key,j.id);
  UPDATE sesion_refuerzo SET estado='ready' WHERE id=sid;
 END IF;
 UPDATE trabajo_ia SET estado='ready',respuesta=data,error=NULL,actualizado_en=now() WHERE id=j.id;
 RETURN jsonb_build_object('status','ready');
END $$;
CREATE FUNCTION public.apex_transition_diagnostic(student_ids TEXT[]) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;tid TEXT;n INTEGER;
BEGIN
 u:=actor();IF u.rol<>'administrador' THEN RAISE EXCEPTION 'Solo administrador.' USING ERRCODE='42501'; END IF;
 SELECT diagnostico INTO tid FROM configuracion_mvp WHERE id;
 IF tid IS NULL OR NOT EXISTS(SELECT 1 FROM plantilla_evaluacion WHERE id=tid AND habilitada AND tipo='diagnostico') THEN RAISE EXCEPTION 'Transición aún no habilitada.'; END IF;
 IF cardinality(student_ids) IS NULL OR cardinality(student_ids)=0 OR EXISTS(SELECT 1 FROM unnest(student_ids) sid WHERE NOT EXISTS(SELECT 1 FROM usuario us JOIN estudiante e ON e.id_usuario=us.id JOIN programa_componente pc ON pc.id_programa=e.id_programa WHERE us.id=sid AND us.estado='activo' AND us.rol='estudiante' AND us.perfil_completo AND pc.id_componente='ingles')) THEN RAISE EXCEPTION 'Destinatarios inválidos.'; END IF;
 PERFORM 1 FROM estudiante WHERE id_usuario=ANY(student_ids) ORDER BY id_usuario FOR UPDATE;
 INSERT INTO convocatoria_banco(id_estudiante,id_plantilla) SELECT DISTINCT sid,tid FROM unnest(student_ids) sid
 WHERE NOT EXISTS(SELECT 1 FROM asignacion_evaluacion a JOIN evaluacion e ON e.id=a.id_evaluacion JOIN evaluacion_componente ec ON ec.id_evaluacion=e.id WHERE a.id_estudiante=sid AND e.tipo='diagnostico' AND ec.id_componente='ingles')
 AND NOT EXISTS(SELECT 1 FROM convocatoria_banco c JOIN plantilla_evaluacion p ON p.id=c.id_plantilla WHERE c.id_estudiante=sid AND p.tipo='diagnostico') ON CONFLICT(id_estudiante,id_plantilla) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN jsonb_build_object('assigned',n,'requested',cardinality(student_ids));
END $$;
REVOKE ALL ON FUNCTION objeto_ia(JSONB,TEXT[]),fuentes_ia(TEXT),solicitar_nivel(TEXT,INTEGER),seccion_json(UUID,TEXT),contexto_generacion(TEXT,INTEGER),chat_json(UUID,TEXT),contexto_chat(UUID),validar_referencias_ia(JSONB,JSONB,TEXT),validar_secciones_ia(JSONB,JSONB,TEXT),aprender_operacion(TEXT,JSONB),public.apex_ai_claim(),public.apex_ai_finish(UUID,UUID,JSONB,TEXT),public.apex_transition_diagnostic(TEXT[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_ai_claim(),public.apex_ai_finish(UUID,UUID,JSONB,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.apex_transition_diagnostic(TEXT[]) TO authenticated;
ALTER FUNCTION public.apex_assign_english(TEXT[]) RENAME TO apex_assign_english_pre_mvp;
CREATE FUNCTION public.apex_assign_english(program_ids TEXT[]) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
BEGIN
 PERFORM actor();
 IF EXISTS(SELECT 1 FROM configuracion_mvp WHERE diagnostico IS NOT NULL) THEN RAISE EXCEPTION 'El diagnóstico vigente usa el banco APEX. Usa la transición explícita de estudiantes; ICFES 2018 queda en el historial.'; END IF;
 RETURN public.apex_assign_english_pre_mvp(program_ids);
END $$;
REVOKE ALL ON FUNCTION public.apex_assign_english_pre_mvp(TEXT[]),public.apex_assign_english(TEXT[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_assign_english(TEXT[]) TO authenticated;
COMMIT;
