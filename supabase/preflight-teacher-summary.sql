-- OWNER, read-only. Compare deployed definitions before applying the new migration.
-- No calls to apex_api, activity, grading, AI, enablement or group mutation.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT name,to_regprocedure(name) AS installed
FROM unnest(ARRAY['public.apex_api(text,jsonb)','apex_private.actor()',
 'apex_private.docente_grupo(text,uuid)','apex_private.integrante_grupo(uuid,text)',
 'apex_private.seguimiento_intentos(text,text)','apex_private.seguimiento_estudiante(text,text)',
 'apex_private.asignacion_tecnica(text)','apex_private.resultado_json(text)',
 'apex_private.evidencia_habilidades_docente(text)','apex_private.resumen_grupo_docente(uuid)',
 'public.apex_api_pre_resumen_docente(text,jsonb)']) name;
SELECT p.oid::regprocedure AS function,md5(pg_get_functiondef(p.oid)) AS definition_md5,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname='apex_api') OR
 (n.nspname='apex_private' AND p.proname IN ('docente_grupo','integrante_grupo','seguimiento_intentos','seguimiento_estudiante','asignacion_tecnica'));
SELECT g.id,g.codigo,g.estado,count(DISTINCT m.id_estudiante) FILTER(WHERE m.activa) AS reserved,
 count(DISTINCT m.id_estudiante) FILTER(WHERE apex_private.integrante_grupo(g.id,m.id_estudiante)) AS eligible
FROM apex_private.grupo g LEFT JOIN apex_private.grupo_integrante m ON m.id_grupo=g.id GROUP BY g.id ORDER BY g.codigo;
SELECT id,habilitada AS enabled FROM apex_private.prueba_reloj_tecnica;
ROLLBACK;
