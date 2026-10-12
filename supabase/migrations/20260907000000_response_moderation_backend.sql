-- ==============================================================================
-- SOBAIKE JANAO ADMIN — RESPONSE MODERATION BACKEND & RBAC
-- ==============================================================================
-- Migration: 20260907000000_response_moderation_backend.sql
-- Description:
--   1. Prerequisite validation for RBAC and response schema.
--   2. Seeds canonical response moderation permissions:
--      - responses.publish
--      - responses.reject
--      - responses.unpublish
--   3. Strict no auto-grant to existing roles (permissions added to catalog only).
--   4. Creates hardened, SECURITY DEFINER moderation RPCs:
--      - public.admin_publish_response(p_response_id text)
--      - public.admin_reject_response(p_response_id text, p_note text DEFAULT NULL)
--      - public.admin_unpublish_response(p_response_id text, p_reason text DEFAULT NULL)
--   5. Strict status transitions:
--      - pending_review -> published
--      - pending_review -> rejected
--      - published -> unpublished
--   6. Audit logging into public.admin_audit_logs with zero exposure of private contact info.
--   7. Tight privileges: REVOKE from PUBLIC/anon, GRANT EXECUTE to authenticated.
--   8. Row locking with FOR UPDATE and explicit pre-COMMIT fail-closed assertions.
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
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. SEED CANONICAL RESPONSE MODERATION PERMISSIONS
-- ------------------------------------------------------------------------------
-- Critical: Seed to catalog only. Do NOT automatically assign to roles.
INSERT INTO public.permissions (id, module, action, name_en, name_bn, description)
VALUES
    ('responses.publish', 'responses', 'publish', 'Publish Response', 'প্রতিক্রিয়া প্রকাশ করুন', 'Publish an official agency or citizen information response.'),
    ('responses.reject', 'responses', 'reject', 'Reject Response', 'প্রতিক্রিয়া প্রত্যাখ্যান করুন', 'Reject an inappropriate or irrelevant response.'),
    ('responses.unpublish', 'responses', 'unpublish', 'Unpublish Response', 'প্রতিক্রিয়া অপ্রকাশিত করুন', 'Retract a previously published response from public display.')
ON CONFLICT (id) DO NOTHING;

