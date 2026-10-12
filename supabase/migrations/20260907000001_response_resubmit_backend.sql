-- ==============================================================================
-- SOBAIKE JANAO ADMIN — REJECTED RESPONSE RESUBMIT BACKEND & RBAC
-- ==============================================================================
-- Migration: 20260907000001_response_resubmit_backend.sql
-- Description:
--   1. Prerequisite validation for RBAC, response schema, and previous permissions.
--   2. Seeds canonical response resubmit permission:
--      - responses.resubmit (module: 'responses', action: 'resubmit')
--   3. Strict no auto-grant to existing roles (permission added to catalog only).
--   4. Creates hardened, SECURITY DEFINER resubmit RPC:
--      - public.admin_resubmit_response(p_response_id text)
--   5. Strict status transition:
--      - rejected -> pending_review ONLY
--      - Blocks all other transitions.
--   6. Preserves existing Response ID and record in place (no duplicate row).
--   7. Preserves response content, incident date, contact metadata, and existing published_at.
--   8. Audit logging into public.admin_audit_logs with zero exposure of private contact info:
--      - action: 'response.resubmit'
--   9. Tight privileges: REVOKE from PUBLIC/anon, GRANT EXECUTE to authenticated.
--  10. Row locking with FOR UPDATE and explicit pre-COMMIT fail-closed assertions.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PREREQUISITE VALIDATION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.complaint_responses') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.complaint_responses table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF to_regclass('public.permissions') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.permissions table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF to_regclass('public.role_permissions') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.role_permissions table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF to_regclass('public.roles') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.roles table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF to_regclass('public.user_roles') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.user_roles table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF to_regclass('public.admin_users') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.admin_users table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF to_regclass('public.admin_audit_logs') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.admin_audit_logs table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'is_active_admin'
          AND oidvectortypes(p.proargtypes) = ''
    ) THEN
        RAISE EXCEPTION 'Prerequisite failed: public.is_active_admin() function does not exist.'
            USING ERRCODE = '42883';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'has_permission'
          AND oidvectortypes(p.proargtypes) = 'text'
    ) THEN
        RAISE EXCEPTION 'Prerequisite failed: public.has_permission(text) function does not exist.'
            USING ERRCODE = '42883';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.permissions WHERE id = 'responses.view'
    ) THEN
        RAISE EXCEPTION 'Prerequisite failed: canonical permission responses.view does not exist.'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.permissions WHERE id = 'responses.publish'
    ) THEN
        RAISE EXCEPTION 'Prerequisite failed: canonical permission responses.publish does not exist.'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.permissions WHERE id = 'responses.reject'
    ) THEN
        RAISE EXCEPTION 'Prerequisite failed: canonical permission responses.reject does not exist.'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.permissions WHERE id = 'responses.unpublish'
    ) THEN
        RAISE EXCEPTION 'Prerequisite failed: canonical permission responses.unpublish does not exist.'
            USING ERRCODE = 'P0002';
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. SEED CANONICAL RESPONSE RESUBMIT PERMISSION
-- ------------------------------------------------------------------------------
-- Critical: Seed to catalog only. Do NOT automatically assign to roles.
INSERT INTO public.permissions (id, module, action, name_en, name_bn, description)
VALUES (
    'responses.resubmit',
    'responses',
    'resubmit',
    'Resubmit Response',
    'প্রতিক্রিয়া পুনরায় পর্যালোচনায় পাঠান',
    'Send a rejected response back to Pending Review without changing its content.'
)
ON CONFLICT (id) DO NOTHING;

-- Semantic validation: verify the row has the exact expected fields
DO $$
DECLARE
    v_perm record;
