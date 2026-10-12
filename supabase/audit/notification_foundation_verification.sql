-- ==============================================================================
-- SOBAIKE JANAO ADMIN — NOTIFICATION FOUNDATION VERIFICATION SCRIPT
-- ==============================================================================
-- Migration: 20260904000004_notification_foundation.sql
-- Target: Supabase PostgreSQL Database (sobaike-production)
-- Purpose: Complete verification of Notification tables, columns, event catalogue keys,
--          audience_mode persistence, read-time visibility re-evaluation, function
--          privileges, and transactional deduplication/resolver runtime safety.
-- Safety: Non-destructive; runtime assertions execute inside a rolled-back transaction.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Static Schema & Table Assertions
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_rls_cat BOOLEAN;
    v_rls_notif BOOLEAN;
    v_nullable TEXT;
    v_con_aud TEXT;
    v_con_tgt TEXT;
BEGIN
    -- 1.1 Tables exist and RLS is enabled
    SELECT relrowsecurity INTO v_rls_cat
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'admin_notification_event_catalogue';

    IF v_rls_cat IS NOT TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: admin_notification_event_catalogue RLS is not enabled!';
    END IF;

    SELECT relrowsecurity INTO v_rls_notif
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'admin_notifications';

    IF v_rls_notif IS NOT TRUE THEN
        RAISE EXCEPTION 'Static Assertion FAILED: admin_notifications RLS is not enabled!';
    END IF;

    -- 1.2 audience_mode column is NOT NULL with domain check constraint
    SELECT is_nullable INTO v_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_notifications'
      AND column_name = 'audience_mode';

    IF v_nullable IS NULL THEN
        RAISE EXCEPTION 'Static Assertion FAILED: audience_mode column does not exist on admin_notifications!';
    ELSIF v_nullable <> 'NO' THEN
        RAISE EXCEPTION 'Static Assertion FAILED: audience_mode column must be NOT NULL, found nullable: %', v_nullable;
    END IF;

    SELECT pg_get_constraintdef(oid) INTO v_con_aud
    FROM pg_constraint
    WHERE conrelid = 'public.admin_notifications'::regclass
      AND conname = 'chk_notifications_audience_mode';

    IF v_con_aud IS NULL OR NOT (v_con_aud LIKE '%permission%' AND v_con_aud LIKE '%super_admin_only%' AND v_con_aud LIKE '%personal%') THEN
        RAISE EXCEPTION 'Static Assertion FAILED: chk_notifications_audience_mode constraint invalid or missing: %', v_con_aud;
    END IF;

    -- 1.3 target_type check constraint exists and restricts values
    SELECT pg_get_constraintdef(oid) INTO v_con_tgt
    FROM pg_constraint
    WHERE conrelid = 'public.admin_notifications'::regclass
      AND conname = 'chk_notifications_target_type';

    IF v_con_tgt IS NULL OR NOT (v_con_tgt LIKE '%complaint%' AND v_con_tgt LIKE '%admin_user%' AND v_con_tgt LIKE '%role%') THEN
        RAISE EXCEPTION 'Static Assertion FAILED: chk_notifications_target_type constraint invalid or missing: %', v_con_tgt;
    END IF;

    RAISE NOTICE 'Static Schema Assertions PASS: Tables, RLS, and constraints verified.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Canonical Event Catalogue Keys Assertion (Exact Set Matching)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_missing_keys TEXT[];
    v_unexpected_keys TEXT[];
    v_total_count INTEGER;
    v_expected_keys TEXT[] := ARRAY[
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
BEGIN
    SELECT COUNT(*) INTO v_total_count
    FROM public.admin_notification_event_catalogue;

    SELECT ARRAY(
        SELECT unnest(v_expected_keys)
        EXCEPT
        SELECT event_key FROM public.admin_notification_event_catalogue
    ) INTO v_missing_keys;

    SELECT ARRAY(
        SELECT event_key FROM public.admin_notification_event_catalogue
        EXCEPT
        SELECT unnest(v_expected_keys)
    ) INTO v_unexpected_keys;

    IF v_total_count <> 12 OR cardinality(v_missing_keys) > 0 OR cardinality(v_unexpected_keys) > 0 THEN
        RAISE EXCEPTION 'Event Catalogue Assertion FAILED! Count: % (expected 12), Missing: %, Unexpected: %',
            v_total_count, v_missing_keys, v_unexpected_keys;
    END IF;

    RAISE NOTICE 'Event Catalogue Assertion PASS: Exactly 12 approved Phase 1 keys present.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Permissions Table Integrity (Zero Notification Permissions)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_notif_perms_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_notif_perms_count
    FROM public.permissions
    WHERE id LIKE '%notif%' OR module LIKE '%notif%';

    IF v_notif_perms_count <> 0 THEN
        RAISE EXCEPTION 'Permissions Assertion FAILED: Found % notification permissions in public.permissions! Expected 0.', v_notif_perms_count;
    END IF;

    RAISE NOTICE 'Permissions Assertion PASS: Zero notification permissions in public.permissions (canonical 15 preserved).';
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Function Signatures & No-Unsafe-Overloads Assertion
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_has_safe_func BOOLEAN;
    v_has_unsafe_7args BOOLEAN;
    v_has_unsafe_2args BOOLEAN;
BEGIN
    -- Assert safe caller-bound 6-argument version exists
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_notification_can_currently_view'
          AND pg_get_function_identity_arguments(p.oid) = 'p_recipient_user_id uuid, p_audience_mode text, p_required_all_permissions text[], p_required_any_permissions text[], p_target_type text, p_target_id text'
    ) INTO v_has_safe_func;

    -- Assert NO 7-argument overload exists
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_notification_can_currently_view'
          AND p.pronargs = 7
    ) INTO v_has_unsafe_7args;

    -- Assert NO 2-argument overload exists
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_notification_can_currently_view'
          AND p.pronargs = 2
    ) INTO v_has_unsafe_2args;

    IF NOT v_has_safe_func THEN
        RAISE EXCEPTION 'Function Signature Assertion FAILED: Safe caller-bound admin_notification_can_currently_view(UUID, TEXT, TEXT[], TEXT[], TEXT, TEXT) not found!';
    END IF;

    IF v_has_unsafe_7args THEN
        RAISE EXCEPTION 'Function Signature Assertion FAILED: Unsafe 7-argument admin_notification_can_currently_view overload still exists!';
    END IF;

    IF v_has_unsafe_2args THEN
        RAISE EXCEPTION 'Function Signature Assertion FAILED: Unsafe 2-argument admin_notification_can_currently_view overload still exists!';
    END IF;

    RAISE NOTICE 'Function Signature Assertion PASS: Only safe caller-bound 6-argument visibility evaluator exists.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. RLS Policy Definition Assertion
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_qual TEXT;
BEGIN
    SELECT pg_get_expr(polqual, polrelid) INTO v_qual
    FROM pg_policy
    WHERE polrelid = 'public.admin_notifications'::regclass
      AND polname = 'admin_notifications_select_own';

    IF v_qual IS NULL THEN
        RAISE EXCEPTION 'RLS Policy Assertion FAILED: Policy admin_notifications_select_own does not exist!';
    END IF;

    IF NOT (v_qual LIKE '%auth.uid()%' AND v_qual LIKE '%is_active_admin()%' AND v_qual LIKE '%admin_notification_can_currently_view%') THEN
        RAISE EXCEPTION 'RLS Policy Assertion FAILED: Policy admin_notifications_select_own does not match expected definition: %', v_qual;
    END IF;

    RAISE NOTICE 'RLS Policy Assertion PASS: Policy admin_notifications_select_own correctly enforces auth.uid() and read-time visibility.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Privilege Lockdown Assertion
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_unsafe_grants INTEGER;
    v_unsafe_routines INTEGER;
    v_has_select BOOLEAN;
