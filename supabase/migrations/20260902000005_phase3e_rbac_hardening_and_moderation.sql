-- ==============================================================================
-- SOBAIKE JANAO ADMIN — RBAC HARDENING & MODERATION TRANSITIONS (PHASE 3E)
-- ==============================================================================
-- Repository: shihabshajib01-cell/sobaike-janao-admin
-- Target: Supabase PostgreSQL Database (sobaike-production)
-- Purpose:
--   1. Storage Authorization:
--      - Enforce SELECT RLS on storage.objects for private 'complaint-evidence' bucket
--        requiring active admin + 'complaints.evidence_view'.
--   2. Strict Moderation RPC Status Transitions & Row Locking:
--      - public.admin_publish_complaint:
--        * Allowed ONLY from 'submitted' or 'unpublished' -> 'published'
--        * Locks complaint row FOR UPDATE
--        * Inserts lifecycle event into public.complaint_updates (preserving timeline)
--        * Inserts audit log into public.admin_audit_logs
--      - public.admin_unpublish_complaint:
--        * Allowed ONLY from 'published' -> 'unpublished'
--        * Locks complaint row FOR UPDATE
--        * Inserts lifecycle event into public.complaint_updates
--        * Inserts audit log into public.admin_audit_logs
--      - public.admin_reject_complaint:
--        * Allowed ONLY from 'submitted' -> 'rejected'
--        * Locks complaint row FOR UPDATE
--        * Inserts lifecycle event into public.complaint_updates
--        * Inserts audit log into public.admin_audit_logs
-- Safety: SECURITY DEFINER with fixed search_path = pg_catalog, public.
--         Atomic, transactional, non-destructive.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. STORAGE OBJECTS AUTHORIZATION FOR 'complaint-evidence'
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'storage' AND table_name = 'objects'
    ) THEN
        DROP POLICY IF EXISTS "complaint_evidence_storage_view_policy" ON storage.objects;
        
        CREATE POLICY "complaint_evidence_storage_view_policy" ON storage.objects
            FOR SELECT
            TO authenticated
            USING (
                bucket_id = 'complaint-evidence'
                AND public.is_active_admin()
                AND public.has_permission('complaints.evidence_view')
            );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. HARDENED MODERATION RPC: admin_publish_complaint(p_complaint_id)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_publish_complaint(p_complaint_id text)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_complaint RECORD;
