-- ==============================================================================
-- SOBAIKE JANAO ADMIN — ROLE MANAGEMENT BACKEND (PHASE 1: SECURE RPCs)
-- ==============================================================================
-- Repository: shihabshajib01-cell/sobaike-janao-admin
-- Target: Supabase PostgreSQL Database (sobaike-production)
-- Purpose:
--   1. Reusable permission check helper: public.has_permission(p_permission_id text)
--   2. Bootstrap authorization helper: public.can_manage_roles()
--      - Bootstrap mode: active Admin when COUNT(public.user_roles) = 0
--      - Normal mode: active Admin with effective 'roles.manage' permission
--   3. Slug generation helper: public.generate_role_slug(p_name text)
--   4. Read RPCs:
--      - public.admin_list_roles() -> Role list with permission_count & assigned_user_count
--      - public.admin_get_role_detail(p_role_id) -> Full role detail + permission mappings + count
--      - public.admin_get_permission_catalogue() -> 15 canonical permissions grouped by module
--   5. Write RPCs (Atomic, Audited, Strict Validation):
--      - public.admin_create_role(p_name, p_active, p_permission_ids, p_description)
--      - public.admin_update_role(p_role_id, p_name, p_active, p_permission_ids, p_description)
--      - public.admin_replace_role_permissions(p_role_id, p_permission_ids)
-- Safety: SECURITY DEFINER with fixed search_path = pg_catalog, public.
--         Atomic transactions, zero role/user seeding, zero direct table mutations.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. HELPER FUNCTION: public.has_permission(p_permission_id text)
-- ------------------------------------------------------------------------------
-- Checks whether the current authenticated user has an active role containing the
-- specified permission_id.
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_id text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users au
        JOIN public.user_roles ur ON ur.user_id = au.user_id
        JOIN public.roles r ON r.id = ur.role_id
        JOIN public.role_permissions rp ON rp.role_id = r.id
        WHERE au.user_id = auth.uid()
          AND au.active = true
          AND r.active = true
          AND rp.permission_id = p_permission_id
    );
$$;

REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. HELPER FUNCTION: public.can_manage_roles()
-- ------------------------------------------------------------------------------
-- Resolves whether the caller is authorized to create/update/manage roles:
-- 1) Caller must be an active admin (public.is_active_admin() = true)
-- 2) EITHER:
--    a) Bootstrap Mode: No user_roles assignments exist anywhere in the system (COUNT = 0)
--    b) Normal Mode: Caller has effective 'roles.manage' permission
CREATE OR REPLACE FUNCTION public.can_manage_roles()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_has_any_assignments BOOLEAN;
BEGIN
    -- Step 1: Must be an active admin
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = auth.uid() AND active = true
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RETURN false;
    END IF;

    -- Step 2: Check if any user_roles assignments exist anywhere in the system
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
    ) INTO v_has_any_assignments;

    -- If bootstrap mode (0 assignments), allow any authenticated active admin
    IF NOT v_has_any_assignments THEN
        RETURN true;
    END IF;

    -- Normal mode: Check for 'roles.manage' permission
    RETURN public.has_permission('roles.manage');
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_roles() FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_roles() TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. HELPER: Generate URL-safe slug from role name
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_role_slug(p_name text)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_slug TEXT;
BEGIN
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Role name cannot be empty' USING ERRCODE = '22000';
    END IF;

    -- Trim, lowercase, replace non-alphanumeric chars with hyphen, collapse hyphens, trim edges
    v_slug := lower(btrim(p_name));
    v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');

    IF v_slug IS NULL OR v_slug = '' THEN
        RAISE EXCEPTION 'Role name must contain valid alphanumeric characters' USING ERRCODE = '22000';
    END IF;

    RETURN v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_role_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_role_slug(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_role_slug(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. READ RPC: public.admin_get_permission_catalogue()
-- ------------------------------------------------------------------------------
-- Returns the canonical permissions catalogue grouped/sorted by module and action.
CREATE OR REPLACE FUNCTION public.admin_get_permission_catalogue()
RETURNS TABLE (
    id TEXT,
    module TEXT,
    action TEXT,
    name_en TEXT,
    name_bn TEXT,
    description TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. Role management authorization required.'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        p.id,
        p.module,
        p.action,
        p.name_en,
        p.name_bn,
        p.description,
        p.created_at
    FROM public.permissions p
    ORDER BY p.module ASC, p.action ASC, p.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_permission_catalogue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_permission_catalogue() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_permission_catalogue() TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. READ RPC: public.admin_list_roles()
-- ------------------------------------------------------------------------------
-- Returns all roles with aggregated permission count and assigned user count.
CREATE OR REPLACE FUNCTION public.admin_list_roles()
RETURNS TABLE (
    id TEXT,
    name_en TEXT,
    name_bn TEXT,
    description TEXT,
    active BOOLEAN,
    is_system BOOLEAN,
    permission_count BIGINT,
    assigned_user_count BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. Role management authorization required.'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.name_en,
        r.name_bn,
        r.description,
        r.active,
        r.is_system,
        COALESCE(COUNT(DISTINCT rp.permission_id), 0)::BIGINT AS permission_count,
        COALESCE(COUNT(DISTINCT ur.user_id), 0)::BIGINT AS assigned_user_count,
        r.created_at,
        r.updated_at
    FROM public.roles r
    LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
    LEFT JOIN public.user_roles ur ON ur.role_id = r.id
    GROUP BY r.id, r.name_en, r.name_bn, r.description, r.active, r.is_system, r.created_at, r.updated_at
    ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_roles() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_roles() TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. READ RPC: public.admin_get_role_detail(p_role_id text)
-- ------------------------------------------------------------------------------
-- Returns full role fields, assigned permission IDs array, and user count.
CREATE OR REPLACE FUNCTION public.admin_get_role_detail(p_role_id text)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_role RECORD;
    v_permissions TEXT[];
    v_user_count BIGINT;
    v_result JSONB;
BEGIN
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. Role management authorization required.'
            USING ERRCODE = '42501';
    END IF;

    IF p_role_id IS NULL OR btrim(p_role_id) = '' THEN
        RAISE EXCEPTION 'Role ID cannot be empty' USING ERRCODE = '22000';
    END IF;

    SELECT id, name_en, name_bn, description, active, is_system, created_at, updated_at
    INTO v_role
    FROM public.roles
    WHERE id = btrim(p_role_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found with ID: %', p_role_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(array_agg(rp.permission_id ORDER BY rp.permission_id), ARRAY[]::TEXT[])
    INTO v_permissions
    FROM public.role_permissions rp
    WHERE rp.role_id = v_role.id;

    SELECT COUNT(*)
    INTO v_user_count
    FROM public.user_roles ur
    WHERE ur.role_id = v_role.id;

    v_result := jsonb_build_object(
        'id', v_role.id,
        'name_en', v_role.name_en,
        'name_bn', v_role.name_bn,
        'description', v_role.description,
        'active', v_role.active,
        'is_system', v_role.is_system,
        'permission_ids', v_permissions,
        'permission_count', COALESCE(array_length(v_permissions, 1), 0),
        'assigned_user_count', v_user_count,
        'created_at', v_role.created_at,
        'updated_at', v_role.updated_at
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_role_detail(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_role_detail(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_role_detail(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. WRITE RPC: public.admin_create_role(...)
-- ------------------------------------------------------------------------------
-- Atomically creates a new role with validated permission IDs and audit trail.
CREATE OR REPLACE FUNCTION public.admin_create_role(
    p_name text,
    p_active boolean DEFAULT true,
    p_permission_ids text[] DEFAULT ARRAY[]::text[],
    p_description text DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_role_id TEXT;
    v_clean_name TEXT;
    v_clean_active BOOLEAN;
    v_perm_id TEXT;
    v_distinct_perms TEXT[];
    v_invalid_perms TEXT[];
    v_created_role RECORD;
BEGIN
    -- 1. Validate authorization
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. Role management authorization required.' USING ERRCODE = '42501';
    END IF;

    -- 2. Validate role name
    v_clean_name := btrim(p_name);
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Role name is required and cannot be blank.' USING ERRCODE = '22000';
    END IF;

    v_clean_active := COALESCE(p_active, true);

    -- 3. Generate role slug ID
    v_role_id := public.generate_role_slug(v_clean_name);

    -- 4. Check duplicate role by slug ID or visible name (case-insensitive)
    IF EXISTS (
        SELECT 1 FROM public.roles 
        WHERE id = v_role_id 
           OR lower(btrim(name_en)) = lower(v_clean_name)
    ) THEN
        RAISE EXCEPTION 'A role with this name already exists.'
            USING ERRCODE = '23505';
    END IF;

    -- 5. Validate permission IDs
    IF p_permission_ids IS NOT NULL AND array_length(p_permission_ids, 1) > 0 THEN
        -- Normalize distinct non-null permission IDs
        SELECT array_agg(DISTINCT btrim(elem))
        INTO v_distinct_perms
        FROM unnest(p_permission_ids) AS elem
        WHERE elem IS NOT NULL AND btrim(elem) <> '';

        -- Check for any unknown permissions
        SELECT array_agg(elem)
        INTO v_invalid_perms
        FROM unnest(v_distinct_perms) AS elem
        WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = elem);

        IF v_invalid_perms IS NOT NULL AND array_length(v_invalid_perms, 1) > 0 THEN
            RAISE EXCEPTION 'Invalid permission ID(s) provided: %', array_to_string(v_invalid_perms, ', ')
                USING ERRCODE = '22000';
        END IF;
    ELSE
        v_distinct_perms := ARRAY[]::TEXT[];
    END IF;

    -- 6. Insert into public.roles (name_bn falls back to submitted name)
    INSERT INTO public.roles (
        id,
        name_en,
        name_bn,
        description,
        active,
        is_system,
        created_at,
        updated_at
    ) VALUES (
        v_role_id,
        v_clean_name,
        v_clean_name,
        btrim(p_description),
        v_clean_active,
        false,
        now(),
        now()
    )
    RETURNING * INTO v_created_role;

    -- 7. Insert into public.role_permissions
    IF v_distinct_perms IS NOT NULL AND array_length(v_distinct_perms, 1) > 0 THEN
        FOREACH v_perm_id IN ARRAY v_distinct_perms
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, created_at)
            VALUES (v_role_id, v_perm_id, now());
        END LOOP;
    END IF;

    -- 8. Write immutable administrative audit log
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        v_caller_id,
        'role.created',
        'role',
        v_role_id,
        jsonb_build_object(
            'name', v_clean_name,
            'active', v_clean_active,
            'permission_count', COALESCE(array_length(v_distinct_perms, 1), 0),
            'permission_ids', COALESCE(v_distinct_perms, ARRAY[]::TEXT[]),
            'description', btrim(p_description)
        ),
        now()
    );

    -- 9. Return JSON representation
    RETURN jsonb_build_object(
        'id', v_created_role.id,
        'name_en', v_created_role.name_en,
        'name_bn', v_created_role.name_bn,
        'description', v_created_role.description,
        'active', v_created_role.active,
        'is_system', v_created_role.is_system,
        'permission_ids', COALESCE(v_distinct_perms, ARRAY[]::TEXT[]),
        'permission_count', COALESCE(array_length(v_distinct_perms, 1), 0),
        'created_at', v_created_role.created_at,
        'updated_at', v_created_role.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_role(text, boolean, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_role(text, boolean, text[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_role(text, boolean, text[], text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. WRITE RPC: public.admin_update_role(...)
-- ------------------------------------------------------------------------------
-- Updates role name, active status, description, and optionally replaces permission set.
-- Technical role ID remains stable on rename. Duplicate visible role names are rejected.
CREATE OR REPLACE FUNCTION public.admin_update_role(
    p_role_id text,
    p_name text,
    p_active boolean,
    p_permission_ids text[] DEFAULT NULL,
    p_description text DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_clean_role_id TEXT;
    v_clean_name TEXT;
    v_clean_active BOOLEAN;
    v_existing_role RECORD;
    v_perm_id TEXT;
    v_distinct_perms TEXT[];
    v_invalid_perms TEXT[];
    v_final_perms TEXT[];
    v_updated_role RECORD;
BEGIN
    -- 1. Validate authorization
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. Role management authorization required.' USING ERRCODE = '42501';
    END IF;

    -- 2. Validate role ID
    v_clean_role_id := btrim(p_role_id);
    IF v_clean_role_id IS NULL OR v_clean_role_id = '' THEN
        RAISE EXCEPTION 'Role ID cannot be empty.' USING ERRCODE = '22000';
    END IF;

    -- 3. Check role exists
    SELECT * INTO v_existing_role
    FROM public.roles
    WHERE id = v_clean_role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found with ID: %', v_clean_role_id USING ERRCODE = 'P0002';
    END IF;

    -- 4. Validate name & active
    v_clean_name := btrim(p_name);
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Role name is required and cannot be blank.' USING ERRCODE = '22000';
    END IF;

    v_clean_active := COALESCE(p_active, v_existing_role.active);

    -- 5. Check duplicate visible role name against all other roles
    IF EXISTS (
        SELECT 1 FROM public.roles
        WHERE id <> v_clean_role_id
          AND lower(btrim(name_en)) = lower(v_clean_name)
    ) THEN
        RAISE EXCEPTION 'A role with this name already exists.'
            USING ERRCODE = '23505';
    END IF;

    -- 6. Update role table (keeping technical ID stable)
    UPDATE public.roles
    SET 
        name_en = v_clean_name,
        name_bn = v_clean_name,
        active = v_clean_active,
        description = btrim(p_description),
        updated_at = now()
    WHERE id = v_clean_role_id
    RETURNING * INTO v_updated_role;

    -- 7. If permission_ids supplied, replace permission set atomically
    IF p_permission_ids IS NOT NULL THEN
        SELECT array_agg(DISTINCT btrim(elem))
        INTO v_distinct_perms
        FROM unnest(p_permission_ids) AS elem
        WHERE elem IS NOT NULL AND btrim(elem) <> '';

        IF v_distinct_perms IS NOT NULL AND array_length(v_distinct_perms, 1) > 0 THEN
            SELECT array_agg(elem)
            INTO v_invalid_perms
            FROM unnest(v_distinct_perms) AS elem
            WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = elem);

            IF v_invalid_perms IS NOT NULL AND array_length(v_invalid_perms, 1) > 0 THEN
                RAISE EXCEPTION 'Invalid permission ID(s) provided: %', array_to_string(v_invalid_perms, ', ')
                    USING ERRCODE = '22000';
            END IF;
        ELSE
            v_distinct_perms := ARRAY[]::TEXT[];
        END IF;

        -- Clear old mappings
        DELETE FROM public.role_permissions WHERE role_id = v_clean_role_id;

        -- Insert new mappings
        IF v_distinct_perms IS NOT NULL AND array_length(v_distinct_perms, 1) > 0 THEN
            FOREACH v_perm_id IN ARRAY v_distinct_perms
            LOOP
                INSERT INTO public.role_permissions (role_id, permission_id, created_at)
                VALUES (v_clean_role_id, v_perm_id, now());
            END LOOP;
        END IF;

        v_final_perms := COALESCE(v_distinct_perms, ARRAY[]::TEXT[]);
    ELSE
        -- Retain existing permissions
        SELECT COALESCE(array_agg(permission_id ORDER BY permission_id), ARRAY[]::TEXT[])
        INTO v_final_perms
        FROM public.role_permissions
        WHERE role_id = v_clean_role_id;
    END IF;

    -- 8. Audit log
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        v_caller_id,
        'role.updated',
        'role',
        v_clean_role_id,
        jsonb_build_object(
            'name', v_clean_name,
            'active', v_clean_active,
            'permissions_updated', (p_permission_ids IS NOT NULL),
            'permission_count', COALESCE(array_length(v_final_perms, 1), 0),
            'description', btrim(p_description)
        ),
        now()
    );

    RETURN jsonb_build_object(
        'id', v_updated_role.id,
        'name_en', v_updated_role.name_en,
        'name_bn', v_updated_role.name_bn,
        'description', v_updated_role.description,
        'active', v_updated_role.active,
        'is_system', v_updated_role.is_system,
        'permission_ids', v_final_perms,
        'permission_count', COALESCE(array_length(v_final_perms, 1), 0),
        'created_at', v_updated_role.created_at,
        'updated_at', v_updated_role.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_role(text, text, boolean, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_role(text, text, boolean, text[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_role(text, text, boolean, text[], text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 9. WRITE RPC: public.admin_replace_role_permissions(p_role_id, p_permission_ids)
-- ------------------------------------------------------------------------------
-- Dedicated atomic RPC for replacing a role's permissions set.
CREATE OR REPLACE FUNCTION public.admin_replace_role_permissions(
    p_role_id text,
    p_permission_ids text[]
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_clean_role_id TEXT;
    v_perm_id TEXT;
    v_distinct_perms TEXT[];
    v_invalid_perms TEXT[];
BEGIN
    -- 1. Validate authorization
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. Role management authorization required.' USING ERRCODE = '42501';
    END IF;

    -- 2. Validate role exists
    v_clean_role_id := btrim(p_role_id);
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = v_clean_role_id) THEN
        RAISE EXCEPTION 'Role not found with ID: %', v_clean_role_id USING ERRCODE = 'P0002';
    END IF;

    -- 3. Validate permissions
    IF p_permission_ids IS NOT NULL AND array_length(p_permission_ids, 1) > 0 THEN
        SELECT array_agg(DISTINCT btrim(elem))
        INTO v_distinct_perms
        FROM unnest(p_permission_ids) AS elem
        WHERE elem IS NOT NULL AND btrim(elem) <> '';

        SELECT array_agg(elem)
        INTO v_invalid_perms
        FROM unnest(v_distinct_perms) AS elem
        WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = elem);

        IF v_invalid_perms IS NOT NULL AND array_length(v_invalid_perms, 1) > 0 THEN
            RAISE EXCEPTION 'Invalid permission ID(s) provided: %', array_to_string(v_invalid_perms, ', ')
                USING ERRCODE = '22000';
        END IF;
    ELSE
        v_distinct_perms := ARRAY[]::TEXT[];
    END IF;

    -- 4. Replace mappings
    DELETE FROM public.role_permissions WHERE role_id = v_clean_role_id;

    IF v_distinct_perms IS NOT NULL AND array_length(v_distinct_perms, 1) > 0 THEN
        FOREACH v_perm_id IN ARRAY v_distinct_perms
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, created_at)
            VALUES (v_clean_role_id, v_perm_id, now());
        END LOOP;
    END IF;

    -- 5. Update role updated_at timestamp
    UPDATE public.roles SET updated_at = now() WHERE id = v_clean_role_id;

    -- 6. Audit log
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        v_caller_id,
        'role.permissions_updated',
        'role',
        v_clean_role_id,
        jsonb_build_object(
            'permission_count', COALESCE(array_length(v_distinct_perms, 1), 0),
            'permission_ids', COALESCE(v_distinct_perms, ARRAY[]::TEXT[])
        ),
        now()
    );

    RETURN jsonb_build_object(
        'role_id', v_clean_role_id,
        'permission_ids', COALESCE(v_distinct_perms, ARRAY[]::TEXT[]),
        'permission_count', COALESCE(array_length(v_distinct_perms, 1), 0),
        'updated_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_replace_role_permissions(text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_replace_role_permissions(text, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_replace_role_permissions(text, text[]) TO authenticated;

COMMIT;
