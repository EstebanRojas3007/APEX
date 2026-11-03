-- OWNER-ONLY template. Intentionally fails closed until explicit real IDs and
-- approved group metadata are supplied below. Never derives a roster from all users.
-- Run after 202610220001 and after checking the first teacher's domain mapping.
BEGIN;
DO $$
DECLARE
 group_id UUID:=NULL; -- Supply a reviewed UUID for this group; reuse on reruns.
 group_code TEXT:=NULL; -- Approved code, not a sample classroom number.
 group_name TEXT:=NULL;
 teacher_ids TEXT[]:=ARRAY[]::TEXT[]; -- DOMAIN IDs from usuario.id, not Auth UUIDs.
 student_ids TEXT[]:=ARRAY[]::TEXT[]; -- Explicit DOMAIN IDs from estudiante.id_usuario.
 tid TEXT;sid TEXT;
BEGIN
 IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='apex_private.grupo'::regclass)) THEN
  RAISE EXCEPTION 'Solo propietario SQL.' USING ERRCODE='42501';END IF;
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Usa las RPC administrativas con tu sesión real.';END IF;
 IF group_id IS NULL OR nullif(trim(group_code),'') IS NULL OR nullif(trim(group_name),'') IS NULL OR cardinality(teacher_ids)=0 OR cardinality(student_ids)=0
  OR array_position(teacher_ids,NULL) IS NOT NULL OR array_position(student_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Completa grupo e IDs explícitos revisados; no se creó ningún dato.';
 END IF;
 INSERT INTO apex_private.grupo(id,codigo,nombre,id_componente) VALUES(group_id,trim(group_code),trim(group_name),'ingles')
 ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM apex_private.grupo WHERE id=group_id AND codigo=trim(group_code) AND nombre=trim(group_name) AND id_componente='ingles' AND estado='activo') THEN
  RAISE EXCEPTION 'El grupo existente no coincide con los datos aprobados.';END IF;
 FOREACH tid IN ARRAY teacher_ids LOOP
  INSERT INTO apex_private.grupo_docente(id_grupo,id_docente,activa) VALUES(group_id,tid,true)
  ON CONFLICT(id_grupo,id_docente) DO UPDATE SET activa=true WHERE NOT grupo_docente.activa;
 END LOOP;
 -- Stable ordering reduces deadlocks in batches. Trigger enforces capacity even
 -- for direct SQL and concurrent connections; no minimum of five is enforced.
 FOR sid IN SELECT DISTINCT unnest(student_ids) ORDER BY 1 LOOP
  INSERT INTO apex_private.grupo_integrante(id_grupo,id_estudiante,activa) VALUES(group_id,sid,true)
  ON CONFLICT(id_grupo,id_estudiante) DO UPDATE SET activa=true WHERE NOT grupo_integrante.activa;
 END LOOP;
END $$;
COMMIT;
