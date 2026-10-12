-- ==============================================================================
-- SOBAIKE JANAO ADMIN — COMPLAINT EDITING BACKEND CONTRACT
-- ==============================================================================
-- Repository contract synchronized with live Supabase migration:
--   20260915044537 phase13_admin_edit_complaint_live
--
-- Current Admin Edit authorization mirrors the existing UI exactly:
-- an active admin must hold at least one of complaints.publish,
-- complaints.unpublish, or complaints.reject. There is intentionally no
-- complaints.edit permission in the current live permission catalogue.
--
-- Location mapping follows the actual Admin mapper:
--   location.ward -> public.complaints.upazila_or_thana
--   location.zone -> public.complaints.district
--   addressEn/addressBn -> public.complaints.formatted_address
--
-- The mutation preserves moderation status, reporter/device coordinates,
-- evidence, publication preferences, submission metadata, and created_at.
-- ==============================================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.complaints') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.complaints table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF to_regclass('public.complaint_updates') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.complaint_updates table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF to_regclass('public.admin_audit_logs') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.admin_audit_logs table does not exist.'
            USING ERRCODE = '42P01';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_edit_complaint(
    p_complaint_id text,
    p_title_en text DEFAULT NULL,
    p_title_bn text DEFAULT NULL,
    p_description_en text DEFAULT NULL,
    p_description_bn text DEFAULT NULL,
    p_segment_id text DEFAULT NULL,
    p_subcategory_id text DEFAULT NULL,
    p_priority text DEFAULT NULL,
    p_ward text DEFAULT NULL,
    p_zone text DEFAULT NULL,
    p_address_en text DEFAULT NULL,
    p_address_bn text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_complaint public.complaints%ROWTYPE;
    v_complaint_id text;
    v_segment_id text;
    v_subcategory_id text;
    v_priority text;
    v_title_bn text;
    v_title_en text;
    v_description_bn text;
    v_description_en text;
    v_ward text;
    v_district text;
    v_address text;
    v_notes text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT (
        public.has_permission('complaints.publish') OR
        public.has_permission('complaints.unpublish') OR
        public.has_permission('complaints.reject')
    ) THEN
        RAISE EXCEPTION 'Access denied. Complaint moderation permission required.' USING ERRCODE = '42501';
    END IF;

    v_complaint_id := NULLIF(btrim(p_complaint_id), '');
    IF v_complaint_id IS NULL THEN
        RAISE EXCEPTION 'Complaint ID cannot be empty.' USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_complaint
      FROM public.complaints
     WHERE id = v_complaint_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint with ID % not found.', v_complaint_id USING ERRCODE = 'P0002';
    END IF;

    v_segment_id := COALESCE(NULLIF(btrim(p_segment_id), ''), v_complaint.segment_id);

    IF v_segment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM public.segments s
         WHERE s.id = v_segment_id
           AND COALESCE(s.active, true) = true
    ) THEN
        RAISE EXCEPTION 'Invalid active complaint segment: %', v_segment_id USING ERRCODE = '22023';
    END IF;

    v_subcategory_id := COALESCE(NULLIF(btrim(p_subcategory_id), ''), v_complaint.subcategory_id);

    IF v_subcategory_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM public.subcategories sc
         WHERE sc.id = v_subcategory_id
           AND sc.segment_id = v_segment_id
           AND COALESCE(sc.active, true) = true
    ) THEN
        RAISE EXCEPTION 'Invalid subcategory % for segment %', v_subcategory_id, v_segment_id USING ERRCODE = '22023';
    END IF;

    v_priority := COALESCE(
        NULLIF(lower(btrim(p_priority)), ''),
        lower(COALESCE(v_complaint.priority, 'medium'))
    );

    IF v_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
        RAISE EXCEPTION 'Invalid priority: %', v_priority USING ERRCODE = '22023';
    END IF;

    -- Live schema stores Bengali/default text in title/description and English in *_en.
    v_title_bn := COALESCE(NULLIF(btrim(p_title_bn), ''), v_complaint.title);
    v_title_en := COALESCE(NULLIF(btrim(p_title_en), ''), v_complaint.title_en);
    v_description_bn := COALESCE(NULLIF(btrim(p_description_bn), ''), v_complaint.description);
    v_description_en := COALESCE(NULLIF(btrim(p_description_en), ''), v_complaint.description_en);

    IF COALESCE(NULLIF(btrim(v_title_bn), ''), NULLIF(btrim(v_title_en), '')) IS NULL THEN
        RAISE EXCEPTION 'At least one complaint title is required.' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(NULLIF(btrim(v_description_bn), ''), NULLIF(btrim(v_description_en), '')) IS NULL THEN
        RAISE EXCEPTION 'At least one complaint description is required.' USING ERRCODE = '22023';
    END IF;

    v_ward := COALESCE(NULLIF(btrim(p_ward), ''), v_complaint.upazila_or_thana);
    v_district := COALESCE(NULLIF(btrim(p_zone), ''), v_complaint.district);
    v_address := COALESCE(
        NULLIF(btrim(p_address_bn), ''),
        NULLIF(btrim(p_address_en), ''),
        v_complaint.formatted_address
    );
    v_notes := NULLIF(btrim(p_notes), '');

    UPDATE public.complaints
       SET title = v_title_bn,
           title_en = v_title_en,
           description = v_description_bn,
           description_en = v_description_en,
           segment_id = v_segment_id,
           subcategory_id = v_subcategory_id,
           priority = v_priority,
           upazila_or_thana = v_ward,
           district = v_district,
           formatted_address = v_address,
           updated_at = now()
     WHERE id = v_complaint.id;

    INSERT INTO public.complaint_updates (
        complaint_id,
        update_type,
        note,
        is_public,
        created_at
    ) VALUES (
        v_complaint.id,
        'edited',
        COALESCE(v_notes, 'Complaint details updated by administrator.'),
        false,
        now()
    );

    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        auth.uid(),
        'complaint.edit',
        'complaint',
        v_complaint.id,
        jsonb_build_object(
            'complaint_id', v_complaint.id,
            'status_preserved', v_complaint.status,
            'segment_id', v_segment_id,
            'subcategory_id', v_subcategory_id,
            'priority', v_priority,
            'ward', v_ward,
            'district', v_district,
            'notes', v_notes
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', v_complaint.id,
        'status', v_complaint.status,
        'message', 'Complaint updated successfully.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_edit_complaint(
    text, text, text, text, text, text, text,
    text, text, text, text, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_edit_complaint(
    text, text, text, text, text, text, text,
    text, text, text, text, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_edit_complaint(
    text, text, text, text, text, text, text,
    text, text, text, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_edit_complaint(
    text, text, text, text, text, text, text,
    text, text, text, text, text, text
) TO service_role;

DO $$
DECLARE
    v_secdef boolean;
    v_search_path text[];
    v_anon_execute boolean;
    v_auth_execute boolean;
BEGIN
    SELECT p.prosecdef, p.proconfig
      INTO v_secdef, v_search_path
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.oid = 'public.admin_edit_complaint(text,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure;

    IF v_secdef IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Assertion failed: admin_edit_complaint must be SECURITY DEFINER';
    END IF;

    IF v_search_path IS NULL OR NOT ('search_path=pg_catalog, public' = ANY(v_search_path)) THEN
        RAISE EXCEPTION 'Assertion failed: admin_edit_complaint must use fixed search_path';
    END IF;

    SELECT has_function_privilege(
        'anon',
        'public.admin_edit_complaint(text,text,text,text,text,text,text,text,text,text,text,text,text)',
        'EXECUTE'
    ) INTO v_anon_execute;

    IF v_anon_execute THEN
        RAISE EXCEPTION 'Assertion failed: anon must not execute admin_edit_complaint';
    END IF;

    SELECT has_function_privilege(
        'authenticated',
        'public.admin_edit_complaint(text,text,text,text,text,text,text,text,text,text,text,text,text)',
        'EXECUTE'
    ) INTO v_auth_execute;

    IF NOT v_auth_execute THEN
        RAISE EXCEPTION 'Assertion failed: authenticated must execute admin_edit_complaint';
    END IF;
END $$;

COMMIT;
