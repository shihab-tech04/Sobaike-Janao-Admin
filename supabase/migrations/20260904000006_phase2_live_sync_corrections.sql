-- ==============================================================================
-- SOBAIKE JANAO ADMIN — PHASE 2 LIVE SYNC CORRECTIONS
-- ==============================================================================
-- Migration: 20260904000006_phase2_live_sync_corrections.sql
-- Description: Synchronizes live database corrections back into repository:
--   1. admin_publish_complaint(text): Remove nonexistent column reference;
--      preserve submitted/unpublished -> published workflow and notification wiring.
--   2. admin_update_user(uuid, text, text, boolean): Align authorization and role management;
--      preserve atomic resulting-state count_effective_role_managers() protection
--      and admin.activated, admin.deactivated, admin.role_changed notifications.
--   3. admin_update_role: DROP accidental conflicting overload
--      admin_update_role(text, text, text, text, boolean, text[], text, text) and retain
--      the frontend-compatible bilingual signature:
--      admin_update_role(text, text, text, boolean, text[], text, boolean, boolean);
--      preserve bilingual update behavior and role.updated & role.permissions_changed notifications.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. admin_publish_complaint(text)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_publish_complaint(p_complaint_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_complaint record;
    v_audit_id uuid;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('complaints.publish') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to publish complaints.' USING ERRCODE = '42501';
    END IF;

    SELECT id, status INTO v_complaint
    FROM public.complaints
    WHERE id = p_complaint_id
    FOR UPDATE;

    IF v_complaint.id IS NULL THEN
        RAISE EXCEPTION 'Complaint with ID % not found', p_complaint_id USING ERRCODE = 'P0002';
    END IF;

    IF v_complaint.status IS NULL OR v_complaint.status NOT IN ('submitted', 'unpublished') THEN
        RAISE EXCEPTION 'Cannot publish complaint with status "%". Only "submitted" or "unpublished" complaints can be published.', COALESCE(v_complaint.status, 'null')
            USING ERRCODE = '22023';
    END IF;

    -- Update status and timestamp
    UPDATE public.complaints
    SET 
        status = 'published',
        updated_at = now()
    WHERE id = v_complaint.id;

    INSERT INTO public.complaint_updates (
        complaint_id, update_type, note, is_public, created_at
    ) VALUES (
        v_complaint.id, 'published', 'Complaint approved and published to public feed.', true, now()
    );

    INSERT INTO public.admin_audit_logs (
        actor_id, action, target_type, target_id, details
    ) VALUES (
        auth.uid(), 'complaint.publish', 'complaint', p_complaint_id,
        jsonb_build_object('previous_status', v_complaint.status, 'new_status', 'published', 'timestamp', now())
    )
    RETURNING id INTO v_audit_id;

    -- Emit Notification: complaint.published
    PERFORM public.admin_emit_notification(
        p_event_key := 'complaint.published',
        p_title_en := 'Complaint published: ' || p_complaint_id,
        p_title_bn := 'অভিযোগ প্রকাশ করা হয়েছে: ' || p_complaint_id,
        p_body_en := 'Complaint ' || p_complaint_id || ' was approved and published to the public feed.',
        p_body_bn := 'অভিযোগ ' || p_complaint_id || ' অনুমোদন করে পাবলিক ফিডে প্রকাশ করা হয়েছে।',
        p_actor_user_id := auth.uid(),
        p_target_type := 'complaint',
        p_target_id := p_complaint_id,
        p_target_label := p_complaint_id,
        p_metadata := jsonb_build_object(
            'complaint_id', p_complaint_id,
            'previous_status', v_complaint.status,
            'new_status', 'published',
            'actor_user_id', auth.uid(),
            'timestamp', now()
        ),
        p_required_all_permissions := ARRAY['complaints.view'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/complaints/' || p_complaint_id,
        p_dedupe_key := 'complaint.published:oversight:' || v_audit_id::text,
        p_exclude_actor := true,
        p_include_super_admin := true
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', p_complaint_id,
        'status', 'published',
        'previous_status', v_complaint.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_publish_complaint(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_complaint(text) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 2. admin_update_user(uuid, text, text, boolean)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_user_id UUID,
    p_display_name TEXT DEFAULT NULL,
    p_role_id TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
    PERFORM pg_advisory_xact_lock(
        hashtext('sobaike_user_management_mutation_lock')
    );

    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrator session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION 'Access denied. Permission admin_users.manage required.' USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Target user ID cannot be null.' USING ERRCODE = '22000';
    END IF;

    SELECT user_id, display_name, is_super_admin, active
    INTO v_existing_admin
    FROM public.admin_users
    WHERE user_id = p_user_id;

    IF v_existing_admin.user_id IS NULL THEN
        RAISE EXCEPTION 'Target user % not found in admin_users store.', p_user_id USING ERRCODE = 'P0002';
    END IF;

    -- TARGET CEILING GUARD: Caller cannot mutate a target whose permissions exceed caller's ceiling
    IF NOT public.can_manage_user_target(p_user_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot modify an administrator whose permissions or roles exceed your own authority.'
            USING ERRCODE = '42501';
    END IF;

    SELECT role_id INTO v_existing_role_id
    FROM public.user_roles
    WHERE user_id = p_user_id;

    SELECT email INTO v_target_email
    FROM auth.users
    WHERE id = p_user_id;

    v_clean_display_name := nullif(trim(p_display_name), '');
    v_clean_role_id := nullif(trim(p_role_id), '');

    -- Track changes
    IF p_active IS NOT NULL AND p_active <> v_existing_admin.active THEN
        v_active_changed := true;
    END IF;

    IF v_clean_role_id IS NOT NULL AND v_clean_role_id <> v_existing_role_id THEN
        v_role_changed := true;
    END IF;

    -- Role Scope Ceiling Check if changing role
    IF v_role_changed THEN
        IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = v_clean_role_id AND active = true) THEN
            RAISE EXCEPTION 'Target role % is invalid or inactive.', v_clean_role_id USING ERRCODE = '22000';
        END IF;

        IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
            RAISE EXCEPTION 'Access denied. You cannot assign a role with permissions exceeding your own authority.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    v_updated_at := clock_timestamp();

    -- Update admin_users
    UPDATE public.admin_users
    SET display_name = COALESCE(v_clean_display_name, display_name),
        active = COALESCE(p_active, active),
        updated_at = v_updated_at
    WHERE user_id = p_user_id;

    -- Update user_roles if changed
    IF v_role_changed THEN
        IF v_existing_role_id IS NOT NULL THEN
            UPDATE public.user_roles
            SET role_id = v_clean_role_id,
                created_at = v_updated_at
            WHERE user_id = p_user_id;
        ELSE
            INSERT INTO public.user_roles (user_id, role_id, created_at)
            VALUES (p_user_id, v_clean_role_id, v_updated_at);
        END IF;
    END IF;

    -- RESULTING STATE LAST-MANAGER SAFETY CHECK (Protection against leaving zero active role managers)
    IF public.count_effective_role_managers() = 0 THEN
        RAISE EXCEPTION 'Mutation rejected: operation would leave zero active administrators capable of managing roles.'
            USING ERRCODE = '23514';
    END IF;

    -- Audit log
    v_audit_id := public.log_role_audit_event(
        'ADMIN_USER_UPDATED',
        COALESCE(v_clean_role_id, v_existing_role_id, 'none'),
        jsonb_build_object(
            'target_user_id', p_user_id,
            'active', COALESCE(p_active, v_existing_admin.active),
            'role_id', COALESCE(v_clean_role_id, v_existing_role_id),
            'previous_role_id', v_existing_role_id,
            'display_name', COALESCE(v_clean_display_name, v_existing_admin.display_name),
            'active_changed', v_active_changed,
            'role_changed', v_role_changed
        )
    );

    v_target_label := COALESCE(v_clean_display_name, v_existing_admin.display_name, v_target_email, p_user_id::text);

    -- --------------------------------------------------------------------------
    -- Emit Events 7 & 8: admin.activated / admin.deactivated
    -- --------------------------------------------------------------------------
    IF v_active_changed THEN
        IF p_active IS TRUE THEN
            -- Stream A: Oversight
            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.activated',
                p_title_en := 'Administrator activated: ' || v_target_label,
                p_title_bn := 'প্রশাসক সক্রিয় করা হয়েছে: ' || v_target_label,
                p_body_en := 'Administrator ' || v_target_label || ' has been activated.',
                p_body_bn := 'প্রশাসক ' || v_target_label || '-কে সক্রিয় করা হয়েছে।',
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
                p_required_all_permissions := '{}'::text[],
                p_required_any_permissions := ARRAY['admin_users.view', 'admin_users.manage'],
                p_audience_mode := 'permission',
                p_route := '/users',
                p_dedupe_key := 'admin.activated:oversight:' || v_audit_id::text,
                p_exclude_actor := true,
                p_include_super_admin := true
            );

            -- Stream B: Personal
            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.activated',
                p_title_en := 'Your administrator account has been activated',
                p_title_bn := 'আপনার প্রশাসক অ্যাকাউন্ট সক্রিয় করা হয়েছে',
                p_body_en := 'Your administrative account access has been restored.',
                p_body_bn := 'আপনার প্রশাসক অ্যাকাউন্ট অ্যাক্সেস পুনরায় চালু করা হয়েছে।',
                p_actor_user_id := auth.uid(),
                p_target_type := 'admin_user',
                p_target_id := p_user_id::text,
                p_target_label := v_target_label,
                p_metadata := jsonb_build_object(
                    'target_user_id', p_user_id,
                    'active', true,
                    'timestamp', now()
                ),
                p_required_all_permissions := '{}'::text[],
                p_required_any_permissions := '{}'::text[],
                p_audience_mode := 'personal',
                p_personal_recipient_id := p_user_id,
                p_route := '/dashboard',
                p_dedupe_key := 'admin.activated:personal:' || v_audit_id::text,
                p_exclude_actor := false,
                p_include_super_admin := true
            );
        ELSE
            -- Stream A: Oversight (Personal admin.deactivated is intentionally excluded)
            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.deactivated',
                p_title_en := 'Administrator deactivated: ' || v_target_label,
                p_title_bn := 'প্রশাসক নিষ্ক্রিয় করা হয়েছে: ' || v_target_label,
                p_body_en := 'Administrator ' || v_target_label || ' has been deactivated.',
                p_body_bn := 'প্রশাসক ' || v_target_label || '-কে নিষ্ক্রিয় করা হয়েছে।',
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
                p_required_all_permissions := '{}'::text[],
                p_required_any_permissions := ARRAY['admin_users.view', 'admin_users.manage'],
                p_audience_mode := 'permission',
                p_route := '/users',
                p_dedupe_key := 'admin.deactivated:oversight:' || v_audit_id::text,
                p_exclude_actor := true,
                p_include_super_admin := true
            );
        END IF;
    END IF;

    -- --------------------------------------------------------------------------
    -- Emit Event 9: admin.role_changed
    -- --------------------------------------------------------------------------
    IF v_role_changed THEN
        -- Stream A: Oversight
        PERFORM public.admin_emit_notification(
            p_event_key := 'admin.role_changed',
            p_title_en := 'Administrator role changed: ' || v_target_label,
            p_title_bn := 'প্রশাসকের ভূমিকা পরিবর্তন করা হয়েছে: ' || v_target_label,
            p_body_en := 'Role for ' || v_target_label || ' was changed from ' || COALESCE(v_existing_role_id, 'none') || ' to ' || v_clean_role_id || '.',
            p_body_bn := 'প্রশাসক ' || v_target_label || '-এর ভূমিকা ' || COALESCE(v_existing_role_id, 'নেই') || ' থেকে ' || v_clean_role_id || '-এ পরিবর্তন করা হয়েছে।',
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
            p_required_all_permissions := '{}'::text[],
            p_required_any_permissions := ARRAY['admin_users.view', 'admin_users.manage'],
            p_audience_mode := 'permission',
            p_route := '/users',
            p_dedupe_key := 'admin.role_changed:oversight:' || v_audit_id::text,
            p_exclude_actor := true,
            p_include_super_admin := true
        );

        -- Stream B: Personal (emit only when role changed AND resulting user is active)
        IF COALESCE(p_active, v_existing_admin.active) IS TRUE THEN
            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.role_changed',
                p_title_en := 'Your administrator role has been updated',
                p_title_bn := 'আপনার প্রশাসকের ভূমিকা পরিবর্তন করা হয়েছে',
                p_body_en := 'Your role has been changed to ' || v_clean_role_id || '.',
                p_body_bn := 'আপনার ভূমিকা ' || v_clean_role_id || '-এ পরিবর্তন করা হয়েছে।',
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
                p_required_all_permissions := '{}'::text[],
                p_required_any_permissions := '{}'::text[],
                p_audience_mode := 'personal',
                p_personal_recipient_id := p_user_id,
                p_route := '/dashboard',
                p_dedupe_key := 'admin.role_changed:personal:' || v_audit_id::text,
                p_exclude_actor := false,
                p_include_super_admin := true
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'display_name', COALESCE(v_clean_display_name, v_existing_admin.display_name),
        'role_id', COALESCE(v_clean_role_id, v_existing_role_id),
        'active', COALESCE(p_active, v_existing_admin.active),
        'updated_at', v_updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 3. admin_update_role
-- ------------------------------------------------------------------------------
-- DROP accidental conflicting overload with 8 parameters: (text, text, text, text, boolean, text[], text, text)
DROP FUNCTION IF EXISTS public.admin_update_role(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[], TEXT, TEXT);

-- Retain / create authoritative frontend-compatible 8-param signature:
-- admin_update_role(text, text, text, boolean, text[], text, boolean, boolean)
CREATE OR REPLACE FUNCTION public.admin_update_role(
    p_role_id text,
    p_name_en text,
    p_name_bn text DEFAULT NULL,
    p_active boolean DEFAULT NULL,
    p_permission_ids text[] DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_update_description boolean DEFAULT NULL,
    p_update_name_bn boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_id text;
    v_clean_name_en text;
    v_clean_name_bn text;
    v_clean_desc text;
    v_existing_role record;
    v_existing_perms text[];
    v_invalid_perms text[];
    v_distinct_perms text[];
    v_final_perms text[];
    v_added_perms text[] := '{}';
    v_removed_perms text[] := '{}';
    v_perm_id text;
    v_updated_at timestamptz;
    v_updated_role record;
    v_user_count int;
    v_meta_changed boolean := false;
    v_perms_changed boolean := false;
    v_audit_id uuid;
BEGIN
    -- Concurrency serialization
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_role_management_mutation_lock'));

    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION
          'Access denied. You do not have permission to update roles.'
          USING ERRCODE = '42501';
    END IF;

    -- Validate technical role ID
    v_clean_id := btrim(p_role_id);
    IF v_clean_id IS NULL OR v_clean_id = '' THEN
        RAISE EXCEPTION 'Role ID is required.' USING ERRCODE = '22000';
    END IF;

    -- Fetch existing role
    SELECT id, name_en, name_bn, description, active, is_system, created_at, updated_at
    INTO v_existing_role
    FROM public.roles
    WHERE id = v_clean_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found: %', v_clean_id USING ERRCODE = 'P0002';
    END IF;

    -- Fetch existing permissions
    SELECT COALESCE(array_agg(permission_id ORDER BY permission_id ASC), ARRAY[]::TEXT[])
    INTO v_existing_perms
    FROM public.role_permissions
    WHERE role_id = v_clean_id;

    -- TARGET SCOPE GUARD: Caller cannot modify a role whose permissions exceed caller's ceiling
    IF NOT public.can_manage_role_scope(v_clean_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot modify a role containing permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- Validate English role name
    v_clean_name_en := btrim(p_name_en);
    IF v_clean_name_en IS NULL OR v_clean_name_en = '' THEN
        RAISE EXCEPTION 'English role name is required and cannot be blank.' USING ERRCODE = '22000';
    END IF;

    -- Process Bengali role name with explicit update flag
    IF p_update_name_bn IS TRUE THEN
        v_clean_name_bn := btrim(p_name_bn);
        IF v_clean_name_bn = '' THEN
            v_clean_name_bn := NULL;
        END IF;
    ELSIF p_update_name_bn IS FALSE THEN
        v_clean_name_bn := v_existing_role.name_bn;
    ELSE
        IF p_name_bn IS NOT NULL THEN
            v_clean_name_bn := btrim(p_name_bn);
            IF v_clean_name_bn = '' THEN
                v_clean_name_bn := NULL;
            END IF;
        ELSE
            v_clean_name_bn := v_existing_role.name_bn;
        END IF;
    END IF;

    -- System role protections
    IF v_existing_role.is_system IS TRUE THEN
        IF p_active IS NOT NULL AND p_active IS FALSE THEN
            RAISE EXCEPTION 'System roles cannot be deactivated.' USING ERRCODE = '42501';
        END IF;

        IF p_permission_ids IS NOT NULL THEN
            RAISE EXCEPTION 'Permissions of system roles cannot be modified.' USING ERRCODE = '42501';
        END IF;

        IF v_clean_name_en <> v_existing_role.name_en THEN
            RAISE EXCEPTION 'English name of system roles cannot be modified.' USING ERRCODE = '42501';
        END IF;

        IF (v_clean_name_bn IS DISTINCT FROM v_existing_role.name_bn) THEN
            RAISE EXCEPTION 'Bengali name of system roles cannot be modified.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Check duplicate English role name across other roles
    IF EXISTS (
        SELECT 1 FROM public.roles
        WHERE id <> v_clean_id AND lower(name_en) = lower(v_clean_name_en)
    ) THEN
        RAISE EXCEPTION 'Another role with this English name already exists.' USING ERRCODE = '23505';
    END IF;

    -- Process description with explicit update flag
    IF p_update_description IS TRUE THEN
        v_clean_desc := btrim(p_description);
        IF v_clean_desc = '' THEN
            v_clean_desc := NULL;
        END IF;
    ELSIF p_update_description IS FALSE THEN
        v_clean_desc := v_existing_role.description;
    ELSE
        IF p_description IS NOT NULL THEN
            v_clean_desc := btrim(p_description);
            IF v_clean_desc = '' THEN
                v_clean_desc := NULL;
            END IF;
        ELSE
            v_clean_desc := v_existing_role.description;
        END IF;
    END IF;

    -- Check if metadata changed
    IF v_clean_name_en <> v_existing_role.name_en OR
       (v_clean_name_bn IS DISTINCT FROM v_existing_role.name_bn) OR
       (v_clean_desc IS DISTINCT FROM v_existing_role.description) OR
       (p_active IS NOT NULL AND p_active <> v_existing_role.active) THEN
        v_meta_changed := true;
    END IF;

    -- Permission validation & ceiling verification if permissions are being modified
    IF p_permission_ids IS NOT NULL AND v_existing_role.is_system IS NOT TRUE THEN
        IF cardinality(p_permission_ids) > 0 THEN
            SELECT ARRAY(
                SELECT unnest(p_permission_ids)
                EXCEPT
                SELECT id FROM public.permissions
            ) INTO v_invalid_perms;

            IF cardinality(v_invalid_perms) > 0 THEN
                RAISE EXCEPTION 'Invalid permission ID(s) provided: %', array_to_string(v_invalid_perms, ', ')
                    USING ERRCODE = '22000';
            END IF;

            SELECT ARRAY(
                SELECT DISTINCT unnest(p_permission_ids)
            ) INTO v_distinct_perms;
        ELSE
            v_distinct_perms := ARRAY[]::TEXT[];
        END IF;

        -- NEW PERMISSION SET CEILING GUARD
        IF NOT public.can_delegate_permission_set(v_distinct_perms) THEN
            RAISE EXCEPTION 'Access denied. You cannot grant permissions that you do not possess.'
                USING ERRCODE = '42501';
        END IF;

        -- Compute delta
        SELECT ARRAY(SELECT unnest(v_distinct_perms) EXCEPT SELECT unnest(v_existing_perms)) INTO v_added_perms;
        SELECT ARRAY(SELECT unnest(v_existing_perms) EXCEPT SELECT unnest(v_distinct_perms)) INTO v_removed_perms;

        IF cardinality(v_added_perms) > 0 OR cardinality(v_removed_perms) > 0 THEN
            v_perms_changed := true;
        END IF;
    END IF;

    v_updated_at := clock_timestamp();

    -- Update role table
    UPDATE public.roles
    SET
        name_en = v_clean_name_en,
        name_bn = v_clean_name_bn,
        description = v_clean_desc,
        active = COALESCE(p_active, active),
        updated_at = v_updated_at
    WHERE id = v_clean_id
    RETURNING * INTO v_updated_role;

    -- Update permissions if provided
    IF p_permission_ids IS NOT NULL AND v_existing_role.is_system IS NOT TRUE THEN
        DELETE FROM public.role_permissions WHERE role_id = v_clean_id;

        IF cardinality(v_distinct_perms) > 0 THEN
            FOREACH v_perm_id IN ARRAY v_distinct_perms
            LOOP
                INSERT INTO public.role_permissions (role_id, permission_id, created_at)
                VALUES (v_clean_id, v_perm_id, v_updated_at);
            END LOOP;
        END IF;

        v_final_perms := v_distinct_perms;
    ELSE
        v_final_perms := v_existing_perms;
    END IF;

    -- RESULTING STATE LAST-MANAGER SAFETY CHECK
    IF EXISTS (SELECT 1 FROM public.user_roles) THEN
        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION 'Cannot update or deactivate this role because doing so would leave no active administrators capable of managing roles.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- Count assigned users
    SELECT COUNT(*)::INT INTO v_user_count
    FROM public.user_roles
    WHERE role_id = v_clean_id;

    -- Audit log
    v_audit_id := public.log_role_audit_event(
        'ROLE_UPDATED',
        v_clean_id,
        jsonb_build_object(
            'role_id', v_clean_id,
            'name_en', v_clean_name_en,
            'name_bn', v_clean_name_bn,
            'active', v_updated_role.active,
            'permission_ids', to_jsonb(v_final_perms),
            'description', v_clean_desc,
            'meta_changed', v_meta_changed,
            'perms_changed', v_perms_changed
        )
    );

    -- Emit Event 11: role.updated (if metadata changed)
    IF v_meta_changed THEN
        PERFORM public.admin_emit_notification(
            p_event_key := 'role.updated',
            p_title_en := 'Role updated: ' || v_clean_name_en,
            p_title_bn := 'ভূমিকার তথ্য পরিবর্তন করা হয়েছে: ' || COALESCE(v_clean_name_bn, v_clean_name_en),
            p_body_en := 'Role details for ' || v_clean_name_en || ' were updated.',
            p_body_bn := 'ভূমিকা ' || COALESCE(v_clean_name_bn, v_clean_name_en) || '-এর বিবরণ আপডেট করা হয়েছে।',
            p_actor_user_id := auth.uid(),
            p_target_type := 'role',
            p_target_id := v_clean_id,
            p_target_label := v_clean_name_en,
            p_metadata := jsonb_build_object(
                'role_id', v_clean_id,
                'name_en', v_clean_name_en,
                'name_bn', v_clean_name_bn,
                'active', v_updated_role.active,
                'previous_name_en', v_existing_role.name_en,
                'previous_name_bn', v_existing_role.name_bn,
                'previous_active', v_existing_role.active,
                'actor_user_id', auth.uid(),
                'timestamp', now()
            ),
            p_required_all_permissions := ARRAY['roles.manage'],
            p_required_any_permissions := '{}'::text[],
            p_audience_mode := 'permission',
            p_route := '/roles/' || v_clean_id,
            p_dedupe_key := 'role.updated:oversight:' || v_audit_id::text,
            p_exclude_actor := true,
            p_include_super_admin := true
        );
    END IF;

    -- Emit Event 12: role.permissions_changed (if permissions changed)
    IF v_perms_changed THEN
        PERFORM public.admin_emit_notification(
            p_event_key := 'role.permissions_changed',
            p_title_en := 'Role permissions updated: ' || v_clean_name_en,
            p_title_bn := 'ভূমিকার অনুমতি পরিবর্তন করা হয়েছে: ' || COALESCE(v_clean_name_bn, v_clean_name_en),
            p_body_en := 'Permissions for role ' || v_clean_name_en || ' were modified (' || cardinality(v_added_perms)::text || ' added, ' || cardinality(v_removed_perms)::text || ' removed).',
            p_body_bn := 'ভূমিকা ' || COALESCE(v_clean_name_bn, v_clean_name_en) || '-এর অনুমতি পরিবর্তন করা হয়েছে (' || cardinality(v_added_perms)::text || 'টি যোগ, ' || cardinality(v_removed_perms)::text || 'টি অপসারিত)।',
            p_actor_user_id := auth.uid(),
            p_target_type := 'role',
            p_target_id := v_clean_id,
            p_target_label := v_clean_name_en,
            p_metadata := jsonb_build_object(
                'role_id', v_clean_id,
                'added_permissions', to_jsonb(v_added_perms),
                'removed_permissions', to_jsonb(v_removed_perms),
                'new_permission_count', cardinality(v_final_perms),
                'actor_user_id', auth.uid(),
                'timestamp', now()
            ),
            p_required_all_permissions := ARRAY['roles.manage'],
            p_required_any_permissions := '{}'::text[],
            p_audience_mode := 'permission',
            p_route := '/roles/' || v_clean_id,
            p_dedupe_key := 'role.permissions_changed:oversight:' || v_audit_id::text,
            p_exclude_actor := true,
            p_include_super_admin := true
        );
    END IF;

    RETURN jsonb_build_object(
        'id', v_updated_role.id,
        'name_en', v_updated_role.name_en,
        'name_bn', v_updated_role.name_bn,
        'description', v_updated_role.description,
        'active', v_updated_role.active,
        'is_system', v_updated_role.is_system,
        'permission_ids', to_jsonb(v_final_perms),
        'permission_count', cardinality(v_final_perms),
        'assigned_user_count', v_user_count,
        'created_at', v_updated_role.created_at,
        'updated_at', v_updated_role.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_role(TEXT, TEXT, TEXT, BOOLEAN, TEXT[], TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_role(TEXT, TEXT, TEXT, BOOLEAN, TEXT[], TEXT, BOOLEAN, BOOLEAN) TO authenticated, service_role;

COMMIT;

