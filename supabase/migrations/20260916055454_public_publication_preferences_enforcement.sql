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
    AND p.proname = 'get_public_home_feed'
    AND pg_get_function_identity_arguments(p.oid) = 'p_visitor_lat double precision, p_visitor_lng double precision, p_filter text, p_district text';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Expected get_public_home_feed signature not found.';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF (length(v_def) - length(replace(v_def, '      c.description,', ''))) / length('      c.description,') <> 1
     OR (length(v_def) - length(replace(v_def, '      party.name AS party_name,', ''))) / length('      party.name AS party_name,') <> 1
     OR (length(v_def) - length(replace(v_def, '      party.organization AS party_org,', ''))) / length('      party.organization AS party_org,') <> 1 THEN
    RAISE EXCEPTION 'Unexpected get_public_home_feed source; privacy patch aborted.';
  END IF;

  v_new := replace(v_def,
    '      c.description,',
    '      CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END AS description,');
  v_new := replace(v_new,
    '      party.name AS party_name,',
    '      CASE WHEN (c.publication_preferences->''showSubjectName'') = ''true''::jsonb THEN party.name ELSE NULL END AS party_name,');
  v_new := replace(v_new,
    '      party.organization AS party_org,',
    '      CASE WHEN (c.publication_preferences->''showOrganization'') = ''true''::jsonb THEN party.organization ELSE NULL END AS party_org,');

  EXECUTE v_new;

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

  IF (length(v_def) - length(replace(v_def, '''descriptionBn'', c.description,', ''))) / length('''descriptionBn'', c.description,') <> 1
     OR (length(v_def) - length(replace(v_def, '''descriptionEn'', c.description,', ''))) / length('''descriptionEn'', c.description,') <> 1
     OR (length(v_def) - length(replace(v_def, '''reportedSubject'', party.name,', ''))) / length('''reportedSubject'', party.name,') <> 1
     OR (length(v_def) - length(replace(v_def, '''organization'', party.organization,', ''))) / length('''organization'', party.organization,') <> 1 THEN
    RAISE EXCEPTION 'Unexpected get_public_published_report source; privacy patch aborted.';
  END IF;

  v_new := replace(v_def,
    '''descriptionBn'', c.description,',
    '''descriptionBn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END,');
  v_new := replace(v_new,
    '''descriptionEn'', c.description,',
    '''descriptionEn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END,');
  v_new := replace(v_new,
    '''reportedSubject'', party.name,',
    '''reportedSubject'', CASE WHEN (c.publication_preferences->''showSubjectName'') = ''true''::jsonb THEN party.name ELSE NULL END,');
  v_new := replace(v_new,
    '''organization'', party.organization,',
    '''organization'', CASE WHEN (c.publication_preferences->''showOrganization'') = ''true''::jsonb THEN party.organization ELSE NULL END,');

  EXECUTE v_new;

  SELECT p.oid INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_public_published_reports'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Expected get_public_published_reports signature not found.';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF (length(v_def) - length(replace(v_def, '''descriptionBn'', c.description,', ''))) / length('''descriptionBn'', c.description,') <> 1
     OR (length(v_def) - length(replace(v_def, '''descriptionEn'', c.description,', ''))) / length('''descriptionEn'', c.description,') <> 1
     OR (length(v_def) - length(replace(v_def, '''reportedSubject'', party.name,', ''))) / length('''reportedSubject'', party.name,') <> 1
     OR (length(v_def) - length(replace(v_def, '''organization'', party.organization,', ''))) / length('''organization'', party.organization,') <> 1 THEN
    RAISE EXCEPTION 'Unexpected get_public_published_reports source; privacy patch aborted.';
  END IF;

  v_new := replace(v_def,
    '''descriptionBn'', c.description,',
    '''descriptionBn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END,');
  v_new := replace(v_new,
    '''descriptionEn'', c.description,',
    '''descriptionEn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END,');
  v_new := replace(v_new,
    '''reportedSubject'', party.name,',
    '''reportedSubject'', CASE WHEN (c.publication_preferences->''showSubjectName'') = ''true''::jsonb THEN party.name ELSE NULL END,');
  v_new := replace(v_new,
    '''organization'', party.organization,',
    '''organization'', CASE WHEN (c.publication_preferences->''showOrganization'') = ''true''::jsonb THEN party.organization ELSE NULL END,');

  EXECUTE v_new;
END;
$migration$;
