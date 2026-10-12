-- ==============================================================================
-- SOBAIKE JANAO ADMIN — PHASE 2A: ROLE MANAGEMENT BACKEND SAFETY
-- ==============================================================================
-- Repository: shihabshajib01-cell/sobaike-janao-admin
-- Target: Supabase PostgreSQL Database (sobaike-production)
-- Purpose:
--   1. Helper Function: public.count_effective_role_managers()
--      - Calculates the count of active administrators with an active assigned role
--        containing the 'roles.manage' permission.
--   2. Last Effective Role Manager Lockout Protection:
--      - Guarantees that no permission replacement or role deactivation can leave
--        zero effective 'roles.manage' holders once user_roles assignments exist.
--   3. System Role Protection:
--      - Rejects deactivation, permission modification, or renaming of roles where is_system = true.
--   4. Role Technical ID Immutability:
--      - Ensures role slug ID cannot be mutated on role updates.
--   5. Atomic, Transactional, Audited Write Operations:
--      - public.admin_update_role()
--      - public.admin_replace_role_permissions()
--   6. Reaffirm Read RPC:
--      - public.admin_get_role_detail()
-- Safety: SECURITY DEFINER with fixed search_path = pg_catalog, public.
--         Advisory xact lock for concurrency safety.
--         Idempotent, non-destructive, transaction-wrapped.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. HELPER: public.count_effective_role_managers()
-- ------------------------------------------------------------------------------
-- Returns the count of distinct active admin users who hold an active role
-- with the 'roles.manage' permission.
CREATE OR REPLACE FUNCTION public.count_effective_role_managers()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT COUNT(DISTINCT au.user_id)::BIGINT
    FROM public.admin_users au
    JOIN public.user_roles ur ON ur.user_id = au.user_id
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    WHERE au.active = true
      AND r.active = true
      AND rp.permission_id = 'roles.manage';
$$;

