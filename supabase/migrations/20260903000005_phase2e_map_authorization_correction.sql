-- ==============================================================================
-- SOBAIKE JANAO ADMIN — PHASE 2E: MAP MONITORING AUTHORIZATION CORRECTION
-- ==============================================================================
-- Migration: 20260903000005_phase2e_map_authorization_correction.sql
-- Target: Supabase PostgreSQL Database (Public Schema)
--
-- Objective:
--   1. Provide a dedicated SECURITY DEFINER RPC: public.admin_get_map_dataset()
--      allowing callers with 'map.view' permission to retrieve controlled geospatial
--      and taxonomy filter data without granting arbitrary direct SELECT on public.complaints.
--   2. Explicitly verify active admin session and 'map.view' permission.
--   3. Return strictly sanitized fields required for map markers, filters, and clusters:
--      excludes reporter identities, contact details, private evidence, and audit logs.
--   4. Idempotently reaffirm Row-Level Security on public.complaints with explicit known
--      policies:
--      - anon: published complaints only (status = 'published')
--      - authenticated: requires 'complaints.view' (Super Admin passes dynamically)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ROW LEVEL SECURITY REAFFIRMATION ON public.complaints
-- ------------------------------------------------------------------------------
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- Reaffirm Policy 1: Public Citizen Feed (anon)
DROP POLICY IF EXISTS "complaints_public_anon_select_published" ON public.complaints;
CREATE POLICY "complaints_public_anon_select_published" ON public.complaints
    FOR SELECT
    TO anon
    USING (status = 'published');

-- Reaffirm Policy 2: Administrative Complaint Access (authenticated)
DROP POLICY IF EXISTS "complaints_admin_authenticated_select" ON public.complaints;
CREATE POLICY "complaints_admin_authenticated_select" ON public.complaints
    FOR SELECT
    TO authenticated
    USING (
        public.has_permission('complaints.view')
    );

-- ------------------------------------------------------------------------------
-- 2. CONTROLLED SECURITY DEFINER MAP RPC: public.admin_get_map_dataset()
--    Provides geospatial complaint data and taxonomy options strictly to active
--    administrators holding 'map.view' permission.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_map_dataset()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_complaints jsonb;
    v_segments jsonb;
    v_subcategories jsonb;
    v_unsupported_status_count int;
BEGIN
    -- 1. Enforce active administrator session
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrator session required.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Enforce map.view permission (Super Admin satisfies automatically)
    IF NOT public.has_permission('map.view') THEN
        RAISE EXCEPTION 'Access denied. Map view authorization required.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Calculate count of unsupported status complaints server-side without exposing row data
    SELECT COUNT(*)::int
    INTO v_unsupported_status_count
    FROM public.complaints c
    WHERE c.status IS NULL
       OR c.status NOT IN (
            'submitted',
            'published',
            'unpublished',
            'rejected',
            'edited'
       );

    -- 4. Fetch complaints strictly filtered to supported statuses and safe geospatial & display fields
    SELECT COALESCE(jsonb_agg(comp_row), '[]'::jsonb)
    INTO v_complaints
    FROM (
        SELECT
            c.id,
            c.segment_id,
            c.subcategory_id,
            c.title,
            c.title_en,
            c.status,
            c.formatted_address,
            c.division,
            c.district,
            c.upazila_or_thana,
            c.area,
            c.road,
            c.landmark,
            c.latitude,
            c.longitude,
            c.created_at
        FROM public.complaints c
        WHERE c.status IN (
            'submitted',
            'published',
            'unpublished',
            'rejected',
            'edited'
        )
        ORDER BY c.created_at DESC, c.id DESC
    ) comp_row;

    -- 5. Fetch segments taxonomy for map filters
    SELECT COALESCE(jsonb_agg(seg_row), '[]'::jsonb)
    INTO v_segments
    FROM (
        SELECT
            s.id,
            s.name_en,
            s.name_bn
        FROM public.segments s
        ORDER BY s.sort_order ASC, s.name_en ASC
    ) seg_row;

    -- 6. Fetch subcategories taxonomy for map filters
    SELECT COALESCE(jsonb_agg(sub_row), '[]'::jsonb)
    INTO v_subcategories
    FROM (
        SELECT
            sc.id,
            sc.segment_id,
            sc.name_en,
            sc.name_bn
        FROM public.subcategories sc
        ORDER BY sc.sort_order ASC, sc.name_en ASC
    ) sub_row;

    RETURN jsonb_build_object(
        'complaints', v_complaints,
        'segments', v_segments,
        'subcategories', v_subcategories,
        'unsupportedStatusCount', v_unsupported_status_count
    );
END;
$$;

-- Secure access privileges
REVOKE ALL ON FUNCTION public.admin_get_map_dataset() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_map_dataset() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_map_dataset() TO authenticated;

COMMIT;