-- Validate seeded permissions exist and match canonical taxonomy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.permissions 
        WHERE id = 'responses.publish' AND module = 'responses' AND action = 'publish'
    ) THEN
        RAISE EXCEPTION 'Semantic validation failed: responses.publish permission missing or corrupt.'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.permissions 
        WHERE id = 'responses.reject' AND module = 'responses' AND action = 'reject'
    ) THEN
        RAISE EXCEPTION 'Semantic validation failed: responses.reject permission missing or corrupt.'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.permissions 
        WHERE id = 'responses.unpublish' AND module = 'responses' AND action = 'unpublish'
    ) THEN
        RAISE EXCEPTION 'Semantic validation failed: responses.unpublish permission missing or corrupt.'
            USING ERRCODE = 'P0002';
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. MODERATION RPC: public.admin_publish_response
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_publish_response(
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
    -- 1. Authorization: active admin + responses.publish permission
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.publish') THEN
        RAISE EXCEPTION 'Access denied. Missing responses.publish permission.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Input validation
    v_trimmed_id := NULLIF(btrim(p_response_id), '');
    IF v_trimmed_id IS NULL THEN
        RAISE EXCEPTION 'Invalid input: response ID cannot be empty.'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Lock row FOR UPDATE and fetch current status
    SELECT id, status, published_at
    INTO v_response
    FROM public.complaint_responses
    WHERE id::text = v_trimmed_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Response not found: %', v_trimmed_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 4. Strict status transition: ONLY pending_review -> published
    IF v_response.status <> 'pending_review' THEN
        RAISE EXCEPTION 'Cannot publish response with status "%". Only "pending_review" responses can be published.', v_response.status
            USING ERRCODE = '22023';
    END IF;

    -- 5. Status mutation
    UPDATE public.complaint_responses
    SET
        status = 'published',
        published_at = v_now,
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
        'response.publish',
        'response',
        v_trimmed_id,
        jsonb_build_object(
            'previous_status', v_response.status,
            'new_status', 'published',
            'timestamp', v_now
        )
    );

    -- 7. Return mutation payload
    RETURN jsonb_build_object(
        'success', true,
        'response_id', v_trimmed_id,
        'previous_status', v_response.status,
        'status', 'published',
        'updated_at', v_now,
        'published_at', v_now
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. MODERATION RPC: public.admin_reject_response
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reject_response(
    p_response_id text,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trimmed_id text;
    v_normalized_note text;
    v_response record;
    v_now timestamptz := clock_timestamp();
BEGIN
    -- 1. Authorization: active admin + responses.reject permission
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.reject') THEN
        RAISE EXCEPTION 'Access denied. Missing responses.reject permission.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Input validation & note normalization
    v_trimmed_id := NULLIF(btrim(p_response_id), '');
    IF v_trimmed_id IS NULL THEN
        RAISE EXCEPTION 'Invalid input: response ID cannot be empty.'
            USING ERRCODE = '22023';
    END IF;

    v_normalized_note := NULLIF(btrim(p_note), '');

    -- 3. Lock row FOR UPDATE and fetch current status
    SELECT id, status
    INTO v_response
    FROM public.complaint_responses
    WHERE id::text = v_trimmed_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Response not found: %', v_trimmed_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 4. Strict status transition: ONLY pending_review -> rejected
    IF v_response.status <> 'pending_review' THEN
        RAISE EXCEPTION 'Cannot reject response with status "%". Only "pending_review" responses can be rejected.', v_response.status
            USING ERRCODE = '22023';
    END IF;

    -- 5. Status mutation (preserves published_at as NULL, does not alter content/metadata)
    UPDATE public.complaint_responses
    SET
        status = 'rejected',
        updated_at = v_now
    WHERE id = v_response.id;

    -- 6. Audit log entry with optional rejection note (zero private contact info)
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details
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

    -- 7. Return mutation payload
    RETURN jsonb_build_object(
        'success', true,
        'response_id', v_trimmed_id,
        'previous_status', v_response.status,
        'status', 'rejected',
        'updated_at', v_now
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. MODERATION RPC: public.admin_unpublish_response
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_unpublish_response(
    p_response_id text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trimmed_id text;
    v_normalized_reason text;
    v_response record;
    v_now timestamptz := clock_timestamp();
BEGIN
    -- 1. Authorization: active admin + responses.unpublish permission
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.unpublish') THEN
        RAISE EXCEPTION 'Access denied. Missing responses.unpublish permission.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Input validation & reason normalization
    v_trimmed_id := NULLIF(btrim(p_response_id), '');
    IF v_trimmed_id IS NULL THEN
        RAISE EXCEPTION 'Invalid input: response ID cannot be empty.'
            USING ERRCODE = '22023';
    END IF;

    v_normalized_reason := NULLIF(btrim(p_reason), '');

    -- 3. Lock row FOR UPDATE and fetch current status
    SELECT id, status, published_at
    INTO v_response
    FROM public.complaint_responses
    WHERE id::text = v_trimmed_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Response not found: %', v_trimmed_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 4. Strict status transition: ONLY published -> unpublished
    IF v_response.status <> 'published' THEN
        RAISE EXCEPTION 'Cannot unpublish response with status "%". Only "published" responses can be unpublished.', v_response.status
            USING ERRCODE = '22023';
    END IF;

    -- 5. Status mutation (preserves original published_at timestamp)
    UPDATE public.complaint_responses
    SET
        status = 'unpublished',
        updated_at = v_now
    WHERE id = v_response.id;

    -- 6. Audit log entry with optional unpublish reason (zero private contact info)
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details
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

    -- 7. Return mutation payload
    RETURN jsonb_build_object(
        'success', true,
        'response_id', v_trimmed_id,
        'previous_status', v_response.status,
        'status', 'unpublished',
        'updated_at', v_now,
        'published_at', v_response.published_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. PRIVILEGE HARDENING FOR MODERATION RPCS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_publish_response(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_publish_response(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_response(text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_reject_response(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_response(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_response(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_unpublish_response(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_unpublish_response(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_unpublish_response(text, text) TO authenticated;

-- Direct mutation access on complaint_responses remains blocked from client roles
REVOKE UPDATE, INSERT, DELETE ON public.complaint_responses FROM anon;
REVOKE UPDATE, INSERT, DELETE ON public.complaint_responses FROM authenticated;

-- ------------------------------------------------------------------------------
-- 7. PRE-COMMIT FAIL-CLOSED VERIFICATION ASSERTIONS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_pub_oid OID;
    v_rej_oid OID;
    v_unpub_oid OID;
    v_pub_secdef BOOLEAN;
    v_rej_secdef BOOLEAN;
    v_unpub_secdef BOOLEAN;
    v_pub_config TEXT[];
    v_rej_config TEXT[];
    v_unpub_config TEXT[];
BEGIN
    -- Core table prerequisites
    IF to_regclass('public.complaint_responses') IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: public.complaint_responses does not exist.';
    END IF;

    IF to_regclass('public.admin_audit_logs') IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: public.admin_audit_logs does not exist.';
    END IF;

    -- Canonical permissions exist
    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.view') THEN
        RAISE EXCEPTION 'Pre-commit check failed: responses.view permission does not exist.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.publish') THEN
        RAISE EXCEPTION 'Pre-commit check failed: responses.publish permission does not exist.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.reject') THEN
        RAISE EXCEPTION 'Pre-commit check failed: responses.reject permission does not exist.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.unpublish') THEN
        RAISE EXCEPTION 'Pre-commit check failed: responses.unpublish permission does not exist.';
    END IF;

    -- Exact signature resolution: admin_publish_response(text)
    SELECT p.oid, p.prosecdef, p.proconfig
    INTO v_pub_oid, v_pub_secdef, v_pub_config
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_publish_response'
      AND oidvectortypes(p.proargtypes) = 'text';

    IF v_pub_oid IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_publish_response(text) RPC not found.';
    END IF;

    IF NOT v_pub_secdef THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_publish_response must be SECURITY DEFINER.';
    END IF;

    IF NOT (
        v_pub_config @> ARRAY['search_path=pg_catalog, public']
        OR v_pub_config @> ARRAY['search_path=pg_catalog,public']
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_publish_response must have search_path = pg_catalog, public.';
    END IF;

    -- Exact signature resolution: admin_reject_response(text, text)
    SELECT p.oid, p.prosecdef, p.proconfig
    INTO v_rej_oid, v_rej_secdef, v_rej_config
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_reject_response'
      AND oidvectortypes(p.proargtypes) = 'text, text';

    IF v_rej_oid IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_reject_response(text, text) RPC not found.';
    END IF;

    IF NOT v_rej_secdef THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_reject_response must be SECURITY DEFINER.';
    END IF;

    IF NOT (
        v_rej_config @> ARRAY['search_path=pg_catalog, public']
        OR v_rej_config @> ARRAY['search_path=pg_catalog,public']
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_reject_response must have search_path = pg_catalog, public.';
    END IF;

    -- Exact signature resolution: admin_unpublish_response(text, text)
    SELECT p.oid, p.prosecdef, p.proconfig
    INTO v_unpub_oid, v_unpub_secdef, v_unpub_config
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_unpublish_response'
      AND oidvectortypes(p.proargtypes) = 'text, text';

    IF v_unpub_oid IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_unpublish_response(text, text) RPC not found.';
    END IF;

    IF NOT v_unpub_secdef THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_unpublish_response must be SECURITY DEFINER.';
    END IF;

    IF NOT (
        v_unpub_config @> ARRAY['search_path=pg_catalog, public']
        OR v_unpub_config @> ARRAY['search_path=pg_catalog,public']
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_unpublish_response must have search_path = pg_catalog, public.';
    END IF;

    -- Verify PUBLIC execute is completely blocked via catalog inspection (no public execute ACL)
    IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
        WHERE n.nspname = 'public'
          AND (
              (p.proname = 'admin_publish_response' AND oidvectortypes(p.proargtypes) = 'text')
              OR (p.proname = 'admin_reject_response' AND oidvectortypes(p.proargtypes) = 'text, text')
              OR (p.proname = 'admin_unpublish_response' AND oidvectortypes(p.proargtypes) = 'text, text')
          )
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: PUBLIC execute must be blocked on moderation RPCs.';
    END IF;

    -- Verify anon execute is blocked
    IF has_function_privilege('anon', v_pub_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_rej_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_unpub_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'Pre-commit check failed: anon execute must be blocked on moderation RPCs.';
    END IF;

    -- Verify authenticated execute is allowed
    IF NOT has_function_privilege('authenticated', v_pub_oid, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_rej_oid, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_unpub_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'Pre-commit check failed: authenticated execute must be granted on moderation RPCs.';
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
-- 8. POST-COMMIT CATALOG-DERIVED VERIFICATION
-- ------------------------------------------------------------------------------
SELECT
    (SELECT to_regclass('public.complaint_responses') IS NOT NULL) AS response_table,
    (SELECT to_regclass('public.admin_audit_logs') IS NOT NULL) AS audit_log_table,
    (SELECT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.view')) AS responses_view_permission,
    (SELECT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.publish')) AS responses_publish_permission,
    (SELECT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.reject')) AS responses_reject_permission,
    (SELECT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.unpublish')) AS responses_unpublish_permission,
    (SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_publish_response'
          AND oidvectortypes(p.proargtypes) = 'text'
    )) AS publish_rpc,
    (SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_reject_response'
          AND oidvectortypes(p.proargtypes) = 'text, text'
    )) AS reject_rpc,
    (SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_unpublish_response'
          AND oidvectortypes(p.proargtypes) = 'text, text'
    )) AS unpublish_rpc,
    (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_publish_response'
       AND oidvectortypes(p.proargtypes) = 'text'
    ) AS publish_security_definer,
    (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_reject_response'
       AND oidvectortypes(p.proargtypes) = 'text, text'
    ) AS reject_security_definer,
    (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_unpublish_response'
       AND oidvectortypes(p.proargtypes) = 'text, text'
    ) AS unpublish_security_definer,
    (SELECT p.proconfig @> ARRAY['search_path=pg_catalog, public'] OR p.proconfig @> ARRAY['search_path=pg_catalog,public']
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_publish_response'
       AND oidvectortypes(p.proargtypes) = 'text'
    ) AS publish_safe_search_path,
    (SELECT p.proconfig @> ARRAY['search_path=pg_catalog, public'] OR p.proconfig @> ARRAY['search_path=pg_catalog,public']
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_reject_response'
       AND oidvectortypes(p.proargtypes) = 'text, text'
    ) AS reject_safe_search_path,
    (SELECT p.proconfig @> ARRAY['search_path=pg_catalog, public'] OR p.proconfig @> ARRAY['search_path=pg_catalog,public']
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_unpublish_response'
       AND oidvectortypes(p.proargtypes) = 'text, text'
    ) AS unpublish_safe_search_path,
    (
        SELECT NOT EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            WHERE n.nspname = 'public'
              AND (
                  (p.proname = 'admin_publish_response' AND oidvectortypes(p.proargtypes) = 'text')
                  OR (p.proname = 'admin_reject_response' AND oidvectortypes(p.proargtypes) = 'text, text')
                  OR (p.proname = 'admin_unpublish_response' AND oidvectortypes(p.proargtypes) = 'text, text')
              )
              AND acl.grantee = 0
              AND acl.privilege_type = 'EXECUTE'
        )
    ) AS public_execute_blocked,
    (
        SELECT NOT has_function_privilege('anon', 'public.admin_publish_response(text)', 'EXECUTE')
           AND NOT has_function_privilege('anon', 'public.admin_reject_response(text, text)', 'EXECUTE')
           AND NOT has_function_privilege('anon', 'public.admin_unpublish_response(text, text)', 'EXECUTE')
    ) AS anon_execute_blocked,
    (
        SELECT has_function_privilege('authenticated', 'public.admin_publish_response(text)', 'EXECUTE')
           AND has_function_privilege('authenticated', 'public.admin_reject_response(text, text)', 'EXECUTE')
           AND has_function_privilege('authenticated', 'public.admin_unpublish_response(text, text)', 'EXECUTE')
    ) AS authenticated_execute_allowed,
    (SELECT NOT has_table_privilege('authenticated', 'public.complaint_responses', 'SELECT')) AS authenticated_raw_select_blocked,
    (SELECT NOT has_table_privilege('authenticated', 'public.complaint_responses', 'UPDATE')) AS authenticated_raw_update_blocked;
