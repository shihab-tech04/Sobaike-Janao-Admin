-- ==============================================================================
-- Migration: 20260903000001_phase2c_role_bilingual_names.sql
-- Module: Phase 2C — Full EN/BN Role Naming + Safe Technical Role ID
-- Safety: Strict Transactional, Preserves Immutable Role ID, Separate EN/BN Names,
--         English Drives Slug Generation, Bengali Name Never Affects Technical Slug,
--         Preserves System-Role Invariant, Preserves Last Manager Protection.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. DROP OLD OVERLOADS TO PREVENT POSTGRESQL FUNCTION CALL AMBIGUITY (PGRST202)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_create_role(text, boolean, text[], text);
DROP FUNCTION IF EXISTS public.admin_update_role(text, text, boolean, text[], text);
DROP FUNCTION IF EXISTS public.admin_update_role(text, text, boolean, text[], text, boolean);

-- ------------------------------------------------------------------------------
-- 2. CREATE HARDENED public.admin_create_role(...) WITH SEPARATE EN/BN SUPPORT
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_role(
    p_name_en text,
    p_name_bn text DEFAULT NULL,
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
    v_clean_name_en TEXT;
    v_clean_name_bn TEXT;
    v_role_id TEXT;
    v_clean_active BOOLEAN;
    v_clean_description TEXT;
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

    -- 2. Validate English role name (mandatory, drives technical slug)
    v_clean_name_en := btrim(p_name_en);
    IF v_clean_name_en IS NULL OR v_clean_name_en = '' THEN
        RAISE EXCEPTION 'English role name is required and cannot be blank.' USING ERRCODE = '22000';
    END IF;

    IF length(v_clean_name_en) > 100 THEN
        RAISE EXCEPTION 'English role name cannot exceed 100 characters.' USING ERRCODE = '22000';
    END IF;

    -- 3. Clean optional Bengali role name (does NOT affect technical slug)
    v_clean_name_bn := NULLIF(btrim(p_name_bn), '');
    IF v_clean_name_bn IS NOT NULL AND length(v_clean_name_bn) > 100 THEN
        RAISE EXCEPTION 'Bengali role name cannot exceed 100 characters.' USING ERRCODE = '22000';
    END IF;

    v_clean_active := COALESCE(p_active, true);
    v_clean_description := NULLIF(btrim(p_description), '');

    -- 4. Concurrency safety: acquire transaction-level advisory lock
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_role_management_mutation_lock'));

    -- 5. Generate immutable URL-safe ASCII slug from English name ONLY
    v_role_id := public.generate_role_slug(v_clean_name_en);

    -- 6. Check duplicate role by slug ID or visible English name (case-insensitive)
    IF EXISTS (
        SELECT 1 FROM public.roles 
        WHERE id = v_role_id 
           OR lower(btrim(name_en)) = lower(v_clean_name_en)
    ) THEN
        RAISE EXCEPTION 'A role with this name already exists.'
            USING ERRCODE = '23505';
    END IF;

    -- 7. Validate permission IDs if supplied
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

    -- 8. Insert into public.roles
    -- Stored separately: name_bn is NULL if not provided; never fabricated or translated.
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
        v_clean_name_en,
        v_clean_name_bn,
        v_clean_description,
        v_clean_active,
        false,
        now(),
        now()
    )
    RETURNING * INTO v_created_role;

    -- 9. Insert into public.role_permissions
    IF v_distinct_perms IS NOT NULL AND array_length(v_distinct_perms, 1) > 0 THEN
        FOREACH v_perm_id IN ARRAY v_distinct_perms
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, created_at)
            VALUES (v_role_id, v_perm_id, now());
        END LOOP;
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
        'role.created',
        'role',
        v_role_id,
        jsonb_build_object(
            'name_en', v_clean_name_en,
            'name_bn', v_clean_name_bn,
            'active', v_clean_active,
            'permission_count', COALESCE(array_length(v_distinct_perms, 1), 0),
            'permission_ids', v_distinct_perms,
            'description', v_clean_description
        ),
        now()
    );

    -- 11. Return structured JSON
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

