-- Read-only teacher summary and focused corrections to tracking projections.
-- No historical writes, activation, new tables, identities or academic changes.
BEGIN;
SET LOCAL search_path TO apex_private,pg_catalog;

CREATE OR REPLACE FUNCTION seguimiento_intentos(uid TEXT,component_id TEXT) RETURNS JSONB LANGUAGE sql STABLE SET search_path=apex_private,pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'assignmentId',a.id,'chainId',coalesce(ir.id_convocatoria,a.id),'title',e.titulo,
  'kind',coalesce(d.tipo,p.tipo,CASE e.tipo WHEN 'cuestionario' THEN 'control' WHEN 'simulacro' THEN 'final' ELSE 'diagnostico' END),
  'level',coalesce(d.nivel,p.nivel),'number',ir.numero,'status',i.estado,'startedAt',i.iniciado_en,'completedAt',i.finalizado_en,
  'resultAvailable',r.id_intento IS NOT NULL,'correct',r.aciertos,'total',r.total_preguntas,'passed',d.aprobada,'threshold',d.umbral,
  'reviewRequired',coalesce(i.estado='finalizado' AND d.aprobada=false AND (rv.id IS NULL OR (rv.completada_en IS NULL AND rv.id_nuevo_intento IS NULL)),false),
  'reviewStatus',CASE WHEN d.aprobada=false THEN coalesce(rv.estado,'pending') END,'reviewCompletedAt',rv.completada_en,
  'skills',CASE WHEN r.id_intento IS NOT NULL THEN coalesce((SELECT jsonb_agg(jsonb_build_object('label',b->>'label','correct',b->'correct','total',b->'total') ORDER BY b->>'label')
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(resultado_json(i.id)->'competencies')='array' THEN resultado_json(i.id)->'competencies' ELSE '[]'::jsonb END) b),'[]'::jsonb) ELSE '[]'::jsonb END
 ) ORDER BY i.iniciado_en,i.id),'[]'::jsonb)
 FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN evaluacion e ON e.id=a.id_evaluacion
 LEFT JOIN plantilla_evaluacion p ON p.id=e.id_plantilla LEFT JOIN resultado r ON r.id_intento=i.id
 LEFT JOIN decision_avance d ON d.id_intento=i.id LEFT JOIN intento_ruta ir ON ir.id_intento=i.id
 LEFT JOIN sesion_refuerzo rv ON rv.id_intento=i.id AND rv.tipo='review' AND rv.id_estudiante=uid
 WHERE a.id_estudiante=uid AND NOT asignacion_tecnica(a.id)
 AND EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=e.id AND ec.id_componente=component_id)
 AND NOT EXISTS(SELECT 1 FROM evaluacion_componente ec WHERE ec.id_evaluacion=e.id AND ec.id_componente<>component_id)
$$;

