CREATE OR REPLACE FUNCTION public.admin_get_response_detail(p_response_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
    v_id text;
    v_response_json jsonb;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.view') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to view responses.'
            USING ERRCODE = '42501';
    END IF;

    v_id := NULLIF(trim(p_response_id), '');
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'Response ID is required'
            USING ERRCODE = '22000';
    END IF;

    SELECT jsonb_build_object(
        'id', r.id,
        'complaint_id', r.complaint_id,
        'complaint', jsonb_build_object(
            'id', c.id,
            'title', c.title,
            'segment_id', c.segment_id,
            'segment_name_en', s.name_en,
            'segment_name_bn', s.name_bn,
            'district', c.district,
            'status', c.status
        ),
        'response_type', r.response_type,
        'responder_type', r.responder_type,
        'responder_name', r.responder_name,
        'designation', r.designation,
        'organization_name', r.organization_name,
        'official_statement', r.official_statement,
        'supporting_documents_note', r.supporting_documents_note,
        'request_correction_or_removal', COALESCE(r.request_correction_or_removal, false),
        'correction_details', r.correction_details,
        'status', r.status,
        'content', r.content,
        'incident_date', r.incident_date,
        'rejection_reason', r.rejection_reason,
        'rejection_note', r.rejection_note,
        'unpublish_reason', r.unpublish_reason,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'published_at', r.published_at,
        'contact_consent', COALESCE(r.contact_consent, false),
        'contact_info', CASE
            WHEN COALESCE(r.contact_consent, false) = true THEN r.contact_info
            ELSE NULL
        END,
        'contact_email_or_phone', r.contact_email_or_phone
    )
    INTO v_response_json
    FROM public.complaint_responses r
    JOIN public.complaints c ON c.id = r.complaint_id
    LEFT JOIN public.segments s ON s.id = c.segment_id
    WHERE r.id::text = v_id;

    IF v_response_json IS NULL THEN
        RAISE EXCEPTION 'Response with ID % not found', v_id
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_response_json;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_response_detail(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_response_detail(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_response_detail(text) TO authenticated;
