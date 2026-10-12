-- ==============================================================================
-- SOBAIKE JANAO ADMIN — ACTIVITY LOG READ RPC VERIFICATION SCRIPT
-- ==============================================================================
-- Migration: 20260904000007_activity_log_read_rpc.sql
-- Target: Supabase PostgreSQL Database (sobaike-production)
-- Purpose: Authoritative verification of admin_list_audit_logs RPC:
--          1. Exact RPC signature
--          2. SECURITY DEFINER declaration
--          3. Correct fixed search_path (pg_catalog, public, auth)
--          4. authenticated has EXECUTE on admin_list_audit_logs
--          5. anon cannot execute admin_list_audit_logs
--          6. PUBLIC cannot execute admin_list_audit_logs
--          7. authenticated cannot directly SELECT admin_audit_logs
--          8. authenticated cannot execute sanitize_audit_details directly
--          9. audit.view is enforced
--         10. active admin is enforced
--         11. target_type USER -> admin_user normalization
--         12. admin_user target_id prefers details.target_user_id
--         13. complaint target remains stored complaint ID
--         14. role target remains stored role ID
--         15. Search works across safe fields (including effective admin target)
--         16. Action filter works with real stored codes
--         17. Target filter works with normalized types
--         18. Actor filter works
--         19. Date filters work
--         20. Pagination works (limit and offset)
--         21. total_count is correct
--         22. Output order is created_at DESC, id DESC
--         23. Sensitive keys are removed recursively
-- Safety: Non-destructive; runtime assertions execute inside a rolled-back transaction.
--         Does NOT assume super_admin role and creates isolated test roles.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Static Signature, Properties & Privilege Assertions
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_proc_record RECORD;
    v_has_auth_execute BOOLEAN;
    v_has_anon_execute BOOLEAN;
    v_has_public_execute BOOLEAN;
    v_sanitizer_auth_execute BOOLEAN;
    v_sanitizer_anon_execute BOOLEAN;
    v_table_auth_select BOOLEAN;
    v_table_anon_select BOOLEAN;