CREATE OR REPLACE FUNCTION seguimiento_estudiante(uid TEXT,component_id TEXT) RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=apex_private,pg_catalog AS $$
DECLARE attempts JSONB;diagnostic JSONB;levels JSONB;assessments JSONB;current_level INTEGER;stage TEXT;
BEGIN
 attempts:=seguimiento_intentos(uid,component_id);
 SELECT value INTO diagnostic FROM jsonb_array_elements(attempts)
 WHERE value->>'kind'='diagnostico' AND value->>'status'='finalizado' AND (value->>'resultAvailable')::boolean
 ORDER BY (value->>'completedAt')::bigint DESC NULLS LAST,value->>'id' DESC LIMIT 1;
 -- Same advancement evidence as nivel_habilitado/control_aprobado, scoped to
 -- authorized English instruments. Scores and completed sections never set stage.
 current_level:=CASE WHEN diagnostic IS NULL THEN NULL ELSE least(3,1+coalesce((SELECT max((x->>'level')::integer)
  FROM jsonb_array_elements(attempts) x WHERE x->>'kind'='control' AND x->>'status'='finalizado' AND (x->>'passed')::boolean),0)) END;
 stage:=CASE WHEN diagnostic IS NULL THEN 'diagnostic_pending'
  WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(attempts) x WHERE x->>'kind'='final' AND x->>'status'='finalizado' AND (x->>'passed')::boolean) THEN 'final_passed'
  ELSE 'level_'||current_level END;
 SELECT jsonb_agg(jsonb_build_object('level',lvl,'version',r.version,'generationStatus',CASE WHEN r.id IS NOT NULL THEN 'ready' ELSE coalesce(j.estado,'pending') END,
  'completed',(SELECT count(*) FROM seccion_ruta s JOIN progreso_seccion ps ON ps.id_seccion=s.id AND ps.id_estudiante=uid WHERE s.id_ruta=r.id AND ps.completada_en IS NOT NULL),
  'sections',(SELECT jsonb_agg(jsonb_build_object('order',ord,'status',CASE WHEN s.id IS NULL THEN 'pending' WHEN ps.completada_en IS NOT NULL THEN 'completed' WHEN ps.iniciada_en IS NOT NULL THEN 'started' ELSE 'available' END,'completedAt',ps.completada_en) ORDER BY ord)
    FROM generate_series(1,7) ord LEFT JOIN seccion_ruta s ON s.id_ruta=r.id AND s.orden=ord LEFT JOIN progreso_seccion ps ON ps.id_seccion=s.id AND ps.id_estudiante=uid)) ORDER BY lvl)
 INTO levels FROM generate_series(1,3) lvl
 LEFT JOIN LATERAL(SELECT * FROM ruta_nivel_version WHERE id_estudiante=uid AND nivel=lvl ORDER BY version DESC LIMIT 1) r ON component_id='ingles'
 LEFT JOIN LATERAL(SELECT * FROM trabajo_ia WHERE id_estudiante=uid AND tipo='sections' AND nivel=lvl ORDER BY creado_en DESC,id DESC LIMIT 1) j ON component_id='ingles';
 SELECT jsonb_agg(jsonb_build_object('kind',kind,'level',lvl,'status',coalesce(last_attempt->>'status','pendiente'),
  'passed',last_attempt->'passed','correct',last_attempt->'correct','total',last_attempt->'total',
  'activeRetry',last_attempt IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(attempts) x WHERE x->>'kind'=kind
    AND (x->>'level')::integer IS NOT DISTINCT FROM lvl AND x->>'status'='activo'),
  'reviewRequired',review_required) ORDER BY ord)
 INTO assessments FROM (VALUES('control',1,1),('control',2,2),('control',3,3),('final',NULL,4)) slots(kind,lvl,ord)
 LEFT JOIN LATERAL(SELECT value last_attempt FROM jsonb_array_elements(attempts)
  WHERE value->>'kind'=kind AND (value->>'level')::integer IS NOT DISTINCT FROM lvl AND value->>'status'='finalizado' AND (value->>'resultAvailable')::boolean
  ORDER BY (value->>'completedAt')::bigint DESC NULLS LAST,value->>'id' DESC LIMIT 1) latest ON true
 LEFT JOIN LATERAL(SELECT EXISTS(SELECT 1 FROM (
  SELECT DISTINCT ON (x->>'chainId') x FROM jsonb_array_elements(attempts) x
  WHERE x->>'kind'=kind AND (x->>'level')::integer IS NOT DISTINCT FROM lvl
  ORDER BY x->>'chainId',(x->>'number')::integer DESC NULLS LAST,(x->>'startedAt')::bigint DESC,x->>'id' DESC
 ) current_chain WHERE (x->>'reviewRequired')::boolean) review_required) ongoing ON true;
 RETURN (SELECT jsonb_build_object('id',u.id,'name',u.nombre,'program',pa.nombre,'semester',e.semestre,
  'diagnosticStatus',CASE WHEN diagnostic IS NOT NULL THEN 'completado' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(attempts) x WHERE x->>'kind'='diagnostico' AND x->>'status'='activo') THEN 'en progreso' ELSE 'pendiente' END,
  'diagnostic',diagnostic,'currentLevel',current_level,'journeyStage',stage,'levels',levels,'assessments',assessments,'attempts',attempts,
  'reviewRequired',EXISTS(SELECT 1 FROM (SELECT DISTINCT ON (x->>'chainId') x FROM jsonb_array_elements(attempts) x
    ORDER BY x->>'chainId',(x->>'number')::integer DESC NULLS LAST,(x->>'startedAt')::bigint DESC,x->>'id' DESC) current_chain WHERE (x->>'reviewRequired')::boolean),
  'lastSignInAt',(SELECT to_jsonb(au)->>'last_sign_in_at' FROM auth.users au WHERE au.id=u.auth_user_id),
  'lastActivityAt',(SELECT max(sa.ultima_actividad) FROM sesion_actividad sa WHERE sa.id_usuario=uid))
 FROM usuario u JOIN estudiante e ON e.id_usuario=u.id JOIN programa_academico pa ON pa.id=e.id_programa WHERE u.id=uid);
