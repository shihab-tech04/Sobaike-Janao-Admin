-- ==============================================================================
-- SOBAIKE JANAO ADMIN — REPAIR MISSING EVIDENCE RPC
-- ==============================================================================
-- Migration: 20260904000009_fix_admin_get_complaint_evidence.sql
-- Purpose:
--   1. Authoritatively restores public.admin_get_complaint_evidence(p_complaint_id text)
--      in production schema matching the frontend contract in supabaseComplaintService.ts.
--   2. Enforces active administrative session via public.is_active_admin().
--   3. Enforces canonical permission 'complaints.evidence_view' via public.has_permission('complaints.evidence_view').
--   4. Returns exact SupabaseComplaintEvidenceRow structure:
--      id, complaint_id, storage_path, file_url, file_name, mime_type, media_type,
--      file_size_bytes, caption, created_at.
--   5. Secures function execution: blocks PUBLIC and anon, permits authenticated and service_role.
--   6. Reloads PostgREST schema cache via NOTIFY pgrst, 'reload schema'.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SECURE EVIDENCE RETRIEVAL RPC: admin_get_complaint_evidence(p_complaint_id)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_complaint_evidence(p_complaint_id text)
RETURNS TABLE (
    id UUID,
    complaint_id TEXT,
    storage_path TEXT,
    file_url TEXT,
    file_name TEXT,
    mime_type TEXT,
    media_type TEXT,
    file_size_bytes BIGINT,
    caption TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- 1. Verify active administrator session
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Verify specific evidence viewing permission
    IF NOT public.has_permission('complaints.evidence_view') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to view private complaint evidence.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Return evidence rows for the requested complaint
    RETURN QUERY
    SELECT
        ce.id,
        ce.complaint_id::text,
        ce.storage_path,
        ce.file_url,
        ce.file_name,
        ce.mime_type,
        ce.media_type,
        ce.file_size_bytes,
        ce.caption,
        ce.created_at
    FROM public.complaint_evidence ce
    WHERE ce.complaint_id::text = p_complaint_id
    ORDER BY ce.created_at ASC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. PRIVILEGE ENFORCEMENT & SCHEMA CACHE RELOAD
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_get_complaint_evidence(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_complaint_evidence(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_complaint_evidence(text) TO authenticated, service_role;

-- Request PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;