BEGIN
    -- admin_notifications: NO client mutation privileges
    SELECT COUNT(*) INTO v_unsafe_grants
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'admin_notifications'
      AND grantee IN ('authenticated', 'anon', 'PUBLIC')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

    IF v_unsafe_grants > 0 THEN
        RAISE EXCEPTION 'Privilege Assertion FAILED: Found % unsafe table mutation grants on admin_notifications!', v_unsafe_grants;
    END IF;

    -- admin_notifications: authenticated has SELECT
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = 'admin_notifications'
          AND grantee = 'authenticated'
          AND privilege_type = 'SELECT'
    ) INTO v_has_select;

    IF NOT v_has_select THEN
        RAISE EXCEPTION 'Privilege Assertion FAILED: authenticated role missing SELECT on admin_notifications!';
    END IF;

    -- Internal helper functions: NO client EXECUTE
    SELECT COUNT(*) INTO v_unsafe_routines
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN (
          'admin_notification_get_effective_permissions',
          'admin_notification_can_view_user_scope',
          'admin_notification_can_view_role_scope',
          'admin_notification_resolve_recipients',
          'admin_emit_notification'
      )
      AND grantee IN ('authenticated', 'anon', 'PUBLIC');

    IF v_unsafe_routines > 0 THEN
        RAISE EXCEPTION 'Privilege Assertion FAILED: Found % internal helper functions executable by client roles!', v_unsafe_routines;
    END IF;

    RAISE NOTICE 'Privilege Lockdown Assertion PASS: Client mutations and internal helpers strictly secured.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. Transactional Runtime Safety & Assertion Test Suite (Leaves NO persistent data)
