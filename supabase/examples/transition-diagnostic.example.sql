-- EJEMPLO: solo en sesión administrativa real, con autorización independiente.
-- No inventar JWT ni ejecutar como SQL owner suplantando una sesión.
-- El marcador falla antes de llamar a la función que asigna el diagnóstico.
BEGIN;
DO $$
DECLARE student_id TEXT := 'REEMPLAZAR_ID_ESTUDIANTE';
BEGIN
 IF student_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
  RAISE EXCEPTION 'Sustituye REEMPLAZAR_ID_ESTUDIANTE por un ID verificado y autorizado.';
 END IF;
 PERFORM public.apex_transition_diagnostic(ARRAY[student_id]::text[]);
END $$;
COMMIT;
