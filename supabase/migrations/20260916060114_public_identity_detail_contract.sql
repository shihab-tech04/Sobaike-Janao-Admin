DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_public_published_report'
    AND pg_get_function_identity_arguments(p.oid) = 'p_report_id text';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Expected get_public_published_report signature not found.';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF (length(v_def) - length(replace(v_def, '''id'', c.id,', ''))) / length('''id'', c.id,') <> 1 THEN
    RAISE EXCEPTION 'Unexpected get_public_published_report source; public identity patch aborted.';
  END IF;

  v_new := replace(
    v_def,
    '''id'', c.id,',
    '''id'', c.id,' || chr(10) ||
    '    ''reporterName'', CASE WHEN c.privacy_choice = ''public_identity'' AND c.confirm_public_identity = true THEN nullif(trim(c.reporter_name), '''') ELSE NULL END,'
  );

  EXECUTE v_new;
END;
$migration$;
