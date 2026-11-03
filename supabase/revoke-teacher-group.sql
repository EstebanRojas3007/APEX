-- OWNER-ONLY directed reversal; no DELETE, academic edits or audit erasure.
-- Supply ONLY links added/reactivated by the reviewed operation. A shared group
-- or a previously active link must not be withdrawn as an accidental rollback.
BEGIN;
DO $$
DECLARE group_id UUID:=NULL;teacher_ids TEXT[]:=ARRAY[]::TEXT[];student_ids TEXT[]:=ARRAY[]::TEXT[];
BEGIN
 IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='apex_private.grupo'::regclass)) THEN RAISE EXCEPTION 'Solo propietario SQL.' USING ERRCODE='42501';END IF;
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Usa las RPC administrativas con tu sesión real.';END IF;
 IF group_id IS NULL OR cardinality(teacher_ids)+cardinality(student_ids)=0 THEN RAISE EXCEPTION 'Indica grupo y vínculos explícitos.';END IF;
 UPDATE apex_private.grupo_docente SET activa=false WHERE id_grupo=group_id AND id_docente=ANY(teacher_ids) AND activa;
 UPDATE apex_private.grupo_integrante SET activa=false WHERE id_grupo=group_id AND id_estudiante=ANY(student_ids) AND activa;
END $$;
COMMIT;
