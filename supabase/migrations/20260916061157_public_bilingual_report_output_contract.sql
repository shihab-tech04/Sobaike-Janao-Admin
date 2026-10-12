DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='get_public_home_feed'
    AND pg_get_function_identity_arguments(p.oid)='p_visitor_lat double precision, p_visitor_lng double precision, p_filter text, p_district text';

  IF v_oid IS NULL THEN RAISE EXCEPTION 'Expected get_public_home_feed signature not found.'; END IF;
  v_def := pg_get_functiondef(v_oid);

  IF (length(v_def)-length(replace(v_def,'      c.title,','')))/length('      c.title,') <> 1
     OR (length(v_def)-length(replace(v_def,'      CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END AS description,','')))/length('      CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END AS description,') <> 1
     OR (length(v_def)-length(replace(v_def,'''titleEn'', bc.title,','')))/length('''titleEn'', bc.title,') <> 1
     OR (length(v_def)-length(replace(v_def,'''descriptionEn'', bc.description,','')))/length('''descriptionEn'', bc.description,') <> 1 THEN
    RAISE EXCEPTION 'Unexpected get_public_home_feed source; bilingual patch aborted.';
  END IF;

  v_new := replace(v_def,
    '      c.title,',
    '      c.title,' || chr(10) || '      coalesce(nullif(trim(c.title_en), ''''), c.title) AS title_en,');
  v_new := replace(v_new,
    '      CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END AS description,',
    '      CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END AS description,' || chr(10) ||
    '      CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN coalesce(nullif(trim(c.description_en), ''''), c.description) ELSE NULL END AS description_en,');
  v_new := replace(v_new, '''titleEn'', bc.title,', '''titleEn'', bc.title_en,');
  v_new := replace(v_new, '''descriptionEn'', bc.description,', '''descriptionEn'', bc.description_en,');
  EXECUTE v_new;

  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='get_public_published_report'
    AND pg_get_function_identity_arguments(p.oid)='p_report_id text';

  IF v_oid IS NULL THEN RAISE EXCEPTION 'Expected get_public_published_report signature not found.'; END IF;
  v_def := pg_get_functiondef(v_oid);

  IF (length(v_def)-length(replace(v_def,'''titleEn'', c.title,','')))/length('''titleEn'', c.title,') <> 1
     OR (length(v_def)-length(replace(v_def,'''descriptionEn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END,','')))/length('''descriptionEn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END,') <> 1 THEN
    RAISE EXCEPTION 'Unexpected get_public_published_report source; bilingual patch aborted.';
  END IF;

  v_new := replace(v_def,
    '''titleEn'', c.title,',
    '''titleEn'', coalesce(nullif(trim(c.title_en), ''''), c.title),');
  v_new := replace(v_new,
    '''descriptionEn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END,',
    '''descriptionEn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN coalesce(nullif(trim(c.description_en), ''''), c.description) ELSE NULL END,');
  EXECUTE v_new;

  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='get_public_published_reports'
    AND pg_get_function_identity_arguments(p.oid)='';

  IF v_oid IS NULL THEN RAISE EXCEPTION 'Expected get_public_published_reports signature not found.'; END IF;
  v_def := pg_get_functiondef(v_oid);

  IF (length(v_def)-length(replace(v_def,'''titleEn'', c.title,','')))/length('''titleEn'', c.title,') <> 1
     OR (length(v_def)-length(replace(v_def,'''descriptionEn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END,','')))/length('''descriptionEn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END,') <> 1 THEN
    RAISE EXCEPTION 'Unexpected get_public_published_reports source; bilingual patch aborted.';
  END IF;

  v_new := replace(v_def,
    '''titleEn'', c.title,',
    '''titleEn'', coalesce(nullif(trim(c.title_en), ''''), c.title),');
  v_new := replace(v_new,
    '''descriptionEn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN c.description ELSE NULL END,',
    '''descriptionEn'', CASE WHEN (c.publication_preferences->''showDescription'') = ''true''::jsonb THEN coalesce(nullif(trim(c.description_en), ''''), c.description) ELSE NULL END,');
  EXECUTE v_new;
END;
$migration$;
