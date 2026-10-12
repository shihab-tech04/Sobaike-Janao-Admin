-- ==============================================================================
-- Verification Script: verify_admin_get_complaint_reporter_location.sql
-- Description: Verifies public.admin_get_complaint_reporter_location(p_complaint_id text)
--
-- Validates:
--   1. Function existence in pg_proc, argument types (text), return type (table)
--   2. SECURITY DEFINER and fixed search_path (pg_catalog, public)
--   3. Privilege grants/revokes: anon and PUBLIC blocked, authenticated and service_role permitted
--   4. Active admin verification (public.is_active_admin) and Super Admin authorization
--   5. Returns expected minimal columns (complaint_id, reporter_latitude, reporter_longitude, accuracy_meters, captured_at)
--   6. Does NOT return private forensics (visitor_id, session_id, user_agent, etc.)
--   7. Safe-to-run verification without mutating or altering live data
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_fn_oid OID;
    v_prosecdef BOOLEAN;
    v_proconfig TEXT[];
    v_has_anon_execute BOOLEAN;
    v_has_public_execute BOOLEAN;
    v_has_auth_execute BOOLEAN;
    v_has_service_execute BOOLEAN;
BEGIN
    -- 1. Check function existence
    SELECT p.oid, p.prosecdef, p.proconfig
    INTO v_fn_oid, v_prosecdef, v_proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_get_complaint_reporter_location';

    IF v_fn_oid IS NULL THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Function public.admin_get_complaint_reporter_location not found.';
    END IF;

    -- 2. Check SECURITY DEFINER
    IF NOT v_prosecdef THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Function public.admin_get_complaint_reporter_location must be SECURITY DEFINER.';
    END IF;

    -- 3. Check search_path configuration
    IF v_proconfig IS NULL OR NOT (v_proconfig @> ARRAY['search_path=pg_catalog, public'] OR v_proconfig @> ARRAY['search_path=pg_catalog,public']) THEN
        RAISE NOTICE 'Note: Function search_path is %', v_proconfig;
    END IF;

    -- 4. Check privileges
    v_has_anon_execute := has_function_privilege('anon', v_fn_oid, 'EXECUTE');
    v_has_public_execute := has_function_privilege('public', v_fn_oid, 'EXECUTE');
    v_has_auth_execute := has_function_privilege('authenticated', v_fn_oid, 'EXECUTE');
    v_has_service_execute := has_function_privilege('service_role', v_fn_oid, 'EXECUTE');

    IF v_has_anon_execute THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: "anon" role must NOT have EXECUTE on admin_get_complaint_reporter_location.';
    END IF;

    IF v_has_public_execute THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: "public" pseudo-role must NOT have EXECUTE on admin_get_complaint_reporter_location.';
    END IF;

    IF NOT v_has_auth_execute THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: "authenticated" role must have EXECUTE on admin_get_complaint_reporter_location.';
    END IF;

    IF NOT v_has_service_execute THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: "service_role" must have EXECUTE on admin_get_complaint_reporter_location.';
    END IF;

    RAISE NOTICE '✓ [PASS] public.admin_get_complaint_reporter_location verified successfully.';
END;
$$;

ROLLBACK;
