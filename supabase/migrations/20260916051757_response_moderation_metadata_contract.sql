-- Preserve response moderation metadata that the existing Admin detail contract already reads.
-- Public response submission/read behavior remains unchanged.

ALTER TABLE public.complaint_responses
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejection_note text,
  ADD COLUMN IF NOT EXISTS unpublish_reason text;

CREATE OR REPLACE FUNCTION public.admin_reject_response(
    p_response_id text,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trimmed_id text;
    v_normalized_note text;
    v_response record;
    v_now timestamptz := clock_timestamp();
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.reject') THEN
        RAISE EXCEPTION 'Access denied. Missing responses.reject permission.'
            USING ERRCODE = '42501';
    END IF;

    v_trimmed_id := NULLIF(btrim(p_response_id), '');
    IF v_trimmed_id IS NULL THEN
        RAISE EXCEPTION 'Invalid input: response ID cannot be empty.'
            USING ERRCODE = '22023';
    END IF;

    v_normalized_note := NULLIF(btrim(p_note), '');

    SELECT id, status
      INTO v_response
      FROM public.complaint_responses
     WHERE id::text = v_trimmed_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Response not found: %', v_trimmed_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_response.status <> 'pending_review' THEN
        RAISE EXCEPTION
            'Cannot reject response with status "%". Only "pending_review" responses can be rejected.',
            v_response.status
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.complaint_responses
       SET status = 'rejected',
           rejection_note = v_normalized_note,
           updated_at = v_now
     WHERE id = v_response.id;

    INSERT INTO public.admin_audit_logs (
        actor_id, action, target_type, target_id, details
    ) VALUES (
        auth.uid(),
        'response.reject',
        'response',
        v_trimmed_id,
        jsonb_build_object(
            'previous_status', v_response.status,
            'new_status', 'rejected',
            'note', v_normalized_note,
            'timestamp', v_now
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'response_id', v_trimmed_id,
        'previous_status', v_response.status,
        'status', 'rejected',
        'updated_at', v_now
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unpublish_response(
    p_response_id text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trimmed_id text;
    v_normalized_reason text;
    v_response record;
    v_now timestamptz := clock_timestamp();
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.unpublish') THEN
        RAISE EXCEPTION 'Access denied. Missing responses.unpublish permission.'
            USING ERRCODE = '42501';
    END IF;

    v_trimmed_id := NULLIF(btrim(p_response_id), '');
    IF v_trimmed_id IS NULL THEN
        RAISE EXCEPTION 'Invalid input: response ID cannot be empty.'
            USING ERRCODE = '22023';
    END IF;

    v_normalized_reason := NULLIF(btrim(p_reason), '');

    SELECT id, status, published_at
      INTO v_response
      FROM public.complaint_responses
     WHERE id::text = v_trimmed_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Response not found: %', v_trimmed_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_response.status <> 'published' THEN
        RAISE EXCEPTION
            'Cannot unpublish response with status "%". Only "published" responses can be unpublished.',
            v_response.status
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.complaint_responses
       SET status = 'unpublished',
           unpublish_reason = v_normalized_reason,
           updated_at = v_now
     WHERE id = v_response.id;

    INSERT INTO public.admin_audit_logs (
        actor_id, action, target_type, target_id, details
    ) VALUES (
        auth.uid(),
        'response.unpublish',
        'response',
        v_trimmed_id,
        jsonb_build_object(
            'previous_status', v_response.status,
            'new_status', 'unpublished',
            'reason', v_normalized_reason,
            'timestamp', v_now
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'response_id', v_trimmed_id,
        'previous_status', v_response.status,
        'status', 'unpublished',
        'updated_at', v_now,
        'published_at', v_response.published_at
    );
END;
$$;
