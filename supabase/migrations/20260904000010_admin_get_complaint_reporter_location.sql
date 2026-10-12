-- ==============================================================================
-- SOBAIKE JANAO ADMIN — SECURE REPORTER DEVICE LOCATION RPC
-- ==============================================================================
-- Migration: 20260904000010_admin_get_complaint_reporter_location.sql
-- Purpose:
--   1. Implements public.admin_get_complaint_reporter_location(p_complaint_id text)
--      to securely retrieve citizen reporter device location context without
--      exposing the underlying public.complaint_submission_contexts table to the browser.
--   2. Enforces active administrative session via public.is_active_admin().
--   3. Enforces highest-privilege admin rule (Super Admin) to protect private citizen telemetry
--      as no general canonical permission currently covers private reporter context.
--   4. Returns minimal required fields strictly for the location UI:
--      complaint_id, reporter_latitude, reporter_longitude, accuracy_meters, captured_at.
--      Never returns visitor_id, session_id, user_agent, or browser metadata.
--   5. Secures function execution: blocks PUBLIC and anon, permits authenticated and service_role.
--   6. Reloads PostgREST schema cache via NOTIFY pgrst, 'reload schema'.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SECURE REPORTER LOCATION RPC: admin_get_complaint_reporter_location
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_complaint_reporter_location(p_complaint_id text)
RETURNS TABLE (
    complaint_id TEXT,
    reporter_latitude DOUBLE PRECISION,
    reporter_longitude DOUBLE PRECISION,
    accuracy_meters DOUBLE PRECISION,
    captured_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_is_super_admin BOOLEAN;
BEGIN
    -- 1. Verify active administrator session
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Verify highest-privilege rule (Super Admin)
    -- Citizen device telemetry is strictly confidential and protected from general admins
    SELECT COALESCE(au.is_super_admin, false) INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.active = true;

    IF v_is_super_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Access denied. Private reporter device telemetry is restricted to Super Administrators.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Return minimal device location fields
    RETURN QUERY
    SELECT
        sc.complaint_id::text,
        sc.reporter_latitude,
        sc.reporter_longitude,
        sc.accuracy_meters,
        sc.captured_at
    FROM public.complaint_submission_contexts sc
    WHERE sc.complaint_id::text = p_complaint_id
    LIMIT 1;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. PRIVILEGE ENFORCEMENT & SCHEMA CACHE RELOAD
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_get_complaint_reporter_location(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_complaint_reporter_location(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_complaint_reporter_location(text) TO authenticated, service_role;

-- Request PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;
