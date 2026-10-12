-- ==============================================================================
-- Migration: 20260902000008_phase2a_role_update_correction.sql
-- Module: Phase 2A Forward Correction — Role Update Name_BN & Description Preservation
-- Safety: Strict Transactional, Preserves Bengali Name, Preserves Omitted Description,
--         Preserves System-Role Invariant, Preserves Last Manager Protection.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. DROP OLD OVERLOAD TO AVOID POSTGRESQL FUNCTION AMBIGUITY
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_update_role(text, text, boolean, text[], text);

-- ------------------------------------------------------------------------------
-- 2. CREATE HARDENED public.admin_update_role(...) WITH NAME_BN & DESCRIPTION PRESERVATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_role(
    p_role_id text,
    p_name text,
    p_active boolean,
    p_permission_ids text[] DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_update_description boolean DEFAULT NULL
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

    -- 5. Validate input fields
    v_clean_name := btrim(p_name);
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Role name is required and cannot be blank.' USING ERRCODE = '22000';
    END IF;

    v_clean_active := COALESCE(p_active, v_existing_role.active);

    -- 6. SYSTEM-ROLE PROTECTION
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

    -- 8. Resolve description update semantics safely
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

    -- 9. Validate permission IDs if supplied
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

    -- 10. Update role table (preserving technical role ID AND existing name_bn)
    UPDATE public.roles
    SET 
        name_en = v_clean_name,
        name_bn = v_existing_role.name_bn,
        active = v_clean_active,
        description = v_final_description,
        updated_at = now()
    WHERE id = v_clean_role_id
    RETURNING * INTO v_updated_role;

    -- 11. If permission_ids supplied, replace permission set atomically
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

    -- 12. LAST EFFECTIVE ROLE MANAGER SAFETY ENFORCEMENT
    -- If user_roles assignments exist anywhere in the system, we must not leave 0 effective roles.manage holders
    IF EXISTS (SELECT 1 FROM public.user_roles) THEN
        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION 'Operation rejected: Cannot modify or deactivate this role because it would leave no active administrators with role management permissions.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- 13. Count assigned users for response
    SELECT COUNT(*)
    INTO v_user_count
    FROM public.user_roles ur
    WHERE ur.role_id = v_clean_role_id;

    -- 14. Write immutable administrative audit log
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
            'description_updated', v_desc_updated,
            'description', v_final_description
        ),
        now()
    );

    -- 15. Return structured JSON
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
-- 3. PERMISSIONS AND GRANTS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_update_role(text, text, boolean, text[], text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_role(text, text, boolean, text[], text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_role(text, text, boolean, text[], text, boolean) TO authenticated;

COMMIT;