-- ------------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
    -- Fixture discovery (never create fake admin_users or auth.users!)
    v_normal_admin_id UUID;
    v_super_admin_id UUID;
    v_can_simulate_auth BOOLEAN := false;

    -- Counters for truthful verification reporting
    v_pass_count INTEGER := 0;
    v_skip_count INTEGER := 0;

    -- Temporary roles for transactional permission assignment
    v_test_role_id TEXT := 'test-audit-role-' || substr(gen_random_uuid()::text, 1, 8);
    v_target_role_id TEXT := 'test-target-role-' || substr(gen_random_uuid()::text, 1, 8);
    v_dedupe_key TEXT := 'audit-dedupe-' || gen_random_uuid()::text;
    v_original_role_id TEXT;

    -- Operational test variables
    v_emit_res JSONB;
    v_resolved_count INTEGER;
    v_survived_count INTEGER;
    v_eff_perms TEXT[];
    v_super_perms TEXT[];
    v_all_perm_ids TEXT[];
    v_is_visible BOOLEAN;
    v_caught_22000 BOOLEAN;
    v_scope_ok BOOLEAN;
BEGIN
    -- 7.1 Discover active admin fixtures
    SELECT au.user_id INTO v_normal_admin_id
    FROM public.admin_users au
    WHERE au.active = true
      AND COALESCE(au.is_super_admin, false) = false
    LIMIT 1;

    SELECT au.user_id INTO v_super_admin_id
    FROM public.admin_users au
    WHERE au.active = true
      AND au.is_super_admin = true
    LIMIT 1;

    IF v_normal_admin_id IS NULL THEN
        RAISE NOTICE 'SKIPPED: Active normal administrator fixture not found in database. Normal admin runtime checks skipped.';
    END IF;

    IF v_super_admin_id IS NULL THEN
        RAISE NOTICE 'SKIPPED: Active super administrator fixture not found in database. Super admin runtime checks skipped.';
    END IF;

    -- 7.2 Check if transaction-local auth.uid() simulation is supported by runner
    IF v_normal_admin_id IS NOT NULL THEN
        BEGIN
            PERFORM set_config('request.jwt.claim.sub', v_normal_admin_id::text, true);
            IF auth.uid() = v_normal_admin_id THEN
                v_can_simulate_auth := true;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_can_simulate_auth := false;
        END;
    END IF;

    IF NOT v_can_simulate_auth THEN
        RAISE NOTICE 'SKIPPED: Transaction-local auth.uid() context simulation not active in this runner. Direct caller-bound runtime ownership assertions skipped.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEST N: Canonical Emitter Deduplication
    -- --------------------------------------------------------------------------
    IF v_normal_admin_id IS NOT NULL THEN
        -- First emission
        v_emit_res := public.admin_emit_notification(
            p_event_key := 'complaint.submitted',
            p_title_en := 'Test Dedupe English',
            p_title_bn := 'টেস্ট ডিডুপ বাংলা',
            p_audience_mode := 'personal',
            p_personal_recipient_id := v_normal_admin_id,
            p_dedupe_key := v_dedupe_key,
            p_exclude_actor := false
        );

        IF (v_emit_res->>'recipient_count')::INTEGER <> 1 THEN
            RAISE EXCEPTION 'TEST N FAILED (Dedupe Initial): Expected recipient_count = 1, got %', v_emit_res->>'recipient_count';
        END IF;

        -- Second emission with identical dedupe_key
        v_emit_res := public.admin_emit_notification(
            p_event_key := 'complaint.submitted',
            p_title_en := 'Test Dedupe English',
            p_title_bn := 'টেস্ট ডিডুপ বাংলা',
            p_audience_mode := 'personal',
            p_personal_recipient_id := v_normal_admin_id,
            p_dedupe_key := v_dedupe_key,
            p_exclude_actor := false
        );

        IF (v_emit_res->>'recipient_count')::INTEGER <> 0 THEN
            RAISE EXCEPTION 'TEST N FAILED (Dedupe Secondary): Expected recipient_count = 0, got %', v_emit_res->>'recipient_count';
        END IF;

        SELECT COUNT(*) INTO v_survived_count
        FROM public.admin_notifications
        WHERE recipient_user_id = v_normal_admin_id AND dedupe_key = v_dedupe_key;

        IF v_survived_count <> 1 THEN
            RAISE EXCEPTION 'TEST N FAILED (Dedupe Row Count): Expected exactly 1 surviving row, found %', v_survived_count;
        END IF;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'TEST PASS (Test N - Canonical Emitter Deduplication): Exactly 1 notification row inserted on dedupe collision.';
    ELSE
        v_skip_count := v_skip_count + 1;
        RAISE NOTICE 'SKIPPED (Test N - Canonical Emitter Deduplication): Active normal administrator fixture not found in database.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEST D: Personal Audience Mode
    -- --------------------------------------------------------------------------
    IF v_normal_admin_id IS NOT NULL THEN
        -- Active personal recipient is resolved without needing roles.manage/admin_users.manage
        SELECT COUNT(*) INTO v_resolved_count
        FROM public.admin_notification_resolve_recipients(
            'personal',
            '{}',
            '{}',
            NULL,
            NULL,
            v_normal_admin_id,
            NULL,
            false,
            true
        );

        IF v_resolved_count <> 1 THEN
            RAISE EXCEPTION 'TEST D FAILED (Personal Mode Resolution): Active recipient not resolved.';
        END IF;

        -- Inactive recipient: not returned
        UPDATE public.admin_users SET active = false WHERE user_id = v_normal_admin_id;

        SELECT COUNT(*) INTO v_resolved_count
        FROM public.admin_notification_resolve_recipients(
            'personal',
            '{}',
            '{}',
            NULL,
            NULL,
            v_normal_admin_id,
            NULL,
            false,
            true
        );

        IF v_resolved_count <> 0 THEN
            RAISE EXCEPTION 'TEST D FAILED (Personal Mode Inactive): Inactive recipient was resolved!';
        END IF;

        -- Restore active flag
        UPDATE public.admin_users SET active = true WHERE user_id = v_normal_admin_id;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'TEST PASS (Test D - Personal Mode): Active resolved without elevated perms, inactive safely skipped.';
    ELSE
        v_skip_count := v_skip_count + 1;
        RAISE NOTICE 'SKIPPED (Test D - Personal Mode): Active normal administrator fixture not found in database.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEST C: Actor Exclusion
    -- --------------------------------------------------------------------------
    IF v_super_admin_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_resolved_count
        FROM public.admin_notification_resolve_recipients(
            'super_admin_only',
            '{}',
            '{}',
            NULL,
            NULL,
            NULL,
            v_super_admin_id,
            true, -- exclude actor
            true
        ) r
        WHERE r = v_super_admin_id;

        IF v_resolved_count <> 0 THEN
            RAISE EXCEPTION 'TEST C FAILED (Actor Exclusion): Super admin actor was not excluded.';
        END IF;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'TEST PASS (Test C - Actor Exclusion): Actor excluded when p_exclude_actor is true.';
    ELSE
        v_skip_count := v_skip_count + 1;
        RAISE NOTICE 'SKIPPED: Active super administrator fixture not found. Test C (Actor Exclusion) skipped.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEST B: Super Admin Dynamic Permissions & super_admin_only Mode
    -- --------------------------------------------------------------------------
    IF v_super_admin_id IS NOT NULL THEN
        -- Super Admin must dynamically possess all canonical permissions in system
        SELECT ARRAY(SELECT id FROM public.permissions ORDER BY id) INTO v_all_perm_ids;
        SELECT ARRAY(SELECT p_id FROM public.admin_notification_get_effective_permissions(v_super_admin_id) AS p_id ORDER BY p_id) INTO v_super_perms;

        IF v_super_perms <> v_all_perm_ids THEN
            RAISE EXCEPTION 'TEST B FAILED (Super Admin Permissions): Super admin permissions do not match complete catalog!';
        END IF;

        -- Resolver super_admin_only mode returns only super admins
        SELECT COUNT(*) INTO v_resolved_count
        FROM public.admin_notification_resolve_recipients(
            'super_admin_only',
            '{}',
            '{}',
            NULL,
            NULL,
            NULL,
            NULL,
            false,
            true
        ) r
        JOIN public.admin_users au ON au.user_id = r
        WHERE au.is_super_admin IS NOT TRUE;

        IF v_resolved_count <> 0 THEN
            RAISE EXCEPTION 'TEST B FAILED (super_admin_only Mode): Non-super-admin resolved in super_admin_only mode!';
        END IF;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'TEST PASS (Test B - Super Admin Dynamic Permissions & Isolation): Verified dynamic complete permission set.';
    ELSE
        v_skip_count := v_skip_count + 1;
        RAISE NOTICE 'SKIPPED: Active super administrator fixture not found. Test B (Super Admin Dynamic Permissions & Isolation) skipped.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEMPORARY FIXTURE ASSIGNMENT (Safe Transactional Replacement)
    -- --------------------------------------------------------------------------
    IF v_normal_admin_id IS NOT NULL THEN
        -- 1. Capture existing role mapping for v_normal_admin_id if present (for diagnostic logging)
        SELECT role_id INTO v_original_role_id
        FROM public.user_roles
        WHERE user_id = v_normal_admin_id;

        -- 2. Create a temporary test role
        INSERT INTO public.roles (id, name_en, name_bn, active, is_system)
        VALUES (v_test_role_id, 'Audit Test Role', 'অডিট টেস্ট রোল', true, false);

        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_test_role_id, 'complaints.view');

        -- 3. Safely delete current user_roles mapping for the test normal admin
        DELETE FROM public.user_roles WHERE user_id = v_normal_admin_id;

        -- 4. Deterministically insert temporary test role
        INSERT INTO public.user_roles (user_id, role_id)
        VALUES (v_normal_admin_id, v_test_role_id);

        -- ----------------------------------------------------------------------
        -- TEST E: required_all_permissions
        -- ----------------------------------------------------------------------
        SELECT COUNT(*) INTO v_resolved_count
        FROM public.admin_notification_resolve_recipients(
            'permission',
            ARRAY['complaints.view'],
            '{}',
            NULL,
            NULL,
            NULL,
            NULL,
            false,
            false
        ) r
        WHERE r = v_normal_admin_id;

        IF v_resolved_count <> 1 THEN
            RAISE EXCEPTION 'TEST E FAILED (required_all matching): Normal admin was not resolved!';
        END IF;

        SELECT COUNT(*) INTO v_resolved_count
        FROM public.admin_notification_resolve_recipients(
            'permission',
            ARRAY['complaints.view', 'complaints.evidence_view'],
            '{}',
            NULL,
            NULL,
            NULL,
            NULL,
            false,
            false
        ) r
        WHERE r = v_normal_admin_id;

        IF v_resolved_count <> 0 THEN
            RAISE EXCEPTION 'TEST E FAILED (required_all non-matching): Normal admin resolved without possessing all required permissions!';
        END IF;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'TEST PASS (Test E - required_all_permissions): Passes with full match, fails on missing permission.';

        -- ----------------------------------------------------------------------
        -- TEST F: required_any_permissions
        -- ----------------------------------------------------------------------
        SELECT COUNT(*) INTO v_resolved_count
        FROM public.admin_notification_resolve_recipients(
            'permission',
            '{}',
            ARRAY['complaints.view', 'roles.manage'],
            NULL,
            NULL,
            NULL,
            NULL,
            false,
            false
        ) r
        WHERE r = v_normal_admin_id;

        IF v_resolved_count <> 1 THEN
            RAISE EXCEPTION 'TEST F FAILED (required_any matching): Normal admin was not resolved on permission overlap!';
        END IF;

        SELECT COUNT(*) INTO v_resolved_count
        FROM public.admin_notification_resolve_recipients(
            'permission',
            '{}',
            ARRAY['roles.manage', 'audit.view'],
            NULL,
            NULL,
            NULL,
            NULL,
            false,
            false
        ) r
        WHERE r = v_normal_admin_id;

        IF v_resolved_count <> 0 THEN
            RAISE EXCEPTION 'TEST F FAILED (required_any disjoint): Normal admin resolved without any matching permissions!';
        END IF;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'TEST PASS (Test F - required_any_permissions): Passes on any overlap, fails on disjoint set.';

        -- ----------------------------------------------------------------------
        -- TEST G: Protected Super Admin User Target
        -- ----------------------------------------------------------------------
        IF v_super_admin_id IS NOT NULL THEN
            -- Add admin_users.view to test role
            INSERT INTO public.role_permissions (role_id, permission_id)
            VALUES (v_test_role_id, 'admin_users.view');

            v_scope_ok := public.admin_notification_can_view_user_scope(v_normal_admin_id, v_super_admin_id);
            IF v_scope_ok IS TRUE THEN
                RAISE EXCEPTION 'TEST G FAILED (User Target Scoping): Normal admin allowed to view Super Admin target!';
            END IF;

            v_pass_count := v_pass_count + 1;
            RAISE NOTICE 'TEST PASS (Test G - Protected Super Admin Target): Normal admin cannot target Super Admin user scope.';
        ELSE
            v_skip_count := v_skip_count + 1;
            RAISE NOTICE 'SKIPPED: Active super administrator fixture not found. Test G (Protected Super Admin Target) skipped.';
        END IF;

        -- ----------------------------------------------------------------------
        -- TEST H: Role Target Ceiling
        -- ----------------------------------------------------------------------
        -- Create target role with complaints.view
        INSERT INTO public.roles (id, name_en, name_bn, active, is_system)
        VALUES (v_target_role_id, 'Audit Target Role', 'অডিট টার্গেট রোল', true, false);

        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_target_role_id, 'complaints.view');

        -- Add roles.manage to test role
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_test_role_id, 'roles.manage');

        -- Target role permissions (complaints.view) are a subset of normal admin permissions -> OK
        v_scope_ok := public.admin_notification_can_view_role_scope(v_normal_admin_id, v_target_role_id);
        IF v_scope_ok IS NOT TRUE THEN
            RAISE EXCEPTION 'TEST H FAILED (Role Target Scope Initial): Allowed role target rejected!';
        END IF;

        -- Now add audit.view to target role (normal admin does NOT hold audit.view -> exceeds ceiling)
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_target_role_id, 'audit.view');

        v_scope_ok := public.admin_notification_can_view_role_scope(v_normal_admin_id, v_target_role_id);
        IF v_scope_ok IS TRUE THEN
            RAISE EXCEPTION 'TEST H FAILED (Role Target Ceiling Exceeded): Normal admin allowed to manage role outside ceiling!';
        END IF;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'TEST PASS (Test H - Role Target Ceiling): Out-of-ceiling role target strictly blocked.';

        -- ----------------------------------------------------------------------
        -- TEST I: Stale Target-Scope Revocation
        -- ----------------------------------------------------------------------
        -- Reset target role to complaints.view (inside recipient ceiling)
        DELETE FROM public.role_permissions WHERE role_id = v_target_role_id AND permission_id = 'audit.view';

        v_scope_ok := public.admin_notification_can_view_role_scope(v_normal_admin_id, v_target_role_id);
        IF v_scope_ok IS NOT TRUE THEN
            RAISE EXCEPTION 'TEST I FAILED (Initial Target Scope): Scope must be visible initially!';
        END IF;

        IF v_can_simulate_auth THEN
            PERFORM set_config('request.jwt.claim.sub', v_normal_admin_id::text, true);
            v_is_visible := public.admin_notification_can_currently_view(
                v_normal_admin_id,
                'permission',
                ARRAY['roles.manage'],
                '{}',
                'role',
                v_target_role_id
            );
            IF v_is_visible IS NOT TRUE THEN
                RAISE EXCEPTION 'TEST I FAILED (Caller-Bound Target Scope Initial): Notification must be visible initially!';
            END IF;
        END IF;

        -- Add audit.view to target role (exceeds recipient ceiling)
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_target_role_id, 'audit.view');

        v_scope_ok := public.admin_notification_can_view_role_scope(v_normal_admin_id, v_target_role_id);
        IF v_scope_ok IS TRUE THEN
            RAISE EXCEPTION 'TEST I FAILED (Post-Ceiling Target Scope): Scope must NOT be visible after target expands!';
        END IF;

        IF v_can_simulate_auth THEN
            v_is_visible := public.admin_notification_can_currently_view(
                v_normal_admin_id,
                'permission',
                ARRAY['roles.manage'],
                '{}',
                'role',
                v_target_role_id
            );
            IF v_is_visible IS TRUE THEN
                RAISE EXCEPTION 'TEST I FAILED (Stale Notification Visibility): Stale notification should be hidden when target role exceeds ceiling!';
            END IF;

            v_pass_count := v_pass_count + 1;
            RAISE NOTICE 'TEST PASS (Test I - Stale Target-Scope Revocation): Historical role notifications disappear when target exceeds ceiling.';
        ELSE
            v_skip_count := v_skip_count + 1;
            RAISE NOTICE 'SKIPPED: auth.uid() simulation unavailable for stale role-target visibility test';
        END IF;

        -- ----------------------------------------------------------------------
        -- TEST J: Stale Permission Revocation
        -- ----------------------------------------------------------------------
        IF v_can_simulate_auth THEN
            PERFORM set_config('request.jwt.claim.sub', v_normal_admin_id::text, true);

            -- Initial check: recipient possesses roles.manage
            v_is_visible := public.admin_notification_can_currently_view(
                v_normal_admin_id,
                'permission',
                ARRAY['roles.manage'],
                '{}',
                NULL,
                NULL
            );
            IF v_is_visible IS NOT TRUE THEN
                RAISE EXCEPTION 'TEST J FAILED (Permission Initial): Admin with roles.manage denied visibility!';
            END IF;

            -- Revoke 'roles.manage' from test role
            DELETE FROM public.role_permissions WHERE role_id = v_test_role_id AND permission_id = 'roles.manage';

            -- Re-evaluate visibility: MUST return false immediately!
            v_is_visible := public.admin_notification_can_currently_view(
                v_normal_admin_id,
                'permission',
                ARRAY['roles.manage'],
                '{}',
                NULL,
                NULL
            );
            IF v_is_visible IS TRUE THEN
                RAISE EXCEPTION 'TEST J FAILED (Permission Revocation): Stale notification visible after permission loss!';
            END IF;

            v_pass_count := v_pass_count + 1;
            RAISE NOTICE 'TEST PASS (Test J - Stale Permission Revocation): Stale privileged notifications dynamically hidden after permission loss.';
        ELSE
            v_skip_count := v_skip_count + 1;
            RAISE NOTICE 'SKIPPED: auth.uid() simulation unavailable for stale permission revocation test';
        END IF;

        -- ----------------------------------------------------------------------
        -- TEST A1: Active/Inactive Effective Permissions
        -- ----------------------------------------------------------------------
        -- While active, effective permissions exist
        SELECT ARRAY(SELECT p_id FROM public.admin_notification_get_effective_permissions(v_normal_admin_id) AS p_id) INTO v_eff_perms;
        IF cardinality(v_eff_perms) = 0 THEN
            RAISE EXCEPTION 'TEST A1 FAILED: Active admin must have permissions from test role!';
        END IF;

        -- Temporarily mark inactive
        UPDATE public.admin_users SET active = false WHERE user_id = v_normal_admin_id;

        SELECT ARRAY(SELECT p_id FROM public.admin_notification_get_effective_permissions(v_normal_admin_id) AS p_id) INTO v_eff_perms;
        IF cardinality(v_eff_perms) <> 0 THEN
            RAISE EXCEPTION 'TEST A1 FAILED: Deactivated admin returned effective permissions: %', v_eff_perms;
        END IF;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'TEST PASS (Test A1 - Inactive Effective Permissions): Inactive admins possess no effective permissions.';

        -- ----------------------------------------------------------------------
        -- TEST A2: Caller-Bound Visibility
        -- ----------------------------------------------------------------------
        IF v_can_simulate_auth THEN
            PERFORM set_config('request.jwt.claim.sub', v_normal_admin_id::text, true);
            v_is_visible := public.admin_notification_can_currently_view(
                v_normal_admin_id,
                'personal',
                '{}',
                '{}',
                NULL,
                NULL
            );
            IF v_is_visible IS TRUE THEN
                RAISE EXCEPTION 'TEST A2 FAILED: Deactivated admin granted caller-bound visibility!';
            END IF;

            -- Restore active flag
            UPDATE public.admin_users SET active = true WHERE user_id = v_normal_admin_id;

            v_pass_count := v_pass_count + 1;
            RAISE NOTICE 'TEST PASS (Test A2 - Caller-Bound Visibility): Inactive admins strictly denied caller-bound visibility.';
        ELSE
            -- Restore active flag
            UPDATE public.admin_users SET active = true WHERE user_id = v_normal_admin_id;

            v_skip_count := v_skip_count + 1;
            RAISE NOTICE 'SKIPPED (Test A2 - Caller-Bound Visibility): auth.uid() simulation unavailable.';
        END IF;
    ELSE
        -- Normal admin fixture missing: skip dependent tests E, F, G, H, I, J, A1, A2
        v_skip_count := v_skip_count + 8;
        RAISE NOTICE 'SKIPPED (Tests E, F, G, H, I, J, A1, A2): Active normal administrator fixture not found in database.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEST K: Unknown Target Type Fail-Closed
    -- --------------------------------------------------------------------------
    SELECT COUNT(*) INTO v_resolved_count
    FROM public.admin_notification_resolve_recipients(
        'permission',
        '{}',
        '{}',
        'unknown_target_secret',
        'some_id',
        NULL,
        NULL,
        false,
        false
    );

    IF v_resolved_count <> 0 THEN
        RAISE EXCEPTION 'TEST K FAILED (Unknown Target Type Resolver): Resolved % candidates for unknown target', v_resolved_count;
    END IF;

    v_caught_22000 := false;
    BEGIN
        PERFORM public.admin_emit_notification(
            p_event_key := 'complaint.submitted',
            p_title_en := 'Valid Title',
            p_title_bn := 'বৈধ শিরোনাম',
            p_target_type := 'unsupported_type',
            p_target_id := 'some_id'
        );
    EXCEPTION WHEN SQLSTATE '22000' THEN
        v_caught_22000 := true;
    END;
    IF NOT v_caught_22000 THEN
        RAISE EXCEPTION 'TEST K FAILED (Unknown Target Type Emitter): Did not raise SQLSTATE 22000!';
    END IF;

    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST PASS (Test K - Unknown Target Type): Resolver returns 0, emitter raises SQLSTATE 22000.';

    -- --------------------------------------------------------------------------
    -- TEST L: Malformed Target IDs (SQLSTATE 22000)
    -- --------------------------------------------------------------------------
    -- admin_user with NULL target_id
    v_caught_22000 := false;
    BEGIN
        PERFORM public.admin_emit_notification(
            p_event_key := 'admin.created',
            p_title_en := 'Valid Title',
            p_title_bn := 'বৈধ শিরোনাম',
            p_target_type := 'admin_user',
            p_target_id := NULL
        );
    EXCEPTION WHEN SQLSTATE '22000' THEN
        v_caught_22000 := true;
    END;
    IF NOT v_caught_22000 THEN
        RAISE EXCEPTION 'TEST L FAILED (admin_user NULL target_id): Did not raise SQLSTATE 22000!';
    END IF;

    -- admin_user with blank target_id
    v_caught_22000 := false;
    BEGIN
        PERFORM public.admin_emit_notification(
            p_event_key := 'admin.created',
            p_title_en := 'Valid Title',
            p_title_bn := 'বৈধ শিরোনাম',
            p_target_type := 'admin_user',
            p_target_id := '   '
        );
    EXCEPTION WHEN SQLSTATE '22000' THEN
        v_caught_22000 := true;
    END;
    IF NOT v_caught_22000 THEN
        RAISE EXCEPTION 'TEST L FAILED (admin_user blank target_id): Did not raise SQLSTATE 22000!';
    END IF;

    -- admin_user with invalid UUID
    v_caught_22000 := false;
    BEGIN
        PERFORM public.admin_emit_notification(
            p_event_key := 'admin.created',
            p_title_en := 'Valid Title',
            p_title_bn := 'বৈধ শিরোনাম',
            p_target_type := 'admin_user',
            p_target_id := 'not-a-valid-uuid'
        );
    EXCEPTION WHEN SQLSTATE '22000' THEN
        v_caught_22000 := true;
    END;
    IF NOT v_caught_22000 THEN
        RAISE EXCEPTION 'TEST L FAILED (admin_user invalid UUID): Did not raise SQLSTATE 22000!';
    END IF;

    -- role with NULL target_id
    v_caught_22000 := false;
    BEGIN
        PERFORM public.admin_emit_notification(
            p_event_key := 'role.created',
            p_title_en := 'Valid Title',
            p_title_bn := 'বৈধ শিরোনাম',
            p_target_type := 'role',
            p_target_id := NULL
        );
    EXCEPTION WHEN SQLSTATE '22000' THEN
        v_caught_22000 := true;
    END;
    IF NOT v_caught_22000 THEN
        RAISE EXCEPTION 'TEST L FAILED (role NULL target_id): Did not raise SQLSTATE 22000!';
    END IF;

    -- role with blank target_id
    v_caught_22000 := false;
    BEGIN
        PERFORM public.admin_emit_notification(
            p_event_key := 'role.created',
            p_title_en := 'Valid Title',
            p_title_bn := 'বৈধ শিরোনাম',
            p_target_type := 'role',
            p_target_id := ''
        );
    EXCEPTION WHEN SQLSTATE '22000' THEN
        v_caught_22000 := true;
    END;
    IF NOT v_caught_22000 THEN
        RAISE EXCEPTION 'TEST L FAILED (role blank target_id): Did not raise SQLSTATE 22000!';
    END IF;

    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST PASS (Test L - Malformed Target IDs): Missing, blank, or malformed target IDs strictly rejected with SQLSTATE 22000.';

    -- --------------------------------------------------------------------------
    -- TEST M: Invalid Audience Mode Fail-Closed
    -- --------------------------------------------------------------------------
    SELECT COUNT(*) INTO v_resolved_count
    FROM public.admin_notification_resolve_recipients(
        'invalid_audience_mode',
        '{}',
        '{}',
        NULL,
        NULL,
        NULL,
        NULL,
        false,
        false
    );

    IF v_resolved_count <> 0 THEN
        RAISE EXCEPTION 'TEST M FAILED (Invalid Audience Mode Resolver): Resolved % candidates for invalid mode', v_resolved_count;
    END IF;

    v_caught_22000 := false;
    BEGIN
        PERFORM public.admin_emit_notification(
            p_event_key := 'complaint.submitted',
            p_title_en := 'Valid Title',
            p_title_bn := 'বৈধ শিরোনাম',
            p_audience_mode := 'invalid_mode'
        );
    EXCEPTION WHEN SQLSTATE '22000' THEN
        v_caught_22000 := true;
    END;
    IF NOT v_caught_22000 THEN
        RAISE EXCEPTION 'TEST M FAILED (Invalid Audience Mode Emitter): Did not raise SQLSTATE 22000!';
    END IF;

    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST PASS (Test M - Invalid Audience Mode): Resolver returns 0, emitter raises SQLSTATE 22000.';

    RAISE NOTICE '==============================================================================';
    IF v_skip_count = 0 THEN
        RAISE NOTICE 'NOTIFICATION FOUNDATION VERIFICATION PASSED';
        RAISE NOTICE 'Passed: %', v_pass_count;
        RAISE NOTICE 'Skipped: 0';
        RAISE NOTICE 'All executable verification checks completed successfully.';
    ELSE
        RAISE NOTICE 'NOTIFICATION FOUNDATION VERIFICATION COMPLETED WITH SKIPPED TESTS';
        RAISE NOTICE 'Passed: %', v_pass_count;
        RAISE NOTICE 'Skipped: %', v_skip_count;
        RAISE NOTICE 'Review the SKIPPED notices above before treating live verification as fully complete.';
    END IF;
    RAISE NOTICE '==============================================================================';
END;
$$;

ROLLBACK;
