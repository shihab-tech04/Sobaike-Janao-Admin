-- ==============================================================================
-- SOBAIKE JANAO ADMIN — PHASE 2E: DASHBOARD & COMPLAINT READ AUTHORIZATION
-- ==============================================================================
-- Migration: 20260903000004_phase2e_dashboard_complaint_read_authorization.sql
-- Target: Supabase PostgreSQL Database (Public Schema)
--
-- Objective:
--   1. Secure public.complaints via Row-Level Security (RLS) so that row-level
--      administrative reads strictly require the 'complaints.view' permission.
--   2. Preserve public citizen feed: Anonymous (anon) callers can continue to
--      read published complaints (status = 'published') without interruption.
--   3. Provide a dedicated SECURITY DEFINER aggregate RPC: public.admin_get_dashboard_aggregates()
--      allowing callers with 'dashboard.view' permission to retrieve KPI metrics
--      and category distributions without exposing row-level complaint records.
--
-- Authorization Rules:
--   - public website (anon): SELECT complaints WHERE status = 'published'
--   - authenticated admin with 'complaints.view': SELECT all complaints
--   - authenticated admin with 'dashboard.view' only: BLOCKED from direct complaint SELECT;
--     can execute admin_get_dashboard_aggregates() for high-level aggregate counts only.
--   - Super Admin: Automatically satisfies has_permission() checks across both.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ROW LEVEL SECURITY ON public.complaints
-- ------------------------------------------------------------------------------
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- Explicitly drop known policies on public.complaints to avoid permissive OR-bypass
DROP POLICY IF EXISTS "complaints_public_anon_select_published" ON public.complaints;
DROP POLICY IF EXISTS "complaints_admin_authenticated_select" ON public.complaints;
DROP POLICY IF EXISTS "Allow public read access" ON public.complaints;
DROP POLICY IF EXISTS "Allow anon read published" ON public.complaints;
DROP POLICY IF EXISTS "Public complaints read published" ON public.complaints;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.complaints;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.complaints;
DROP POLICY IF EXISTS "complaints_select_policy" ON public.complaints;
DROP POLICY IF EXISTS "Allow authenticated users to view complaints" ON public.complaints;

-- Policy 1: Public Citizen Feed
-- Anonymous users can strictly read complaints with status = 'published'.
CREATE POLICY "complaints_public_anon_select_published" ON public.complaints
    FOR SELECT
    TO anon
    USING (status = 'published');

-- Policy 2: Administrative Complaint Access
-- Authenticated admins can only read complaints if they possess 'complaints.view' permission.
-- (Super Admin satisfies this automatically via public.has_permission()).
CREATE POLICY "complaints_admin_authenticated_select" ON public.complaints
    FOR SELECT
    TO authenticated
    USING (
        public.has_permission('complaints.view')
    );

-- ------------------------------------------------------------------------------
-- 2. CONTROLLED SECURITY DEFINER AGGREGATE RPC: public.admin_get_dashboard_aggregates()
--    Allows administrators with 'dashboard.view' permission to retrieve high-level
--    operational metrics without exposing row-level complaint records.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_aggregates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_stats jsonb;
    v_category_counts jsonb;
    v_total bigint;
    v_submitted bigint;
    v_published bigint;
    v_unpublished bigint;
    v_rejected bigint;
    v_edited bigint;
BEGIN
    -- Step 1: Enforce active admin session
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrator session required.'
            USING ERRCODE = '42501';
    END IF;

    -- Step 2: Enforce dashboard.view permission (Super Admin satisfies automatically)
    IF NOT public.has_permission('dashboard.view') THEN
        RAISE EXCEPTION 'Access denied. Dashboard view authorization required.'
            USING ERRCODE = '42501';
    END IF;

    -- Step 3: Compute lifecycle status aggregations across valid statuses
    SELECT
        COUNT(*) FILTER (WHERE status IN ('submitted', 'published', 'unpublished', 'rejected', 'edited')),
        COUNT(*) FILTER (WHERE status = 'submitted'),
        COUNT(*) FILTER (WHERE status = 'published'),
        COUNT(*) FILTER (WHERE status = 'unpublished'),
        COUNT(*) FILTER (WHERE status = 'rejected'),
        COUNT(*) FILTER (WHERE status = 'edited')
    INTO
        v_total,
        v_submitted,
        v_published,
        v_unpublished,
        v_rejected,
        v_edited
    FROM public.complaints;

    v_stats := jsonb_build_object(
        'totalComplaints', COALESCE(v_total, 0),
        'submitted', COALESCE(v_submitted, 0),
        'published', COALESCE(v_published, 0),
        'unpublished', COALESCE(v_unpublished, 0),
        'rejected', COALESCE(v_rejected, 0),
        'edited', COALESCE(v_edited, 0)
    );

    -- Step 4: Compute category breakdown across all active segments
    SELECT COALESCE(jsonb_agg(cat_row), '[]'::jsonb)
    INTO v_category_counts
    FROM (
        SELECT
            s.id,
            s.name_en AS "nameEn",
            s.name_bn AS "nameBn",
            COUNT(c.id)::int AS count,
            CASE
                WHEN COALESCE(v_total, 0) > 0 THEN ROUND((COUNT(c.id)::numeric / v_total::numeric) * 100, 2)::float
                ELSE 0::float
            END AS percentage
        FROM public.segments s
        LEFT JOIN public.complaints c 
            ON c.segment_id = s.id 
            AND c.status IN ('submitted', 'published', 'unpublished', 'rejected', 'edited')
        WHERE s.active IS NOT FALSE
        GROUP BY s.id, s.name_en, s.name_bn, s.sort_order
        ORDER BY s.sort_order ASC, s.name_en ASC
    ) cat_row;

    RETURN jsonb_build_object(
        'stats', v_stats,
        'categorySummary', v_category_counts
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_dashboard_aggregates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_dashboard_aggregates() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_aggregates() TO authenticated;

COMMIT;
