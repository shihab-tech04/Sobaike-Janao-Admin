-- ==============================================================================
-- Migration: 20260904000008_admin_delete_user.sql
-- Description: Implement administrative user deletion preflight and validation procedure
--   1. Transaction wrapping (BEGIN ... COMMIT)
--   2. Enforces caller authorization via has_permission('admin_users.manage')
--   3. Blocks caller self-deletion (CANNOT_DELETE_SELF)
--   4. Blocks deletion of Super Administrator accounts (SUPER_ADMIN_CANNOT_BE_DELETED)
--   5. Enforces delegation ceiling via can_manage_user_target(p_target_user_id)
--   6. Gathers metadata (display_name, email, role) for validation & audit preparation
--   7. Safe helper/check operation: does NOT perform independent destructive partial deletions
--   8. Explicit revocation from anon, grant to authenticated and service_role
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_target RECORD;
    v_auth_email TEXT;
    v_previous_role_id TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- Concurrency serialization
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_user_management_mutation_lock'));

    -- 1. Check caller authentication
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    -- 2. Verify caller has admin_users.manage permission
    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to delete administrative users.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Validate target user ID parameter
    IF p_target_user_id IS NULL THEN
        RAISE EXCEPTION 'Target User ID is required.' USING ERRCODE = '22000';
    END IF;

    -- 4. Block self-deletion
    IF v_caller_id = p_target_user_id THEN
        RAISE EXCEPTION 'You cannot delete your own administrative account.'
            USING ERRCODE = '42501',
                  DETAIL = 'CANNOT_DELETE_SELF';
    END IF;

    -- 5. Query target administrator
    SELECT user_id, display_name, active, is_super_admin
    INTO v_target
    FROM public.admin_users
    WHERE user_id = p_target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Administrator account not found.' USING ERRCODE = 'P0002';
    END IF;

    -- 6. Super Admin protection guard
    IF v_target.is_super_admin IS TRUE THEN
        RAISE EXCEPTION 'Protected system account: Super Administrator cannot be deleted.'
            USING ERRCODE = '42501',
                  DETAIL = 'SUPER_ADMIN_CANNOT_BE_DELETED';
    END IF;

    -- 7. Delegation ceiling guard
    IF NOT public.can_manage_user_target(p_target_user_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot delete an administrator with permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- 8. Fetch target email from auth.users (if available)
    BEGIN
        SELECT email INTO v_auth_email
        FROM auth.users
        WHERE id = p_target_user_id;
    EXCEPTION WHEN OTHERS THEN
        v_auth_email := NULL;
    END;

    -- 9. Fetch previous role ID for audit metadata
    SELECT role_id INTO v_previous_role_id
    FROM public.user_roles
    WHERE user_id = p_target_user_id
    LIMIT 1;

    -- 10. Return validation success with target metadata
    -- Note: Authoritative removal of auth.users and associated cascading
    -- cleanup is orchestrated by the admin-delete-user Edge Function using service_role
    -- credentials to avoid partial deletions and orphaned records.
    RETURN jsonb_build_object(
        'success', true,
        'eligible_for_deletion', true,
        'target_user_id', p_target_user_id,
        'display_name', v_target.display_name,
        'email', v_auth_email,
        'previous_role_id', v_previous_role_id
    );
END;
$$;

-- Explicitly revoke from anon and grant to authenticated
REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO service_role;

-- Grant service_role narrow privileges required during delete operations
GRANT SELECT ON TABLE public.user_roles TO service_role;
GRANT INSERT ON TABLE public.admin_audit_logs TO service_role;

COMMIT;
