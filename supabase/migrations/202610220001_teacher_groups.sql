-- Local preparation only. No users, groups, academic assignments or remote writes.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;

CREATE TABLE grupo (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), codigo TEXT NOT NULL UNIQUE CHECK(length(trim(codigo)) BETWEEN 1 AND 40),
 nombre TEXT NOT NULL CHECK(length(trim(nombre)) BETWEEN 2 AND 120),
 id_componente TEXT NOT NULL REFERENCES componente(id) CHECK(id_componente='ingles'),
 estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo','inactivo')),
 revision BIGINT NOT NULL DEFAULT 0, creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE grupo_docente (
 id_grupo UUID REFERENCES grupo(id),id_docente TEXT REFERENCES usuario(id),activa BOOLEAN NOT NULL DEFAULT true,
 actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(id_grupo,id_docente)
);
CREATE TABLE grupo_integrante (
 id_grupo UUID REFERENCES grupo(id),id_estudiante TEXT REFERENCES estudiante(id_usuario),activa BOOLEAN NOT NULL DEFAULT true,
 actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(id_grupo,id_estudiante)
);
CREATE INDEX grupo_integrante_estudiante ON grupo_integrante(id_estudiante) WHERE activa;
CREATE INDEX grupo_docente_docente ON grupo_docente(id_docente) WHERE activa;
CREATE TABLE auditoria_grupo (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor UUID,operador TEXT NOT NULL,
 tabla TEXT NOT NULL,operacion TEXT NOT NULL,anterior JSONB,nuevo JSONB,creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE asignacion_docente IS 'Vínculos previos conservados para conciliación explícita. Desde 202610220001 no conceden acceso; grupo_docente + grupo_integrante son la única fuente docente.';
ALTER TABLE auditoria_rol ADD COLUMN origen TEXT NOT NULL DEFAULT 'historico';
ALTER TABLE auditoria_rol ALTER COLUMN origen SET DEFAULT 'rpc';
ALTER TABLE auditoria_rol ADD COLUMN operador_bd TEXT;
CREATE TRIGGER auditoria_rol_inmutable BEFORE UPDATE OR DELETE ON auditoria_rol FOR EACH ROW EXECUTE FUNCTION registro_inmutable();

CREATE FUNCTION validar_vinculo_grupo() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE componente_id TEXT;
BEGIN
 IF TG_OP='UPDATE' AND (new.id_grupo<>old.id_grupo OR
  (to_jsonb(new)-ARRAY['activa','actualizada_en']) IS DISTINCT FROM (to_jsonb(old)-ARRAY['activa','actualizada_en'])) THEN
  RAISE EXCEPTION 'Retira el vínculo anterior y crea el nuevo.';
 END IF;
 -- A real write serializes concurrent entrants AND makes stale repeatable-read
 -- snapshots fail with 40001. A bare row lock + count is insufficient at RR.
 UPDATE grupo SET revision=revision+1 WHERE id=coalesce(new.id_grupo,old.id_grupo) RETURNING id_componente INTO componente_id;
 IF TG_OP='DELETE' THEN RETURN old; END IF;
 new.actualizada_en:=now();
 IF new.activa THEN
  IF TG_TABLE_NAME='grupo_integrante' THEN
   IF NOT EXISTS(SELECT 1 FROM estudiante e JOIN usuario u ON u.id=e.id_usuario
     JOIN programa_componente pc ON pc.id_programa=e.id_programa AND pc.id_componente=componente_id
     WHERE e.id_usuario=new.id_estudiante AND u.rol='estudiante' AND u.estado='activo') THEN
    RAISE EXCEPTION 'Estudiante activo o componente autorizado inválido.';
   END IF;
   IF (SELECT count(*) FROM grupo_integrante WHERE id_grupo=new.id_grupo AND activa AND id_estudiante<>new.id_estudiante)>=20 THEN
    RAISE EXCEPTION 'Máximo 20 integrantes activos por grupo.' USING ERRCODE='23514';
   END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM usuario WHERE id=new.id_docente AND rol='docente' AND estado='activo') THEN
    RAISE EXCEPTION 'Docente activo inválido.';
   END IF;
  END IF;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER validar_grupo_integrante BEFORE INSERT OR UPDATE OR DELETE ON grupo_integrante FOR EACH ROW EXECUTE FUNCTION validar_vinculo_grupo();