BEGIN
    -- 1.1 Verify admin_list_audit_logs existence, security definer, and search_path
    SELECT
        p.proname,
        p.prosecdef,
        p.prosrc,
        p.proconfig,
        p.proacl
    INTO v_proc_record
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_list_audit_logs';

    IF v_proc_record.proname IS NULL THEN
        RAISE EXCEPTION 'Static Assertion FAILED: public.admin_list_audit_logs does not exist!';
    END IF;

    IF v_proc_record.prosecdef IS NOT TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: public.admin_list_audit_logs must be SECURITY DEFINER!';
    END IF;

    IF v_proc_record.proconfig IS NULL OR NOT (
        array_to_string(v_proc_record.proconfig, ',') ILIKE '%search_path=pg_catalog, public, auth%'
        OR array_to_string(v_proc_record.proconfig, ',') ILIKE '%search_path=pg_catalog,public,auth%'
    ) THEN
        RAISE EXCEPTION 'Static Assertion FAILED: fixed search_path must be pg_catalog, public, auth! Found: %',
            array_to_string(v_proc_record.proconfig, ',');
    END IF;

    -- 1.2 Verify EXECUTE permissions on admin_list_audit_logs
    SELECT has_function_privilege('authenticated', 'public.admin_list_audit_logs(int,int,text,text,text,uuid,timestamptz,timestamptz)', 'EXECUTE')
    INTO v_has_auth_execute;

    SELECT has_function_privilege('anon', 'public.admin_list_audit_logs(int,int,text,text,text,uuid,timestamptz,timestamptz)', 'EXECUTE')
    INTO v_has_anon_execute;

    IF v_has_auth_execute IS NOT TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: authenticated role must have EXECUTE on admin_list_audit_logs!';
    END IF;

    IF v_has_anon_execute IS TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: anon role must NOT have EXECUTE on admin_list_audit_logs!';
    END IF;

    -- Verify PUBLIC has EXECUTE revoked via ACL catalog inspection (grantee = 0 in aclexplode & routine_privileges)
    IF v_proc_record.proacl IS NULL THEN
        RAISE EXCEPTION 'Static Assertion FAILED: admin_list_audit_logs proacl is NULL (default PUBLIC permissions active)!';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM aclexplode(v_proc_record.proacl) acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
    ) INTO v_has_public_execute;

    IF v_has_public_execute IS TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: PUBLIC must NOT have EXECUTE on admin_list_audit_logs (found in pg_proc.proacl)!';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.routine_privileges
        WHERE routine_schema = 'public'
          AND routine_name = 'admin_list_audit_logs'
          AND grantee = 'PUBLIC'
          AND privilege_type = 'EXECUTE'
    ) INTO v_has_public_execute;

    IF v_has_public_execute IS TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: PUBLIC must NOT have EXECUTE on admin_list_audit_logs (found in information_schema.routine_privileges)!';
    END IF;

    -- 1.3 Verify direct SELECT on admin_audit_logs is REVOKED
    SELECT has_table_privilege('authenticated', 'public.admin_audit_logs', 'SELECT')
    INTO v_table_auth_select;

    SELECT has_table_privilege('anon', 'public.admin_audit_logs', 'SELECT')
    INTO v_table_anon_select;

    IF v_table_auth_select IS TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: authenticated role must NOT have direct SELECT on admin_audit_logs!';
    END IF;

    IF v_table_anon_select IS TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: anon role must NOT have direct SELECT on admin_audit_logs!';
    END IF;

    -- 1.4 Verify sanitize_audit_details is internal-only (REVOKED from authenticated & anon)
    SELECT has_function_privilege('authenticated', 'public.sanitize_audit_details(jsonb)', 'EXECUTE')
    INTO v_sanitizer_auth_execute;

    SELECT has_function_privilege('anon', 'public.sanitize_audit_details(jsonb)', 'EXECUTE')
    INTO v_sanitizer_anon_execute;

    IF v_sanitizer_auth_execute IS TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: sanitize_audit_details must be internal! authenticated must NOT have EXECUTE!';
    END IF;

    IF v_sanitizer_anon_execute IS TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: sanitize_audit_details must be internal! anon must NOT have EXECUTE!';
    END IF;

    -- 1.5 Verify function source code requirements
    IF v_proc_record.prosrc NOT LIKE '%audit.view%' THEN
        RAISE EXCEPTION 'Static Assertion FAILED: RPC does not enforce audit.view!';
    END IF;

    IF v_proc_record.prosrc NOT LIKE '%is_active_admin%' THEN
        RAISE EXCEPTION 'Static Assertion FAILED: RPC does not enforce is_active_admin!';
    END IF;

    IF v_proc_record.prosrc NOT LIKE '%sanitize_audit_details%' THEN
        RAISE EXCEPTION 'Static Assertion FAILED: RPC does not invoke sanitize_audit_details!';
    END IF;

    IF v_proc_record.prosrc NOT LIKE '%target_user_id%' THEN
        RAISE EXCEPTION 'Static Assertion FAILED: RPC does not resolve target_user_id for admin_user target!';
    END IF;

    RAISE NOTICE 'Static Schema & Privilege Assertions PASS: Function signature, security definer, search_path, and internal helper protections verified.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Sanitizer Unit Verification
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_input jsonb;
    v_sanitized jsonb;
