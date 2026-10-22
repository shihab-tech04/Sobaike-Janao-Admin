-- Sobaike Janao read-only catalog recovery, 2026-10-18. TEST ONLY.
-- This is NOT an historical migration, production delta, or permission grant plan.
-- Contains only pg_get_functiondef metadata; no application records or runtime secrets.
-- Must be replayed only after the test-only baseline on disposable loopback Supabase.
DO $recovery_guard$ BEGIN
  IF current_setting('recovery.test_only', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Refusing recovery test-only function catalog outside isolated test session';
  END IF;
END $recovery_guard$;

-- public.admin_get_user_filter_roles()
CREATE OR REPLACE FUNCTION public.admin_get_user_filter_roles()
 RETURNS TABLE(id text, name_en text, name_bn text, active boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    IF NOT public.has_permission('admin_users.view') THEN
        RAISE EXCEPTION
            'Access denied. User view authorization required.'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        r.id,
        r.name_en,
        r.name_bn,
        r.active
    FROM public.roles r
    ORDER BY r.name_en ASC;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_get_user_filter_roles() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_filter_roles() TO authenticated;

-- public.admin_get_users(p_search text, p_role_id text, p_status text, p_limit integer, p_offset integer, p_sort_by text, p_sort_direction text)
CREATE OR REPLACE FUNCTION public.admin_get_users(p_search text DEFAULT NULL::text, p_role_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort_by text DEFAULT 'created_at'::text, p_sort_direction text DEFAULT 'desc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_clean_search text;
  v_limit int;
  v_offset int;
  v_total_count int;
  v_users jsonb;
  v_sort_by text;
  v_sort_direction text;
BEGIN
  IF NOT (
    public.has_permission('admin_users.view')
    OR public.has_permission('admin_users.manage')
  ) THEN
    RAISE EXCEPTION
      'Access denied. You do not have permission to view administrative users.'
      USING ERRCODE = '42501';
  END IF;

  v_clean_search := NULLIF(btrim(p_search), '');
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));
  v_sort_by := lower(COALESCE(NULLIF(btrim(p_sort_by), ''), 'created_at'));
  v_sort_direction := lower(COALESCE(NULLIF(btrim(p_sort_direction), ''), 'desc'));

  IF v_sort_by NOT IN ('name', 'account_type', 'role', 'status', 'created_at') THEN
    RAISE EXCEPTION 'Invalid user sort column.' USING ERRCODE = '22000';
  END IF;
  IF v_sort_direction NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid sort direction.' USING ERRCODE = '22000';
  END IF;

  WITH filtered AS (
    SELECT
      au.user_id,
      au.display_name,
      u.email,
      au.active,
      au.is_super_admin,
      ur.role_id,
      r.name_en AS role_name_en,
      r.name_bn AS role_name_bn,
      public.can_manage_user_target(au.user_id) AS can_manage_target,
      au.created_at
    FROM public.admin_users au
    JOIN auth.users u ON u.id = au.user_id
    LEFT JOIN public.user_roles ur ON ur.user_id = au.user_id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    WHERE
      (au.is_super_admin IS NOT TRUE OR au.user_id = auth.uid())
      AND (
        v_clean_search IS NULL
        OR u.email ILIKE '%' || v_clean_search || '%'
        OR au.display_name ILIKE '%' || v_clean_search || '%'
      )
      AND (
        p_role_id IS NULL
        OR CASE
          WHEN p_role_id = 'super_admin' THEN au.is_super_admin = TRUE
          ELSE ur.role_id = p_role_id
        END
      )
      AND (
        p_status IS NULL
        OR CASE
          WHEN p_status = 'active' THEN au.active = TRUE
          WHEN p_status = 'inactive' THEN au.active = FALSE
          ELSE TRUE
        END
      )
  ),
  numbered AS (
    SELECT
      filtered.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_sort_by = 'name' AND v_sort_direction = 'asc'
            THEN lower(COALESCE(display_name, email, '')) END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'name' AND v_sort_direction = 'desc'
            THEN lower(COALESCE(display_name, email, '')) END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'account_type' AND v_sort_direction = 'asc'
            THEN is_super_admin END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'account_type' AND v_sort_direction = 'desc'
            THEN is_super_admin END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'role' AND v_sort_direction = 'asc'
            THEN lower(COALESCE(role_name_en, '')) END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'role' AND v_sort_direction = 'desc'
            THEN lower(COALESCE(role_name_en, '')) END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'status' AND v_sort_direction = 'asc'
            THEN active END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'status' AND v_sort_direction = 'desc'
            THEN active END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'created_at' AND v_sort_direction = 'asc'
            THEN created_at END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'created_at' AND v_sort_direction = 'desc'
            THEN created_at END DESC NULLS LAST,
          user_id ASC
      ) AS row_order
    FROM filtered
  ),
  page_rows AS (
    SELECT *
    FROM numbered
    ORDER BY row_order
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    (SELECT count(*)::int FROM filtered),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'display_name', display_name,
          'email', email,
          'active', active,
          'is_super_admin', is_super_admin,
          'role_id', role_id,
          'role_name_en', role_name_en,
          'role_name_bn', role_name_bn,
          'can_manage_target', can_manage_target,
          'created_at', created_at
        )
        ORDER BY row_order
      ),
      '[]'::jsonb
    )
  INTO v_total_count, v_users
  FROM page_rows;

  RETURN jsonb_build_object(
    'users', v_users,
    'total_count', COALESCE(v_total_count, 0),
    'limit', v_limit,
    'offset', v_offset
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_get_users(p_search text, p_role_id text, p_status text, p_limit integer, p_offset integer, p_sort_by text, p_sort_direction text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_users(p_search text, p_role_id text, p_status text, p_limit integer, p_offset integer, p_sort_by text, p_sort_direction text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_users(p_search text, p_role_id text, p_status text, p_limit integer, p_offset integer, p_sort_by text, p_sort_direction text) TO service_role;

-- public.admin_list_audit_logs(p_limit integer, p_offset integer, p_search text, p_action text, p_target_type text, p_actor_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_sort_by text, p_sort_direction text)
CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(p_limit integer DEFAULT 15, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_action text DEFAULT NULL::text, p_target_type text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sort_by text DEFAULT 'created_at'::text, p_sort_direction text DEFAULT 'desc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_limit int;
  v_offset int;
  v_search text;
  v_action text;
  v_target_type_raw text;
  v_norm_target_type text;
  v_total_count bigint;
  v_logs_json jsonb;
  v_sort_by text;
  v_sort_direction text;
BEGIN
  IF NOT public.is_active_admin()
     OR NOT public.has_permission('audit.view') THEN
    RAISE EXCEPTION
      'Access denied. Audit log view authorization required.'
      USING ERRCODE = '42501';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 15), 100));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));
  v_search := NULLIF(btrim(p_search), '');
  v_action := NULLIF(btrim(p_action), '');
  IF v_action = 'all' THEN v_action := NULL; END IF;

  v_target_type_raw := NULLIF(btrim(p_target_type), '');
  IF v_target_type_raw = 'all' THEN v_target_type_raw := NULL; END IF;
  v_norm_target_type := CASE
    WHEN v_target_type_raw IS NULL THEN NULL
    WHEN lower(v_target_type_raw) = 'complaint' THEN 'complaint'
    WHEN lower(v_target_type_raw) IN ('user', 'admin_user') THEN 'admin_user'
    WHEN lower(v_target_type_raw) = 'role' THEN 'role'
    ELSE lower(v_target_type_raw)
  END;

  v_sort_by := lower(COALESCE(NULLIF(btrim(p_sort_by), ''), 'created_at'));
  v_sort_direction := lower(COALESCE(NULLIF(btrim(p_sort_direction), ''), 'desc'));
  IF v_sort_by NOT IN ('created_at', 'action', 'actor', 'target', 'summary') THEN
    RAISE EXCEPTION 'Invalid audit sort column.' USING ERRCODE = '22000';
  END IF;
  IF v_sort_direction NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid sort direction.' USING ERRCODE = '22000';
  END IF;

  WITH filtered AS (
    SELECT
      a.id,
      a.actor_id,
      au.email AS actor_email,
      u.display_name AS actor_display_name,
      a.action,
      CASE
        WHEN lower(btrim(a.target_type)) = 'complaint' THEN 'complaint'
        WHEN lower(btrim(a.target_type)) IN ('user', 'admin_user') THEN 'admin_user'
        WHEN lower(btrim(a.target_type)) = 'role' THEN 'role'
        ELSE lower(btrim(a.target_type))
      END AS target_type,
      CASE
        WHEN lower(btrim(a.target_type)) IN ('user', 'admin_user')
             AND NULLIF(btrim(a.details->>'target_user_id'), '') IS NOT NULL
          THEN btrim(a.details->>'target_user_id')
        ELSE a.target_id
      END AS target_id,
      a.details,
      a.created_at
    FROM public.admin_audit_logs a
    LEFT JOIN public.admin_users u ON u.user_id = a.actor_id
    LEFT JOIN auth.users au ON au.id = a.actor_id
    WHERE
      (
        v_search IS NULL
        OR a.action ILIKE '%' || v_search || '%'
        OR a.target_id ILIKE '%' || v_search || '%'
        OR (
          lower(btrim(a.target_type)) IN ('user', 'admin_user')
          AND (a.details->>'target_user_id') ILIKE '%' || v_search || '%'
        )
        OR u.display_name ILIKE '%' || v_search || '%'
        OR au.email ILIKE '%' || v_search || '%'
      )
      AND (v_action IS NULL OR a.action = v_action)
      AND (
        v_norm_target_type IS NULL
        OR CASE
          WHEN lower(btrim(a.target_type)) = 'complaint' THEN 'complaint'
          WHEN lower(btrim(a.target_type)) IN ('user', 'admin_user') THEN 'admin_user'
          WHEN lower(btrim(a.target_type)) = 'role' THEN 'role'
          ELSE lower(btrim(a.target_type))
        END = v_norm_target_type
      )
      AND (p_actor_id IS NULL OR a.actor_id = p_actor_id)
      AND (p_date_from IS NULL OR a.created_at >= p_date_from)
      AND (p_date_to IS NULL OR a.created_at <= p_date_to)
  ),
  numbered AS (
    SELECT
      filtered.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_sort_by = 'created_at' AND v_sort_direction = 'asc' THEN created_at END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'created_at' AND v_sort_direction = 'desc' THEN created_at END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'action' AND v_sort_direction = 'asc' THEN lower(action) END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'action' AND v_sort_direction = 'desc' THEN lower(action) END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'actor' AND v_sort_direction = 'asc' THEN lower(COALESCE(actor_display_name, actor_email, '')) END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'actor' AND v_sort_direction = 'desc' THEN lower(COALESCE(actor_display_name, actor_email, '')) END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'target' AND v_sort_direction = 'asc' THEN lower(COALESCE(target_type, '') || ' ' || COALESCE(target_id, '')) END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'target' AND v_sort_direction = 'desc' THEN lower(COALESCE(target_type, '') || ' ' || COALESCE(target_id, '')) END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'summary' AND v_sort_direction = 'asc' THEN lower(COALESCE(details->>'note', details->>'reason', details->>'reason_code', action, '')) END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'summary' AND v_sort_direction = 'desc' THEN lower(COALESCE(details->>'note', details->>'reason', details->>'reason_code', action, '')) END DESC NULLS LAST,
          id ASC
      ) AS row_order
    FROM filtered
  ),
  page_rows AS (
    SELECT
      id,
      actor_id,
      actor_email,
      actor_display_name,
      action,
      target_type,
      target_id,
      public.sanitize_audit_details(details) AS details,
      created_at,
      row_order
    FROM numbered
    ORDER BY row_order
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    (SELECT count(*)::bigint FROM filtered),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'actor_id', actor_id,
          'actor_email', actor_email,
          'actor_display_name', actor_display_name,
          'action', action,
          'target_type', target_type,
          'target_id', target_id,
          'details', details,
          'created_at', created_at
        )
        ORDER BY row_order
      ),
      '[]'::jsonb
    )
  INTO v_total_count, v_logs_json
  FROM page_rows;

  RETURN jsonb_build_object(
    'logs', v_logs_json,
    'total_count', COALESCE(v_total_count, 0)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_list_audit_logs(p_limit integer, p_offset integer, p_search text, p_action text, p_target_type text, p_actor_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_sort_by text, p_sort_direction text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(p_limit integer, p_offset integer, p_search text, p_action text, p_target_type text, p_actor_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_sort_by text, p_sort_direction text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(p_limit integer, p_offset integer, p_search text, p_action text, p_target_type text, p_actor_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_sort_by text, p_sort_direction text) TO service_role;

-- public.admin_list_notifications(p_limit integer, p_before_created_at timestamp with time zone, p_before_id uuid, p_unread_only boolean, p_category text)
CREATE OR REPLACE FUNCTION public.admin_list_notifications(p_limit integer DEFAULT 20, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_unread_only boolean DEFAULT false, p_category text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, event_group_id uuid, event_key text, category text, layer text, severity text, audience_mode text, actor_user_id uuid, actor_display_name text, target_type text, target_id text, target_label text, title_en text, title_bn text, body_en text, body_bn text, metadata jsonb, route text, created_at timestamp with time zone, read_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_caller_id UUID;v_safe_limit INTEGER;
BEGIN
  IF NOT public.is_active_admin() THEN RAISE EXCEPTION 'Active administrator required' USING ERRCODE='42501'; END IF;
  v_caller_id:=auth.uid();IF v_caller_id IS NULL THEN RETURN;END IF;v_safe_limit:=LEAST(GREATEST(COALESCE(p_limit,20),1),50);
  RETURN QUERY SELECT n.id,n.event_group_id,n.event_key,n.category,n.layer,n.severity,n.audience_mode,n.actor_user_id,n.actor_display_name,n.target_type,n.target_id,n.target_label,n.title_en,n.title_bn,n.body_en,n.body_bn,n.metadata,n.route,n.created_at,n.read_at
  FROM public.admin_notifications n
  WHERE n.recipient_user_id=v_caller_id AND public.admin_notification_can_currently_view(n.recipient_user_id,n.audience_mode,n.required_all_permissions,n.required_any_permissions,n.target_type,n.target_id)
    AND (p_unread_only IS NOT TRUE OR n.read_at IS NULL)
    AND (p_category IS NULL
      OR (p_category='security' AND (n.severity='security' OR n.layer='security_privilege' OR n.event_key IN ('admin.role_changed','role.permissions_changed') OR n.category='security'))
      OR (p_category='configuration' AND n.event_key IN ('taxonomy.category_created','taxonomy.category_published','taxonomy.subcategory_created','taxonomy.subcategory_published','taxonomy.subcategory_moved','reporting_form.published','banner.published'))
      OR (p_category='administration' AND n.category='administration' AND n.event_key NOT IN ('taxonomy.category_created','taxonomy.category_published','taxonomy.subcategory_created','taxonomy.subcategory_published','taxonomy.subcategory_moved','reporting_form.published','banner.published'))
      OR (p_category NOT IN ('security','configuration','administration') AND n.category=p_category))
    AND (p_before_created_at IS NULL OR (n.created_at,n.id)<(p_before_created_at,COALESCE(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  ORDER BY n.created_at DESC,n.id DESC LIMIT v_safe_limit;
END;$function$;
REVOKE ALL ON FUNCTION public.admin_list_notifications(p_limit integer, p_before_created_at timestamp with time zone, p_before_id uuid, p_unread_only boolean, p_category text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_notifications(p_limit integer, p_before_created_at timestamp with time zone, p_before_id uuid, p_unread_only boolean, p_category text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_notifications(p_limit integer, p_before_created_at timestamp with time zone, p_before_id uuid, p_unread_only boolean, p_category text) TO service_role;

-- public.admin_list_roles()
CREATE OR REPLACE FUNCTION public.admin_list_roles()
 RETURNS TABLE(id text, name_en text, name_bn text, description text, active boolean, is_system boolean, permission_count bigint, assigned_user_count bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION
            'Access denied. You do not have permission to list roles.'
            USING ERRCODE = '42501';
    END IF;

    v_user_id := auth.uid();

    SELECT COALESCE(au.is_super_admin, false)
    INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id
      AND au.active = true;

    SELECT NOT EXISTS (
        SELECT 1
        FROM public.user_roles
    )
    INTO v_bootstrap_mode;

    RETURN QUERY
    SELECT
        r.id,
        r.name_en,
        r.name_bn,
        r.description,
        r.active,
        r.is_system,
        COUNT(DISTINCT rp.permission_id)::BIGINT,
        COUNT(DISTINCT ur.user_id)::BIGINT,
        r.created_at,
        r.updated_at
    FROM public.roles r
    LEFT JOIN public.role_permissions rp
      ON rp.role_id = r.id
    LEFT JOIN public.user_roles ur
      ON ur.role_id = r.id
    WHERE (
        v_is_super_admin IS TRUE
        OR v_bootstrap_mode IS TRUE
        OR public.can_manage_role_scope(r.id)
    )
    GROUP BY
        r.id,
        r.name_en,
        r.name_bn,
        r.description,
        r.active,
        r.is_system,
        r.created_at,
        r.updated_at
    ORDER BY
        r.is_system DESC,
        r.name_en ASC;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_list_roles() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_roles() TO service_role;

-- public.admin_mark_all_notifications_read()
CREATE OR REPLACE FUNCTION public.admin_mark_all_notifications_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_caller_id UUID;
    v_updated_count INTEGER;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION
            'Active administrator required'
            USING ERRCODE = '42501';
    END IF;

    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RETURN 0;
    END IF;

    UPDATE public.admin_notifications n
    SET read_at = now()
    WHERE n.recipient_user_id = v_caller_id
      AND n.read_at IS NULL
      AND public.admin_notification_can_currently_view(
          n.recipient_user_id,
          n.audience_mode,
          n.required_all_permissions,
          n.required_any_permissions,
          n.target_type,
          n.target_id
      );

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN v_updated_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_mark_all_notifications_read() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_all_notifications_read() TO service_role;

-- public.admin_mark_notification_read(p_notification_id uuid)
CREATE OR REPLACE FUNCTION public.admin_mark_notification_read(p_notification_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_caller_id UUID;
    v_updated_count INTEGER;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION
            'Active administrator required'
            USING ERRCODE = '42501';
    END IF;

    v_caller_id := auth.uid();

    IF v_caller_id IS NULL
       OR p_notification_id IS NULL
    THEN
        RETURN FALSE;
    END IF;

    UPDATE public.admin_notifications n
    SET read_at = COALESCE(n.read_at, now())
    WHERE n.id = p_notification_id
      AND n.recipient_user_id = v_caller_id
      AND public.admin_notification_can_currently_view(
          n.recipient_user_id,
          n.audience_mode,
          n.required_all_permissions,
          n.required_any_permissions,
          n.target_type,
          n.target_id
      );

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN (v_updated_count > 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_mark_notification_read(p_notification_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_notification_read(p_notification_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_notification_read(p_notification_id uuid) TO service_role;

-- public.admin_merge_intake_source(p_complaint_id text, p_source jsonb)
CREATE OR REPLACE FUNCTION public.admin_merge_intake_source(p_complaint_id text, p_source jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_target public.complaints%rowtype;
  v_url text:=nullif(btrim(p_source->>'canonicalUrl'),'');
  v_source_type text:=coalesce(nullif(btrim(p_source->>'sourceType'),''),'news');
  v_publisher text:=nullif(btrim(p_source->>'publisherName'),'');
  v_title text:=nullif(btrim(p_source->>'sourceTitle'),'');
  v_date date;
  v_source_id uuid;
  v_domain jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (not public.is_active_admin() or not public.has_permission('complaints.publish')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select * into v_target from public.complaints
  where id=p_complaint_id for update;

  if v_target.id is null then raise exception 'Complaint not found.' using errcode='P0002'; end if;
  if v_target.origin_type<>'sourced_report' then
    raise exception 'Sources may only be merged through News Intake into sourced reports.'
      using errcode='22023';
  end if;
  if v_target.status='rejected' then
    raise exception 'Cannot merge a source into a rejected report.' using errcode='22023';
  end if;

  v_domain:=public.admin_check_news_source_domain(v_url);
  v_publisher:=coalesce(
    nullif(btrim(v_domain->>'publisherName'),''),
    v_publisher
  );
  if coalesce((v_domain->>'approved')::boolean,false) is not true then
    raise exception 'SOURCE_DOMAIN_NOT_APPROVED: Source domain is not approved.'
      using errcode='22023';
  end if;

  if v_source_type not in ('news','official','social','article','other')
     or v_publisher is null or v_url is null then
    raise exception 'Valid source type, publisher, and URL are required.' using errcode='22023';
  end if;

  begin
    if nullif(btrim(p_source->>'sourcePublishedDate'),'') is not null then
      v_date:=(p_source->>'sourcePublishedDate')::date;
    end if;
  exception when others then
    raise exception 'Invalid source publication date.' using errcode='22023';
  end;

  if exists(
    select 1 from public.complaint_sources
    where public.normalize_source_url(canonical_url)=public.normalize_source_url(v_url)
  ) then
    raise exception 'SOURCE_ALREADY_EXISTS: This source is already attached to a report.'
      using errcode='23505';
  end if;

  insert into public.complaint_sources(
    complaint_id,source_type,publisher_name,source_title,canonical_url,
    source_published_date,verification_status,is_final_detail_page,
    source_version,verification_note,verified_at,verified_by
  ) values (
    v_target.id,v_source_type,v_publisher,v_title,v_url,
    v_date,'verified',true,1,'Verified and merged through Admin News Intake.',
    now(),auth.uid()
  ) returning id into v_source_id;

  update public.complaints set updated_at=now() where id=v_target.id;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'sourced_report.source_merge','complaint',v_target.id,jsonb_build_object(
    'source_id',v_source_id,
    'canonical_url',v_url,
    'publisher_name',v_publisher,
    'timestamp',clock_timestamp()
  ));

  return jsonb_build_object(
    'success',true,
    'reportId',v_target.id,
    'sourceId',v_source_id,
    'status',v_target.status
  );
exception
  when unique_violation then
    raise exception 'SOURCE_ALREADY_EXISTS: This source is already attached to another report.'
      using errcode='23505';
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_merge_intake_source(p_complaint_id text, p_source jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_merge_intake_source(p_complaint_id text, p_source jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_intake_source(p_complaint_id text, p_source jsonb) TO service_role;

-- public.admin_move_subcategory(p_subcategory_id text, p_target_segment_id text, p_sort_order integer)
CREATE OR REPLACE FUNCTION public.admin_move_subcategory(p_subcategory_id text, p_target_segment_id text, p_sort_order integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_sub public.subcategories%rowtype;
  v_old_segment text;
  v_report_count integer;
begin
  if not public.is_active_admin() or not public.has_permission('categories.manage') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select * into v_sub
  from public.subcategories
  where id=p_subcategory_id
  for update;

  if v_sub.id is null then
    raise exception 'Subcategory not found.' using errcode='P0002';
  end if;

  if not exists(
    select 1 from public.segments
    where id=p_target_segment_id and config_status <> 'archived'
  ) then
    raise exception 'Target category not found or archived.' using errcode='P0002';
  end if;

  if v_sub.segment_id=p_target_segment_id then
    return jsonb_build_object('success',true,'moved',false,'subcategoryId',v_sub.id);
  end if;

  v_old_segment := v_sub.segment_id;
  select count(*) into v_report_count from public.complaints where subcategory_id=v_sub.id;

  update public.subcategories
  set
    segment_id=p_target_segment_id,
    sort_order=coalesce(p_sort_order,sort_order),
    active=false,
    config_status=case when config_status='draft' then 'draft' else 'ready' end
  where id=v_sub.id;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'taxonomy.subcategory_move','subcategory',v_sub.id,
    jsonb_build_object(
      'from_segment_id',v_old_segment,
      'to_segment_id',p_target_segment_id,
      'historical_report_count',v_report_count,
      'historical_reports_preserved_by_snapshot',true,
      'reactivation_required',true,
      'timestamp',clock_timestamp()
    ));

  return jsonb_build_object(
    'success',true,'moved',true,'subcategoryId',v_sub.id,
    'fromSegmentId',v_old_segment,'toSegmentId',p_target_segment_id,
    'historicalReportCount',v_report_count,'configStatus',
    (select config_status from public.subcategories where id=v_sub.id)
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_move_subcategory(p_subcategory_id text, p_target_segment_id text, p_sort_order integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_move_subcategory(p_subcategory_id text, p_target_segment_id text, p_sort_order integer) TO authenticated;

-- public.admin_publish_reporting_form(p_subcategory_id text)
CREATE OR REPLACE FUNCTION public.admin_publish_reporting_form(p_subcategory_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_draft public.reporting_form_schemas%rowtype;
  v_fields jsonb;
begin
  if not public.is_active_admin() or not public.has_permission('categories.manage') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select * into v_draft
  from public.reporting_form_schemas
  where scope_type='subcategory' and scope_id=p_subcategory_id and status='draft'
  order by version desc limit 1
  for update;

  if v_draft.id is null then
    raise exception 'No form draft exists for this subcategory.' using errcode='P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'fieldKey',f.field_key,'fieldType',f.field_type,'storageMode',f.storage_mode,
    'storageKey',f.storage_key,'labelEn',f.label_en,'labelBn',f.label_bn,
    'helperEn',f.helper_en,'helperBn',f.helper_bn,'placeholderEn',f.placeholder_en,
    'placeholderBn',f.placeholder_bn,'required',f.required,'active',f.active,
    'sortOrder',f.sort_order,'options',f.options,'validation',f.validation,'config',f.config
  ) order by f.sort_order,f.field_key),'[]'::jsonb)
  into v_fields
  from public.reporting_form_schema_fields f
  where f.schema_id=v_draft.id;

  perform public.validate_reporting_form_fields(v_fields);

  update public.reporting_form_schemas
  set status='archived'
  where scope_type='subcategory'
    and scope_id=p_subcategory_id
    and status='published';

  update public.reporting_form_schemas
  set status='published',engine_mode='schema',published_by=auth.uid(),
      published_at=now(),updated_at=now()
  where id=v_draft.id;

  update public.subcategories
  set config_status=case when config_status='draft' then 'ready' else config_status end
  where id=p_subcategory_id;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'reporting_form_schema.publish','subcategory',p_subcategory_id,
    jsonb_build_object('schema_id',v_draft.id,'version',v_draft.version,
      'field_count',jsonb_array_length(v_fields),'timestamp',clock_timestamp()));

  return jsonb_build_object(
    'success',true,'schemaId',v_draft.id,'version',v_draft.version,'status','published'
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_publish_reporting_form(p_subcategory_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_reporting_form(p_subcategory_id text) TO authenticated;

-- public.admin_publish_response(p_response_id text)
CREATE OR REPLACE FUNCTION public.admin_publish_response(p_response_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_trimmed_id text;
    v_response record;
    v_now timestamptz := clock_timestamp();
BEGIN
    -- Authorization
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.publish') THEN
        RAISE EXCEPTION 'Access denied. Missing responses.publish permission.'
            USING ERRCODE = '42501';
    END IF;


    -- Input validation
    v_trimmed_id := NULLIF(btrim(p_response_id), '');

    IF v_trimmed_id IS NULL THEN
        RAISE EXCEPTION 'Invalid input: response ID cannot be empty.'
            USING ERRCODE = '22023';
    END IF;


    -- Lock target row
    SELECT
        id,
        status,
        published_at
    INTO v_response
    FROM public.complaint_responses
    WHERE id::text = v_trimmed_id
    FOR UPDATE;


    IF NOT FOUND THEN
        RAISE EXCEPTION 'Response not found: %', v_trimmed_id
            USING ERRCODE = 'P0002';
    END IF;


    -- Strict lifecycle:
    -- pending_review -> published
    IF v_response.status <> 'pending_review' THEN
        RAISE EXCEPTION
            'Cannot publish response with status "%". Only "pending_review" responses can be published.',
            v_response.status
            USING ERRCODE = '22023';
    END IF;


    UPDATE public.complaint_responses
    SET
        status = 'published',
        published_at = v_now,
        updated_at = v_now
    WHERE id = v_response.id;


    -- Administrative audit trail
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details
    )
    VALUES (
        auth.uid(),
        'response.publish',
        'response',
        v_trimmed_id,
        jsonb_build_object(
            'previous_status', v_response.status,
            'new_status', 'published',
            'timestamp', v_now
        )
    );


    RETURN jsonb_build_object(
        'success', true,
        'response_id', v_trimmed_id,
        'previous_status', v_response.status,
        'status', 'published',
        'updated_at', v_now,
        'published_at', v_now
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_publish_response(p_response_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_response(p_response_id text) TO authenticated;

-- public.admin_publish_taxonomy_item(p_item_type text, p_item_id text)
CREATE OR REPLACE FUNCTION public.admin_publish_taxonomy_item(p_item_type text, p_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_type text := lower(nullif(btrim(p_item_type),''));
  v_banner public.site_banners%rowtype;
  v_sub public.subcategories%rowtype;
begin
  if not public.is_active_admin() or not public.has_permission('categories.manage') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  if v_type='segment' then
    if not exists(
      select 1 from public.segments
      where id=p_item_id
        and nullif(btrim(name_en),'') is not null
        and nullif(btrim(name_bn),'') is not null
        and nullif(btrim(description_en),'') is not null
        and nullif(btrim(description_bn),'') is not null
        and nullif(btrim(slug),'') is not null
    ) then
      raise exception 'Category details are incomplete. Add bilingual descriptions before publishing.'
        using errcode='22023';
    end if;

    select * into v_banner from public.site_banners where category_key=p_item_id for update;
    if v_banner.category_key is null then
      raise exception 'Configure this category banner before publishing.' using errcode='22023';
    end if;

    if nullif(btrim(v_banner.draft_content->>'illustrationSrc'),'') is null
       or nullif(btrim(v_banner.draft_content->>'mobileDescriptionEn'),'') is null
       or nullif(btrim(v_banner.draft_content->>'mobileDescriptionBn'),'') is null
       or nullif(btrim(v_banner.draft_content->>'desktopDescriptionEn'),'') is null
       or nullif(btrim(v_banner.draft_content->>'desktopDescriptionBn'),'') is null then
      raise exception 'Banner draft is incomplete. Add an image and bilingual descriptions before publishing.'
        using errcode='22023';
    end if;

    update public.site_banners
    set published_content=draft_content,published_at=now(),published_by=auth.uid(),version=version+1
    where category_key=p_item_id;

    update public.segments
    set config_status='published',active=true
    where id=p_item_id;

    if not found then raise exception 'Category not found.' using errcode='P0002'; end if;
  elsif v_type='subcategory' then
    select * into v_sub from public.subcategories where id=p_item_id for update;
    if v_sub.id is null then raise exception 'Subcategory not found.' using errcode='P0002'; end if;

    if not exists(
      select 1 from public.segments
      where id=v_sub.segment_id and config_status='published' and active=true
    ) then
      raise exception 'Parent category must be published and active first.' using errcode='22023';
    end if;

    if not exists(
      select 1 from public.reporting_form_schemas
      where scope_type='subcategory' and scope_id=p_item_id
        and status='published' and engine_mode in ('legacy','schema')
    ) then
      raise exception 'Publish a reporting form before publishing this subcategory.' using errcode='22023';
    end if;

    update public.subcategories
    set config_status='published',active=true
    where id=p_item_id;
  else
    raise exception 'Invalid taxonomy item type.' using errcode='22023';
  end if;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'taxonomy.publish',v_type,p_item_id,
    jsonb_build_object('timestamp',clock_timestamp()));

  return jsonb_build_object('success',true,'itemType',v_type,'id',p_item_id,'active',true,'configStatus','published');
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_publish_taxonomy_item(p_item_type text, p_item_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_taxonomy_item(p_item_type text, p_item_id text) TO authenticated;

-- public.admin_reject_complaint(p_complaint_id text, p_reason_code text, p_note text)
CREATE OR REPLACE FUNCTION public.admin_reject_complaint(p_complaint_id text, p_reason_code text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_complaint record;
    v_note_text text;
    v_audit_id uuid;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION
          'Access denied. Active administrative session required.'
          USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('complaints.reject') THEN
        RAISE EXCEPTION
          'Access denied. You do not have permission to reject complaints.'
          USING ERRCODE = '42501';
    END IF;

    IF p_reason_code IS NULL OR length(trim(p_reason_code)) = 0 THEN
        RAISE EXCEPTION 'Rejection reason code is required'
            USING ERRCODE = '22000';
    END IF;

    SELECT id, status
    INTO v_complaint
    FROM public.complaints
    WHERE id = p_complaint_id
    FOR UPDATE;

    IF v_complaint.id IS NULL THEN
        RAISE EXCEPTION 'Complaint with ID % not found', p_complaint_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_complaint.status IS NULL
       OR v_complaint.status <> 'submitted' THEN
        RAISE EXCEPTION
          'Cannot reject complaint with status "%". Only "submitted" complaints can be rejected.',
          COALESCE(v_complaint.status, 'null')
          USING ERRCODE = '22023';
    END IF;

    UPDATE public.complaints
    SET status = 'rejected',
        updated_at = now()
    WHERE id = v_complaint.id;

    v_note_text :=
      COALESCE(
        NULLIF(TRIM(p_note), ''),
        NULLIF(TRIM(p_reason_code), ''),
        'Rejected by administrator'
      );

    INSERT INTO public.complaint_updates (
        complaint_id, update_type, note, is_public, created_at
    ) VALUES (
        v_complaint.id,
        'rejected',
        v_note_text,
        false,
        now()
    );

    INSERT INTO public.admin_audit_logs (
        actor_id, action, target_type, target_id, details
    ) VALUES (
        auth.uid(),
        'complaint.reject',
        'complaint',
        p_complaint_id,
        jsonb_build_object(
          'previous_status', v_complaint.status,
          'new_status', 'rejected',
          'reason_code', p_reason_code,
          'note', p_note,
          'timestamp', now()
        )
    )
    RETURNING id INTO v_audit_id;

    PERFORM public.admin_emit_notification(
        p_event_key := 'complaint.rejected',
        p_title_en := 'Complaint rejected: ' || p_complaint_id,
        p_title_bn := 'অভিযোগ প্রত্যাখ্যান করা হয়েছে: ' || p_complaint_id,
        p_body_en :=
          'Complaint ' || p_complaint_id ||
          ' was rejected. Reason: ' || p_reason_code,
        p_body_bn :=
          'অভিযোগ ' || p_complaint_id ||
          ' প্রত্যাখ্যান করা হয়েছে। কারণ: ' || p_reason_code,
        p_actor_user_id := auth.uid(),
        p_target_type := 'complaint',
        p_target_id := p_complaint_id,
        p_target_label := p_complaint_id,
        p_metadata := jsonb_build_object(
            'complaint_id', p_complaint_id,
            'previous_status', v_complaint.status,
            'new_status', 'rejected',
            'reason_code', p_reason_code,
            'note', p_note,
            'actor_user_id', auth.uid(),
            'timestamp', now()
        ),
        p_required_all_permissions := ARRAY['complaints.view'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/complaints/' || p_complaint_id,
        p_dedupe_key :=
          'complaint.rejected:oversight:' || v_audit_id::text,
        p_exclude_actor := true,
        p_include_super_admin := true
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', p_complaint_id,
        'status', 'rejected',
        'previous_status', v_complaint.status
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_reject_complaint(p_complaint_id text, p_reason_code text, p_note text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_complaint(p_complaint_id text, p_reason_code text, p_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_complaint(p_complaint_id text, p_reason_code text, p_note text) TO service_role;

-- public.admin_reject_response(p_response_id text, p_note text)
CREATE OR REPLACE FUNCTION public.admin_reject_response(p_response_id text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_trimmed_id text;
    v_normalized_note text;
    v_response record;
    v_now timestamptz := clock_timestamp();
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.reject') THEN
        RAISE EXCEPTION 'Access denied. Missing responses.reject permission.'
            USING ERRCODE = '42501';
    END IF;

    v_trimmed_id := NULLIF(btrim(p_response_id), '');
    IF v_trimmed_id IS NULL THEN
        RAISE EXCEPTION 'Invalid input: response ID cannot be empty.'
            USING ERRCODE = '22023';
    END IF;

    v_normalized_note := NULLIF(btrim(p_note), '');

    SELECT id, status
      INTO v_response
      FROM public.complaint_responses
     WHERE id::text = v_trimmed_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Response not found: %', v_trimmed_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_response.status <> 'pending_review' THEN
        RAISE EXCEPTION
            'Cannot reject response with status "%". Only "pending_review" responses can be rejected.',
            v_response.status
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.complaint_responses
       SET status = 'rejected',
           rejection_note = v_normalized_note,
           updated_at = v_now
     WHERE id = v_response.id;

    INSERT INTO public.admin_audit_logs (
        actor_id, action, target_type, target_id, details
    ) VALUES (
        auth.uid(),
        'response.reject',
        'response',
        v_trimmed_id,
        jsonb_build_object(
            'previous_status', v_response.status,
            'new_status', 'rejected',
            'note', v_normalized_note,
            'timestamp', v_now
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'response_id', v_trimmed_id,
        'previous_status', v_response.status,
        'status', 'rejected',
        'updated_at', v_now
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_reject_response(p_response_id text, p_note text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_response(p_response_id text, p_note text) TO authenticated;

-- public.admin_replace_role_permissions(p_role_id text, p_permission_ids text[])
CREATE OR REPLACE FUNCTION public.admin_replace_role_permissions(p_role_id text, p_permission_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_clean_role_id TEXT;
    v_role_name_en TEXT;
    v_role_name_bn TEXT;
    v_is_system BOOLEAN;
    v_existing_perms TEXT[];
    v_invalid_perms TEXT[];
    v_deduped_perms TEXT[];
    v_added_perms TEXT[] := '{}';
    v_removed_perms TEXT[] := '{}';
    v_perm_id TEXT;
    v_updated_at TIMESTAMPTZ;
    v_new_count INTEGER;
    v_audit_id UUID;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION
          'Access denied. Active administrator session required.'
          USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('roles.manage') THEN
        RAISE EXCEPTION
          'Access denied. Permission roles.manage required.'
          USING ERRCODE = '42501';
    END IF;

    v_clean_role_id :=
      trim(p_role_id);

    IF v_clean_role_id IS NULL
       OR length(v_clean_role_id) = 0 THEN
        RAISE EXCEPTION
          'Role identifier cannot be empty.'
          USING ERRCODE = '22000';
    END IF;

    SELECT
      is_system,
      name_en,
      name_bn
    INTO
      v_is_system,
      v_role_name_en,
      v_role_name_bn
    FROM public.roles
    WHERE id = v_clean_role_id;

    IF v_is_system IS NULL THEN
        RAISE EXCEPTION
          'Role % does not exist.',
          v_clean_role_id
          USING ERRCODE = 'P0002';
    END IF;

    IF v_is_system IS TRUE THEN
        RAISE EXCEPTION
          'Permissions of system roles cannot be modified.'
          USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_manage_role_scope(
      v_clean_role_id
    ) THEN
        RAISE EXCEPTION
          'Access denied. You cannot modify a role containing permissions that you do not possess.'
          USING ERRCODE = '42501';
    END IF;

    SELECT ARRAY(
        SELECT permission_id
        FROM public.role_permissions
        WHERE role_id = v_clean_role_id
    )
    INTO v_existing_perms;

    IF p_permission_ids IS NOT NULL
       AND cardinality(p_permission_ids) > 0 THEN

        SELECT ARRAY(
            SELECT unnest(p_permission_ids)
            EXCEPT
            SELECT id
            FROM public.permissions
        )
        INTO v_invalid_perms;

        IF cardinality(v_invalid_perms) > 0 THEN
            RAISE EXCEPTION
              'Invalid permission ID(s) provided: %',
              array_to_string(
                v_invalid_perms,
                ', '
              )
              USING ERRCODE = '22000';
        END IF;

        SELECT ARRAY(
            SELECT DISTINCT
              unnest(p_permission_ids)
        )
        INTO v_deduped_perms;

    ELSE
        v_deduped_perms :=
          ARRAY[]::TEXT[];
    END IF;

    IF NOT public.can_delegate_permission_set(
      v_deduped_perms
    ) THEN
        RAISE EXCEPTION
          'Access denied. You cannot grant permissions that you do not possess.'
          USING ERRCODE = '42501';
    END IF;

    SELECT ARRAY(
      SELECT unnest(v_deduped_perms)
      EXCEPT
      SELECT unnest(v_existing_perms)
    )
    INTO v_added_perms;

    SELECT ARRAY(
      SELECT unnest(v_existing_perms)
      EXCEPT
      SELECT unnest(v_deduped_perms)
    )
    INTO v_removed_perms;

    DELETE FROM public.role_permissions
    WHERE role_id = v_clean_role_id;

    IF cardinality(v_deduped_perms) > 0 THEN
        FOREACH v_perm_id
        IN ARRAY v_deduped_perms
        LOOP
            INSERT INTO public.role_permissions (
              role_id,
              permission_id,
              created_at
            )
            VALUES (
              v_clean_role_id,
              v_perm_id,
              clock_timestamp()
            );
        END LOOP;
    END IF;

    v_updated_at :=
      clock_timestamp();

    UPDATE public.roles
    SET updated_at = v_updated_at
    WHERE id = v_clean_role_id;

    v_new_count :=
      cardinality(v_deduped_perms);

    IF EXISTS (
      SELECT 1
      FROM public.user_roles
    ) THEN
        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION
              'Cannot remove roles.manage from this role because doing so would leave no active administrators capable of managing roles.'
              USING ERRCODE = '23514';
        END IF;
    END IF;

    v_audit_id :=
      public.log_role_audit_event(
        'ROLE_PERMISSIONS_REPLACED',
        v_clean_role_id,
        jsonb_build_object(
            'permission_ids',
              to_jsonb(v_deduped_perms),
            'permission_count',
              v_new_count,
            'added_count',
              cardinality(v_added_perms),
            'removed_count',
              cardinality(v_removed_perms)
        )
      );

    IF cardinality(v_added_perms) > 0
       OR cardinality(v_removed_perms) > 0 THEN

        PERFORM public.admin_emit_notification(
            p_event_key :=
              'role.permissions_changed',
            p_title_en :=
              'Role permissions updated: ' ||
              COALESCE(
                v_role_name_en,
                v_clean_role_id
              ),
            p_title_bn :=
              'ভূমিকার অনুমতি পরিবর্তন করা হয়েছে: ' ||
              COALESCE(
                v_role_name_bn,
                v_role_name_en,
                v_clean_role_id
              ),
            p_body_en :=
              'Permissions for role ' ||
              COALESCE(
                v_role_name_en,
                v_clean_role_id
              ) ||
              ' were modified (' ||
              cardinality(v_added_perms)::text ||
              ' added, ' ||
              cardinality(v_removed_perms)::text ||
              ' removed).',
            p_body_bn :=
              'ভূমিকা ' ||
              COALESCE(
                v_role_name_bn,
                v_role_name_en,
                v_clean_role_id
              ) ||
              '-এর অনুমতি পরিবর্তন করা হয়েছে (' ||
              cardinality(v_added_perms)::text ||
              'টি যোগ, ' ||
              cardinality(v_removed_perms)::text ||
              'টি অপসারিত)।',
            p_actor_user_id :=
              auth.uid(),
            p_target_type :=
              'role',
            p_target_id :=
              v_clean_role_id,
            p_target_label :=
              COALESCE(
                v_role_name_en,
                v_clean_role_id
              ),
            p_metadata :=
              jsonb_build_object(
                'role_id',
                  v_clean_role_id,
                'added_permissions',
                  to_jsonb(v_added_perms),
                'removed_permissions',
                  to_jsonb(v_removed_perms),
                'new_permission_count',
                  v_new_count,
                'actor_user_id',
                  auth.uid(),
                'timestamp',
                  now()
              ),
            p_required_all_permissions :=
              ARRAY['roles.manage'],
            p_required_any_permissions :=
              '{}'::text[],
            p_audience_mode :=
              'permission',
            p_route :=
              '/roles/' ||
              v_clean_role_id,
            p_dedupe_key :=
              'role.permissions_changed:oversight:' ||
              v_audit_id::text,
            p_exclude_actor :=
              true,
            p_include_super_admin :=
              true
        );
    END IF;

    RETURN jsonb_build_object(
        'role_id',
          v_clean_role_id,
        'permission_ids',
          to_jsonb(v_deduped_perms),
        'permission_count',
          v_new_count,
        'updated_at',
          v_updated_at
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_replace_role_permissions(p_role_id text, p_permission_ids text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_replace_role_permissions(p_role_id text, p_permission_ids text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replace_role_permissions(p_role_id text, p_permission_ids text[]) TO service_role;

-- public.admin_resubmit_response(p_response_id text)
CREATE OR REPLACE FUNCTION public.admin_resubmit_response(p_response_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_trimmed_id text;
    v_response record;
    v_now timestamptz := clock_timestamp();
BEGIN
    -- Active admin required
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    -- Exact permission required
    IF NOT public.has_permission('responses.resubmit') THEN
        RAISE EXCEPTION 'Access denied. Missing responses.resubmit permission.'
            USING ERRCODE = '42501';
    END IF;

    -- Validate input
    v_trimmed_id := NULLIF(btrim(p_response_id), '');

    IF v_trimmed_id IS NULL THEN
        RAISE EXCEPTION 'Invalid input: response ID cannot be empty.'
            USING ERRCODE = '22023';
    END IF;

    -- Lock existing response
    SELECT
        id,
        status,
        published_at
    INTO v_response
    FROM public.complaint_responses
    WHERE id::text = v_trimmed_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Response not found: %', v_trimmed_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Only rejected -> pending_review
    IF v_response.status <> 'rejected' THEN
        RAISE EXCEPTION
            'Cannot resubmit response with status "%". Only "rejected" responses can be resubmitted.',
            v_response.status
            USING ERRCODE = '22023';
    END IF;

    -- Reuse same row and same Response ID
    UPDATE public.complaint_responses
    SET
        status = 'pending_review',
        updated_at = v_now
    WHERE id = v_response.id;

    -- Audit
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details
    )
    VALUES (
        auth.uid(),
        'response.resubmit',
        'response',
        v_trimmed_id,
        jsonb_build_object(
            'previous_status', v_response.status,
            'new_status', 'pending_review',
            'timestamp', v_now
        )
    );

    -- Canonical moderation result
    RETURN jsonb_build_object(
        'success', true,
        'response_id', v_trimmed_id,
        'previous_status', v_response.status,
        'status', 'pending_review',
        'updated_at', v_now,
        'published_at', v_response.published_at
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_resubmit_response(p_response_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resubmit_response(p_response_id text) TO authenticated;

-- public.admin_save_publication_draft(p_complaint_id text, p_public_title_bn text, p_public_title_en text, p_public_summary_bn text, p_public_summary_en text)
CREATE OR REPLACE FUNCTION public.admin_save_publication_draft(p_complaint_id text, p_public_title_bn text DEFAULT NULL::text, p_public_title_en text DEFAULT NULL::text, p_public_summary_bn text DEFAULT NULL::text, p_public_summary_en text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_complaint public.complaints%ROWTYPE;
  v_preferences jsonb;
  v_title_bn text;
  v_title_en text;
  v_summary_bn text;
  v_summary_en text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission('complaints.publish') THEN
    RAISE EXCEPTION 'Access denied. You do not have permission to prepare public complaint content.' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_complaint
    FROM public.complaints
   WHERE id = NULLIF(btrim(p_complaint_id), '')
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint with ID % not found.', p_complaint_id USING ERRCODE = 'P0002';
  END IF;

  IF v_complaint.status NOT IN ('submitted', 'unpublished') THEN
    RAISE EXCEPTION
      'Cannot prepare publication content for complaint with status "%". Only submitted or unpublished complaints can be prepared.',
      COALESCE(v_complaint.status, 'null')
      USING ERRCODE = '22023';
  END IF;

  v_title_bn := NULLIF(btrim(p_public_title_bn), '');
  v_title_en := NULLIF(btrim(p_public_title_en), '');
  v_summary_bn := NULLIF(btrim(p_public_summary_bn), '');
  v_summary_en := NULLIF(btrim(p_public_summary_en), '');

  IF v_title_bn IS NULL AND v_title_en IS NULL THEN
    RAISE EXCEPTION 'At least one public headline is required.' USING ERRCODE = '22023';
  END IF;

  v_preferences := COALESCE(v_complaint.publication_preferences, '{}'::jsonb)
    - 'publicTitleBn'
    - 'publicTitleEn'
    - 'publicSummaryBn'
    - 'publicSummaryEn';

  v_preferences := v_preferences || jsonb_strip_nulls(
    jsonb_build_object(
      'publicTitleBn', v_title_bn,
      'publicTitleEn', v_title_en,
      'publicSummaryBn', v_summary_bn,
      'publicSummaryEn', v_summary_en
    )
  );

  UPDATE public.complaints
     SET publication_preferences = v_preferences,
         updated_at = now()
   WHERE id = v_complaint.id;

  INSERT INTO public.admin_audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    details,
    created_at
  ) VALUES (
    auth.uid(),
    'complaint.publication_draft.save',
    'complaint',
    v_complaint.id,
    jsonb_build_object(
      'status_preserved', v_complaint.status,
      'public_title_bn', v_title_bn,
      'public_title_en', v_title_en,
      'has_public_summary_bn', v_summary_bn IS NOT NULL,
      'has_public_summary_en', v_summary_en IS NOT NULL,
      'raw_title_preserved', true,
      'raw_description_preserved', true
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'complaint_id', v_complaint.id,
    'status', v_complaint.status,
    'message', 'Public presentation draft saved.'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_save_publication_draft(p_complaint_id text, p_public_title_bn text, p_public_title_en text, p_public_summary_bn text, p_public_summary_en text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_publication_draft(p_complaint_id text, p_public_title_bn text, p_public_title_en text, p_public_summary_bn text, p_public_summary_en text) TO authenticated;

-- public.admin_save_reporting_form_draft(p_subcategory_id text, p_fields jsonb, p_notes text)
CREATE OR REPLACE FUNCTION public.admin_save_reporting_form_draft(p_subcategory_id text, p_fields jsonb, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_schema public.reporting_form_schemas%rowtype;
  v_source public.reporting_form_schemas%rowtype;
  v_field jsonb;
begin
  if not public.is_active_admin() or not public.has_permission('categories.manage') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  if not exists(select 1 from public.subcategories where id=p_subcategory_id) then
    raise exception 'Subcategory not found.' using errcode='P0002';
  end if;

  perform public.validate_reporting_form_fields(p_fields);

  select * into v_schema
  from public.reporting_form_schemas
  where scope_type='subcategory' and scope_id=p_subcategory_id and status='draft'
  order by version desc limit 1
  for update;

  if v_schema.id is null then
    select * into v_source
    from public.reporting_form_schemas
    where scope_type='subcategory' and scope_id=p_subcategory_id
    order by version desc limit 1;

    insert into public.reporting_form_schemas(
      scope_type,scope_id,version,status,engine_mode,notes,created_by
    )
    values(
      'subcategory',p_subcategory_id,coalesce(v_source.version,0)+1,'draft','schema',
      coalesce(p_notes,'Admin form-builder draft. Not visible to Public.'),auth.uid()
    )
    returning * into v_schema;
  else
    update public.reporting_form_schemas
    set engine_mode='schema',notes=coalesce(p_notes,notes),updated_at=now()
    where id=v_schema.id
    returning * into v_schema;
  end if;

  delete from public.reporting_form_schema_fields where schema_id=v_schema.id;

  for v_field in select * from jsonb_array_elements(p_fields)
  loop
    insert into public.reporting_form_schema_fields(
      schema_id,field_key,field_type,storage_mode,storage_key,
      label_en,label_bn,helper_en,helper_bn,placeholder_en,placeholder_bn,
      required,active,sort_order,options,validation,config
    )
    values(
      v_schema.id,
      lower(btrim(v_field->>'fieldKey')),
      lower(btrim(v_field->>'fieldType')),
      lower(btrim(v_field->>'storageMode')),
      btrim(v_field->>'storageKey'),
      btrim(v_field->>'labelEn'),
      btrim(v_field->>'labelBn'),
      nullif(btrim(v_field->>'helperEn'),''),
      nullif(btrim(v_field->>'helperBn'),''),
      nullif(btrim(v_field->>'placeholderEn'),''),
      nullif(btrim(v_field->>'placeholderBn'),''),
      coalesce((v_field->>'required')::boolean,false),
      coalesce((v_field->>'active')::boolean,true),
      (v_field->>'sortOrder')::integer,
      coalesce(v_field->'options','[]'::jsonb),
      coalesce(v_field->'validation','{}'::jsonb),
      coalesce(v_field->'config','{}'::jsonb)
    );
  end loop;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'reporting_form_schema.draft_save','subcategory',p_subcategory_id,
    jsonb_build_object('schema_id',v_schema.id,'version',v_schema.version,
      'field_count',jsonb_array_length(p_fields),'timestamp',clock_timestamp()));

  return jsonb_build_object(
    'success',true,'schemaId',v_schema.id,'version',v_schema.version,
    'fieldCount',jsonb_array_length(p_fields),'status','draft'
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_save_reporting_form_draft(p_subcategory_id text, p_fields jsonb, p_notes text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_reporting_form_draft(p_subcategory_id text, p_fields jsonb, p_notes text) TO authenticated;

-- public.admin_set_news_intake_auto_update(p_enabled boolean)
CREATE OR REPLACE FUNCTION public.admin_set_news_intake_auto_update(p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_previous boolean;
  v_row public.news_intake_automation_settings%rowtype;
begin
  if not public.is_active_admin() or not public.has_permission('complaints.publish') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select enabled into v_previous
  from public.news_intake_automation_settings
  where singleton=true
  for update;

  update public.news_intake_automation_settings
  set enabled=p_enabled,
      next_auto_due_at=case
        when p_enabled=true and coalesce(v_previous,false)=false then now()+interval '36 hours'
        when p_enabled=true then next_auto_due_at
        else null
      end,
      updated_at=now()
  where singleton=true
  returning * into v_row;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'news_intake.auto_update_change','news_intake_automation','singleton',
    jsonb_build_object(
      'enabled',p_enabled,
      'interval_hours',36,
      'next_auto_due_at',v_row.next_auto_due_at,
      'timestamp',clock_timestamp()
    ));

  return jsonb_build_object(
    'enabled',v_row.enabled,
    'intervalHours',v_row.interval_hours,
    'lastAutoDispatchedAt',v_row.last_auto_dispatched_at,
    'nextAutoDueAt',v_row.next_auto_due_at
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_set_news_intake_auto_update(p_enabled boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_news_intake_auto_update(p_enabled boolean) TO authenticated;

-- public.admin_unpublish_complaint(p_complaint_id text, p_reason text)
CREATE OR REPLACE FUNCTION public.admin_unpublish_complaint(p_complaint_id text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_complaint record;
    v_note_text text;
    v_audit_id uuid;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION
          'Access denied. Active administrative session required.'
          USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('complaints.unpublish') THEN
        RAISE EXCEPTION
          'Access denied. You do not have permission to unpublish complaints.'
          USING ERRCODE = '42501';
    END IF;

    SELECT id, status
    INTO v_complaint
    FROM public.complaints
    WHERE id = p_complaint_id
    FOR UPDATE;

    IF v_complaint.id IS NULL THEN
        RAISE EXCEPTION 'Complaint with ID % not found', p_complaint_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_complaint.status IS NULL
       OR v_complaint.status <> 'published' THEN
        RAISE EXCEPTION
          'Cannot unpublish complaint with status "%". Only "published" complaints can be unpublished.',
          COALESCE(v_complaint.status, 'null')
          USING ERRCODE = '22023';
    END IF;

    UPDATE public.complaints
    SET status = 'unpublished',
        updated_at = now()
    WHERE id = v_complaint.id;

    v_note_text :=
      COALESCE(
        NULLIF(TRIM(p_reason), ''),
        'Complaint unpublished from public feed.'
      );

    INSERT INTO public.complaint_updates (
        complaint_id, update_type, note, is_public, created_at
    ) VALUES (
        v_complaint.id,
        'unpublished',
        v_note_text,
        false,
        now()
    );

    INSERT INTO public.admin_audit_logs (
        actor_id, action, target_type, target_id, details
    ) VALUES (
        auth.uid(),
        'complaint.unpublish',
        'complaint',
        p_complaint_id,
        jsonb_build_object(
          'previous_status', v_complaint.status,
          'new_status', 'unpublished',
          'reason', p_reason,
          'timestamp', now()
        )
    )
    RETURNING id INTO v_audit_id;

    PERFORM public.admin_emit_notification(
        p_event_key := 'complaint.unpublished',
        p_title_en := 'Complaint unpublished: ' || p_complaint_id,
        p_title_bn := 'অভিযোগ অপ্রকাশিত করা হয়েছে: ' || p_complaint_id,
        p_body_en :=
          'Complaint ' || p_complaint_id ||
          ' was removed from public feed.' ||
          CASE
            WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0
            THEN ' Reason: ' || trim(p_reason)
            ELSE ''
          END,
        p_body_bn :=
          'অভিযোগ ' || p_complaint_id ||
          ' পাবলিক ফিড থেকে প্রত্যাহার করা হয়েছে।' ||
          CASE
            WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0
            THEN ' কারণ: ' || trim(p_reason)
            ELSE ''
          END,
        p_actor_user_id := auth.uid(),
        p_target_type := 'complaint',
        p_target_id := p_complaint_id,
        p_target_label := p_complaint_id,
        p_metadata := jsonb_build_object(
            'complaint_id', p_complaint_id,
            'previous_status', v_complaint.status,
            'new_status', 'unpublished',
            'reason', p_reason,
            'actor_user_id', auth.uid(),
            'timestamp', now()
        ),
        p_required_all_permissions := ARRAY['complaints.view'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/complaints/' || p_complaint_id,
        p_dedupe_key :=
          'complaint.unpublished:oversight:' || v_audit_id::text,
        p_exclude_actor := true,
        p_include_super_admin := true
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', p_complaint_id,
        'status', 'unpublished',
        'previous_status', v_complaint.status
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_unpublish_complaint(p_complaint_id text, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_unpublish_complaint(p_complaint_id text, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unpublish_complaint(p_complaint_id text, p_reason text) TO service_role;

-- public.admin_unpublish_response(p_response_id text, p_reason text)
CREATE OR REPLACE FUNCTION public.admin_unpublish_response(p_response_id text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_trimmed_id text;
    v_normalized_reason text;
    v_response record;
    v_now timestamptz := clock_timestamp();
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.unpublish') THEN
        RAISE EXCEPTION 'Access denied. Missing responses.unpublish permission.'
            USING ERRCODE = '42501';
    END IF;

    v_trimmed_id := NULLIF(btrim(p_response_id), '');
    IF v_trimmed_id IS NULL THEN
        RAISE EXCEPTION 'Invalid input: response ID cannot be empty.'
            USING ERRCODE = '22023';
    END IF;

    v_normalized_reason := NULLIF(btrim(p_reason), '');

    SELECT id, status, published_at
      INTO v_response
      FROM public.complaint_responses
     WHERE id::text = v_trimmed_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Response not found: %', v_trimmed_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_response.status <> 'published' THEN
        RAISE EXCEPTION
            'Cannot unpublish response with status "%". Only "published" responses can be unpublished.',
            v_response.status
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.complaint_responses
       SET status = 'unpublished',
           unpublish_reason = v_normalized_reason,
           updated_at = v_now
     WHERE id = v_response.id;

    INSERT INTO public.admin_audit_logs (
        actor_id, action, target_type, target_id, details
    ) VALUES (
        auth.uid(),
        'response.unpublish',
        'response',
        v_trimmed_id,
        jsonb_build_object(
            'previous_status', v_response.status,
            'new_status', 'unpublished',
            'reason', v_normalized_reason,
            'timestamp', v_now
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'response_id', v_trimmed_id,
        'previous_status', v_response.status,
        'status', 'unpublished',
        'updated_at', v_now,
        'published_at', v_response.published_at
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_unpublish_response(p_response_id text, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_unpublish_response(p_response_id text, p_reason text) TO authenticated;

-- public.admin_update_role(p_role_id text, p_name_en text, p_name_bn text, p_active boolean, p_permission_ids text[], p_description text, p_update_description boolean, p_update_name_bn boolean)
CREATE OR REPLACE FUNCTION public.admin_update_role(p_role_id text, p_name_en text, p_name_bn text DEFAULT NULL::text, p_active boolean DEFAULT NULL::boolean, p_permission_ids text[] DEFAULT NULL::text[], p_description text DEFAULT NULL::text, p_update_description boolean DEFAULT NULL::boolean, p_update_name_bn boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_clean_id TEXT;
    v_clean_name_en TEXT;
    v_clean_name_bn TEXT;
    v_clean_desc TEXT;

    v_existing_role RECORD;
    v_updated_role RECORD;

    v_existing_perms TEXT[] := ARRAY[]::TEXT[];
    v_final_perms TEXT[] := ARRAY[]::TEXT[];
    v_distinct_perms TEXT[] := ARRAY[]::TEXT[];
    v_invalid_perms TEXT[] := ARRAY[]::TEXT[];

    v_added_perms TEXT[] := ARRAY[]::TEXT[];
    v_removed_perms TEXT[] := ARRAY[]::TEXT[];

    v_perm_id TEXT;
    v_user_count INT;

    v_meta_changed BOOLEAN := FALSE;
    v_perms_changed BOOLEAN := FALSE;

    v_audit_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtext('sobaike_role_management_mutation_lock')
    );

    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION
          'Access denied. You do not have permission to update roles.'
          USING ERRCODE = '42501';
    END IF;

    v_clean_id := btrim(p_role_id);

    IF v_clean_id IS NULL OR v_clean_id = '' THEN
        RAISE EXCEPTION
          'Role ID is required.'
          USING ERRCODE = '22000';
    END IF;

    SELECT
        id,
        name_en,
        name_bn,
        description,
        active,
        is_system,
        created_at,
        updated_at
    INTO v_existing_role
    FROM public.roles
    WHERE id = v_clean_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
          'Role not found: %',
          v_clean_id
          USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.can_manage_role_scope(v_clean_id) THEN
        RAISE EXCEPTION
          'Access denied. You cannot modify a role containing permissions that you do not possess.'
          USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(
        array_agg(
            permission_id
            ORDER BY permission_id
        ),
        ARRAY[]::TEXT[]
    )
    INTO v_existing_perms
    FROM public.role_permissions
    WHERE role_id = v_clean_id;

    -- English name
    v_clean_name_en := btrim(p_name_en);

    IF v_clean_name_en IS NULL
       OR v_clean_name_en = '' THEN
        RAISE EXCEPTION
          'English role name is required and cannot be blank.'
          USING ERRCODE = '22000';
    END IF;

    -- Bengali name update semantics
    IF p_update_name_bn IS TRUE THEN

        v_clean_name_bn := btrim(p_name_bn);

        IF v_clean_name_bn = '' THEN
            v_clean_name_bn := NULL;
        END IF;

    ELSIF p_update_name_bn IS FALSE THEN

        v_clean_name_bn :=
            v_existing_role.name_bn;

    ELSE

        IF p_name_bn IS NOT NULL THEN
            v_clean_name_bn :=
                btrim(p_name_bn);

            IF v_clean_name_bn = '' THEN
                v_clean_name_bn := NULL;
            END IF;
        ELSE
            v_clean_name_bn :=
                v_existing_role.name_bn;
        END IF;

    END IF;

    -- Description update semantics
    IF p_update_description IS TRUE THEN

        v_clean_desc :=
            btrim(p_description);

        IF v_clean_desc = '' THEN
            v_clean_desc := NULL;
        END IF;

    ELSIF p_update_description IS FALSE THEN

        v_clean_desc :=
            v_existing_role.description;

    ELSE

        IF p_description IS NOT NULL THEN
            v_clean_desc :=
                btrim(p_description);

            IF v_clean_desc = '' THEN
                v_clean_desc := NULL;
            END IF;
        ELSE
            v_clean_desc :=
                v_existing_role.description;
        END IF;

    END IF;

    -- Preserve system-role protections
    IF v_existing_role.is_system IS TRUE THEN

        IF p_active IS NOT NULL
           AND p_active IS FALSE THEN
            RAISE EXCEPTION
              'System roles cannot be deactivated.'
              USING ERRCODE = '42501';
        END IF;

        IF p_permission_ids IS NOT NULL THEN
            RAISE EXCEPTION
              'Permissions of system roles cannot be modified.'
              USING ERRCODE = '42501';
        END IF;

        IF v_clean_name_en
           <> v_existing_role.name_en THEN
            RAISE EXCEPTION
              'English name of system roles cannot be modified.'
              USING ERRCODE = '42501';
        END IF;

        IF v_clean_name_bn
           IS DISTINCT FROM
           v_existing_role.name_bn THEN
            RAISE EXCEPTION
              'Bengali name of system roles cannot be modified.'
              USING ERRCODE = '42501';
        END IF;

    END IF;

    -- Duplicate English role name protection
    IF EXISTS (
        SELECT 1
        FROM public.roles
        WHERE id <> v_clean_id
          AND lower(name_en) =
              lower(v_clean_name_en)
    ) THEN
        RAISE EXCEPTION
          'Another role with this English name already exists.'
          USING ERRCODE = '23505';
    END IF;

    -- Determine metadata change
    v_meta_changed :=
        v_clean_name_en
            IS DISTINCT FROM
            v_existing_role.name_en

        OR v_clean_name_bn
            IS DISTINCT FROM
            v_existing_role.name_bn

        OR v_clean_desc
            IS DISTINCT FROM
            v_existing_role.description

        OR (
            p_active IS NOT NULL
            AND p_active
                IS DISTINCT FROM
                v_existing_role.active
        );

    -- Permission validation + semantic comparison
    IF p_permission_ids IS NOT NULL
       AND v_existing_role.is_system IS NOT TRUE THEN

        IF cardinality(p_permission_ids) > 0 THEN

            SELECT ARRAY(
                SELECT unnest(p_permission_ids)

                EXCEPT

                SELECT id
                FROM public.permissions
            )
            INTO v_invalid_perms;

            IF cardinality(v_invalid_perms) > 0 THEN
                RAISE EXCEPTION
                  'Invalid permission ID(s) provided: %',
                  array_to_string(
                      v_invalid_perms,
                      ', '
                  )
                  USING ERRCODE = '22000';
            END IF;

            SELECT ARRAY(
                SELECT DISTINCT permission_id
                FROM unnest(
                    p_permission_ids
                ) AS permission_id
                ORDER BY permission_id
            )
            INTO v_distinct_perms;

        ELSE
            v_distinct_perms :=
                ARRAY[]::TEXT[];
        END IF;

        IF NOT public.can_delegate_permission_set(
            v_distinct_perms
        ) THEN
            RAISE EXCEPTION
              'Access denied. You cannot grant permissions that you do not possess.'
              USING ERRCODE = '42501';
        END IF;

        SELECT ARRAY(
            SELECT x
            FROM unnest(v_distinct_perms) AS x

            EXCEPT

            SELECT x
            FROM unnest(v_existing_perms) AS x

            ORDER BY 1
        )
        INTO v_added_perms;

        SELECT ARRAY(
            SELECT x
            FROM unnest(v_existing_perms) AS x

            EXCEPT

            SELECT x
            FROM unnest(v_distinct_perms) AS x

            ORDER BY 1
        )
        INTO v_removed_perms;

        v_perms_changed :=
            cardinality(v_added_perms) > 0
            OR cardinality(v_removed_perms) > 0;

        v_final_perms :=
            v_distinct_perms;

    ELSE
        v_final_perms :=
            v_existing_perms;
    END IF;

    -- Existing role update behavior
    UPDATE public.roles
    SET
        name_en =
            v_clean_name_en,

        name_bn =
            v_clean_name_bn,

        description =
            v_clean_desc,

        active =
            COALESCE(
                p_active,
                active
            ),

        updated_at =
            clock_timestamp()

    WHERE id = v_clean_id

    RETURNING *
    INTO v_updated_role;

    -- Preserve permission replacement behavior
    IF p_permission_ids IS NOT NULL
       AND v_existing_role.is_system IS NOT TRUE THEN

        DELETE FROM public.role_permissions
        WHERE role_id = v_clean_id;

        IF cardinality(v_distinct_perms) > 0 THEN

            FOREACH v_perm_id
            IN ARRAY v_distinct_perms
            LOOP

                INSERT INTO public.role_permissions (
                    role_id,
                    permission_id,
                    created_at
                )
                VALUES (
                    v_clean_id,
                    v_perm_id,
                    clock_timestamp()
                );

            END LOOP;

        END IF;
    END IF;

    -- Preserve resulting-state last-manager protection
    IF EXISTS (
        SELECT 1
        FROM public.user_roles
    ) THEN

        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION
              'Cannot update or deactivate this role because doing so would leave no active administrators capable of managing roles.'
              USING ERRCODE = '23514';
        END IF;

    END IF;

    SELECT COUNT(*)::INT
    INTO v_user_count
    FROM public.user_roles
    WHERE role_id = v_clean_id;

    -- Preserve ROLE_UPDATED audit event.
    -- Phase 2 helper now returns the audit UUID.
    v_audit_id :=
        public.log_role_audit_event(
            'ROLE_UPDATED',
            v_clean_id,
            jsonb_build_object(
                'name_en',
                    v_clean_name_en,

                'name_bn',
                    v_clean_name_bn,

                'active',
                    v_updated_role.active,

                'permission_ids',
                    to_jsonb(v_final_perms),

                'description',
                    v_clean_desc
            )
        );

    -- ============================================================
    -- Event 11: role.updated
    -- ============================================================

    IF v_meta_changed THEN

        PERFORM public.admin_emit_notification(
            p_event_key :=
                'role.updated',

            p_title_en :=
                'Role updated: ' ||
                v_clean_name_en,

            p_title_bn :=
                'ভূমিকার তথ্য পরিবর্তন করা হয়েছে: ' ||
                COALESCE(
                    v_clean_name_bn,
                    v_clean_name_en
                ),

            p_body_en :=
                'Role details for ' ||
                v_clean_name_en ||
                ' were updated.',

            p_body_bn :=
                'ভূমিকা ' ||
                COALESCE(
                    v_clean_name_bn,
                    v_clean_name_en
                ) ||
                '-এর বিবরণ আপডেট করা হয়েছে।',

            p_actor_user_id :=
                auth.uid(),

            p_target_type :=
                'role',

            p_target_id :=
                v_clean_id,

            p_target_label :=
                v_clean_name_en,

            p_metadata :=
                jsonb_build_object(
                    'role_id',
                        v_clean_id,

                    'before',
                        jsonb_build_object(
                            'name_en',
                                v_existing_role.name_en,

                            'name_bn',
                                v_existing_role.name_bn,

                            'description',
                                v_existing_role.description,

                            'active',
                                v_existing_role.active
                        ),

                    'after',
                        jsonb_build_object(
                            'name_en',
                                v_updated_role.name_en,

                            'name_bn',
                                v_updated_role.name_bn,

                            'description',
                                v_updated_role.description,

                            'active',
                                v_updated_role.active
                        )
                ),

            p_required_all_permissions :=
                ARRAY['roles.manage'],

            p_required_any_permissions :=
                ARRAY[]::TEXT[],

            p_audience_mode :=
                'permission',

            p_route :=
                '/roles/' ||
                v_clean_id,

            p_dedupe_key :=
                'role.updated:oversight:' ||
                v_audit_id::TEXT,

            p_exclude_actor :=
                true,

            p_include_super_admin :=
                true
        );

    END IF;

    -- ============================================================
    -- Event 12: role.permissions_changed
    -- ============================================================

    IF v_perms_changed THEN

        PERFORM public.admin_emit_notification(
            p_event_key :=
                'role.permissions_changed',

            p_title_en :=
                'Role permissions updated: ' ||
                v_clean_name_en,

            p_title_bn :=
                'ভূমিকার অনুমতি পরিবর্তন করা হয়েছে: ' ||
                COALESCE(
                    v_clean_name_bn,
                    v_clean_name_en
                ),

            p_body_en :=
                'Permissions for role ' ||
                v_clean_name_en ||
                ' were updated.',

            p_body_bn :=
                'ভূমিকা ' ||
                COALESCE(
                    v_clean_name_bn,
                    v_clean_name_en
                ) ||
                '-এর অনুমতি পরিবর্তন করা হয়েছে।',

            p_actor_user_id :=
                auth.uid(),

            p_target_type :=
                'role',

            p_target_id :=
                v_clean_id,

            p_target_label :=
                v_clean_name_en,

            p_metadata :=
                jsonb_build_object(
                    'role_id',
                        v_clean_id,

                    'before_permission_ids',
                        to_jsonb(
                            v_existing_perms
                        ),

                    'after_permission_ids',
                        to_jsonb(
                            v_final_perms
                        ),

                    'added_permission_ids',
                        to_jsonb(
                            v_added_perms
                        ),

                    'removed_permission_ids',
                        to_jsonb(
                            v_removed_perms
                        )
                ),

            p_required_all_permissions :=
                ARRAY['roles.manage'],

            p_required_any_permissions :=
                ARRAY[]::TEXT[],

            p_audience_mode :=
                'permission',

            p_route :=
                '/roles/' ||
                v_clean_id,

            p_dedupe_key :=
                'role.permissions_changed:oversight:' ||
                v_audit_id::TEXT,

            p_exclude_actor :=
                true,

            p_include_super_admin :=
                true
        );

    END IF;

    RETURN jsonb_build_object(
        'id',
            v_updated_role.id,

        'name_en',
            v_updated_role.name_en,

        'name_bn',
            v_updated_role.name_bn,

        'description',
            v_updated_role.description,

        'active',
            v_updated_role.active,

        'is_system',
            v_updated_role.is_system,

        'permission_ids',
            to_jsonb(
                v_final_perms
            ),

        'permission_count',
            cardinality(
                v_final_perms
            ),

        'assigned_user_count',
            v_user_count,

        'created_at',
            v_existing_role.created_at,

        'updated_at',
            v_updated_role.updated_at
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_role(p_role_id text, p_name_en text, p_name_bn text, p_active boolean, p_permission_ids text[], p_description text, p_update_description boolean, p_update_name_bn boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_role(p_role_id text, p_name_en text, p_name_bn text, p_active boolean, p_permission_ids text[], p_description text, p_update_description boolean, p_update_name_bn boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_role(p_role_id text, p_name_en text, p_name_bn text, p_active boolean, p_permission_ids text[], p_description text, p_update_description boolean, p_update_name_bn boolean) TO service_role;

-- public.admin_update_taxonomy_configuration(p_item_type text, p_item_id text, p_payload jsonb)
CREATE OR REPLACE FUNCTION public.admin_update_taxonomy_configuration(p_item_type text, p_item_id text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_type text := lower(nullif(btrim(p_item_type),''));
  v_id text := nullif(btrim(p_item_id),'');
  v_before jsonb;
  v_after jsonb;
  v_slug text;
begin
  if not public.is_active_admin() or not public.has_permission('categories.manage') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  if v_type not in ('segment','subcategory') or v_id is null
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid taxonomy configuration request.' using errcode='22023';
  end if;

  if v_type='segment' then
    select to_jsonb(s) into v_before from public.segments s where s.id=v_id for update;
    if v_before is null then raise exception 'Segment not found: %',v_id using errcode='P0002'; end if;

    v_slug := lower(coalesce(nullif(btrim(p_payload->>'slug'),''),(v_before->>'slug')));
    if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'Slug must use lowercase letters, numbers, and hyphens.' using errcode='22023';
    end if;
    if exists(select 1 from public.segments where slug=v_slug and id<>v_id) then
      raise exception 'Category slug already exists: %',v_slug using errcode='23505';
    end if;

    update public.segments
    set
      name_en=coalesce(nullif(btrim(p_payload->>'nameEn'),''),name_en),
      name_bn=coalesce(nullif(btrim(p_payload->>'nameBn'),''),name_bn),
      short_name_en=coalesce(nullif(btrim(p_payload->>'shortNameEn'),''),short_name_en,name_en),
      short_name_bn=coalesce(nullif(btrim(p_payload->>'shortNameBn'),''),short_name_bn,name_bn),
      description_en=coalesce(p_payload->>'descriptionEn',description_en,''),
      description_bn=coalesce(p_payload->>'descriptionBn',description_bn,''),
      slug=v_slug,
      icon_key=coalesce(nullif(btrim(p_payload->>'iconKey'),''),icon_key,'shield'),
      theme_key=coalesce(nullif(btrim(p_payload->>'themeKey'),''),theme_key,'sky'),
      sort_order=coalesce((p_payload->>'sortOrder')::integer,sort_order)
    where id=v_id;

    select to_jsonb(s) into v_after from public.segments s where s.id=v_id;
  else
    select to_jsonb(sc) into v_before from public.subcategories sc where sc.id=v_id for update;
    if v_before is null then raise exception 'Subcategory not found: %',v_id using errcode='P0002'; end if;

    update public.subcategories
    set
      name_en=coalesce(nullif(btrim(p_payload->>'nameEn'),''),name_en),
      name_bn=coalesce(nullif(btrim(p_payload->>'nameBn'),''),name_bn),
      description_en=coalesce(p_payload->>'descriptionEn',description_en,''),
      description_bn=coalesce(p_payload->>'descriptionBn',description_bn,''),
      category_group=case
        when p_payload ? 'categoryGroup' then nullif(btrim(p_payload->>'categoryGroup'),'')
        else category_group end,
      is_sensitive=case
        when p_payload ? 'isSensitive' then coalesce((p_payload->>'isSensitive')::boolean,false)
        else is_sensitive end,
      sort_order=coalesce((p_payload->>'sortOrder')::integer,sort_order)
    where id=v_id;

    select to_jsonb(sc) into v_after from public.subcategories sc where sc.id=v_id;
  end if;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'taxonomy.configuration_update',v_type,v_id,
    jsonb_build_object('before',v_before,'after',v_after,'timestamp',clock_timestamp()));

  return jsonb_build_object('success',true,'item',v_after);
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_taxonomy_configuration(p_item_type text, p_item_id text, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_taxonomy_configuration(p_item_type text, p_item_id text, p_payload jsonb) TO authenticated;

-- public.admin_update_taxonomy_full(p_item_type text, p_item_id text, p_parent_segment_id text, p_name_en text, p_name_bn text, p_active boolean, p_sort_order integer, p_payload jsonb)
CREATE OR REPLACE FUNCTION public.admin_update_taxonomy_full(p_item_type text, p_item_id text, p_parent_segment_id text, p_name_en text, p_name_bn text, p_active boolean, p_sort_order integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_type text := lower(nullif(btrim(p_item_type),''));
  v_id text := nullif(btrim(p_item_id),'');
  v_parent text := nullif(btrim(p_parent_segment_id),'');
  v_current_parent text;
  v_config_status text;
  v_effective_active boolean := false;
begin
  if not public.is_active_admin() or not public.has_permission('categories.manage') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  if v_type not in ('segment','subcategory') or v_id is null then
    raise exception 'Invalid taxonomy update request.' using errcode='22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Taxonomy configuration payload must be an object.' using errcode='22023';
  end if;

  if v_type='subcategory' then
    select segment_id,config_status
      into v_current_parent,v_config_status
    from public.subcategories
    where id=v_id
    for update;

    if v_current_parent is null then
      raise exception 'Subcategory not found: %',v_id using errcode='P0002';
    end if;

    if v_parent is not null and v_parent <> v_current_parent then
      perform public.admin_move_subcategory(v_id,v_parent,p_sort_order);
    end if;
  else
    select config_status
      into v_config_status
    from public.segments
    where id=v_id
    for update;

    if v_config_status is null then
      raise exception 'Category not found: %',v_id using errcode='P0002';
    end if;
  end if;

  perform public.admin_update_taxonomy_configuration(v_type,v_id,p_payload);

  if v_type='segment' then
    select config_status into v_config_status
    from public.segments where id=v_id;
  else
    select config_status into v_config_status
    from public.subcategories where id=v_id;
  end if;

  v_effective_active := coalesce(p_active,false) and v_config_status='published';

  perform public.admin_update_taxonomy_item(
    v_type,
    v_id,
    p_name_en,
    p_name_bn,
    v_effective_active,
    p_sort_order
  );

  return jsonb_build_object(
    'success',true,
    'itemType',v_type,
    'id',v_id,
    'active',v_effective_active,
    'configStatus',v_config_status,
    'parentSegmentId',
      case
        when v_type='subcategory' then
          (select segment_id from public.subcategories where id=v_id)
        else null
      end
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_taxonomy_full(p_item_type text, p_item_id text, p_parent_segment_id text, p_name_en text, p_name_bn text, p_active boolean, p_sort_order integer, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_taxonomy_full(p_item_type text, p_item_id text, p_parent_segment_id text, p_name_en text, p_name_bn text, p_active boolean, p_sort_order integer, p_payload jsonb) TO authenticated;

-- public.admin_update_taxonomy_item(p_item_type text, p_item_id text, p_name_en text, p_name_bn text, p_active boolean, p_sort_order integer)
CREATE OR REPLACE FUNCTION public.admin_update_taxonomy_item(p_item_type text, p_item_id text, p_name_en text, p_name_bn text, p_active boolean, p_sort_order integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_item_type text;
  v_item_id text;
  v_name_en text;
  v_name_bn text;
  v_config_status text;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_active_admin() then
    raise exception 'Access denied. Active administrative session required.'
      using errcode = '42501';
  end if;

  if not public.has_permission('categories.manage') then
    raise exception 'Access denied. Missing categories.manage permission.'
      using errcode = '42501';
  end if;

  v_item_type := lower(nullif(btrim(p_item_type), ''));
  v_item_id := nullif(btrim(p_item_id), '');
  v_name_en := nullif(btrim(p_name_en), '');
  v_name_bn := nullif(btrim(p_name_bn), '');

  if v_item_type not in ('segment', 'subcategory') then
    raise exception 'Invalid taxonomy item type.' using errcode = '22023';
  end if;

  if v_item_id is null then
    raise exception 'Taxonomy item ID is required.' using errcode = '22023';
  end if;

  if v_name_en is null or v_name_bn is null then
    raise exception 'Both English and Bangla names are required.' using errcode = '22023';
  end if;

  if p_active is null or p_sort_order is null then
    raise exception 'Active state and sort order are required.' using errcode = '22023';
  end if;

  if p_sort_order < 1 or p_sort_order > 999 then
    raise exception 'Sort order must be from 1 to 999.' using errcode = '22023';
  end if;

  if v_item_type = 'segment' then
    select
      s.config_status,
      jsonb_build_object(
        'id', s.id,
        'name_en', s.name_en,
        'name_bn', s.name_bn,
        'active', s.active,
        'sort_order', s.sort_order,
        'config_status', s.config_status
      )
    into v_config_status, v_before
    from public.segments s
    where s.id = v_item_id
    for update;

    if v_before is null then
      raise exception 'Segment not found: %', v_item_id using errcode = 'P0002';
    end if;

    if v_config_status <> 'published' and p_active then
      raise exception 'Only published categories can be activated.'
        using errcode = '22023';
    end if;

    update public.segments
    set
      name_en = v_name_en,
      name_bn = v_name_bn,
      active = case when config_status = 'published' then p_active else false end,
      sort_order = p_sort_order
    where id = v_item_id;

    select jsonb_build_object(
      'id', s.id,
      'name_en', s.name_en,
      'name_bn', s.name_bn,
      'active', s.active,
      'sort_order', s.sort_order,
      'config_status', s.config_status
    )
    into v_after
    from public.segments s
    where s.id = v_item_id;
  else
    select
      sc.config_status,
      jsonb_build_object(
        'id', sc.id,
        'segment_id', sc.segment_id,
        'name_en', sc.name_en,
        'name_bn', sc.name_bn,
        'active', sc.active,
        'sort_order', sc.sort_order,
        'config_status', sc.config_status
      )
    into v_config_status, v_before
    from public.subcategories sc
    where sc.id = v_item_id
    for update;

    if v_before is null then
      raise exception 'Subcategory not found: %', v_item_id using errcode = 'P0002';
    end if;

    if v_config_status <> 'published' and p_active then
      raise exception 'Only published subcategories can be activated.'
        using errcode = '22023';
    end if;

    update public.subcategories
    set
      name_en = v_name_en,
      name_bn = v_name_bn,
      active = case when config_status = 'published' then p_active else false end,
      sort_order = p_sort_order
    where id = v_item_id;

    select jsonb_build_object(
      'id', sc.id,
      'segment_id', sc.segment_id,
      'name_en', sc.name_en,
      'name_bn', sc.name_bn,
      'active', sc.active,
      'sort_order', sc.sort_order,
      'config_status', sc.config_status
    )
    into v_after
    from public.subcategories sc
    where sc.id = v_item_id;
  end if;

  insert into public.admin_audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    auth.uid(),
    'taxonomy.update',
    v_item_type,
    v_item_id,
    jsonb_build_object(
      'before', v_before,
      'after', v_after,
      'timestamp', clock_timestamp()
    )
  );

  return jsonb_build_object(
    'success', true,
    'item_type', v_item_type,
    'item', v_after
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_taxonomy_item(p_item_type text, p_item_id text, p_name_en text, p_name_bn text, p_active boolean, p_sort_order integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_taxonomy_item(p_item_type text, p_item_id text, p_name_en text, p_name_bn text, p_active boolean, p_sort_order integer) TO authenticated;

-- public.admin_update_user(p_user_id uuid, p_display_name text, p_role_id text, p_active boolean)
CREATE OR REPLACE FUNCTION public.admin_update_user(p_user_id uuid, p_display_name text DEFAULT NULL::text, p_role_id text DEFAULT NULL::text, p_active boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_clean_display_name TEXT;
    v_clean_role_id TEXT;
    v_existing_admin RECORD;
    v_existing_role_id TEXT;
    v_target_email TEXT;
    v_target_label TEXT;
    v_updated_at TIMESTAMPTZ;
    v_active_changed BOOLEAN := false;
    v_role_changed BOOLEAN := false;
    v_audit_id UUID;
BEGIN
    -- Preserve existing mutation serialization
    PERFORM pg_advisory_xact_lock(
        hashtext('sobaike_user_management_mutation_lock')
    );

    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION
          'Access denied. Active administrator session required.'
          USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION
          'Access denied. Permission admin_users.manage required.'
          USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION
          'Target user ID cannot be null.'
          USING ERRCODE = '22000';
    END IF;

    SELECT
        user_id,
        display_name,
        is_super_admin,
        active
    INTO v_existing_admin
    FROM public.admin_users
    WHERE user_id = p_user_id;

    IF v_existing_admin.user_id IS NULL THEN
        RAISE EXCEPTION
          'Target user % not found in admin_users store.',
          p_user_id
          USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.can_manage_user_target(p_user_id) THEN
        RAISE EXCEPTION
          'Access denied. You cannot modify an administrator whose permissions or roles exceed your own authority.'
          USING ERRCODE = '42501';
    END IF;

    SELECT role_id
    INTO v_existing_role_id
    FROM public.user_roles
    WHERE user_id = p_user_id;

    SELECT email
    INTO v_target_email
    FROM auth.users
    WHERE id = p_user_id;

    v_clean_display_name :=
        nullif(trim(p_display_name), '');

    v_clean_role_id :=
        nullif(trim(p_role_id), '');

    IF p_active IS NOT NULL
       AND p_active <> v_existing_admin.active THEN
        v_active_changed := true;
    END IF;

    IF v_clean_role_id IS NOT NULL
       AND v_clean_role_id IS DISTINCT FROM v_existing_role_id THEN
        v_role_changed := true;
    END IF;

    IF v_role_changed THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.roles
            WHERE id = v_clean_role_id
              AND active = true
        ) THEN
            RAISE EXCEPTION
              'Target role % is invalid or inactive.',
              v_clean_role_id
              USING ERRCODE = '22000';
        END IF;

        IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
            RAISE EXCEPTION
              'Access denied. You cannot assign a role with permissions exceeding your own authority.'
              USING ERRCODE = '42501';
        END IF;
    END IF;

    v_updated_at := clock_timestamp();

    UPDATE public.admin_users
    SET
        display_name =
            COALESCE(v_clean_display_name, display_name),
        active =
            COALESCE(p_active, active),
        updated_at =
            v_updated_at
    WHERE user_id = p_user_id;

    IF v_role_changed THEN
        IF v_existing_role_id IS NOT NULL THEN
            UPDATE public.user_roles
            SET
                role_id = v_clean_role_id,
                created_at = v_updated_at
            WHERE user_id = p_user_id;
        ELSE
            INSERT INTO public.user_roles (
                user_id,
                role_id,
                created_at
            )
            VALUES (
                p_user_id,
                v_clean_role_id,
                v_updated_at
            );
        END IF;
    END IF;

    -- Canonical resulting-state last-manager protection.
    -- Any unsafe mutation rolls back atomically.
    IF public.count_effective_role_managers() = 0 THEN
        RAISE EXCEPTION
          'Mutation rejected: operation would leave zero active administrators capable of managing roles.'
          USING ERRCODE = '23514';
    END IF;

    v_audit_id := public.log_role_audit_event(
        'ADMIN_USER_UPDATED',
        COALESCE(
            v_clean_role_id,
            v_existing_role_id,
            'none'
        ),
        jsonb_build_object(
            'target_user_id', p_user_id,
            'active',
                COALESCE(
                    p_active,
                    v_existing_admin.active
                ),
            'role_id',
                COALESCE(
                    v_clean_role_id,
                    v_existing_role_id
                ),
            'previous_role_id',
                v_existing_role_id,
            'display_name',
                COALESCE(
                    v_clean_display_name,
                    v_existing_admin.display_name
                ),
            'active_changed',
                v_active_changed,
            'role_changed',
                v_role_changed
        )
    );

    v_target_label :=
        COALESCE(
            v_clean_display_name,
            v_existing_admin.display_name,
            v_target_email,
            p_user_id::text
        );

    -- admin.activated / admin.deactivated
    IF v_active_changed THEN

        IF p_active IS TRUE THEN

            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.activated',
                p_title_en :=
                    'Administrator activated: ' || v_target_label,
                p_title_bn :=
                    'প্রশাসক সক্রিয় করা হয়েছে: ' || v_target_label,
                p_body_en :=
                    'Administrator ' || v_target_label ||
                    ' has been activated.',
                p_body_bn :=
                    'প্রশাসক ' || v_target_label ||
                    '-কে সক্রিয় করা হয়েছে।',

                p_actor_user_id := auth.uid(),

                p_target_type := 'admin_user',
                p_target_id := p_user_id::text,
                p_target_label := v_target_label,

                p_metadata := jsonb_build_object(
                    'target_user_id', p_user_id,
                    'display_name', v_clean_display_name,
                    'active', true,
                    'previous_active', false,
                    'actor_user_id', auth.uid(),
                    'timestamp', now()
                ),

                p_required_all_permissions :=
                    '{}'::text[],

                p_required_any_permissions :=
                    ARRAY[
                        'admin_users.view',
                        'admin_users.manage'
                    ],

                p_audience_mode := 'permission',
                p_route := '/users',

                p_dedupe_key :=
                    'admin.activated:oversight:' ||
                    v_audit_id::text,

                p_exclude_actor := true,
                p_include_super_admin := true
            );

            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.activated',

                p_title_en :=
                    'Your administrator account has been activated',

                p_title_bn :=
                    'আপনার প্রশাসক অ্যাকাউন্ট সক্রিয় করা হয়েছে',

                p_body_en :=
                    'Your administrative account access has been restored.',

                p_body_bn :=
                    'আপনার প্রশাসক অ্যাকাউন্ট অ্যাক্সেস পুনরায় চালু করা হয়েছে।',

                p_actor_user_id := auth.uid(),

                p_target_type := 'admin_user',
                p_target_id := p_user_id::text,
                p_target_label := v_target_label,

                p_metadata := jsonb_build_object(
                    'target_user_id', p_user_id,
                    'active', true,
                    'timestamp', now()
                ),

                p_required_all_permissions :=
                    '{}'::text[],

                p_required_any_permissions :=
                    '{}'::text[],

                p_audience_mode := 'personal',

                p_personal_recipient_id :=
                    p_user_id,

                p_route := '/',

                p_dedupe_key :=
                    'admin.activated:personal:' ||
                    v_audit_id::text,

                p_exclude_actor := false,
                p_include_super_admin := true
            );

        ELSE

            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.deactivated',

                p_title_en :=
                    'Administrator deactivated: ' ||
                    v_target_label,

                p_title_bn :=
                    'প্রশাসক নিষ্ক্রিয় করা হয়েছে: ' ||
                    v_target_label,

                p_body_en :=
                    'Administrator ' ||
                    v_target_label ||
                    ' has been deactivated.',

                p_body_bn :=
                    'প্রশাসক ' ||
                    v_target_label ||
                    '-কে নিষ্ক্রিয় করা হয়েছে।',

                p_actor_user_id := auth.uid(),

                p_target_type := 'admin_user',
                p_target_id := p_user_id::text,
                p_target_label := v_target_label,

                p_metadata := jsonb_build_object(
                    'target_user_id', p_user_id,
                    'display_name', v_clean_display_name,
                    'active', false,
                    'previous_active', true,
                    'actor_user_id', auth.uid(),
                    'timestamp', now()
                ),

                p_required_all_permissions :=
                    '{}'::text[],

                p_required_any_permissions :=
                    ARRAY[
                        'admin_users.view',
                        'admin_users.manage'
                    ],

                p_audience_mode := 'permission',
                p_route := '/users',

                p_dedupe_key :=
                    'admin.deactivated:oversight:' ||
                    v_audit_id::text,

                p_exclude_actor := true,
                p_include_super_admin := true
            );

        END IF;
    END IF;

    -- admin.role_changed
    IF v_role_changed THEN

        PERFORM public.admin_emit_notification(
            p_event_key := 'admin.role_changed',

            p_title_en :=
                'Administrator role changed: ' ||
                v_target_label,

            p_title_bn :=
                'প্রশাসকের ভূমিকা পরিবর্তন করা হয়েছে: ' ||
                v_target_label,

            p_body_en :=
                'Role for ' ||
                v_target_label ||
                ' was changed from ' ||
                COALESCE(v_existing_role_id, 'none') ||
                ' to ' ||
                v_clean_role_id ||
                '.',

            p_body_bn :=
                'প্রশাসক ' ||
                v_target_label ||
                '-এর ভূমিকা ' ||
                COALESCE(v_existing_role_id, 'নেই') ||
                ' থেকে ' ||
                v_clean_role_id ||
                '-এ পরিবর্তন করা হয়েছে।',

            p_actor_user_id := auth.uid(),

            p_target_type := 'admin_user',
            p_target_id := p_user_id::text,
            p_target_label := v_target_label,

            p_metadata := jsonb_build_object(
                'target_user_id', p_user_id,
                'previous_role_id', v_existing_role_id,
                'new_role_id', v_clean_role_id,
                'actor_user_id', auth.uid(),
                'timestamp', now()
            ),

            p_required_all_permissions :=
                '{}'::text[],

            p_required_any_permissions :=
                ARRAY[
                    'admin_users.view',
                    'admin_users.manage'
                ],

            p_audience_mode := 'permission',
            p_route := '/users',

            p_dedupe_key :=
                'admin.role_changed:oversight:' ||
                v_audit_id::text,

            p_exclude_actor := true,
            p_include_super_admin := true
        );

        IF COALESCE(
            p_active,
            v_existing_admin.active
        ) IS TRUE THEN

            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.role_changed',

                p_title_en :=
                    'Your administrator role has been updated',

                p_title_bn :=
                    'আপনার প্রশাসকের ভূমিকা পরিবর্তন করা হয়েছে',

                p_body_en :=
                    'Your role has been changed to ' ||
                    v_clean_role_id ||
                    '.',

                p_body_bn :=
                    'আপনার ভূমিকা ' ||
                    v_clean_role_id ||
                    '-এ পরিবর্তন করা হয়েছে।',

                p_actor_user_id := auth.uid(),

                p_target_type := 'admin_user',
                p_target_id := p_user_id::text,
                p_target_label := v_target_label,

                p_metadata := jsonb_build_object(
                    'target_user_id', p_user_id,
                    'previous_role_id', v_existing_role_id,
                    'new_role_id', v_clean_role_id,
                    'actor_user_id', auth.uid(),
                    'timestamp', now()
                ),

                p_required_all_permissions :=
                    '{}'::text[],

                p_required_any_permissions :=
                    '{}'::text[],

                p_audience_mode := 'personal',

                p_personal_recipient_id :=
                    p_user_id,

                p_route := '/',

                p_dedupe_key :=
                    'admin.role_changed:personal:' ||
                    v_audit_id::text,

                p_exclude_actor := false,
                p_include_super_admin := true
            );

        END IF;
    END IF;

    RETURN jsonb_build_object(
        'user_id',
            p_user_id,

        'display_name',
            COALESCE(
                v_clean_display_name,
                v_existing_admin.display_name
            ),

        'role_id',
            COALESCE(
                v_clean_role_id,
                v_existing_role_id
            ),

        'active',
            COALESCE(
                p_active,
                v_existing_admin.active
            ),

        'updated_at',
            v_updated_at
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_user(p_user_id uuid, p_display_name text, p_role_id text, p_active boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user(p_user_id uuid, p_display_name text, p_role_id text, p_active boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(p_user_id uuid, p_display_name text, p_role_id text, p_active boolean) TO service_role;

-- public.build_public_area(p_area text, p_upazila text, p_district text, p_lang text)
CREATE OR REPLACE FUNCTION public.build_public_area(p_area text, p_upazila text, p_district text, p_lang text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_lang text:=case when lower(coalesce(p_lang,'en'))='bn' then 'bn' else 'en' end;
  v text;
begin
  if nullif(btrim(coalesce(p_area,'')),'') is not null
     and public.location_text_language(p_area)=v_lang then return btrim(p_area); end if;
  v:=public.localize_upazila_name(p_upazila,p_district,v_lang);
  if v is not null then return v; end if;
  return public.localize_district_name(p_district,v_lang);
end
$function$;
REVOKE ALL ON FUNCTION public.build_public_area(p_area text, p_upazila text, p_district text, p_lang text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.build_public_area(p_area text, p_upazila text, p_district text, p_lang text) TO anon;
GRANT EXECUTE ON FUNCTION public.build_public_area(p_area text, p_upazila text, p_district text, p_lang text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_public_area(p_area text, p_upazila text, p_district text, p_lang text) TO service_role;

-- public.build_public_location(p_formatted text, p_road text, p_area text, p_landmark text, p_upazila text, p_district text, p_lang text)
CREATE OR REPLACE FUNCTION public.build_public_location(p_formatted text, p_road text, p_area text, p_landmark text, p_upazila text, p_district text, p_lang text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_lang text:=case when lower(coalesce(p_lang,'en'))='bn' then 'bn' else 'en' end;
  v_parts text[]:='{}';
  v text;
  v_formatted_lang text:=public.location_text_language(p_formatted);
begin
  if nullif(btrim(coalesce(p_formatted,'')),'') is not null
     and v_formatted_lang=v_lang then
    return btrim(p_formatted);
  end if;

  foreach v in array array[p_road,p_area,p_landmark] loop
    if nullif(btrim(coalesce(v,'')),'') is not null
       and public.location_text_language(v)=v_lang then
      v_parts:=array_append(v_parts,btrim(v));
    end if;
  end loop;

  v:=public.localize_upazila_name(p_upazila,p_district,v_lang);
  if v is null and public.location_text_language(p_upazila)=v_lang then v:=btrim(p_upazila); end if;
  if nullif(v,'') is not null and not (v=any(v_parts)) then v_parts:=array_append(v_parts,v); end if;

  v:=public.localize_district_name(p_district,v_lang);
  if v is null and public.location_text_language(p_district)=v_lang then v:=btrim(p_district); end if;
  if nullif(v,'') is not null and not (v=any(v_parts)) then v_parts:=array_append(v_parts,v); end if;

  if array_length(v_parts,1) is null then return null; end if;
  return array_to_string(v_parts,', ');
end
$function$;
REVOKE ALL ON FUNCTION public.build_public_location(p_formatted text, p_road text, p_area text, p_landmark text, p_upazila text, p_district text, p_lang text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.build_public_location(p_formatted text, p_road text, p_area text, p_landmark text, p_upazila text, p_district text, p_lang text) TO anon;
GRANT EXECUTE ON FUNCTION public.build_public_location(p_formatted text, p_road text, p_area text, p_landmark text, p_upazila text, p_district text, p_lang text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_public_location(p_formatted text, p_road text, p_area text, p_landmark text, p_upazila text, p_district text, p_lang text) TO service_role;

-- public.can_delegate_permission_set(p_permission_ids text[])
CREATE OR REPLACE FUNCTION public.can_delegate_permission_set(p_permission_ids text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_is_active_admin BOOLEAN;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT (active = true)
    INTO v_is_active_admin
    FROM public.admin_users
    WHERE user_id = v_user_id;

    IF v_is_active_admin IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    IF p_permission_ids IS NULL
       OR cardinality(p_permission_ids) = 0 THEN
        RETURN TRUE;
    END IF;

    SELECT COALESCE(au.is_super_admin, false)
    INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id
      AND au.active = true;

    IF v_is_super_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    SELECT NOT EXISTS (
        SELECT 1
        FROM public.user_roles
    )
    INTO v_bootstrap_mode;

    IF v_bootstrap_mode IS TRUE THEN
        RETURN TRUE;
    END IF;

    RETURN NOT EXISTS (
        SELECT 1
        FROM unnest(p_permission_ids) AS perm_id
        WHERE perm_id NOT IN (
            SELECT public.get_caller_effective_permission_set()
        )
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.can_delegate_permission_set(p_permission_ids text[]) FROM PUBLIC, anon, authenticated, service_role;

-- public.can_manage_roles()
CREATE OR REPLACE FUNCTION public.can_manage_roles()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
    v_has_any_assignments boolean;
begin
    if not public.is_active_admin() then
        return false;
    end if;

    if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
        return false;
    end if;

    select exists (
        select 1
        from public.user_roles
    )
    into v_has_any_assignments;

    if not v_has_any_assignments then
        return true;
    end if;

    return public.has_permission('roles.manage');
end;
$function$;
REVOKE ALL ON FUNCTION public.can_manage_roles() FROM PUBLIC, anon, authenticated, service_role;