CREATE TRIGGER validar_grupo_docente BEFORE INSERT OR UPDATE OR DELETE ON grupo_docente FOR EACH ROW EXECUTE FUNCTION validar_vinculo_grupo();

CREATE FUNCTION auditar_grupo() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
BEGIN
 -- revision is only a concurrency token, not an administrative change.
 IF TG_TABLE_NAME='grupo' AND TG_OP='UPDATE' AND (to_jsonb(new)-'revision')=(to_jsonb(old)-'revision') THEN RETURN new; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(new)-'actualizada_en')=(to_jsonb(old)-'actualizada_en') THEN RETURN new; END IF;
 INSERT INTO auditoria_grupo(actor,operador,tabla,operacion,anterior,nuevo)
 VALUES(auth.uid(),session_user,TG_TABLE_NAME,TG_OP,CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(old) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(new) END);
 RETURN coalesce(new,old);
END $$;
CREATE TRIGGER auditar_grupo AFTER INSERT OR UPDATE OR DELETE ON grupo FOR EACH ROW EXECUTE FUNCTION auditar_grupo();
CREATE TRIGGER auditar_grupo_docente AFTER INSERT OR UPDATE OR DELETE ON grupo_docente FOR EACH ROW EXECUTE FUNCTION auditar_grupo();
CREATE TRIGGER auditar_grupo_integrante AFTER INSERT OR UPDATE OR DELETE ON grupo_integrante FOR EACH ROW EXECUTE FUNCTION auditar_grupo();
CREATE TRIGGER auditoria_grupo_inmutable BEFORE UPDATE OR DELETE ON auditoria_grupo FOR EACH ROW EXECUTE FUNCTION registro_inmutable();

CREATE FUNCTION docente_grupo(uid TEXT,gid UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM grupo g JOIN grupo_docente d ON d.id_grupo=g.id JOIN usuario u ON u.id=d.id_docente
 WHERE g.id=gid AND g.estado='activo' AND d.id_docente=uid AND d.activa AND u.rol='docente' AND u.estado='activo')
$$;
CREATE FUNCTION integrante_grupo(gid UUID,uid TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM grupo_integrante m JOIN grupo g ON g.id=m.id_grupo JOIN usuario u ON u.id=m.id_estudiante
 JOIN estudiante e ON e.id_usuario=u.id JOIN programa_componente pc ON pc.id_programa=e.id_programa AND pc.id_componente=g.id_componente
 WHERE m.id_grupo=gid AND m.id_estudiante=uid AND m.activa AND u.estado='activo' AND u.rol='estudiante')
$$;
CREATE OR REPLACE FUNCTION puede_leer_estudiante(estudiante_id TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;
BEGIN
 u:=actor();
 RETURN u.id=estudiante_id OR u.rol='administrador' OR (u.rol='docente' AND EXISTS(
  SELECT 1 FROM grupo_docente d WHERE d.id_docente=u.id AND docente_grupo(u.id,d.id_grupo) AND integrante_grupo(d.id_grupo,estudiante_id)));
EXCEPTION WHEN invalid_authorization_specification THEN RETURN false;
END $$;

-- The teacher surface returns explicit tracking projections, never question DTOs,
-- route text, private AI payloads, answers, chat messages or whole result.detalle.
CREATE FUNCTION seguimiento_intentos(uid TEXT,component_id TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'assignmentId',a.id,'title',e.titulo,'kind',coalesce(d.tipo,p.tipo,CASE e.tipo WHEN 'cuestionario' THEN 'control' WHEN 'simulacro' THEN 'final' ELSE 'diagnostico' END),
  'level',coalesce(d.nivel,p.nivel),'number',ir.numero,'status',i.estado,'startedAt',i.iniciado_en,'completedAt',i.finalizado_en,
  'correct',r.aciertos,'total',r.total_preguntas,'passed',d.aprobada,'threshold',d.umbral,
  'reviewRequired',coalesce(d.aprobada=false AND (rv.id IS NULL OR rv.completada_en IS NULL),false),
  'reviewStatus',CASE WHEN d.aprobada=false THEN coalesce(rv.estado,'pending') END,'reviewCompletedAt',rv.completada_en,
  'skills',CASE WHEN r.id_intento IS NOT NULL THEN coalesce((SELECT jsonb_agg(jsonb_build_object('label',b->>'label','correct',b->'correct','total',b->'total') ORDER BY b->>'label')
    FROM jsonb_array_elements(coalesce(resultado_json(i.id)->'competencies','[]'::jsonb)) b),'[]'::jsonb) ELSE '[]'::jsonb END
 ) ORDER BY i.iniciado_en,i.id),'[]'::jsonb)
 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN evaluacion e ON e.id=a.id_evaluacion
 LEFT JOIN plantilla_evaluacion p ON p.id=e.id_plantilla LEFT JOIN resultado r ON r.id_intento=i.id
 LEFT JOIN decision_avance d ON d.id_intento=i.id LEFT JOIN intento_ruta ir ON ir.id_intento=i.id LEFT JOIN sesion_refuerzo rv ON rv.id_intento=i.id
 WHERE a.id_estudiante=uid AND NOT asignacion_tecnica(a.id)
 AND EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=e.id AND ec.id_componente=component_id)
 -- A whole mixed-component result cannot be relabeled as this group's result.
 AND NOT EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=e.id AND ec.id_componente<>component_id)