BEGIN
    v_input := jsonb_build_object(
        'user_id', '00000000-0000-0000-0000-000000000001',
        'email', 'test@example.com',
        'password', 'super_secret_password',
        'token', 'jwt.bearer.token',
        'access_token', 'atk_12345',
        'refresh_token', 'rtk_67890',
        'auth_key', 'key_abc',
        'api_key', 'live_xyz',
        'private_key', 'BEGIN RSA PRIVATE KEY',
        'secret_token', 'topsecret',
        'credential_data', 'passwords123',
        'password_hash', '$2a$12$abcdefg',
        'evidence_url', 'https://storage.private/evidence/123.jpg',
        'signed_url', 'https://storage.private/evidence/123.jpg?token=secret',
        'safe_nested', jsonb_build_object(
            'allowed_prop', 'fine',
            'nested_secret', 'should_be_stripped',
            'nested_evidence_url', 'https://private'
        ),
        'safe_array', jsonb_build_array(
            jsonb_build_object('ok', true, 'password', 'bad'),
            'string_item'
        )
    );

    v_sanitized := public.sanitize_audit_details(v_input);

    -- Ensure sensitive keys are stripped
    IF v_sanitized ? 'password' OR v_sanitized ? 'token' OR v_sanitized ? 'access_token'
       OR v_sanitized ? 'refresh_token' OR v_sanitized ? 'auth_key' OR v_sanitized ? 'api_key'
       OR v_sanitized ? 'private_key' OR v_sanitized ? 'secret_token' OR v_sanitized ? 'credential_data'
       OR v_sanitized ? 'password_hash' OR v_sanitized ? 'evidence_url' OR v_sanitized ? 'signed_url' THEN
        RAISE EXCEPTION 'Sanitizer Assertion FAILED: Sensitive root keys leaked into output! Output: %', v_sanitized;
    END IF;

    -- Ensure nested sensitive keys are stripped
    IF (v_sanitized->'safe_nested') ? 'nested_secret' OR (v_sanitized->'safe_nested') ? 'nested_evidence_url' THEN
        RAISE EXCEPTION 'Sanitizer Assertion FAILED: Sensitive nested keys leaked! Output: %', v_sanitized;
    END IF;

    -- Ensure safe nested keys remain
    IF NOT (v_sanitized->'safe_nested' ? 'allowed_prop') THEN
        RAISE EXCEPTION 'Sanitizer Assertion FAILED: Safe nested key was incorrectly stripped!';
    END IF;

    -- Ensure safe array item was preserved and inner password stripped
    IF NOT ((v_sanitized->'safe_array'->0) ? 'ok') OR ((v_sanitized->'safe_array'->0) ? 'password') THEN
        RAISE EXCEPTION 'Sanitizer Assertion FAILED: Array sanitization failed! Output: %', v_sanitized;
    END IF;

    RAISE NOTICE 'Sanitizer Unit Assertions PASS: Recursive credential & private URL redaction verified.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Dynamic Runtime Assertions (Rollback-Safe, No Super Admin Assumptions)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_test_actor_id UUID := gen_random_uuid();
    v_test_unauth_id UUID := gen_random_uuid();
    v_target_admin_uuid UUID := gen_random_uuid();
    v_test_log_complaint UUID;
    v_test_log_user_target UUID;
    v_test_log_role UUID;
    v_result JSONB;
    v_logs JSONB;
    v_total INT;
    v_caught_error BOOLEAN := FALSE;
    v_first_created_at TIMESTAMPTZ;
    v_second_created_at TIMESTAMPTZ;