END $$;

-- Historical result snapshots have labels, not stable skill IDs. Accept only
-- immutable approved-bank selections whose reconstructed counts agree exactly
-- with the grader's stored breakdown and totals. Never expose questions/answers.
CREATE FUNCTION evidencia_habilidades_docente(iid TEXT) RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=apex_private,pg_catalog AS $$
DECLARE r resultado;pl plantilla_evaluacion;breakdown JSONB;clock reloj_intento;
BEGIN
 SELECT * INTO r FROM resultado WHERE id_intento=iid;
 SELECT t.* INTO pl FROM intento i JOIN asignacion_evaluacion a ON a.id=i.id_asignacion JOIN evaluacion e ON e.id=a.id_evaluacion JOIN plantilla_evaluacion t ON t.id=e.id_plantilla WHERE i.id=iid AND i.estado='finalizado';
 IF r.id_intento IS NULL OR r.version_regla<>'aciertos-v1' OR pl.id IS NULL OR NOT EXISTS(SELECT 1 FROM carga_banco WHERE id_fuente=pl.id_fuente)
  OR jsonb_typeof(r.detalle->'competencies') IS DISTINCT FROM 'array' THEN RETURN NULL;END IF;
 SELECT * INTO clock FROM reloj_intento WHERE id_intento=iid;
 IF (SELECT count(*) FROM seleccion_intento WHERE id_intento=iid)<>r.total_preguntas OR EXISTS(
  SELECT 1 FROM seleccion_intento s JOIN pregunta p ON p.id=s.id_pregunta JOIN competencia c ON c.id=p.id_competencia
  WHERE s.id_intento=iid AND (p.version<>s.version_pregunta OR p.id_fuente<>pl.id_fuente OR c.id_componente<>'ingles')) THEN RETURN NULL;END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'correct',correct,'total',total) ORDER BY id) INTO breakdown FROM (
  SELECT c.id,c.nombre label,count(*) total,count(*) FILTER(WHERE o.es_correcta=1) correct
  FROM seleccion_intento s JOIN pregunta p ON p.id=s.id_pregunta JOIN competencia c ON c.id=p.id_competencia
  LEFT JOIN respuesta a ON a.id_intento=iid AND a.id_item=s.id_item AND (clock.vence_en IS NULL OR a.guardada_en<clock.vence_en)
  LEFT JOIN opcion_respuesta o ON o.id=a.id_opcion WHERE s.id_intento=iid GROUP BY c.id,c.nombre
 ) b;
 IF (SELECT sum((b->>'total')::integer) FROM jsonb_array_elements(breakdown) b)<>r.total_preguntas
  OR (SELECT sum((b->>'correct')::integer) FROM jsonb_array_elements(breakdown) b)<>r.aciertos
  OR (SELECT count(DISTINCT b->>'label') FROM jsonb_array_elements(breakdown) b)<>jsonb_array_length(breakdown)
  OR (SELECT jsonb_agg(jsonb_build_object('label',b->>'label','correct',b->'correct','total',b->'total') ORDER BY b->>'label') FROM jsonb_array_elements(breakdown) b)
    IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('label',b->>'label','correct',b->'correct','total',b->'total') ORDER BY b->>'label') FROM jsonb_array_elements(r.detalle->'competencies') b)
 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('key',jsonb_build_array(r.version_regla,pl.id_fuente,pl.id,pl.version,coalesce(clock.politica,'legacy-unclocked'))::text,
  'label',pl.titulo||' · versión '||pl.version||' · '||CASE WHEN clock.politica='total-apex-v1' THEN 'con límite de tiempo' ELSE 'sin límite de tiempo' END,'skills',breakdown);