BEGIN
    -- 1. Authorization checks
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('complaints.publish') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to publish complaints.' USING ERRCODE = '42501';
    END IF;

    -- 2. Lock row FOR UPDATE and verify complaint exists
    SELECT id, status INTO v_complaint
    FROM public.complaints
    WHERE id::text = p_complaint_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint with ID % not found', p_complaint_id USING ERRCODE = 'P0002';
    END IF;

    -- 3. Strict Status Transition Matrix: allowed only from 'submitted' or 'unpublished'
    IF v_complaint.status NOT IN ('submitted', 'unpublished') THEN
        RAISE EXCEPTION 'Cannot publish complaint with status "%". Only "submitted" or "unpublished" complaints can be published.', v_complaint.status
            USING ERRCODE = '22023';
    END IF;

    -- 4. Perform status mutation
    UPDATE public.complaints
    SET 
        status = 'published',
        published_at = COALESCE(published_at, now()),
        updated_at = now()
    WHERE id = v_complaint.id;

    -- 5. Record lifecycle update for timeline UI in complaint_updates
    INSERT INTO public.complaint_updates (
        complaint_id,
        update_type,
        note,
        is_public,
        created_at
    ) VALUES (
        v_complaint.id,
        'published',
        'Complaint approved and published to public feed.',
        true,
        now()
    );

    -- 6. Record administrative audit log
    INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (
        auth.uid(),
        'complaint.publish',
        'complaint',
        p_complaint_id,
        jsonb_build_object('previous_status', v_complaint.status, 'new_status', 'published', 'timestamp', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', p_complaint_id,
        'status', 'published',
        'previous_status', v_complaint.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_publish_complaint(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_publish_complaint(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_complaint(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. HARDENED MODERATION RPC: admin_unpublish_complaint(p_complaint_id, p_reason)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_unpublish_complaint(p_complaint_id text, p_reason text DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_complaint RECORD;
    v_note_text TEXT;
BEGIN
    -- 1. Authorization checks
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('complaints.unpublish') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to unpublish complaints.' USING ERRCODE = '42501';
    END IF;

    -- 2. Lock row FOR UPDATE and verify complaint exists
    SELECT id, status INTO v_complaint
    FROM public.complaints
    WHERE id::text = p_complaint_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint with ID % not found', p_complaint_id USING ERRCODE = 'P0002';
    END IF;

    -- 3. Strict Status Transition Matrix: allowed only from 'published'
    IF v_complaint.status <> 'published' THEN
        RAISE EXCEPTION 'Cannot unpublish complaint with status "%". Only "published" complaints can be unpublished.', v_complaint.status
            USING ERRCODE = '22023';
    END IF;

    -- 4. Perform status mutation
    UPDATE public.complaints
    SET 
        status = 'unpublished',
        updated_at = now()
    WHERE id = v_complaint.id;

    v_note_text := COALESCE(NULLIF(TRIM(p_reason), ''), 'Complaint unpublished from public feed.');

    -- 5. Record lifecycle update for timeline UI in complaint_updates
    INSERT INTO public.complaint_updates (
        complaint_id,
        update_type,
        note,
        is_public,
        created_at
    ) VALUES (
        v_complaint.id,
        'unpublished',
        v_note_text,
        false,
        now()
    );

    -- 6. Record administrative audit log
    INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (
        auth.uid(),
        'complaint.unpublish',
        'complaint',
        p_complaint_id,
        jsonb_build_object('previous_status', v_complaint.status, 'new_status', 'unpublished', 'reason', p_reason, 'timestamp', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', p_complaint_id,
        'status', 'unpublished',
        'previous_status', v_complaint.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unpublish_complaint(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_unpublish_complaint(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_unpublish_complaint(text, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. HARDENED MODERATION RPC: admin_reject_complaint(p_complaint_id, p_reason_code, p_note)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reject_complaint(
    p_complaint_id text,
    p_reason_code text,
    p_note text
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_complaint RECORD;
    v_note_text TEXT;
BEGIN
    -- 1. Authorization checks
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('complaints.reject') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to reject complaints.' USING ERRCODE = '42501';
    END IF;

    -- 2. Lock row FOR UPDATE and verify complaint exists
    SELECT id, status INTO v_complaint
    FROM public.complaints
    WHERE id::text = p_complaint_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint with ID % not found', p_complaint_id USING ERRCODE = 'P0002';
    END IF;

    -- 3. Strict Status Transition Matrix: allowed only from 'submitted'
    IF v_complaint.status <> 'submitted' THEN
        RAISE EXCEPTION 'Cannot reject complaint with status "%". Only "submitted" complaints can be rejected.', v_complaint.status
            USING ERRCODE = '22023';
    END IF;

    -- 4. Perform status mutation
    UPDATE public.complaints
    SET 
        status = 'rejected',
        updated_at = now()
    WHERE id = v_complaint.id;

    v_note_text := COALESCE(NULLIF(TRIM(p_note), ''), p_reason_code);

    -- 5. Record lifecycle update for timeline UI in complaint_updates
    INSERT INTO public.complaint_updates (
        complaint_id,
        update_type,
        note,
        is_public,
        created_at
    ) VALUES (
        v_complaint.id,
        'rejected',
        v_note_text,
        false,
        now()
    );

    -- 6. Record administrative audit log
    INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (
        auth.uid(),
        'complaint.reject',
        'complaint',
        p_complaint_id,
        jsonb_build_object('previous_status', v_complaint.status, 'new_status', 'rejected', 'reason_code', p_reason_code, 'note', p_note, 'timestamp', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', p_complaint_id,
        'status', 'rejected',
        'previous_status', v_complaint.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_complaint(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_complaint(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_complaint(text, text, text) TO authenticated;

COMMIT;