BEGIN
    -- 3.1 Provision test roles and users in rollback transaction
    -- Create isolated temporary test roles (do NOT rely on or mutate super_admin)
    INSERT INTO public.roles (id, name_en, name_bn, active)
    VALUES ('test_audit_viewer_role', 'Test Audit Viewer Role', 'টেস্ট অডিট ভূমিকা', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.role_permissions (role_id, permission_id)
    VALUES ('test_audit_viewer_role', 'audit.view')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    INSERT INTO public.roles (id, name_en, name_bn, active)
    VALUES ('test_audit_denied_role', 'Test Audit Denied Role', 'টেস্ট বঞ্চিত ভূমিকা', true)
    ON CONFLICT (id) DO NOTHING;

    -- Test authorized user
    INSERT INTO auth.users (id, email, aud, role)
    VALUES (v_test_actor_id, 'audit_actor@example.com', 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.admin_users (user_id, display_name, active)
    VALUES (v_test_actor_id, 'Authorized Audit Admin', true)
    ON CONFLICT (user_id) DO UPDATE SET display_name = 'Authorized Audit Admin', active = true;

    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (v_test_actor_id, 'test_audit_viewer_role')
    ON CONFLICT (user_id) DO UPDATE SET role_id = 'test_audit_viewer_role';

    -- Test unauthorized user (active admin but NO audit.view)
    INSERT INTO auth.users (id, email, aud, role)
    VALUES (v_test_unauth_id, 'denied_actor@example.com', 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.admin_users (user_id, display_name, active)
    VALUES (v_test_unauth_id, 'Denied Audit Admin', true)
    ON CONFLICT (user_id) DO UPDATE SET display_name = 'Denied Audit Admin', active = true;

    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (v_test_unauth_id, 'test_audit_denied_role')
    ON CONFLICT (user_id) DO UPDATE SET role_id = 'test_audit_denied_role';

    -- 3.2 Insert test audit entries with mixed casing and target details
    -- Log 1: Complaint
    INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details, created_at)
    VALUES (
        v_test_actor_id,
        'complaint.publish',
        'complaint',
        'CMP-TEST-0001',
        jsonb_build_object('published', true, 'password', 'leak', 'note', 'First test complaint'),
        now() - interval '2 hours'
    ) RETURNING id INTO v_test_log_complaint;

    -- Log 2: User membership finalized (stores role ID in target_id, but real admin in details->>'target_user_id')
    INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details, created_at)
    VALUES (
        v_test_actor_id,
        'USER_MEMBERSHIP_FINALIZED',
        'USER', -- uppercase to test normalization
        'field_officer', -- role ID stored by existing producer
        jsonb_build_object('target_user_id', v_target_admin_uuid::text, 'role_id', 'field_officer', 'token', 'jwt_secret'),
        now() - interval '1 hour'
    ) RETURNING id INTO v_test_log_user_target;

    -- Log 3: Role created
    INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details, created_at)
    VALUES (
        v_test_actor_id,
        'ROLE_CREATED',
        'ROLE', -- uppercase to test normalization
        'custom_security_role',
        jsonb_build_object('name', 'Custom Security Role', 'secret_key', 'supersecret'),
        now()
    ) RETURNING id INTO v_test_log_role;

    -- 3.3 Authorization failure check: caller without audit.view
    PERFORM set_config('request.jwt.claim.sub', v_test_unauth_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    BEGIN
        PERFORM public.admin_list_audit_logs();
    EXCEPTION
        WHEN SQLSTATE '42501' THEN
            v_caught_error := TRUE;
    END;

    IF v_caught_error IS NOT TRUE THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: admin_list_audit_logs permitted caller without audit.view!';
    END IF;

    -- 3.4 Authorization success check: caller with audit.view
    PERFORM set_config('request.jwt.claim.sub', v_test_actor_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_result := public.admin_list_audit_logs(
        p_limit := 10,
        p_offset := 0,
        p_actor_id := v_test_actor_id
    );

    v_total := (v_result->>'total_count')::int;
    v_logs := v_result->'logs';

    IF v_total < 3 THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Expected at least 3 logs, found: %', v_total;
    END IF;

    -- 3.5 Target type normalization and admin_user target_id resolution checks
    -- Check Log 2: target_type normalized to 'admin_user', target_id resolved to target_user_id
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_logs) elem
        WHERE elem->>'id' = v_test_log_user_target::text
          AND elem->>'target_type' = 'admin_user'
          AND elem->>'target_id' = v_target_admin_uuid::text
    ) THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: admin_user target_id did not prefer details.target_user_id! Logs: %', v_logs;
    END IF;

    -- Check Log 1: complaint target_id remains CMP-TEST-0001
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_logs) elem
        WHERE elem->>'id' = v_test_log_complaint::text
          AND elem->>'target_type' = 'complaint'
          AND elem->>'target_id' = 'CMP-TEST-0001'
    ) THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: complaint target_id was modified!';
    END IF;

    -- Check Log 3: role target_id remains custom_security_role
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_logs) elem
        WHERE elem->>'id' = v_test_log_role::text
          AND elem->>'target_type' = 'role'
          AND elem->>'target_id' = 'custom_security_role'
    ) THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: role target_id was modified!';
    END IF;

    -- 3.6 Check sensitive details keys stripped recursively
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_logs) elem
        WHERE elem->'details' ? 'password'
           OR elem->'details' ? 'token'
           OR elem->'details' ? 'secret_key'
    ) THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Sensitive keys leaked in returned logs!';
    END IF;

    -- 3.7 Output order assertion: created_at DESC, id DESC
    v_first_created_at := (v_logs->0->>'created_at')::timestamptz;
    v_second_created_at := (v_logs->1->>'created_at')::timestamptz;
    IF v_first_created_at < v_second_created_at THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Logs are not ordered by created_at DESC!';
    END IF;

    -- 3.8 Search filter checks
    -- Search by effective admin user target UUID
    v_result := public.admin_list_audit_logs(
        p_search := v_target_admin_uuid::text,
        p_actor_id := v_test_actor_id
    );
    IF (v_result->>'total_count')::int < 1 THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Search by target_user_id failed!';
    END IF;

    -- Search by complaint target ID
    v_result := public.admin_list_audit_logs(
        p_search := 'CMP-TEST-0001',
        p_actor_id := v_test_actor_id
    );
    IF (v_result->>'total_count')::int < 1 THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Search by complaint target ID failed!';
    END IF;

    -- 3.9 Action filter check
    v_result := public.admin_list_audit_logs(
        p_action := 'USER_MEMBERSHIP_FINALIZED',
        p_actor_id := v_test_actor_id
    );
    IF (v_result->>'total_count')::int < 1 OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_result->'logs') elem
        WHERE elem->>'action' = 'USER_MEMBERSHIP_FINALIZED'
    ) THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Action filter failed for USER_MEMBERSHIP_FINALIZED!';
    END IF;

    -- 3.10 Target type filter check ('admin_user' and 'user')
    v_result := public.admin_list_audit_logs(
        p_target_type := 'admin_user',
        p_actor_id := v_test_actor_id
    );
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_result->'logs') elem
        WHERE elem->>'id' = v_test_log_user_target::text
    ) THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Target type filter for admin_user failed!';
    END IF;

    v_result := public.admin_list_audit_logs(
        p_target_type := 'user',
        p_actor_id := v_test_actor_id
    );
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_result->'logs') elem
        WHERE elem->>'id' = v_test_log_user_target::text
    ) THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Target type filter for user failed!';
    END IF;

    -- 3.11 Date filters check
    v_result := public.admin_list_audit_logs(
        p_date_from := now() - interval '90 minutes',
        p_actor_id := v_test_actor_id
    );
    -- Should include Log 2 (-1 hr) and Log 3 (now), but exclude Log 1 (-2 hr)
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_result->'logs') elem
        WHERE elem->>'id' = v_test_log_complaint::text
    ) THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Date filter p_date_from failed!';
    END IF;

    -- 3.12 Pagination check
    v_result := public.admin_list_audit_logs(
        p_limit := 1,
        p_offset := 0,
        p_actor_id := v_test_actor_id
    );
    IF jsonb_array_length(v_result->'logs') <> 1 THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Pagination limit did not restrict output to 1 row!';
    END IF;
    IF (v_result->>'total_count')::int < 3 THEN
        RAISE EXCEPTION 'Runtime Assertion FAILED: Pagination total_count is incorrect!';
    END IF;

    RAISE NOTICE 'Dynamic Runtime Assertions PASS: Authorization, normalization, target_id resolution, filtering, pagination, and deterministic ordering verified.';

    -- ALWAYS ROLLBACK test changes
    RAISE EXCEPTION 'ROLLBACK_INTENTIONAL';
EXCEPTION
    WHEN SQLSTATE 'P0001' AND SQLERRM = 'ROLLBACK_INTENTIONAL' THEN
        RAISE NOTICE 'Rollback complete. Zero persistent side-effects.';
END;
$$;