END $$;

CREATE FUNCTION resumen_grupo_docente(gid UUID) RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=apex_private,pg_catalog AS $$
DECLARE u usuario;students JSONB;data JSONB;
BEGIN
 u:=actor();
 IF u.rol<>'docente' OR gid IS NULL OR NOT docente_grupo(u.id,gid) THEN RAISE EXCEPTION 'Grupo no asignado.' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(seguimiento_estudiante(m.id_estudiante,g.id_componente) ORDER BY m.id_estudiante),'[]'::jsonb) INTO students
 FROM grupo_integrante m JOIN grupo g ON g.id=m.id_grupo WHERE m.id_grupo=gid AND integrante_grupo(gid,m.id_estudiante);
 WITH population AS (SELECT value s FROM jsonb_array_elements(students)),
 slots(key,kind,lvl,ord) AS (VALUES('diagnostic','diagnostico',NULL::integer,0),('control_1','control',1,1),('control_2','control',2,2),('control_3','control',3,3),('final','final',NULL,4)),
 attempts AS MATERIALIZED (SELECT s->>'id' uid,a FROM population CROSS JOIN LATERAL jsonb_array_elements(s->'attempts') a),
 finished AS MATERIALIZED (SELECT uid,a FROM attempts WHERE a->>'status'='finalizado' AND (a->>'resultAvailable')::boolean),
 evidence AS MATERIALIZED (SELECT uid,a,evidencia_habilidades_docente(a->>'id') e FROM finished),
 compatible AS (SELECT DISTINCT ON (uid,key) uid,key,a,e FROM evidence JOIN slots ON a->>'kind'=kind AND (a->>'level')::integer IS NOT DISTINCT FROM lvl
  WHERE e IS NOT NULL ORDER BY uid,key,(a->>'completedAt')::bigint DESC NULLS LAST,a->>'id' DESC),
 cohorts AS (SELECT key,e->>'key' compatibility,e->>'label' label,count(*) student_count FROM compatible GROUP BY key,e->>'key',e->>'label'),
 skill_groups AS (SELECT key,compatibility,label,student_count,
  (SELECT jsonb_agg(row ORDER BY row->>'id') FROM (SELECT jsonb_build_object('id',b->>'id','label',min(b->>'label'),
   'correct',sum((b->>'correct')::integer),'total',sum((b->>'total')::integer),'students',count(DISTINCT c.uid)) row
   FROM compatible c CROSS JOIN LATERAL jsonb_array_elements(c.e->'skills') b WHERE c.key=outer_c.key AND c.e->>'key'=outer_c.compatibility GROUP BY b->>'id') skills) skills
  FROM cohorts outer_c)
 SELECT jsonb_build_object('group',grupo_json(gid),'updatedAt',statement_timestamp(),'population',jsonb_array_length(students),
  'diagnostic',jsonb_build_object('completed',(SELECT count(*) FROM population WHERE s->>'diagnosticStatus'='completado'),
   'inProgress',(SELECT count(*) FROM population WHERE s->>'diagnosticStatus'='en progreso'),'pending',(SELECT count(*) FROM population WHERE s->>'diagnosticStatus'='pendiente')),
  'stages',(SELECT jsonb_agg(jsonb_build_object('id',stage,'count',(SELECT count(*) FROM population WHERE s->>'journeyStage'=stage)) ORDER BY ord)
   FROM (VALUES('diagnostic_pending',0),('level_1',1),('level_2',2),('level_3',3),('final_passed',4)) stages(stage,ord)),
  'study',(SELECT jsonb_agg(jsonb_build_object('level',lvl,'withRoute',(SELECT count(*) FROM population CROSS JOIN LATERAL jsonb_array_elements(s->'levels') l WHERE (l->>'level')::integer=lvl AND l->>'generationStatus'='ready'),
   'pending',(SELECT count(*) FROM population CROSS JOIN LATERAL jsonb_array_elements(s->'levels') l WHERE (l->>'level')::integer=lvl AND l->>'generationStatus'<>'ready'),
   'completedSections',(SELECT coalesce(sum((l->>'completed')::integer),0) FROM population CROSS JOIN LATERAL jsonb_array_elements(s->'levels') l WHERE (l->>'level')::integer=lvl AND l->>'generationStatus'='ready')) ORDER BY lvl) FROM generate_series(1,3) lvl),
  'assessments',(SELECT jsonb_agg(jsonb_build_object('key',key,'withoutResult',jsonb_array_length(students)-present,
   'passed',passed,'notPassed',failed,'undecided',present-passed-failed,
   'activeAttempts',(SELECT count(DISTINCT uid) FROM attempts WHERE a->>'kind'=kind AND (a->>'level')::integer IS NOT DISTINCT FROM lvl AND a->>'status'='activo'),
   'activeRetries',(SELECT count(DISTINCT uid) FROM attempts active WHERE a->>'kind'=kind AND (a->>'level')::integer IS NOT DISTINCT FROM lvl AND a->>'status'='activo' AND EXISTS(SELECT 1 FROM finished f WHERE f.uid=active.uid AND f.a->>'kind'=kind AND (f.a->>'level')::integer IS NOT DISTINCT FROM lvl))) ORDER BY ord)
   FROM slots CROSS JOIN LATERAL (SELECT count(*) FILTER(WHERE a->>'status'='finalizado') present,count(*) FILTER(WHERE (a->>'passed')::boolean) passed,count(*) FILTER(WHERE (a->>'passed')::boolean=false) failed
    FROM population CROSS JOIN LATERAL jsonb_array_elements(s->'assessments') a WHERE a->>'kind'=kind AND (a->>'level')::integer IS NOT DISTINCT FROM lvl) counts WHERE ord>0),
  'skills',(SELECT jsonb_agg(jsonb_build_object('key',key,
   'withResult',(SELECT count(DISTINCT uid) FROM finished WHERE a->>'kind'=kind AND (a->>'level')::integer IS NOT DISTINCT FROM lvl),
   'supportedStudents',(SELECT count(*) FROM compatible c WHERE c.key=slots.key),
   'fallbackStudents',(SELECT count(*) FROM compatible c WHERE c.key=slots.key AND EXISTS(SELECT 1 FROM finished f WHERE f.uid=c.uid AND f.a->>'kind'=kind AND (f.a->>'level')::integer IS NOT DISTINCT FROM lvl AND ((f.a->>'completedAt')::bigint,f.a->>'id')>((c.a->>'completedAt')::bigint,c.a->>'id'))),
   'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('key',compatibility,'label',label,'students',student_count,'skills',skills) ORDER BY compatibility) FROM skill_groups g WHERE g.key=slots.key),'[]'::jsonb)) ORDER BY ord) FROM slots),
  'reviewPending',(SELECT count(*) FROM population WHERE (s->>'reviewRequired')::boolean),
  'incompleteHistory',(SELECT count(DISTINCT uid) FROM attempts WHERE a->>'status'='finalizado' AND NOT (a->>'resultAvailable')::boolean)
 ) INTO data;
 RETURN data;
END $$;

ALTER FUNCTION public.apex_api(TEXT,JSONB) RENAME TO apex_api_pre_resumen_docente;
CREATE FUNCTION public.apex_api(operation TEXT,payload JSONB DEFAULT '{}'::jsonb) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=apex_private,pg_catalog AS $$
BEGIN
 IF operation='teacher_group_summary' THEN RETURN resumen_grupo_docente((payload->>'groupId')::uuid);END IF;
 RETURN public.apex_api_pre_resumen_docente(operation,payload);
END $$;
REVOKE ALL ON FUNCTION seguimiento_intentos(TEXT,TEXT),seguimiento_estudiante(TEXT,TEXT),evidencia_habilidades_docente(TEXT),resumen_grupo_docente(UUID),public.apex_api_pre_resumen_docente(TEXT,JSONB),public.apex_api(TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_api(TEXT,JSONB) TO authenticated;
COMMIT;