REVOKE ALL ON FUNCTION public.count_effective_role_managers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_effective_role_managers() FROM anon;
GRANT EXECUTE ON FUNCTION public.count_effective_role_managers() TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. HARDENED WRITE RPC: public.admin_update_role(...)
-- ------------------------------------------------------------------------------
-- Atomically updates role metadata and optionally replaces its permission set.
-- Enforces system role protection, technical ID immutability, permission validation,
-- and last effective role manager safety.
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
    v_user_count BIGINT;
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

    -- 3. Concurrency safety: acquire transaction-level advisory lock
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_role_management_mutation_lock'));

    -- 4. Check role exists and lock row FOR UPDATE
    SELECT * INTO v_existing_role
    FROM public.roles
    WHERE id = v_clean_role_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found with ID: %', v_clean_role_id USING ERRCODE = 'P0002';
    END IF;

    -- 5. Validate input fields
    v_clean_name := btrim(p_name);
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Role name is required and cannot be blank.' USING ERRCODE = '22000';
    END IF;

    v_clean_active := COALESCE(p_active, v_existing_role.active);

    -- 6. System-role safety protections
    IF v_existing_role.is_system THEN
        -- Prevent deactivating system role
        IF NOT v_clean_active THEN
            RAISE EXCEPTION 'System roles are protected and cannot be deactivated.'
                USING ERRCODE = '42501';
        END IF;

        -- Prevent modifying permissions of a system role
        IF p_permission_ids IS NOT NULL THEN
            RAISE EXCEPTION 'System role permissions are protected and cannot be modified.'
                USING ERRCODE = '42501';
        END IF;

        -- Prevent renaming a system role
        IF lower(v_clean_name) <> lower(v_existing_role.name_en) THEN
            RAISE EXCEPTION 'System role names are protected and cannot be modified.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 7. Check duplicate visible role name against all other roles
    IF EXISTS (
        SELECT 1 FROM public.roles
        WHERE id <> v_clean_role_id
          AND lower(btrim(name_en)) = lower(v_clean_name)
    ) THEN
        RAISE EXCEPTION 'A role with this name already exists.'
            USING ERRCODE = '23505';
    END IF;

    -- 8. Validate permission IDs if supplied
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
    END IF;

    -- 9. Update role table (keeping technical role ID immutable)
    UPDATE public.roles
    SET 
        name_en = v_clean_name,
        name_bn = v_clean_name,
        active = v_clean_active,
        description = btrim(p_description),
        updated_at = now()
    WHERE id = v_clean_role_id
    RETURNING * INTO v_updated_role;

    -- 10. If permission_ids supplied, replace permission set atomically
    IF p_permission_ids IS NOT NULL THEN
        DELETE FROM public.role_permissions WHERE role_id = v_clean_role_id;

        IF v_distinct_perms IS NOT NULL AND array_length(v_distinct_perms, 1) > 0 THEN
            FOREACH v_perm_id IN ARRAY v_distinct_perms
            LOOP
                INSERT INTO public.role_permissions (role_id, permission_id, created_at)
                VALUES (v_clean_role_id, v_perm_id, now());
            END LOOP;
        END IF;

        v_final_perms := COALESCE(v_distinct_perms, ARRAY[]::TEXT[]);
    ELSE
        SELECT COALESCE(array_agg(permission_id ORDER BY permission_id), ARRAY[]::TEXT[])
        INTO v_final_perms
        FROM public.role_permissions
        WHERE role_id = v_clean_role_id;
    END IF;

    -- 11. LAST EFFECTIVE ROLE MANAGER SAFETY ENFORCEMENT
    -- If user_roles assignments exist anywhere in the system, we must not leave 0 effective roles.manage holders
    IF EXISTS (SELECT 1 FROM public.user_roles) THEN
        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION 'Operation rejected: Cannot modify or deactivate this role because it would leave no active administrators with role management permissions.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- 12. Count assigned users for response
    SELECT COUNT(*)
    INTO v_user_count
    FROM public.user_roles ur
    WHERE ur.role_id = v_clean_role_id;

    -- 13. Write immutable administrative audit log
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

    -- 14. Return structured JSON
    RETURN jsonb_build_object(
        'id', v_updated_role.id,
        'name_en', v_updated_role.name_en,
        'name_bn', v_updated_role.name_bn,
        'description', v_updated_role.description,
        'active', v_updated_role.active,
        'is_system', v_updated_role.is_system,
        'permission_ids', v_final_perms,
        'permission_count', COALESCE(array_length(v_final_perms, 1), 0),
        'assigned_user_count', v_user_count,
        'created_at', v_updated_role.created_at,
        'updated_at', v_updated_role.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_role(text, text, boolean, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_role(text, text, boolean, text[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_role(text, text, boolean, text[], text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. HARDENED WRITE RPC: public.admin_replace_role_permissions(...)
-- ------------------------------------------------------------------------------
-- Dedicated atomic RPC for replacing a role's permissions set.
-- Enforces system role protection, permission validation, and last effective manager protection.
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
    v_existing_role RECORD;
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

    -- 2. Validate role ID
    v_clean_role_id := btrim(p_role_id);
    IF v_clean_role_id IS NULL OR v_clean_role_id = '' THEN
        RAISE EXCEPTION 'Role ID cannot be empty.' USING ERRCODE = '22000';
    END IF;

    -- 3. Concurrency safety: acquire transaction-level advisory lock
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_role_management_mutation_lock'));

    -- 4. Check role exists and lock row FOR UPDATE
    SELECT * INTO v_existing_role
    FROM public.roles
    WHERE id = v_clean_role_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found with ID: %', v_clean_role_id USING ERRCODE = 'P0002';
    END IF;

    -- 5. System-role safety protection
    IF v_existing_role.is_system THEN
        RAISE EXCEPTION 'System roles are protected and their permissions cannot be modified.'
            USING ERRCODE = '42501';
    END IF;

    -- 6. Validate permissions
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

    -- 7. Replace mappings atomically
    DELETE FROM public.role_permissions WHERE role_id = v_clean_role_id;

    IF v_distinct_perms IS NOT NULL AND array_length(v_distinct_perms, 1) > 0 THEN
        FOREACH v_perm_id IN ARRAY v_distinct_perms
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, created_at)
            VALUES (v_clean_role_id, v_perm_id, now());
        END LOOP;
    END IF;

    -- 8. Update role updated_at timestamp
    UPDATE public.roles SET updated_at = now() WHERE id = v_clean_role_id;

    -- 9. LAST EFFECTIVE ROLE MANAGER SAFETY ENFORCEMENT
    IF EXISTS (SELECT 1 FROM public.user_roles) THEN
        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION 'Operation rejected: Cannot remove roles.manage permission because it would leave no active administrators with role management permissions.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- 10. Write immutable administrative audit log
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

-- ------------------------------------------------------------------------------
-- 4. REAFFIRM READ RPC: public.admin_get_role_detail(p_role_id text)
-- ------------------------------------------------------------------------------
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
        RAISE EXCEPTION 'Role ID cannot be empty.' USING ERRCODE = '22000';
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

COMMIT;