$$;
CREATE FUNCTION seguimiento_estudiante(uid TEXT,component_id TEXT) RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=apex_private,pg_catalog AS $$
DECLARE attempts JSONB;diagnostic JSONB;levels JSONB;assessments JSONB;
BEGIN
 attempts:=seguimiento_intentos(uid,component_id);
 SELECT value INTO diagnostic FROM jsonb_array_elements(attempts) WHERE value->>'kind'='diagnostico' AND value->>'status'='finalizado' ORDER BY (value->>'completedAt')::bigint DESC LIMIT 1;
 SELECT jsonb_agg(jsonb_build_object('level',lvl,'version',r.version,'generationStatus',CASE WHEN r.id IS NOT NULL THEN 'ready' ELSE coalesce(j.estado,'pending') END,
  'completed',(SELECT count(*) FROM seccion_ruta s JOIN progreso_seccion ps ON ps.id_seccion=s.id AND ps.id_estudiante=uid WHERE s.id_ruta=r.id AND ps.completada_en IS NOT NULL),
  'sections',(SELECT jsonb_agg(jsonb_build_object('order',ord,'status',CASE WHEN s.id IS NULL THEN 'pending' WHEN ps.completada_en IS NOT NULL THEN 'completed' WHEN ps.iniciada_en IS NOT NULL THEN 'started' ELSE 'available' END,'completedAt',ps.completada_en) ORDER BY ord)
    FROM generate_series(1,7) ord LEFT JOIN seccion_ruta s ON s.id_ruta=r.id AND s.orden=ord LEFT JOIN progreso_seccion ps ON ps.id_seccion=s.id AND ps.id_estudiante=uid)) ORDER BY lvl)
 INTO levels FROM generate_series(1,3) lvl
 LEFT JOIN LATERAL(SELECT * FROM ruta_nivel_version WHERE id_estudiante=uid AND nivel=lvl ORDER BY version DESC LIMIT 1) r ON component_id='ingles'
 LEFT JOIN LATERAL(SELECT * FROM trabajo_ia WHERE id_estudiante=uid AND tipo='sections' AND nivel=lvl ORDER BY creado_en DESC,id DESC LIMIT 1) j ON component_id='ingles';
 -- Three controls + final are pending when no server evidence exists. These are
 -- expected assessment slots, not fabricated academic assignments or results.
 SELECT jsonb_agg(jsonb_build_object('kind',kind,'level',lvl,'status',coalesce(last_attempt->>'status','pendiente'),
  'passed',last_attempt->'passed','correct',last_attempt->'correct','total',last_attempt->'total',
  'reviewRequired',coalesce((last_attempt->>'reviewRequired')::boolean,false)) ORDER BY ord)
 INTO assessments FROM (VALUES('control',1,1),('control',2,2),('control',3,3),('final',NULL,4)) slots(kind,lvl,ord)
 LEFT JOIN LATERAL(SELECT value last_attempt FROM jsonb_array_elements(attempts) WHERE value->>'kind'=kind AND (value->>'level')::integer IS NOT DISTINCT FROM lvl
  ORDER BY (value->>'startedAt')::bigint DESC,value->>'id' DESC LIMIT 1) latest ON true;
 RETURN (SELECT jsonb_build_object('id',u.id,'name',u.nombre,'program',pa.nombre,'semester',e.semestre,
  'diagnosticStatus',CASE WHEN diagnostic IS NOT NULL THEN 'completado' ELSE 'pendiente' END,'diagnostic',diagnostic,
  'currentLevel',CASE WHEN diagnostic IS NULL THEN NULL ELSE least(3,1+coalesce((SELECT max((x->>'level')::integer) FROM jsonb_array_elements(attempts) x WHERE x->>'kind'='control' AND (x->>'passed')::boolean),0)) END,
  'levels',levels,'assessments',assessments,'attempts',attempts,
  'reviewRequired',EXISTS(SELECT 1 FROM jsonb_array_elements(attempts) x WHERE (x->>'reviewRequired')::boolean),
  'lastSignInAt',(SELECT to_jsonb(au)->>'last_sign_in_at' FROM auth.users au WHERE au.id=u.auth_user_id),
  'lastActivityAt',(SELECT max(sa.ultima_actividad) FROM sesion_actividad sa WHERE sa.id_usuario=uid))
 FROM usuario u JOIN estudiante e ON e.id_usuario=u.id JOIN programa_academico pa ON pa.id=e.id_programa WHERE u.id=uid);