BEGIN
    SELECT id, module, action INTO v_perm
    FROM public.permissions
    WHERE id = 'responses.resubmit';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verification failed: responses.resubmit was not seeded into public.permissions.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_perm.module <> 'responses' OR v_perm.action <> 'resubmit' THEN
        RAISE EXCEPTION 'Verification failed: responses.resubmit has incompatible module/action definition.'
            USING ERRCODE = '22023';
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. RESUBMIT RPC: public.admin_resubmit_response
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resubmit_response(
    p_response_id text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trimmed_id text;
    v_response record;
    v_now timestamptz := clock_timestamp();
BEGIN
    -- 1. Authorization: active admin + responses.resubmit permission
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.resubmit') THEN
        RAISE EXCEPTION 'Access denied. Missing responses.resubmit permission.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Input validation
    v_trimmed_id := NULLIF(btrim(p_response_id), '');
    IF v_trimmed_id IS NULL THEN
        RAISE EXCEPTION 'Invalid input: response ID cannot be empty.'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Lock row FOR UPDATE and fetch current status & published_at
    SELECT id, status, published_at
    INTO v_response
    FROM public.complaint_responses
    WHERE id::text = v_trimmed_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Response not found: %', v_trimmed_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 4. Strict status transition: ONLY rejected -> pending_review
    IF v_response.status <> 'rejected' THEN
        RAISE EXCEPTION 'Cannot resubmit response with status "%". Only "rejected" responses can be resubmitted.', v_response.status
            USING ERRCODE = '22023';
    END IF;

    -- 5. Status mutation
    -- Reuses existing row in place. Does not alter content, id, created_at, or published_at.
    UPDATE public.complaint_responses
    SET
        status = 'pending_review',
        updated_at = v_now
    WHERE id = v_response.id;

    -- 6. Audit log entry (zero exposure of private citizen contact info)
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details
    ) VALUES (
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

    -- 7. Return mutation payload matching ResponseModerationResult shape
    RETURN jsonb_build_object(
        'success', true,
        'response_id', v_trimmed_id,
        'previous_status', v_response.status,
        'status', 'pending_review',
        'updated_at', v_now,
        'published_at', v_response.published_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. PRIVILEGE HARDENING FOR RESUBMIT RPC
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_resubmit_response(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_resubmit_response(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_resubmit_response(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. PRE-COMMIT FAIL-CLOSED VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_resub_oid oid;
    v_resub_secdef boolean;
    v_resub_config text[];
BEGIN
    -- Verify complaint_responses exists
    IF to_regclass('public.complaint_responses') IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: public.complaint_responses does not exist.';
    END IF;

    -- Verify admin_audit_logs exists
    IF to_regclass('public.admin_audit_logs') IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: public.admin_audit_logs does not exist.';
    END IF;

    -- Verify responses.resubmit permission exists
    IF NOT EXISTS (
        SELECT 1 FROM public.permissions WHERE id = 'responses.resubmit'
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: responses.resubmit permission does not exist.';
    END IF;

    -- Verify no role has auto-grant for responses.resubmit
    IF EXISTS (
        SELECT 1 FROM public.role_permissions WHERE permission_id = 'responses.resubmit'
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: responses.resubmit must not be automatically assigned to any role.';
    END IF;

    -- Exact signature resolution: admin_resubmit_response(text)
    SELECT p.oid, p.prosecdef, p.proconfig
    INTO v_resub_oid, v_resub_secdef, v_resub_config
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_resubmit_response'
      AND oidvectortypes(p.proargtypes) = 'text';

    IF v_resub_oid IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_resubmit_response(text) RPC not found.';
    END IF;

    IF NOT v_resub_secdef THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_resubmit_response must be SECURITY DEFINER.';
    END IF;

    IF NOT (
        v_resub_config @> ARRAY['search_path=pg_catalog, public']
        OR v_resub_config @> ARRAY['search_path=pg_catalog,public']
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_resubmit_response must have search_path = pg_catalog, public.';
    END IF;

    -- Verify PUBLIC execute is completely blocked via catalog inspection (no public execute ACL)
    IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_resubmit_response'
          AND oidvectortypes(p.proargtypes) = 'text'
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: PUBLIC execute must be blocked on admin_resubmit_response.';
    END IF;

    -- Verify anon execute is blocked
    IF has_function_privilege('anon', v_resub_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'Pre-commit check failed: anon execute must be blocked on admin_resubmit_response.';
    END IF;

    -- Verify authenticated execute is allowed
    IF NOT has_function_privilege('authenticated', v_resub_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'Pre-commit check failed: authenticated execute must be granted on admin_resubmit_response.';
    END IF;

    -- Verify authenticated has no raw UPDATE on complaint_responses
    IF has_table_privilege('authenticated', 'public.complaint_responses', 'UPDATE') THEN
        RAISE EXCEPTION 'Pre-commit check failed: authenticated raw UPDATE on complaint_responses must remain blocked.';
    END IF;

    -- Verify authenticated has no raw SELECT on complaint_responses
    IF has_table_privilege('authenticated', 'public.complaint_responses', 'SELECT') THEN
        RAISE EXCEPTION 'Pre-commit check failed: authenticated raw SELECT on complaint_responses must remain blocked.';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------------------------
-- 6. POST-COMMIT CATALOG-DERIVED VERIFICATION
-- ------------------------------------------------------------------------------
SELECT
    (SELECT to_regclass('public.complaint_responses') IS NOT NULL) AS response_table,
    (SELECT to_regclass('public.admin_audit_logs') IS NOT NULL) AS audit_log_table,
    (SELECT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.resubmit')) AS responses_resubmit_permission,
    (SELECT NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE permission_id = 'responses.resubmit')) AS no_role_auto_grant,
    (SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_resubmit_response'
          AND oidvectortypes(p.proargtypes) = 'text'
    )) AS resubmit_rpc,
    (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_resubmit_response'
       AND oidvectortypes(p.proargtypes) = 'text'
    ) AS resubmit_security_definer,
    (SELECT p.proconfig @> ARRAY['search_path=pg_catalog, public'] OR p.proconfig @> ARRAY['search_path=pg_catalog,public']
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_resubmit_response'
       AND oidvectortypes(p.proargtypes) = 'text'
    ) AS resubmit_safe_search_path,
    (
        SELECT NOT EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            WHERE n.nspname = 'public'
              AND p.proname = 'admin_resubmit_response'
              AND oidvectortypes(p.proargtypes) = 'text'
              AND acl.grantee = 0
              AND acl.privilege_type = 'EXECUTE'
        )
    ) AS public_execute_blocked,
    (
        SELECT NOT has_function_privilege('anon', 'public.admin_resubmit_response(text)', 'EXECUTE')
    ) AS anon_execute_blocked,
    (
        SELECT has_function_privilege('authenticated', 'public.admin_resubmit_response(text)', 'EXECUTE')
    ) AS authenticated_execute_allowed,
    (SELECT NOT has_table_privilege('authenticated', 'public.complaint_responses', 'SELECT')) AS authenticated_raw_select_blocked,
    (SELECT NOT has_table_privilege('authenticated', 'public.complaint_responses', 'UPDATE')) AS authenticated_raw_update_blocked;
