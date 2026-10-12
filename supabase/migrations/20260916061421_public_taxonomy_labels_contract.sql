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
  IF (length(v_def)-length(replace(v_def,'''subcategoryId'', bc.subcategory_id,','')))/length('''subcategoryId'', bc.subcategory_id,') <> 1 THEN
    RAISE EXCEPTION 'Unexpected get_public_home_feed source; taxonomy-label patch aborted.';
  END IF;
  v_new := replace(
    v_def,
    '''subcategoryId'', bc.subcategory_id,',
    '''subcategoryId'', bc.subcategory_id,' || chr(10) ||
    '        ''subcategoryBn'', coalesce((SELECT sc.name_bn FROM public.subcategories sc WHERE sc.id = bc.subcategory_id), bc.subcategory_id),' || chr(10) ||
    '        ''subcategoryEn'', coalesce((SELECT sc.name_en FROM public.subcategories sc WHERE sc.id = bc.subcategory_id), bc.subcategory_id),'
  );
  EXECUTE v_new;

  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='get_public_published_report'
    AND pg_get_function_identity_arguments(p.oid)='p_report_id text';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Expected get_public_published_report signature not found.'; END IF;
  v_def := pg_get_functiondef(v_oid);
  IF (length(v_def)-length(replace(v_def,'''subcategoryId'', c.subcategory_id,','')))/length('''subcategoryId'', c.subcategory_id,') <> 1 THEN
    RAISE EXCEPTION 'Unexpected get_public_published_report source; taxonomy-label patch aborted.';
  END IF;
  v_new := replace(
    v_def,
    '''subcategoryId'', c.subcategory_id,',
    '''subcategoryId'', c.subcategory_id,' || chr(10) ||
    '    ''subcategoryBn'', coalesce((SELECT sc.name_bn FROM public.subcategories sc WHERE sc.id = c.subcategory_id), c.subcategory_id),' || chr(10) ||
    '    ''subcategoryEn'', coalesce((SELECT sc.name_en FROM public.subcategories sc WHERE sc.id = c.subcategory_id), c.subcategory_id),'
  );
  EXECUTE v_new;

  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='get_public_published_reports'
    AND pg_get_function_identity_arguments(p.oid)='';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Expected get_public_published_reports signature not found.'; END IF;
  v_def := pg_get_functiondef(v_oid);
  IF (length(v_def)-length(replace(v_def,'''subcategoryId'', c.subcategory_id,','')))/length('''subcategoryId'', c.subcategory_id,') <> 1 THEN
    RAISE EXCEPTION 'Unexpected get_public_published_reports source; taxonomy-label patch aborted.';
  END IF;
  v_new := replace(
    v_def,
    '''subcategoryId'', c.subcategory_id,',
    '''subcategoryId'', c.subcategory_id,' || chr(10) ||
    '        ''subcategoryBn'', coalesce((SELECT sc.name_bn FROM public.subcategories sc WHERE sc.id = c.subcategory_id), c.subcategory_id),' || chr(10) ||
    '        ''subcategoryEn'', coalesce((SELECT sc.name_en FROM public.subcategories sc WHERE sc.id = c.subcategory_id), c.subcategory_id),'
  );
  EXECUTE v_new;
END;
$migration$;