END $$;
CREATE FUNCTION grupo_json(gid UUID) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT jsonb_build_object('id',g.id,'code',g.codigo,'name',g.nombre,'componentId',g.id_componente,'component',c.nombre,'status',g.estado,
 'activeCount',(SELECT count(*) FROM grupo_integrante m WHERE m.id_grupo=g.id AND integrante_grupo(g.id,m.id_estudiante)),
 'membershipCount',(SELECT count(*) FROM grupo_integrante m WHERE m.id_grupo=g.id AND m.activa))
 FROM grupo g JOIN componente c ON c.id=g.id_componente WHERE g.id=gid
$$;

CREATE FUNCTION administrar_grupo(operation TEXT,payload JSONB) RETURNS JSONB LANGUAGE plpgsql SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;gid UUID:=(payload->>'groupId')::uuid;active BOOLEAN:=(payload->>'active')::boolean;
BEGIN
 u:=actor();IF u.rol<>'administrador' THEN RAISE EXCEPTION 'Solo administrador.' USING ERRCODE='42501';END IF;
 IF operation='admin_group_save' THEN
  gid:=coalesce(gid,gen_random_uuid());
  INSERT INTO grupo(id,codigo,nombre,id_componente,estado) VALUES(gid,trim(payload->>'code'),trim(payload->>'name'),payload->>'componentId',coalesce(payload->>'status','activo'))
  ON CONFLICT(id) DO UPDATE SET codigo=excluded.codigo,nombre=excluded.nombre,estado=excluded.estado
  WHERE grupo.id_componente=excluded.id_componente;
  IF NOT FOUND THEN RAISE EXCEPTION 'El componente del grupo es inmutable.';END IF;
 ELSIF operation IN ('admin_group_teacher','admin_group_member') THEN
  IF active IS NULL OR NOT EXISTS(SELECT 1 FROM grupo WHERE id=gid) THEN RAISE EXCEPTION 'Grupo o estado inválido.';END IF;
  IF operation='admin_group_teacher' THEN
   INSERT INTO grupo_docente(id_grupo,id_docente,activa) VALUES(gid,payload->>'teacherId',active)
   ON CONFLICT(id_grupo,id_docente) DO UPDATE SET activa=excluded.activa;
  ELSE
   INSERT INTO grupo_integrante(id_grupo,id_estudiante,activa) VALUES(gid,payload->>'studentId',active)
   ON CONFLICT(id_grupo,id_estudiante) DO UPDATE SET activa=excluded.activa;
  END IF;
 ELSE RAISE EXCEPTION 'Operación administrativa desconocida.';END IF;
 RETURN grupo_json(gid);
END $$;


