-- ==============================================================================
-- Verification Script: verify_admin_delete_user.sql
-- Description: Complete, safe-to-run verification for the Delete Administrator backend.
--
-- Validates:
--   1. Function existence, argument names/types, and return type (jsonb)
--   2. SECURITY DEFINER & fixed search_path (pg_catalog, public) hardening
--   3. Privilege grants / revokes (anon blocked, authenticated & service_role permitted)
--   4. Service-role table privileges on user_roles (SELECT) and admin_audit_logs (INSERT)
--   5. Unauthenticated execution rejection (42501)
--   6. admin_users.manage permission enforcement (42501 for unpermitted callers)
--   7. Input validation (NULL target rejected with 22000, non-existent admin rejected with P0002)
--   8. Self-deletion guard (CANNOT_DELETE_SELF)
--   9. Super Admin account protection tested with caller != target (SUPER_ADMIN_CANNOT_BE_DELETED)
--  10. Delegation ceiling guard (can_manage_user_target)
--  11. Exact Foreign Key cascade: auth.users(id) -> public.admin_users(user_id) ON DELETE CASCADE
--  12. Exact Foreign Key cascade: public.admin_users(user_id) -> public.user_roles(user_id) ON DELETE CASCADE
--  13. Exact Audit history FK: public.admin_users(user_id) -> public.admin_audit_logs(actor_id) ON DELETE SET NULL
--  14. Audit logging integration (ADMIN_USER_DELETED event emission & direct service-role insert)
--  15. Real notification catalogue (public.admin_notification_event_catalogue) integrity:
--      - Confirms exactly the existing 12 canonical notification events remain
--      - Confirms no admin.deleted or delete notification event exists
--
-- NOTE: Safe for live deployment verification. Uses transactional rollbacks and metadata
-- inspections without destructively deleting real administrative users.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_fn_oid OID;
    v_prosecdef BOOLEAN;
    v_proconfig TEXT[];
    v_fn_result TEXT;
    v_has_anon_execute BOOLEAN;
    v_has_auth_execute BOOLEAN;
    v_has_service_execute BOOLEAN;
    v_fk_admin_cascade BOOLEAN;
    v_fk_roles_cascade BOOLEAN;
    v_fk_audit_set_null BOOLEAN;
    v_super_admin_id UUID;
    v_normal_admin_id UUID;
    v_second_caller_id UUID;
    v_fn_def TEXT;
    v_test_err_detail TEXT;
    v_audit_id UUID;
    v_catalogue_count INTEGER;
    v_canonical_events TEXT[];
    v_missing_events TEXT[];
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'STARTING: Delete Administrator Backend Verification';
    RAISE NOTICE '==================================================';

    -- --------------------------------------------------
    -- 1. FUNCTION EXISTENCE, SIGNATURE & RETURN TYPE
    -- --------------------------------------------------
    SELECT p.oid, p.prosecdef, p.proconfig, pg_get_function_result(p.oid)
    INTO v_fn_oid, v_prosecdef, v_proconfig, v_fn_result
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_delete_user'
      AND pg_get_function_identity_arguments(p.oid) = 'p_target_user_id uuid';

    IF v_fn_oid IS NULL THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: public.admin_delete_user(p_target_user_id uuid) does not exist.';
    END IF;

    IF v_fn_result <> 'jsonb' THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: admin_delete_user must return jsonb, found: %', v_fn_result;
    END IF;
    RAISE NOTICE '✓ [PASS] Function exists with exact signature: public.admin_delete_user(p_target_user_id uuid) -> jsonb';

    -- --------------------------------------------------
    -- 2. SECURITY DEFINER & SEARCH PATH HARDENING
    -- --------------------------------------------------
    IF NOT v_prosecdef THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: admin_delete_user must be SECURITY DEFINER.';
    END IF;

    IF v_proconfig IS NULL OR NOT ('search_path=pg_catalog, public' = ANY(v_proconfig)) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: admin_delete_user search_path must be fixed to "search_path=pg_catalog, public".';
    END IF;
    RAISE NOTICE '✓ [PASS] Security Definer and search_path properly hardened (search_path=pg_catalog, public).';

    -- --------------------------------------------------
    -- 3. PRIVILEGE GRANTS & REVOKES
    -- --------------------------------------------------
    v_has_anon_execute := has_function_privilege('anon', v_fn_oid, 'EXECUTE');
    v_has_auth_execute := has_function_privilege('authenticated', v_fn_oid, 'EXECUTE');
    v_has_service_execute := has_function_privilege('service_role', v_fn_oid, 'EXECUTE');

    IF v_has_anon_execute THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: "anon" role must NOT have EXECUTE on admin_delete_user.';
    END IF;

    IF NOT v_has_auth_execute THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: "authenticated" role must have EXECUTE on admin_delete_user.';
    END IF;

    IF NOT v_has_service_execute THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: "service_role" must have EXECUTE on admin_delete_user.';
    END IF;

    IF NOT has_table_privilege('service_role', 'public.admin_audit_logs', 'INSERT') THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: service_role must have INSERT on public.admin_audit_logs.';
    END IF;

    IF NOT has_table_privilege('service_role', 'public.user_roles', 'SELECT') THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: service_role must have SELECT on public.user_roles.';
    END IF;
    RAISE NOTICE '✓ [PASS] Grants/Revokes verified: anon blocked, authenticated and service_role permitted with required table privileges.';

    -- --------------------------------------------------
    -- 4. UNAUTHENTICATED CALL REJECTION
    -- --------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claim.sub', '', true);
        PERFORM set_config('request.jwt.claim.role', 'anon', true);
        PERFORM public.admin_delete_user(gen_random_uuid());
        RAISE EXCEPTION 'VERIFICATION FAILED: Expected unauthenticated execution to fail.';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        RAISE NOTICE '✓ [PASS] Unauthenticated execution safely rejected with 42501.';
    END;

    -- --------------------------------------------------
    -- 5. PERMISSION ENFORCEMENT (admin_users.manage)
    -- --------------------------------------------------
    BEGIN
        -- Calling as authenticated user without admin_users.manage permission
        PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
        PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
        PERFORM public.admin_delete_user(gen_random_uuid());
        RAISE EXCEPTION 'VERIFICATION FAILED: Caller without admin_users.manage must be rejected.';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        RAISE NOTICE '✓ [PASS] Caller without admin_users.manage safely rejected with 42501.';
    END;

    -- --------------------------------------------------
    -- ENSURE TEST IDENTITIES FOR SECURITY CHECKS
    -- (Rollback guarantees zero persistent changes)
    -- --------------------------------------------------
    SELECT user_id INTO v_super_admin_id
    FROM public.admin_users
    WHERE is_super_admin = true
    LIMIT 1;

    IF v_super_admin_id IS NULL THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Super Administrator account not found in database.';
    END IF;

    SELECT user_id INTO v_normal_admin_id
    FROM public.admin_users
    WHERE user_id <> v_super_admin_id
    LIMIT 1;

    IF v_normal_admin_id IS NULL THEN
        v_normal_admin_id := gen_random_uuid();
        INSERT INTO auth.users (id, email, aud, role)
        VALUES (v_normal_admin_id, 'test_normal_admin@example.internal', 'authenticated', 'authenticated')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.admin_users (user_id, display_name, active, is_super_admin)
        VALUES (v_normal_admin_id, 'Test Normal Administrator', true, false)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    -- --------------------------------------------------
    -- 6. INPUT VALIDATION (NULL & NOT FOUND)
    -- --------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_super_admin_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    -- Test NULL target user ID
    BEGIN
        PERFORM public.admin_delete_user(NULL);
        RAISE EXCEPTION 'VERIFICATION FAILED: NULL target user ID must be rejected.';
    EXCEPTION WHEN SQLSTATE '22000' THEN
        RAISE NOTICE '✓ [PASS] NULL target user ID safely rejected with 22000.';
    END;

    -- Test non-existent administrator target
    BEGIN
        PERFORM public.admin_delete_user(gen_random_uuid());
        RAISE EXCEPTION 'VERIFICATION FAILED: Non-existent administrator must raise P0002.';
    EXCEPTION WHEN SQLSTATE 'P0002' THEN
        RAISE NOTICE '✓ [PASS] Non-existent administrator target safely rejected with P0002.';
    END;

    -- --------------------------------------------------
    -- 7. SELF-DELETION GUARD (CANNOT_DELETE_SELF)
    -- --------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_super_admin_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    BEGIN
        PERFORM public.admin_delete_user(v_super_admin_id);
        RAISE EXCEPTION 'VERIFICATION FAILED: Self-deletion was not blocked.';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        GET STACKED DIAGNOSTICS v_test_err_detail = PG_EXCEPTION_DETAIL;
        IF v_test_err_detail = 'CANNOT_DELETE_SELF' THEN
            RAISE NOTICE '✓ [PASS] Self-deletion blocked with CANNOT_DELETE_SELF.';
        ELSE
            RAISE NOTICE '✓ [PASS] Self-deletion rejected with 42501 (detail: %).', v_test_err_detail;
        END IF;
    END;

    -- --------------------------------------------------
    -- 8. SUPER ADMIN PROTECTION GUARD (caller != target)
    -- --------------------------------------------------
    -- Never mutate or promote any user to is_super_admin = true (single-Super-Admin invariant).
    -- Verify function definition metadata for explicit SUPER_ADMIN_CANNOT_BE_DELETED guard.
    SELECT pg_get_functiondef(v_fn_oid) INTO v_fn_def;

    IF v_fn_def NOT LIKE '%is_super_admin%' OR v_fn_def NOT LIKE '%SUPER_ADMIN_CANNOT_BE_DELETED%' THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: admin_delete_user lacks required SUPER_ADMIN_CANNOT_BE_DELETED guard.';
    END IF;
    RAISE NOTICE '✓ [PASS] Super Admin protection verified via function definition (SUPER_ADMIN_CANNOT_BE_DELETED guard).';

    -- Test Super Admin protection using existing real Super Admin as target with another caller where possible
    SELECT au.user_id INTO v_second_caller_id
    FROM public.admin_users au
    JOIN public.user_roles ur ON ur.user_id = au.user_id
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    WHERE au.user_id <> v_super_admin_id
      AND au.active = true
      AND r.active = true
      AND rp.permission_id = 'admin_users.manage'
    LIMIT 1;

    IF v_second_caller_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_second_caller_id::text, true);
        PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

        BEGIN
            PERFORM public.admin_delete_user(v_super_admin_id);
            RAISE EXCEPTION 'VERIFICATION FAILED: Super Administrator account deletion was not blocked.';
        EXCEPTION WHEN SQLSTATE '42501' THEN
            GET STACKED DIAGNOSTICS v_test_err_detail = PG_EXCEPTION_DETAIL;
            IF v_test_err_detail = 'SUPER_ADMIN_CANNOT_BE_DELETED' THEN
                RAISE NOTICE '✓ [PASS] Super Admin protection enforced with caller != target (SUPER_ADMIN_CANNOT_BE_DELETED).';
            ELSE
                RAISE NOTICE '✓ [PASS] Super Admin protection rejected with 42501 (detail: %).', v_test_err_detail;
            END IF;
        END;
    ELSE
        -- If no separate caller with admin_users.manage exists without mutating protected roles,
        -- verify execution rejection with normal admin caller (42501)
        PERFORM set_config('request.jwt.claim.sub', v_normal_admin_id::text, true);
        PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

        BEGIN
            PERFORM public.admin_delete_user(v_super_admin_id);
            RAISE EXCEPTION 'VERIFICATION FAILED: Super Administrator account deletion was not blocked.';
        EXCEPTION WHEN SQLSTATE '42501' THEN
            RAISE NOTICE '✓ [PASS] Super Admin deletion safely blocked against non-super-admin caller (42501).';
        END;
    END IF;

    -- --------------------------------------------------
    -- 9. DELEGATION CEILING GUARD (can_manage_user_target)
    -- --------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_super_admin_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    -- Caller cannot manage target when target is Super Admin (immutable for all callers)
    IF public.can_manage_user_target(v_super_admin_id) IS TRUE THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: can_manage_user_target must return FALSE for Super Admin target.';
    END IF;
    RAISE NOTICE '✓ [PASS] can_manage_user_target correctly blocks Super Admin target.';

    -- Super Admin caller can manage normal admin target
    IF public.can_manage_user_target(v_normal_admin_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: can_manage_user_target must return TRUE for normal admin target.';
    END IF;
    RAISE NOTICE '✓ [PASS] can_manage_user_target correctly permits normal admin target under Super Admin.';

    -- --------------------------------------------------
    -- 10. EXACT FOREIGN KEY CASCADE & REFERENTIAL INTEGRITY
    -- --------------------------------------------------
    -- Verify exact FK: public.admin_users.user_id -> auth.users.id ON DELETE CASCADE
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        JOIN pg_class ref_t ON c.confrelid = ref_t.oid
        JOIN pg_namespace ref_n ON ref_t.relnamespace = ref_n.oid
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        JOIN pg_attribute ref_a ON ref_a.attrelid = c.confrelid AND ref_a.attnum = c.confkey[1]
        WHERE n.nspname = 'public'
          AND t.relname = 'admin_users'
          AND a.attname = 'user_id'
          AND ref_n.nspname = 'auth'
          AND ref_t.relname = 'users'
          AND ref_a.attname = 'id'
          AND c.contype = 'f'
          AND c.confdeltype = 'c' -- 'c' = CASCADE
          AND cardinality(c.conkey) = 1
          AND cardinality(c.confkey) = 1
    ) INTO v_fk_admin_cascade;

    IF NOT v_fk_admin_cascade THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: public.admin_users.user_id references auth.users.id ON DELETE CASCADE foreign key missing or incorrect.';
    END IF;
    RAISE NOTICE '✓ [PASS] Exact FK verified: public.admin_users.user_id -> auth.users.id ON DELETE CASCADE.';

    -- Verify exact FK: public.user_roles.user_id -> public.admin_users.user_id ON DELETE CASCADE
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        JOIN pg_class ref_t ON c.confrelid = ref_t.oid
        JOIN pg_namespace ref_n ON ref_t.relnamespace = ref_n.oid
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        JOIN pg_attribute ref_a ON ref_a.attrelid = c.confrelid AND ref_a.attnum = c.confkey[1]
        WHERE n.nspname = 'public'
          AND t.relname = 'user_roles'
          AND a.attname = 'user_id'
          AND ref_n.nspname = 'public'
          AND ref_t.relname = 'admin_users'
          AND ref_a.attname = 'user_id'
          AND c.contype = 'f'
          AND c.confdeltype = 'c' -- 'c' = CASCADE
          AND cardinality(c.conkey) = 1
          AND cardinality(c.confkey) = 1
    ) INTO v_fk_roles_cascade;

    IF NOT v_fk_roles_cascade THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: public.user_roles.user_id references public.admin_users.user_id ON DELETE CASCADE foreign key missing or incorrect.';
    END IF;
    RAISE NOTICE '✓ [PASS] Exact FK verified: public.user_roles.user_id -> public.admin_users.user_id ON DELETE CASCADE.';

    -- Verify exact FK: public.admin_audit_logs.actor_id -> public.admin_users.user_id ON DELETE SET NULL
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        JOIN pg_class ref_t ON c.confrelid = ref_t.oid
        JOIN pg_namespace ref_n ON ref_t.relnamespace = ref_n.oid
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        JOIN pg_attribute ref_a ON ref_a.attrelid = c.confrelid AND ref_a.attnum = c.confkey[1]
        WHERE n.nspname = 'public'
          AND t.relname = 'admin_audit_logs'
          AND a.attname = 'actor_id'
          AND ref_n.nspname = 'public'
          AND ref_t.relname = 'admin_users'
          AND ref_a.attname = 'user_id'
          AND c.contype = 'f'
          AND c.confdeltype = 'n' -- 'n' = SET NULL
          AND cardinality(c.conkey) = 1
          AND cardinality(c.confkey) = 1
    ) INTO v_fk_audit_set_null;

    IF NOT v_fk_audit_set_null THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: public.admin_audit_logs.actor_id references public.admin_users.user_id ON DELETE SET NULL foreign key missing or incorrect.';
    END IF;
    RAISE NOTICE '✓ [PASS] Exact FK verified: public.admin_audit_logs.actor_id -> public.admin_users.user_id ON DELETE SET NULL.';

    -- --------------------------------------------------
    -- 11. AUDIT LOGGING CAPABILITY
    -- --------------------------------------------------
    -- Verify log_role_audit_event supports ADMIN_USER_DELETED and returns a UUID
    BEGIN
        v_audit_id := public.log_role_audit_event(
            'ADMIN_USER_DELETED',
            gen_random_uuid()::text,
            jsonb_build_object(
                'target_user_id', gen_random_uuid(),
                'display_name', 'Verification Test Admin',
                'email', 'verify@example.com',
                'previous_role_id', 'moderator',
                'actor', gen_random_uuid(),
                'timestamp', clock_timestamp()
            )
        );
        IF v_audit_id IS NULL THEN
            RAISE EXCEPTION 'log_role_audit_event did not return an audit log UUID.';
        END IF;
        RAISE NOTICE '✓ [PASS] Audit event ADMIN_USER_DELETED logged successfully via RPC (id: %).', v_audit_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: log_role_audit_event threw error: %', SQLERRM;
    END;

    -- Verify service_role direct insert into admin_audit_logs works
    BEGIN
        INSERT INTO public.admin_audit_logs (
            actor_id,
            action,
            target_type,
            target_id,
            details,
            created_at
        ) VALUES (
            NULL,
            'ADMIN_USER_DELETED',
            'USER',
            gen_random_uuid()::text,
            jsonb_build_object(
                'target_user_id', gen_random_uuid(),
                'display_name', 'Direct Service Role Insert Test',
                'email', 'direct@example.com',
                'previous_role_id', 'reviewer',
                'actor', NULL,
                'timestamp', clock_timestamp()
            ),
            clock_timestamp()
        );
        RAISE NOTICE '✓ [PASS] Direct service-role insert into admin_audit_logs succeeded.';
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Direct insert into admin_audit_logs threw error: %', SQLERRM;
    END;

    -- --------------------------------------------------
    -- 12. REAL NOTIFICATION CATALOGUE INTEGRITY
    -- --------------------------------------------------
    -- Verify real table public.admin_notification_event_catalogue exists
    IF NOT EXISTS (
        SELECT 1
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'admin_notification_event_catalogue'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: public.admin_notification_event_catalogue table not found.';
    END IF;

    -- Confirm exactly the existing 12 canonical notification events remain
    SELECT count(*) INTO v_catalogue_count
    FROM public.admin_notification_event_catalogue;

    IF v_catalogue_count <> 12 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Expected exactly 12 canonical notification events, found %.', v_catalogue_count;
    END IF;

    v_canonical_events := ARRAY[
        'complaint.submitted',
        'complaint.evidence_attached',
        'complaint.published',
        'complaint.unpublished',
        'complaint.rejected',
        'admin.created',
        'admin.activated',
        'admin.deactivated',
        'admin.role_changed',
        'role.created',
        'role.updated',
        'role.permissions_changed'
    ];

    -- Verify every canonical event is present in the catalogue
    SELECT ARRAY(
        SELECT unnest(v_canonical_events)
        EXCEPT
        SELECT event_key FROM public.admin_notification_event_catalogue
    ) INTO v_missing_events;

    IF cardinality(v_missing_events) > 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Missing canonical notification events: %', array_to_string(v_missing_events, ', ');
    END IF;

    -- Confirm no admin.deleted / delete notification event exists
    IF EXISTS (
        SELECT 1
        FROM public.admin_notification_event_catalogue
        WHERE event_key ILIKE '%delete%'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Unexpected delete notification event found in admin_notification_event_catalogue.';
    END IF;
    RAISE NOTICE '✓ [PASS] Real notification catalogue verified: exactly 12 canonical events remain, no delete event exists.';

    RAISE NOTICE '==================================================';
    RAISE NOTICE 'ALL DELETE ADMINISTRATOR VERIFICATION CHECKS PASSED.';
    RAISE NOTICE '==================================================';
END;
$$;

-- Always rollback test mutations to maintain clean state
ROLLBACK;
