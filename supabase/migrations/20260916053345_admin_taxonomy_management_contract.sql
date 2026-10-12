INSERT INTO public.permissions (id, module, action, name_en, name_bn, description)
VALUES (
  'categories.manage',
  'categories',
  'manage',
  'Manage Categories',
  'ক্যাটাগরি পরিচালনা করুন',
  'Update existing public reporting taxonomy names, visibility, and sort order.'
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_get_taxonomy()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_segments jsonb;
  v_subcategories jsonb;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Access denied. Active administrative session required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission('categories.view') THEN
    RAISE EXCEPTION 'Access denied. Missing categories.view permission.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name_en', s.name_en,
        'name_bn', s.name_bn,
        'active', s.active,
        'sort_order', s.sort_order
      ) ORDER BY s.sort_order, s.id
    ),
    '[]'::jsonb
  )
  INTO v_segments
  FROM public.segments s;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', sc.id,
        'segment_id', sc.segment_id,
        'name_en', sc.name_en,
        'name_bn', sc.name_bn,
        'active', sc.active,
        'sort_order', sc.sort_order
      ) ORDER BY sc.segment_id, sc.sort_order, sc.id
    ),
    '[]'::jsonb
  )
  INTO v_subcategories
  FROM public.subcategories sc;

  RETURN jsonb_build_object(
    'segments', v_segments,
    'subcategories', v_subcategories
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_taxonomy_item(
  p_item_type text,
  p_item_id text,
  p_name_en text,
  p_name_bn text,
  p_active boolean,
  p_sort_order integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_item_type text;
  v_item_id text;
  v_name_en text;
  v_name_bn text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Access denied. Active administrative session required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission('categories.manage') THEN
    RAISE EXCEPTION 'Access denied. Missing categories.manage permission.'
      USING ERRCODE = '42501';
  END IF;

  v_item_type := lower(NULLIF(btrim(p_item_type), ''));
  v_item_id := NULLIF(btrim(p_item_id), '');
  v_name_en := NULLIF(btrim(p_name_en), '');
  v_name_bn := NULLIF(btrim(p_name_bn), '');

  IF v_item_type NOT IN ('segment', 'subcategory') THEN
    RAISE EXCEPTION 'Invalid taxonomy item type.' USING ERRCODE = '22023';
  END IF;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'Taxonomy item ID is required.' USING ERRCODE = '22023';
  END IF;

  IF v_name_en IS NULL OR v_name_bn IS NULL THEN
    RAISE EXCEPTION 'Both English and Bangla names are required.' USING ERRCODE = '22023';
  END IF;

  IF p_active IS NULL OR p_sort_order IS NULL THEN
    RAISE EXCEPTION 'Active state and sort order are required.' USING ERRCODE = '22023';
  END IF;

  IF v_item_type = 'segment' THEN
    SELECT jsonb_build_object(
      'id', s.id,
      'name_en', s.name_en,
      'name_bn', s.name_bn,
      'active', s.active,
      'sort_order', s.sort_order
    )
    INTO v_before
    FROM public.segments s
    WHERE s.id = v_item_id
    FOR UPDATE;

    IF v_before IS NULL THEN
      RAISE EXCEPTION 'Segment not found: %', v_item_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.segments
    SET name_en = v_name_en, name_bn = v_name_bn, active = p_active, sort_order = p_sort_order
    WHERE id = v_item_id;

    SELECT jsonb_build_object(
      'id', s.id,
      'name_en', s.name_en,
      'name_bn', s.name_bn,
      'active', s.active,
      'sort_order', s.sort_order
    )
    INTO v_after
    FROM public.segments s
    WHERE s.id = v_item_id;
  ELSE
    SELECT jsonb_build_object(
      'id', sc.id,
      'segment_id', sc.segment_id,
      'name_en', sc.name_en,
      'name_bn', sc.name_bn,
      'active', sc.active,
      'sort_order', sc.sort_order
    )
    INTO v_before
    FROM public.subcategories sc
    WHERE sc.id = v_item_id
    FOR UPDATE;

    IF v_before IS NULL THEN
      RAISE EXCEPTION 'Subcategory not found: %', v_item_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.subcategories
    SET name_en = v_name_en, name_bn = v_name_bn, active = p_active, sort_order = p_sort_order
    WHERE id = v_item_id;

    SELECT jsonb_build_object(
      'id', sc.id,
      'segment_id', sc.segment_id,
      'name_en', sc.name_en,
      'name_bn', sc.name_bn,
      'active', sc.active,
      'sort_order', sc.sort_order
    )
    INTO v_after
    FROM public.subcategories sc
    WHERE sc.id = v_item_id;
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'taxonomy.update',
    v_item_type,
    v_item_id,
    jsonb_build_object('before', v_before, 'after', v_after, 'timestamp', clock_timestamp())
  );

  RETURN jsonb_build_object('success', true, 'item_type', v_item_type, 'item', v_after);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_taxonomy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_taxonomy() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_taxonomy() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_taxonomy_item(text, text, text, text, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_taxonomy_item(text, text, text, text, boolean, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_taxonomy_item(text, text, text, text, boolean, integer) TO authenticated;