-- No implicit document privilege for teachers, including former student profiles.
ALTER FUNCTION material_autorizado(TEXT) RENAME TO material_autorizado_pre_docente;
CREATE FUNCTION material_autorizado(fid TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;
BEGIN
 u:=actor();IF u.rol='docente' THEN RETURN false;END IF;
 RETURN material_autorizado_pre_docente(fid);
EXCEPTION WHEN invalid_authorization_specification THEN RETURN false;
END $$;

ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_docente;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;gid UUID;data JSONB;
BEGIN
 u:=actor();
 IF operation LIKE 'admin_group_%' THEN RETURN administrar_grupo(operation,payload);END IF;
 IF operation='assign_teacher' THEN
  IF u.rol<>'administrador' THEN RAISE EXCEPTION 'Solo administrador.' USING ERRCODE='42501';END IF;
  RAISE EXCEPTION 'Usa asignaciones explícitas de grupo: admin_group_teacher y admin_group_member.';
 END IF;
 IF operation LIKE 'teacher_%' THEN
  IF u.rol<>'docente' THEN RAISE EXCEPTION 'Solo docente.' USING ERRCODE='42501';END IF;
  IF operation='teacher_groups' THEN
   RETURN coalesce((SELECT jsonb_agg(grupo_json(g.id) ORDER BY g.codigo,g.id) FROM grupo g WHERE docente_grupo(u.id,g.id)),'[]'::jsonb);
  END IF;
  gid:=(payload->>'groupId')::uuid;
  IF gid IS NULL OR NOT docente_grupo(u.id,gid) THEN RAISE EXCEPTION 'Grupo no asignado.' USING ERRCODE='42501';END IF;
  IF operation='teacher_group' THEN
   RETURN jsonb_build_object('group',grupo_json(gid),'students',coalesce((SELECT jsonb_agg(seguimiento_estudiante(m.id_estudiante,g.id_componente) ORDER BY us.nombre,us.id)
    FROM grupo_integrante m JOIN grupo g ON g.id=m.id_grupo JOIN usuario us ON us.id=m.id_estudiante
    WHERE m.id_grupo=gid AND integrante_grupo(gid,m.id_estudiante)),'[]'::jsonb));
  ELSIF operation='teacher_student' THEN
   IF NOT integrante_grupo(gid,payload->>'studentId') THEN RAISE EXCEPTION 'Estudiante no asignado.' USING ERRCODE='42501';END IF;
   RETURN seguimiento_estudiante(payload->>'studentId',(SELECT id_componente FROM grupo WHERE id=gid));
  ELSE RAISE EXCEPTION 'Operación docente desconocida.';END IF;
 END IF;
 -- Retire broad legacy staff projections for teachers. No group ID means no scope.
 IF u.rol='docente' THEN
  IF operation='me' THEN RETURN jsonb_build_object('profile',perfil_json(u.id),'results','[]'::jsonb,'assignments','[]'::jsonb,'attempt',NULL,'technicalAssessment',NULL);END IF;
  IF operation='students' THEN RETURN '[]'::jsonb;END IF;
  IF operation='student_results' THEN RAISE EXCEPTION 'Estudiante no asignado: selecciona su grupo.' USING ERRCODE='42501';END IF;
  IF operation IN ('set_role') THEN RAISE EXCEPTION 'Solo administrador.' USING ERRCODE='42501';END IF;
  IF operation NOT IN ('me','activity','logout','profile','profile_consent') THEN RAISE EXCEPTION 'Operación no autorizada para docente.' USING ERRCODE='42501';END IF;
 END IF;
 IF operation='set_role' AND u.rol='administrador' THEN
  PERFORM 1 FROM usuario WHERE auth_user_id=(payload->>'userId')::uuid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM usuario WHERE auth_user_id=(payload->>'userId')::uuid AND rol=payload->>'role') THEN RETURN '{"ok":true}'::jsonb;END IF;
 END IF;
 data:=public.apex_api_pre_docente(operation,payload);
 RETURN data;
END $$;

DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['grupo','grupo_docente','grupo_integrante','auditoria_grupo'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION validar_vinculo_grupo(),auditar_grupo(),docente_grupo(TEXT,UUID),integrante_grupo(UUID,TEXT),seguimiento_intentos(TEXT,TEXT),seguimiento_estudiante(TEXT,TEXT),grupo_json(UUID),administrar_grupo(TEXT,JSONB),material_autorizado_pre_docente(TEXT),material_autorizado(TEXT),public.apex_api_pre_docente(TEXT,JSONB),public.apex_api(TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB) TO authenticated;
COMMIT;