-- ------------------------------------------------------------------------------
-- 3. CREATE HARDENED public.admin_update_role(...) WITH SEPARATE EN/BN SUPPORT
-- ------------------------------------------------------------------------------
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
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_clean_role_id TEXT;
    v_clean_name_en TEXT;
    v_clean_name_bn TEXT;
    v_final_name_bn TEXT;
    v_name_bn_updated BOOLEAN;
    v_clean_active BOOLEAN;
    v_existing_role RECORD;
    v_perm_id TEXT;
    v_distinct_perms TEXT[];
    v_invalid_perms TEXT[];
    v_final_perms TEXT[];
    v_final_description TEXT;
    v_desc_updated BOOLEAN;
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

    -- 5. Validate English role name
    v_clean_name_en := btrim(p_name_en);
    IF v_clean_name_en IS NULL OR v_clean_name_en = '' THEN
        RAISE EXCEPTION 'English role name is required and cannot be blank.' USING ERRCODE = '22000';
    END IF;

    IF length(v_clean_name_en) > 100 THEN
        RAISE EXCEPTION 'English role name cannot exceed 100 characters.' USING ERRCODE = '22000';
    END IF;

    v_clean_active := COALESCE(p_active, v_existing_role.active);

    -- 6. Resolve Bengali name update semantics
    -- If p_update_name_bn is TRUE -> update or clear (NULLIF)
    -- If p_update_name_bn is FALSE -> preserve existing
    -- If p_update_name_bn is NULL (omitted) -> update if non-null argument, else preserve existing
    IF p_update_name_bn IS TRUE THEN
        v_clean_name_bn := NULLIF(btrim(p_name_bn), '');
        v_final_name_bn := v_clean_name_bn;
        v_name_bn_updated := true;
    ELSIF p_update_name_bn IS FALSE THEN
        v_final_name_bn := v_existing_role.name_bn;
        v_name_bn_updated := false;
    ELSE
        IF p_name_bn IS NOT NULL THEN
            v_clean_name_bn := NULLIF(btrim(p_name_bn), '');
            v_final_name_bn := v_clean_name_bn;
            v_name_bn_updated := true;
        ELSE
            v_final_name_bn := v_existing_role.name_bn;
            v_name_bn_updated := false;
        END IF;
    END IF;

    IF v_final_name_bn IS NOT NULL AND length(v_final_name_bn) > 100 THEN
        RAISE EXCEPTION 'Bengali role name cannot exceed 100 characters.' USING ERRCODE = '22000';
    END IF;

    -- 7. SYSTEM-ROLE PROTECTION
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

        -- Prevent changing English name of a system role
        IF lower(v_clean_name_en) <> lower(v_existing_role.name_en) THEN
            RAISE EXCEPTION 'System role names are protected and cannot be modified.'
                USING ERRCODE = '42501';
        END IF;

        -- Prevent changing Bengali name of a system role
        IF v_name_bn_updated AND (v_final_name_bn IS DISTINCT FROM v_existing_role.name_bn) THEN
            RAISE EXCEPTION 'System role names are protected and cannot be modified.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 8. Check duplicate visible English role name against all other roles
    IF EXISTS (
        SELECT 1 FROM public.roles
        WHERE id <> v_clean_role_id
          AND lower(btrim(name_en)) = lower(v_clean_name_en)
    ) THEN
        RAISE EXCEPTION 'A role with this name already exists.'
            USING ERRCODE = '23505';
    END IF;

    -- 9. Resolve description update semantics safely
    -- If p_update_description is explicitly true -> update (or clear if empty/null)
    -- If p_update_description is explicitly false -> preserve existing
    -- If p_update_description is NULL (omitted) -> update if non-null string provided, else preserve existing
    IF p_update_description IS TRUE THEN
        v_final_description := NULLIF(btrim(p_description), '');
        v_desc_updated := true;
    ELSIF p_update_description IS FALSE THEN
        v_final_description := v_existing_role.description;
        v_desc_updated := false;
    ELSE
        IF p_description IS NOT NULL THEN
            v_final_description := NULLIF(btrim(p_description), '');
            v_desc_updated := true;
        ELSE
            v_final_description := v_existing_role.description;
            v_desc_updated := false;
        END IF;
    END IF;

    -- 10. Validate permission IDs if supplied
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

    -- 11. Update role table (preserving immutable technical role ID)
    UPDATE public.roles
    SET 
        name_en = v_clean_name_en,
        name_bn = v_final_name_bn,
        active = v_clean_active,
        description = v_final_description,
        updated_at = now()
    WHERE id = v_clean_role_id
    RETURNING * INTO v_updated_role;

    -- 12. If permission_ids supplied, replace permission set atomically
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

    -- 13. LAST EFFECTIVE ROLE MANAGER SAFETY ENFORCEMENT
    -- If user_roles assignments exist anywhere in the system, we must not leave 0 effective roles.manage holders
    IF EXISTS (SELECT 1 FROM public.user_roles) THEN
        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION 'Operation rejected: Cannot modify or deactivate this role because it would leave no active administrators with role management permissions.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- 14. Count assigned users for response
    SELECT COUNT(*)
    INTO v_user_count
    FROM public.user_roles ur
    WHERE ur.role_id = v_clean_role_id;

    -- 15. Write immutable administrative audit log
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
            'name_en', v_clean_name_en,
            'name_bn', v_final_name_bn,
            'name_bn_updated', v_name_bn_updated,
            'active', v_clean_active,
            'permissions_updated', (p_permission_ids IS NOT NULL),
            'permission_count', COALESCE(array_length(v_final_perms, 1), 0),
            'description_updated', v_desc_updated,
            'description', v_final_description
        ),
        now()
    );

    -- 16. Return structured JSON
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

-- ------------------------------------------------------------------------------
-- 4. PERMISSIONS AND GRANTS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_create_role(text, text, boolean, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_role(text, text, boolean, text[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_role(text, text, boolean, text[], text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_role(text, text, text, boolean, text[], text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_role(text, text, text, boolean, text[], text, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_role(text, text, text, boolean, text[], text, boolean, boolean) TO authenticated;

COMMIT;
