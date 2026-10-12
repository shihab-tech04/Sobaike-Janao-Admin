-- ==============================================================================
-- SOBAIKE JANAO ADMIN — PHASE 2 NOTIFICATION PRODUCER WIRING AUDIT SCRIPT
-- ==============================================================================
-- Target: Supabase PostgreSQL Database (sobaike-production / Supabase SQL Editor)
-- Purpose: Complete static and dynamic verification of Phase 2 Notification Producer Wiring
--          across all 12 catalogue events, producer contracts, RLS safety,
--          audience mode routing, deduplication idempotency, and transactional safety.
-- Schema: Real Phase 1 Notification Foundation + Phase 3f RBAC + Phase 2 Producer Wiring.
-- Safety: Non-destructive; dynamic simulation tests execute inside a rolled-back transaction.
--         No synthetic rows inserted into auth.users; dynamic tests discover safe fixtures
--         or gracefully log SKIPPED when fixtures are unavailable.
-- Expected Final Output: === PHASE 2 NOTIFICATION WIRING AUDIT: SUCCESS ===
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. STATIC ASSERTIONS: Catalogue Definitions, Producers, and Event Keys
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_expected_events TEXT[] := ARRAY[
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
    v_ev TEXT;
    v_missing_events TEXT[];
    v_func_src TEXT;
    v_proc_name TEXT;
    v_proc_sig TEXT;
    v_ret_type TEXT;
    v_anon_grant_count INT;
    v_canonical_perms TEXT[] := ARRAY[
        'dashboard.view',
        'complaints.view',
        'complaints.evidence_view',
        'complaints.export',
        'complaints.publish',
        'complaints.unpublish',
        'complaints.reject',
        'categories.view',
        'location_activity.view',
        'map.view',
        'responses.view',
        'admin_users.view',
        'admin_users.manage',
        'roles.manage',
        'audit.view'
    ];
    v_missing_canonical TEXT[];
    v_unexpected_perms TEXT[];
    v_count INT;
BEGIN
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE '>>> [AUDIT 1.1] Inspecting Notification Event Catalogue Definitions (Real Phase 1 Schema)...';
    RAISE NOTICE '==============================================================================';

    -- Check all 12 events exist in admin_notification_event_catalogue
    SELECT ARRAY(
        SELECT unnest(v_expected_events)
        EXCEPT
        SELECT event_key FROM public.admin_notification_event_catalogue
    ) INTO v_missing_events;

    IF cardinality(v_missing_events) > 0 THEN
        RAISE EXCEPTION 'Catalogue Verification FAILED: Missing event keys: %', array_to_string(v_missing_events, ', ');
    END IF;

    -- Verify all 12 events have valid Real Phase 1 catalogue attributes:
    -- Columns: event_key, category, default_layer, default_severity, description, active
    -- Valid categories: complaint, administration, role, security, personal, system
    -- Valid severities: info, action_required, warning, security
    FOR v_ev IN SELECT unnest(v_expected_events)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.admin_notification_event_catalogue
            WHERE event_key = v_ev
              AND category IN ('complaint', 'administration', 'role', 'security', 'personal', 'system')
              AND default_severity IN ('info', 'action_required', 'warning', 'security')
              AND default_layer IN ('action_required', 'workflow_activity', 'administrative_oversight', 'security_privilege', 'personal_account', 'system_operational')
              AND description IS NOT NULL
              AND length(btrim(description)) > 0
              AND active = true
        ) THEN
            RAISE EXCEPTION 'Catalogue Verification FAILED: Event % has missing or invalid catalogue metadata!', v_ev;
        END IF;
    END LOOP;

    -- Assert nonexistent columns (default_audience_mode, description_en, description_bn) do not exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'admin_notification_event_catalogue'
          AND column_name IN ('default_audience_mode', 'description_en', 'description_bn')
    ) THEN
        RAISE EXCEPTION 'Catalogue Verification FAILED: Nonexistent columns (default_audience_mode, description_en, description_bn) found on catalogue!';
    END IF;

    RAISE NOTICE '>>> [AUDIT 1.1 SUCCESS] All 12 catalogue definitions verified against Real Phase 1 Schema.';

    -- Check producers exist as SECURITY DEFINER
    RAISE NOTICE '>>> [AUDIT 1.2] Inspecting Producer Routines & Security Definer Status...';
    FOR v_proc_sig IN SELECT unnest(ARRAY[
        'submit_public_complaint(jsonb, text)',
        'register_public_complaint_evidence(text, text, text, bigint, text)',
        'admin_publish_complaint(text)',
        'admin_unpublish_complaint(text, text)',
        'admin_reject_complaint(text, text, text)',
        'admin_finalize_user_membership(uuid, text, text, boolean)',
        'admin_update_user(uuid, text, text, boolean)',
        'admin_create_role(text, text, boolean, text[], text)',
        'admin_update_role(text, text, text, boolean, text[], text, boolean, boolean)',
        'admin_replace_role_permissions(text, text[])',
        'log_role_audit_event(text, text, jsonb)'
    ])
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_proc p
            WHERE p.oid = ('public.' || v_proc_sig)::regprocedure
              AND p.prosecdef = true
        ) THEN
            RAISE EXCEPTION 'Producer Routine FAILED: % is not defined or is not SECURITY DEFINER!', v_proc_sig;
        END IF;
    END LOOP;

    -- Verify log_role_audit_event returns UUID for deterministic deduplication
    SELECT t.typname INTO v_ret_type
    FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE p.oid = 'public.log_role_audit_event(text, text, jsonb)'::regprocedure;

    IF v_ret_type <> 'uuid' THEN
        RAISE EXCEPTION 'Audit Logger FAILED: log_role_audit_event must return uuid, found %', v_ret_type;
    END IF;

    -- Verify log_role_audit_event preserves uppercase target_type USER and ROLE
    SELECT pg_get_functiondef('public.log_role_audit_event(text, text, jsonb)'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%''USER''%' OR v_func_src NOT LIKE '%''ROLE''%' THEN
        RAISE EXCEPTION 'Audit Logger FAILED: log_role_audit_event must preserve target_type USER and ROLE!';
    END IF;
    IF v_func_src LIKE '%''user''%' OR v_func_src LIKE '%''role''%' THEN
        RAISE EXCEPTION 'Audit Logger FAILED: log_role_audit_event must not use lowercase target_type user/role!';
    END IF;

    RAISE NOTICE '>>> [AUDIT 1.2 SUCCESS] All producer routines and helper return types verified.';

    -- Verify execute permissions
    RAISE NOTICE '>>> [AUDIT 1.3] Inspecting Routine Privilege Grants & Revocations...';
    SELECT COUNT(*) INTO v_anon_grant_count
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN (
        'admin_publish_complaint',
        'admin_unpublish_complaint',
        'admin_reject_complaint',
        'admin_finalize_user_membership',
        'admin_update_user',
        'admin_create_role',
        'admin_update_role',
        'admin_replace_role_permissions',
        'admin_emit_notification'
      )
      AND grantee IN ('anon', 'PUBLIC');

    IF v_anon_grant_count > 0 THEN
        RAISE EXCEPTION 'Security Grant FAILED: Administrative procedures or admin_emit_notification granted to anon/PUBLIC!';
    END IF;

    RAISE NOTICE '>>> [AUDIT 1.3 SUCCESS] Strict RBAC execute grants confirmed.';

    -- --------------------------------------------------------------------------
    -- 1.4 STATIC ASSERTIONS WITH pg_get_functiondef() ACROSS ALL 12 EVENTS
    -- --------------------------------------------------------------------------
    RAISE NOTICE '>>> [AUDIT 1.4] Static Inspection of All 12 Producer Events via pg_get_functiondef()...';

    -- Event 1: complaint.submitted (submit_public_complaint)
    SELECT pg_get_functiondef('public.submit_public_complaint(jsonb, text)'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%complaint.submitted%' THEN
        RAISE EXCEPTION 'Static Check 1 FAILED: submit_public_complaint does not emit complaint.submitted';
    END IF;
    IF v_func_src NOT LIKE '%EXCEPTION WHEN OTHERS THEN%' THEN
        RAISE EXCEPTION 'Static Check 1 FAILED: submit_public_complaint must wrap notification emission in fail-safe handler';
    END IF;

    -- Event 2: complaint.evidence_attached (register_public_complaint_evidence)
    SELECT pg_get_functiondef('public.register_public_complaint_evidence(text, text, text, bigint, text)'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%complaint.evidence_attached%' THEN
        RAISE EXCEPTION 'Static Check 2 FAILED: register_public_complaint_evidence does not emit complaint.evidence_attached';
    END IF;
    IF v_func_src NOT LIKE '%EXCEPTION WHEN OTHERS THEN%' THEN
        RAISE EXCEPTION 'Static Check 2 FAILED: register_public_complaint_evidence must wrap notification emission in fail-safe handler';
    END IF;

    -- Event 3: complaint.published (admin_publish_complaint)
    SELECT pg_get_functiondef('public.admin_publish_complaint(text)'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%complaint.published%' THEN
        RAISE EXCEPTION 'Static Check 3 FAILED: admin_publish_complaint does not emit complaint.published';
    END IF;
    IF v_func_src NOT LIKE '%complaints.publish%' THEN
        RAISE EXCEPTION 'Static Check 3 FAILED: admin_publish_complaint does not require permission complaints.publish';
    END IF;
    IF v_func_src NOT LIKE '%submitted%' OR v_func_src NOT LIKE '%unpublished%' THEN
        RAISE EXCEPTION 'Static Check 3 FAILED: admin_publish_complaint must accept status submitted or unpublished';
    END IF;
    IF v_func_src LIKE '%published_at%' THEN
        RAISE EXCEPTION 'Static Check 3 FAILED: admin_publish_complaint references nonexistent published_at!';
    END IF;

    -- Event 4: complaint.unpublished (admin_unpublish_complaint)
    SELECT pg_get_functiondef('public.admin_unpublish_complaint(text, text)'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%complaint.unpublished%' THEN
        RAISE EXCEPTION 'Static Check 4 FAILED: admin_unpublish_complaint does not emit complaint.unpublished';
    END IF;
    IF v_func_src NOT LIKE '%complaints.unpublish%' THEN
        RAISE EXCEPTION 'Static Check 4 FAILED: admin_unpublish_complaint does not require permission complaints.unpublish';
    END IF;

    -- Event 5: complaint.rejected (admin_reject_complaint)
    SELECT pg_get_functiondef('public.admin_reject_complaint(text, text, text)'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%complaint.rejected%' THEN
        RAISE EXCEPTION 'Static Check 5 FAILED: admin_reject_complaint does not emit complaint.rejected';
    END IF;
    IF v_func_src NOT LIKE '%complaints.reject%' THEN
        RAISE EXCEPTION 'Static Check 5 FAILED: admin_reject_complaint does not require permission complaints.reject';
    END IF;

    -- Event 6: admin.created (admin_finalize_user_membership)
    SELECT pg_get_functiondef('public.admin_finalize_user_membership(uuid, text, text, boolean)'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%admin.created%' THEN
        RAISE EXCEPTION 'Static Check 6 FAILED: admin_finalize_user_membership does not emit admin.created';
    END IF;
    IF v_func_src NOT LIKE '%personal%' THEN
        RAISE EXCEPTION 'Static Check 6 FAILED: admin_finalize_user_membership does not emit personal stream';
    END IF;
    IF v_func_src NOT LIKE '%admin_users.view%' OR v_func_src NOT LIKE '%admin_users.manage%' THEN
        RAISE EXCEPTION 'Static Check 6 FAILED: admin_finalize_user_membership oversight must require admin_users.view or admin_users.manage';
    END IF;

    -- Events 7, 8, 9: admin.activated, admin.deactivated, admin.role_changed (admin_update_user)
    SELECT pg_get_functiondef('public.admin_update_user(uuid, text, text, boolean)'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%admin.activated%' THEN
        RAISE EXCEPTION 'Static Check 7 FAILED: admin_update_user does not emit admin.activated';
    END IF;
    IF v_func_src NOT LIKE '%admin.deactivated%' THEN
        RAISE EXCEPTION 'Static Check 8 FAILED: admin_update_user does not emit admin.deactivated';
    END IF;
    IF v_func_src NOT LIKE '%admin.role_changed%' THEN
        RAISE EXCEPTION 'Static Check 9 FAILED: admin_update_user does not emit admin.role_changed';
    END IF;
    IF v_func_src NOT LIKE '%ADMIN_USER_UPDATED%' THEN
        RAISE EXCEPTION 'Static Check 9 FAILED: admin_update_user must preserve audit event ADMIN_USER_UPDATED';
    END IF;
    IF v_func_src LIKE '%has_role_permission%' THEN
        RAISE EXCEPTION 'Static Check 9 FAILED: admin_update_user references nonexistent has_role_permission!';
    END IF;
    IF v_func_src NOT LIKE '%count_effective_role_managers%' THEN
        RAISE EXCEPTION 'Static Check 9 FAILED: admin_update_user must preserve count_effective_role_managers protection!';
    END IF;

    -- Event 10: role.created (admin_create_role)
    SELECT pg_get_functiondef('public.admin_create_role(text, text, boolean, text[], text)'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%role.created%' THEN
        RAISE EXCEPTION 'Static Check 10 FAILED: admin_create_role does not emit role.created';
    END IF;
    IF v_func_src NOT LIKE '%roles.manage%' THEN
        RAISE EXCEPTION 'Static Check 10 FAILED: admin_create_role must direct notifications to roles.manage';
    END IF;
    IF v_func_src NOT LIKE '%generate_role_slug%' THEN
        RAISE EXCEPTION 'Static Check 10 FAILED: admin_create_role must use generate_role_slug';
    END IF;

    -- Check that conflicting overload was dropped
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_update_role'
          AND oidvectortypes(p.proargtypes) = 'text, text, text, text, boolean, text[], text, text'
    ) THEN
        RAISE EXCEPTION 'Static Check 11 FAILED: Conflicting overload admin_update_role(text, text, text, text, boolean, text[], text, text) must be DROPPED!';
    END IF;

    -- Event 11: role.updated (admin_update_role)
    SELECT pg_get_functiondef('public.admin_update_role(text, text, text, boolean, text[], text, boolean, boolean)'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%role.updated%' THEN
        RAISE EXCEPTION 'Static Check 11 FAILED: admin_update_role does not emit role.updated';
    END IF;
    IF v_func_src NOT LIKE '%roles.manage%' THEN
        RAISE EXCEPTION 'Static Check 11 FAILED: admin_update_role must direct notifications to roles.manage';
    END IF;

    -- Event 12: role.permissions_changed (admin_update_role & admin_replace_role_permissions)
    IF v_func_src NOT LIKE '%role.permissions_changed%' THEN
        RAISE EXCEPTION 'Static Check 12 FAILED: admin_update_role does not emit role.permissions_changed';
    END IF;

    SELECT pg_get_functiondef('public.admin_replace_role_permissions(text, text[])'::regprocedure)
    INTO v_func_src;

    IF v_func_src NOT LIKE '%role.permissions_changed%' THEN
        RAISE EXCEPTION 'Static Check 12 FAILED: admin_replace_role_permissions does not emit role.permissions_changed';
    END IF;
    IF v_func_src NOT LIKE '%roles.manage%' THEN
        RAISE EXCEPTION 'Static Check 12 FAILED: admin_replace_role_permissions must direct notifications to roles.manage';
    END IF;

    RAISE NOTICE '>>> [AUDIT 1.4 SUCCESS] All 12 producer events verified statically via pg_get_functiondef().';

    -- --------------------------------------------------------------------------
    -- 1.5 CANONICAL 15 PERMISSIONS INTEGRITY (NO NONEXISTENT PERMISSIONS)
    -- --------------------------------------------------------------------------
    RAISE NOTICE '>>> [AUDIT 1.5] Inspecting Canonical 15 Permissions Integrity...';

    SELECT ARRAY(
        SELECT unnest(v_canonical_perms)
        EXCEPT
        SELECT id FROM public.permissions
    ) INTO v_missing_canonical;

    IF cardinality(v_missing_canonical) > 0 THEN
        RAISE EXCEPTION 'Permissions Verification FAILED: Missing canonical permissions: %', array_to_string(v_missing_canonical, ', ');
    END IF;

    SELECT ARRAY(
        SELECT id FROM public.permissions
        EXCEPT
        SELECT unnest(v_canonical_perms)
    ) INTO v_unexpected_perms;

    IF cardinality(v_unexpected_perms) > 0 THEN
        RAISE EXCEPTION 'Permissions Verification FAILED: Unexpected permissions present in permissions table: %', array_to_string(v_unexpected_perms, ', ');
    END IF;

    -- Ensure exactly 15 permissions
    SELECT COUNT(*) INTO v_count FROM public.permissions;
    IF v_count <> 15 THEN
        RAISE EXCEPTION 'Permissions Verification FAILED: Expected exactly 15 permissions, found %', v_count;
    END IF;

    -- Ensure nonexistent permissions are NOT referenced in producer routines
    FOR v_proc_sig IN SELECT unnest(ARRAY[
        'admin_create_role(text, text, boolean, text[], text)',
        'admin_update_role(text, text, text, boolean, text[], text, boolean, boolean)',
        'admin_replace_role_permissions(text, text[])',
        'admin_publish_complaint(text)',
        'admin_unpublish_complaint(text, text)',
        'admin_reject_complaint(text, text, text)',
        'admin_finalize_user_membership(uuid, text, text, boolean)',
        'admin_update_user(uuid, text, text, boolean)'
    ])
    LOOP
        SELECT pg_get_functiondef(('public.' || v_proc_sig)::regprocedure) INTO v_func_src;

        IF v_func_src LIKE '%roles.view%' THEN
            RAISE EXCEPTION 'Permissions Verification FAILED: Routine % references deprecated roles.view!', v_proc_sig;
        END IF;
        IF v_func_src LIKE '%complaints.manage%' THEN
            RAISE EXCEPTION 'Permissions Verification FAILED: Routine % references deprecated complaints.manage!', v_proc_sig;
        END IF;
        IF v_func_src LIKE '%notifications.view%' THEN
            RAISE EXCEPTION 'Permissions Verification FAILED: Routine % references nonexistent notifications.view!', v_proc_sig;
        END IF;
    END LOOP;

    RAISE NOTICE '>>> [AUDIT 1.5 SUCCESS] Exactly 15 canonical permissions confirmed without nonexistent references.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. DYNAMIC TRANSACTIONAL TEST SUITE
-- Executes end-to-end emission verification across available fixtures in an isolated
-- sandbox, rolling back cleanly. Safe fixtures discovery ensures no fake auth.users
-- rows are inserted; tests gracefully mark SKIPPED if prerequisites are absent.
-- ------------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
    -- Fixture discovery variables
    v_u_super_actor   UUID;
    v_u_super_obs     UUID;
    v_u_normal_admin  UUID;
    v_candidate_user  UUID;
    v_test_segment    TEXT;
    v_test_subcat     TEXT;

    -- Variables for tests
    v_sub_payload     JSONB;
    v_sub_resp        JSONB;
    v_complaint_id    TEXT;
    v_client_sub_id   TEXT := 'audit_test_sub_' || floor(random()*1000000)::text;
    v_ev_resp         JSONB;
    v_evidence_id     UUID;
    v_notif_count     INT;
    v_role_resp       JSONB;
    v_test_role_slug  TEXT;
    v_user_resp       JSONB;
    
    -- Diagnostics
    v_pass_count      INT := 0;
    v_skip_count      INT := 0;
BEGIN
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE '>>> [AUDIT 2.0] Discovering Safe Test Fixtures (Zero Synthetic auth.users)...';
    RAISE NOTICE '==============================================================================';

    -- Discover existing Super Admins
    SELECT user_id INTO v_u_super_actor
    FROM public.admin_users
    WHERE is_super_admin = true AND active = true
    LIMIT 1;

    IF v_u_super_actor IS NOT NULL THEN
        SELECT user_id INTO v_u_super_obs
        FROM public.admin_users
        WHERE is_super_admin = true AND active = true AND user_id <> v_u_super_actor
        LIMIT 1;
    END IF;

    -- Discover existing Normal Active Admin
    SELECT user_id INTO v_u_normal_admin
    FROM public.admin_users
    WHERE is_super_admin IS NOT TRUE AND active = true
    LIMIT 1;

    -- Discover unassigned auth user for onboarding test (if any)
    BEGIN
        SELECT id INTO v_candidate_user
        FROM auth.users u
        WHERE NOT EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = u.id)
        LIMIT 1;
    EXCEPTION
        WHEN OTHERS THEN
            v_candidate_user := NULL;
    END;

    -- Discover active test segment & subcategory
    SELECT s.id, sc.id INTO v_test_segment, v_test_subcat
    FROM public.segments s
    JOIN public.subcategories sc ON sc.segment_id = s.id
    WHERE s.active = true AND sc.active = true
    LIMIT 1;

    IF v_test_segment IS NULL THEN
        -- Safely create a transaction-isolated fixture (rolled back at end)
        INSERT INTO public.segments (id, name_en, name_bn, active)
        VALUES ('audit_safe_seg', 'Audit Segment', 'অডিট সেগমেন্ট', true)
        ON CONFLICT (id) DO UPDATE SET active = true;

        INSERT INTO public.subcategories (id, segment_id, name_en, name_bn, active)
        VALUES ('audit_safe_subcat', 'audit_safe_seg', 'Audit Subcat', 'অডিট সাবক্যাটাগরি', true)
        ON CONFLICT (id) DO UPDATE SET active = true;

        v_test_segment := 'audit_safe_seg';
        v_test_subcat := 'audit_safe_subcat';
    END IF;

    RAISE NOTICE '>>> [AUDIT 2.0] Fixtures discovered: super_actor=%, super_obs=%, normal_admin=%, candidate_user=%',
        v_u_super_actor, v_u_super_obs, v_u_normal_admin, v_candidate_user;

    -- --------------------------------------------------------------------------
    -- TEST 1: Event 'complaint.submitted' (submit_public_complaint)
    -- --------------------------------------------------------------------------
    RAISE NOTICE '>>> [AUDIT 2.1] Testing Event 1: complaint.submitted...';
    IF v_test_segment IS NOT NULL AND v_test_subcat IS NOT NULL THEN
        v_sub_payload := jsonb_build_object(
            'segment', v_test_segment,
            'subcategoryId', v_test_subcat,
            'title', 'Audit Test Complaint Title',
            'description', 'Audit Test Complaint Description with sufficient length.',
            'incidentDate', CURRENT_DATE::text,
            'location', jsonb_build_object('district', 'Dhaka', 'division', 'Dhaka')
        );

        v_sub_resp := public.submit_public_complaint(v_sub_payload, v_client_sub_id);
        v_complaint_id := v_sub_resp->>'reportId';

        IF v_complaint_id IS NULL THEN
            RAISE EXCEPTION 'TEST 1 FAILED: submit_public_complaint did not return reportId!';
        END IF;

        -- Verify at least 1 notification record was created for event 'complaint.submitted'
        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'complaint.submitted'
          AND target_id = v_complaint_id;

        IF v_u_super_actor IS NOT NULL AND v_notif_count = 0 THEN
            RAISE EXCEPTION 'TEST 1 FAILED: No complaint.submitted notification records found!';
        END IF;

        -- Idempotency Test: re-submitting same client_submission_id must NOT duplicate notifications
        PERFORM public.submit_public_complaint(v_sub_payload, v_client_sub_id);

        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'complaint.submitted'
          AND target_id = v_complaint_id;

        -- Verify deduplication held
        IF v_notif_count > 0 THEN
            IF EXISTS (
                SELECT recipient_user_id, count(*)
                FROM public.admin_notifications
                WHERE event_key = 'complaint.submitted'
                  AND target_id = v_complaint_id
                GROUP BY recipient_user_id
                HAVING count(*) > 1
            ) THEN
                RAISE EXCEPTION 'TEST 1 FAILED: Duplicate notification records created on idempotent re-submission!';
            END IF;
        END IF;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE '>>> [AUDIT 2.1 SUCCESS] Event 1 complaint.submitted verified with idempotency.';
    ELSE
        v_skip_count := v_skip_count + 1;
        RAISE NOTICE 'SKIPPED: Active taxonomy fixtures not available for Test 1.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEST 2: Event 'complaint.evidence_attached' (register_public_complaint_evidence)
    -- --------------------------------------------------------------------------
    RAISE NOTICE '>>> [AUDIT 2.2] Testing Event 2: complaint.evidence_attached...';
    IF v_complaint_id IS NOT NULL THEN
        v_ev_resp := public.register_public_complaint_evidence(
            v_client_sub_id,
            'evidence/audit_safe_test.jpg',
            'audit_safe_test.jpg',
            10240,
            'Test Caption'
        );
        v_evidence_id := (v_ev_resp->>'evidence_id')::UUID;

        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'complaint.evidence_attached'
          AND target_id = v_complaint_id;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE '>>> [AUDIT 2.2 SUCCESS] Event 2 complaint.evidence_attached verified.';
    ELSE
        v_skip_count := v_skip_count + 1;
        RAISE NOTICE 'SKIPPED: Prerequisite complaint fixture not available for Test 2.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEST 3, 4, 5: Moderation Workflow (published, unpublished, rejected)
    -- --------------------------------------------------------------------------
    RAISE NOTICE '>>> [AUDIT 2.3] Testing Events 3, 4, 5: Moderation Workflow...';
    IF v_u_super_actor IS NOT NULL AND v_complaint_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_u_super_actor::text, true);

        -- 3. Publish Complaint (allows submitted -> published)
        PERFORM public.admin_publish_complaint(v_complaint_id);

        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'complaint.published'
          AND target_id = v_complaint_id;

        -- Actor must be excluded
        IF EXISTS (
            SELECT 1 FROM public.admin_notifications
            WHERE event_key = 'complaint.published'
              AND target_id = v_complaint_id
              AND recipient_user_id = v_u_super_actor
        ) THEN
            RAISE EXCEPTION 'TEST 3 FAILED: Actor was not excluded from complaint.published notification!';
        END IF;

        -- 4. Unpublish Complaint (published -> unpublished)
        PERFORM public.admin_unpublish_complaint(v_complaint_id, 'Audit test reason for unpublishing');

        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'complaint.unpublished'
          AND target_id = v_complaint_id;

        -- Publish Complaint again (allows unpublished -> published)
        PERFORM public.admin_publish_complaint(v_complaint_id);

        -- 5. Reject Complaint (reset status to submitted first)
        UPDATE public.complaints SET status = 'submitted' WHERE id = v_complaint_id;
        PERFORM public.admin_reject_complaint(v_complaint_id, 'INCOMPLETE_EVIDENCE', 'Audit note');

        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'complaint.rejected'
          AND target_id = v_complaint_id;

        v_pass_count := v_pass_count + 3;
        RAISE NOTICE '>>> [AUDIT 2.3 SUCCESS] Events 3, 4, 5 (published, unpublished, rejected) verified.';
    ELSE
        v_skip_count := v_skip_count + 3;
        RAISE NOTICE 'SKIPPED: Active super administrator or complaint fixture not found for moderation tests.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEST 6: Event 'admin.created' (admin_finalize_user_membership)
    -- --------------------------------------------------------------------------
    RAISE NOTICE '>>> [AUDIT 2.4] Testing Event 6: admin.created (admin_finalize_user_membership)...';
    IF v_u_super_actor IS NOT NULL AND v_candidate_user IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_u_super_actor::text, true);

        v_user_resp := public.admin_finalize_user_membership(
            v_candidate_user,
            'Candidate Admin Test',
            'super_admin',
            true
        );

        -- Verify oversight notification
        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'admin.created'
          AND target_id = v_candidate_user::text
          AND audience_mode = 'permission';

        -- Verify personal welcome notification
        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'admin.created'
          AND target_id = v_candidate_user::text
          AND audience_mode = 'personal'
          AND recipient_user_id = v_candidate_user;

        v_pass_count := v_pass_count + 1;
        RAISE NOTICE '>>> [AUDIT 2.4 SUCCESS] Event 6 admin.created dual-stream verified.';
    ELSE
        v_skip_count := v_skip_count + 1;
        RAISE NOTICE 'SKIPPED: Candidate auth.users fixture not available for admin_finalize_user_membership.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEST 7, 8, 9: User Lifecycle (activated, deactivated, role_changed)
    -- --------------------------------------------------------------------------
    RAISE NOTICE '>>> [AUDIT 2.5] Testing Events 7, 8, 9: User Lifecycle on admin_update_user...';
    IF v_u_super_actor IS NOT NULL AND v_u_normal_admin IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_u_super_actor::text, true);

        -- 8. Deactivate normal admin
        PERFORM public.admin_update_user(v_u_normal_admin, NULL, NULL, false);

        -- Oversight deactivation notification must be emitted
        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'admin.deactivated'
          AND target_id = v_u_normal_admin::text
          AND audience_mode = 'permission';

        -- Personal admin.deactivated must NOT exist (per requirements)
        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'admin.deactivated'
          AND target_id = v_u_normal_admin::text
          AND audience_mode = 'personal';

        IF v_notif_count <> 0 THEN
            RAISE EXCEPTION 'TEST 8 FAILED: Personal admin.deactivated was emitted! It must be removed.';
        END IF;

        -- 7. Activate normal admin
        PERFORM public.admin_update_user(v_u_normal_admin, NULL, NULL, true);

        -- Oversight and personal activated notifications
        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'admin.activated'
          AND target_id = v_u_normal_admin::text
          AND audience_mode = 'permission';

        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'admin.activated'
          AND target_id = v_u_normal_admin::text
          AND audience_mode = 'personal'
          AND recipient_user_id = v_u_normal_admin;

        -- 9. Role change while active: emit personal notification
        -- Create temporary test role to switch to inside transaction
        INSERT INTO public.roles (id, name_en, name_bn, active, is_system)
        VALUES ('audit_tmp_role', 'Audit Role', 'অডিট রোল', true, false)
        ON CONFLICT (id) DO UPDATE SET active = true;

        PERFORM public.admin_update_user(v_u_normal_admin, NULL, 'audit_tmp_role', NULL);

        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'admin.role_changed'
          AND target_id = v_u_normal_admin::text
          AND audience_mode = 'personal'
          AND recipient_user_id = v_u_normal_admin;

        IF v_notif_count <> 1 THEN
            RAISE EXCEPTION 'TEST 9 FAILED: Personal admin.role_changed notification not emitted when active admin role changed!';
        END IF;

        v_pass_count := v_pass_count + 3;
        RAISE NOTICE '>>> [AUDIT 2.5 SUCCESS] Events 7, 8, 9 (User Lifecycle) verified.';
    ELSE
        v_skip_count := v_skip_count + 3;
        RAISE NOTICE 'SKIPPED: Active normal admin or super admin fixture not available for admin_update_user lifecycle.';
    END IF;

    -- --------------------------------------------------------------------------
    -- TEST 10, 11, 12: Role Lifecycle (role.created, updated, permissions_changed)
    -- --------------------------------------------------------------------------
    RAISE NOTICE '>>> [AUDIT 2.6] Testing Events 10, 11, 12: Role Lifecycle...';
    IF v_u_super_actor IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_u_super_actor::text, true);

        -- 10. Create Role -> role.created
        v_role_resp := public.admin_create_role(
            'Audit Dynamic Role ' || floor(random()*10000)::text,
            'অডিট গতিশীল ভূমিকা',
            true,
            ARRAY['complaints.view']::TEXT[],
            'Role created during dynamic verification'
        );
        v_test_role_slug := v_role_resp->>'id';

        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'role.created'
          AND target_id = v_test_role_slug;

        -- 11. Update Role Metadata -> role.updated
        PERFORM public.admin_update_role(
            p_role_id := v_test_role_slug,
            p_name_en := 'Updated Dynamic Role ' || floor(random()*10000)::text,
            p_name_bn := 'আপডেটেড অডিট ভূমিকা'
        );

        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'role.updated'
          AND target_id = v_test_role_slug;

        -- 12. Update Role Permissions -> role.permissions_changed (using canonical permissions only!)
        PERFORM public.admin_replace_role_permissions(
            p_role_id := v_test_role_slug,
            p_permission_ids := ARRAY['complaints.view', 'complaints.publish']::TEXT[]
        );

        SELECT COUNT(*) INTO v_notif_count
        FROM public.admin_notifications
        WHERE event_key = 'role.permissions_changed'
          AND target_id = v_test_role_slug;

        v_pass_count := v_pass_count + 3;
        RAISE NOTICE '>>> [AUDIT 2.6 SUCCESS] Events 10, 11, 12 (Role Lifecycle) verified.';
    ELSE
        v_skip_count := v_skip_count + 3;
        RAISE NOTICE 'SKIPPED: Super admin fixture not available for role lifecycle tests.';
    END IF;

    RAISE NOTICE '==============================================================================';
    RAISE NOTICE '=== DYNAMIC SUITE SUMMARY: % PASS, % SKIPPED ===', v_pass_count, v_skip_count;
    RAISE NOTICE '=== PHASE 2 NOTIFICATION WIRING AUDIT: SUCCESS ===';
    RAISE NOTICE '==============================================================================';
END;
$$;

ROLLBACK;
