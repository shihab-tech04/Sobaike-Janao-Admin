-- ==============================================================================
-- Migration: 20260904000005_notification_producer_wiring.sql
-- Description: Phase 2 — Complete Notification Producer Wiring Across All 12 Events
--
-- This migration updates all backend producers to emit canonical notification events
-- via public.admin_emit_notification() with exact contracts, strict audience modes,
-- RBAC scoping, dual-stream delivery, idempotency deduplication keys, and RLS safety.
--
-- Catalogued Events Wired:
-- 1. complaint.submitted        (Producer: submit_public_complaint)
-- 2. complaint.evidence_attached(Producer: register_public_complaint_evidence)
-- 3. complaint.published        (Producer: admin_publish_complaint)
-- 4. complaint.unpublished      (Producer: admin_unpublish_complaint)
-- 5. complaint.rejected         (Producer: admin_reject_complaint)
-- 6. admin.created              (Producer: admin_finalize_user_membership - Dual Stream)
-- 7. admin.activated            (Producer: admin_update_user - Dual Stream)
-- 8. admin.deactivated          (Producer: admin_update_user - Dual Stream)
-- 9. admin.role_changed         (Producer: admin_update_user - Dual Stream)
-- 10. role.created              (Producer: admin_create_role)
-- 11. role.updated              (Producer: admin_update_role - Metadata changes)
-- 12. role.permissions_changed  (Producers: admin_update_role & admin_replace_role_permissions)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. AUDIT LOGGER HELPER: Return Audit Log UUID
-- Upgrades log_role_audit_event to return the generated UUID for deterministic
-- oversight notification deduplication keys.
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.log_role_audit_event(TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.log_role_audit_event(
    p_action TEXT,
    p_target_id TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    )
    VALUES (
        auth.uid(),
        p_action,
        CASE
            WHEN p_action ILIKE '%USER%' THEN 'USER'
            ELSE 'ROLE'
        END,
        p_target_id,
        COALESCE(p_details, '{}'::jsonb),
        clock_timestamp()
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_role_audit_event(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_role_audit_event(TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_role_audit_event(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_role_audit_event(TEXT, TEXT, JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 2. PRODUCER FOR EVENT 1: complaint.submitted
-- Updates submit_public_complaint to emit 'complaint.submitted' on success.
-- Idempotent duplicate submissions do NOT emit duplicate notifications.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_public_complaint(
  p_payload jsonb,
  p_client_submission_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public, pg_temp
AS $$
DECLARE
  v_client_sub_id text;
  v_existing record;
  v_segment text;
  v_subcat_id text;
  v_title text;
  v_description text;
  v_incident_date_raw text;
  v_incident_date date;
  v_incident_time_raw text;
  v_incident_time time;
  v_frequency text;
  v_privacy_choice text;
  v_division text;
  v_district text;
  v_lat double precision;
  v_lng double precision;
  v_publication_prefs jsonb;
  v_evidence_types jsonb;
  v_report_id text;
  v_year text;
  v_random_suffix int;
  v_collision_check boolean;
  v_attempts int := 0;
  v_party jsonb;
  v_party_type text;
BEGIN
  -- Step 1: Honeypot Anti-Bot Check
  IF (p_payload->>'website' IS NOT NULL AND trim(p_payload->>'website') <> '') OR
     (p_payload->>'honeypot' IS NOT NULL AND trim(p_payload->>'honeypot') <> '') THEN
    RAISE EXCEPTION 'SUBMISSION_REJECTED: The submission could not be accepted.';
  END IF;

  -- Step 2: Validate Client Submission ID
  v_client_sub_id := trim(coalesce(p_client_submission_id, ''));
  IF v_client_sub_id = '' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Client submission identifier is required.';
  END IF;

  -- Step 3: Idempotency Check
  SELECT id, segment_id, subcategory_id, title, status, created_at
  INTO v_existing
  FROM public.complaints
  WHERE client_submission_id = v_client_sub_id
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'reportId', v_existing.id,
      'message', 'Report has already been submitted.',
      'report', jsonb_build_object(
        'id', v_existing.id,
        'segment', v_existing.segment_id,
        'subcategoryId', v_existing.subcategory_id,
        'title', v_existing.title,
        'status', v_existing.status,
        'createdAt', to_char(v_existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    );
  END IF;

  -- Step 4: Validate Segment & Subcategory from Database
  v_segment := trim(coalesce(p_payload->>'segment', ''));
  IF v_segment = '' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Valid segment is required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.segments 
    WHERE id = v_segment AND active = true
  ) THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Selected segment is invalid or inactive.';
  END IF;

  v_subcat_id := trim(coalesce(p_payload->>'subcategoryId', ''));
  IF v_subcat_id = '' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Subcategory is required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.subcategories 
    WHERE id = v_subcat_id 
      AND segment_id = v_segment 
      AND active = true
  ) THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Selected subcategory does not belong to the selected segment or is inactive.';
  END IF;

  -- Step 5: Validate Title & Description Lengths
  v_title := trim(coalesce(p_payload->>'title', ''));
  IF length(v_title) < 3 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Title is required (at least 3 characters).';
  END IF;

  v_description := trim(coalesce(p_payload->>'description', ''));
  IF length(v_description) < 10 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Description is required (at least 10 characters).';
  END IF;

  -- Step 6: Validate and Parse Incident Date & Incident Time
  v_incident_date_raw := trim(coalesce(p_payload->>'incidentDate', ''));
  IF v_incident_date_raw = '' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Incident date is required.';
  END IF;

  BEGIN
    v_incident_date := v_incident_date_raw::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Invalid incident date format. Expected YYYY-MM-DD.';
  END;

  v_incident_time_raw := trim(coalesce(p_payload->>'incidentTime', ''));
  IF v_incident_time_raw <> '' THEN
    BEGIN
      v_incident_time := v_incident_time_raw::time;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'VALIDATION_FAILED: Invalid incident time format.';
    END;
  ELSE
    v_incident_time := NULL;
  END IF;

  -- Step 7: Validate Frequency & Privacy Choice
  v_frequency := coalesce(nullif(trim(coalesce(p_payload->>'frequency', '')), ''), 'one-time');
  IF v_frequency NOT IN ('one-time', 'repeated') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Invalid frequency choice. Allowed: one-time, repeated.';
  END IF;

  v_privacy_choice := trim(coalesce(p_payload->>'privacyChoice', 'anonymous'));
  IF v_privacy_choice NOT IN ('anonymous', 'admin_only', 'public_identity') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Valid reporter privacy choice is required.';
  END IF;

  -- Step 8: Validate Location
  v_division := trim(coalesce(p_payload->'location'->>'division', ''));
  v_district := trim(coalesce(p_payload->'location'->>'district', ''));
  IF v_district = '' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Location district is required.';
  END IF;

  IF p_payload->'location'->>'lat' IS NOT NULL AND trim(p_payload->'location'->>'lat') <> '' THEN
    BEGIN
      v_lat := (p_payload->'location'->>'lat')::double precision;
    EXCEPTION WHEN OTHERS THEN
      v_lat := NULL;
    END;
  ELSE
    v_lat := NULL;
  END IF;

  IF p_payload->'location'->>'lng' IS NOT NULL AND trim(p_payload->'location'->>'lng') <> '' THEN
    BEGIN
      v_lng := (p_payload->'location'->>'lng')::double precision;
    EXCEPTION WHEN OTHERS THEN
      v_lng := NULL;
    END;
  ELSE
    v_lng := NULL;
  END IF;

  -- Step 9: Publication Preferences & Evidence Types
  IF p_payload->'publicationPreferences' IS NOT NULL AND jsonb_typeof(p_payload->'publicationPreferences') = 'object' THEN
    v_publication_prefs := p_payload->'publicationPreferences';
  ELSE
    v_publication_prefs := jsonb_build_object(
      'showSubjectName', false,
      'showOrganization', false,
      'showGeneralLocation', true,
      'showDescription', true
    );
  END IF;

  IF p_payload->'evidenceTypes' IS NOT NULL AND jsonb_typeof(p_payload->'evidenceTypes') = 'array' THEN
    v_evidence_types := p_payload->'evidenceTypes';
  ELSE
    v_evidence_types := '[]'::jsonb;
  END IF;

  -- Step 10: Generate Unique Report ID (SJ-{YEAR}-{6 DIGIT NUMBER})
  v_year := to_char(now(), 'YYYY');
  LOOP
    v_attempts := v_attempts + 1;
    v_random_suffix := floor(100000 + random() * 900000)::int;
    v_report_id := 'SJ-' || v_year || '-' || v_random_suffix::text;

    SELECT EXISTS (SELECT 1 FROM public.complaints WHERE id = v_report_id)
    INTO v_collision_check;

    IF NOT v_collision_check THEN
      EXIT;
    END IF;

    IF v_attempts >= 50 THEN
      RAISE EXCEPTION 'REPORT_ID_GENERATION_FAILED: Unable to generate a unique report ID after multiple attempts. Please try again.';
    END IF;
  END LOOP;

  -- Step 11: Insert Complaint Record
  INSERT INTO public.complaints (
    id,
    client_submission_id,
    segment_id,
    subcategory_id,
    title,
    description,
    incident_date,
    incident_time,
    frequency,
    privacy_choice,
    relationship_context,
    intimate_what_happened,
    intimate_platform,
    division,
    district,
    upazila_or_thana,
    area,
    road,
    landmark,
    formatted_address,
    latitude,
    longitude,
    place_id,
    has_supporting_info,
    evidence_types,
    evidence_description,
    publication_preferences,
    reporter_name,
    reporter_contact,
    confirm_public_identity,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_report_id,
    v_client_sub_id,
    v_segment,
    v_subcat_id,
    v_title,
    v_description,
    v_incident_date,
    v_incident_time,
    v_frequency,
    v_privacy_choice,
    nullif(trim(coalesce(p_payload->>'relationshipContext', '')), ''),
    p_payload->'intimateWhatHappened',
    p_payload->'intimatePlatform',
    v_division,
    v_district,
    nullif(trim(coalesce(p_payload->'location'->>'upazilaOrThana', '')), ''),
    nullif(trim(coalesce(p_payload->'location'->>'area', '')), ''),
    nullif(trim(coalesce(p_payload->'location'->>'road', '')), ''),
    nullif(trim(coalesce(p_payload->'location'->>'landmark', '')), ''),
    nullif(trim(coalesce(p_payload->'location'->>'formattedAddress', '')), ''),
    v_lat,
    v_lng,
    nullif(trim(coalesce(p_payload->'location'->>'placeId', '')), ''),
    coalesce((p_payload->>'hasSupportingInfo')::boolean, false),
    v_evidence_types,
    nullif(trim(coalesce(p_payload->>'evidenceDescription', '')), ''),
    v_publication_prefs,
    nullif(trim(coalesce(p_payload->'adminContact'->>'name', '')), ''),
    nullif(trim(coalesce(p_payload->'adminContact'->>'contact', '')), ''),
    coalesce((p_payload->'adminContact'->>'consentPublic')::boolean, false),
    'submitted',
    now(),
    now()
  );

  -- Step 12: Insert Parties into public.complaint_parties
  IF p_payload->'mentionedParties' IS NOT NULL AND
      jsonb_typeof(p_payload->'mentionedParties') = 'array' AND
      jsonb_array_length(p_payload->'mentionedParties') > 0 THEN
    FOR v_party IN SELECT * FROM jsonb_array_elements(p_payload->'mentionedParties')
    LOOP
      IF v_party->>'name' IS NOT NULL AND trim(v_party->>'name') <> '' THEN
        v_party_type := trim(coalesce(v_party->>'type', 'unknown'));
        IF v_party_type NOT IN ('individual', 'business', 'group', 'organization', 'unknown') THEN
          v_party_type := 'unknown';
        END IF;

        INSERT INTO public.complaint_parties (
          complaint_id,
          name,
          party_type,
          role_or_designation,
          organization,
          phone_or_contact,
          public_profile_handle,
          address,
          identifying_description,
          created_at
        ) VALUES (
          v_report_id,
          trim(v_party->>'name'),
          v_party_type,
          nullif(trim(coalesce(v_party->>'roleOrDesignation', '')), ''),
          nullif(trim(coalesce(v_party->>'organization', '')), ''),
          nullif(trim(coalesce(v_party->>'phoneOrContact', '')), ''),
          nullif(trim(coalesce(v_party->>'publicProfileHandle', '')), ''),
          nullif(trim(coalesce(v_party->>'address', '')), ''),
          nullif(trim(coalesce(v_party->>'identifyingDescription', '')), ''),
          now()
        );
      END IF;
    END LOOP;
  ELSIF p_payload->>'reportedSubject' IS NOT NULL AND trim(p_payload->>'reportedSubject') <> '' THEN
    v_party_type := trim(coalesce(p_payload->>'subjectType', 'unknown'));
    IF v_party_type NOT IN ('individual', 'business', 'group', 'organization', 'unknown') THEN
      v_party_type := 'unknown';
    END IF;

    INSERT INTO public.complaint_parties (
      complaint_id,
      name,
      party_type,
      role_or_designation,
      organization,
      phone_or_contact,
      public_profile_handle,
      address,
      identifying_description,
      created_at
    ) VALUES (
      v_report_id,
      trim(p_payload->>'reportedSubject'),
      v_party_type,
      nullif(trim(coalesce(p_payload->>'roleOrDesignation', '')), ''),
      nullif(trim(coalesce(p_payload->>'organization', '')), ''),
      nullif(trim(coalesce(p_payload->>'phoneOrContact', '')), ''),
      nullif(trim(coalesce(p_payload->>'publicProfileHandle', '')), ''),
      nullif(trim(coalesce(p_payload->>'address', '')), ''),
      nullif(trim(coalesce(p_payload->>'identifyingDescription', '')), ''),
      now()
    );
  END IF;

  -- Step 13: Insert Initial Complaint Update Event (is_public = false)
  INSERT INTO public.complaint_updates (
    complaint_id,
    update_type,
    note,
    is_public,
    created_at
  ) VALUES (
    v_report_id,
    'submitted',
    'Report received and queued for moderation review.',
    false,
    now()
  );

  -- Step 14: Emit Notification: complaint.submitted (fail-safe for public submission)
  BEGIN
    PERFORM public.admin_emit_notification(
      p_event_key := 'complaint.submitted',
      p_title_en := 'New complaint submitted: ' || v_report_id,
      p_title_bn := 'নতুন অভিযোগ জমা দেওয়া হয়েছে: ' || v_report_id,
      p_body_en := 'A new complaint has been submitted under ' || COALESCE(v_segment, 'general') || '.',
      p_body_bn := 'নতুন একটি অভিযোগ জমা দেওয়া হয়েছে (' || COALESCE(v_segment, 'সাধারণ') || ' বিভাগে)।',
      p_actor_user_id := NULL,
      p_target_type := 'complaint',
      p_target_id := v_report_id,
      p_target_label := COALESCE(v_title, v_report_id),
      p_metadata := jsonb_build_object(
        'complaint_id', v_report_id,
        'segment_id', v_segment,
        'subcategory_id', v_subcat_id,
        'division', v_division,
        'district', v_district,
        'submission_time', now()
      ),
      p_required_all_permissions := ARRAY['complaints.view'],
      p_required_any_permissions := '{}'::text[],
      p_audience_mode := 'permission',
      p_route := '/complaints/' || v_report_id,
      p_dedupe_key := 'complaint.submitted:' || v_report_id,
      p_exclude_actor := false,
      p_include_super_admin := true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'admin_emit_notification failed for complaint.submitted (%): %', v_report_id, SQLERRM;
  END;

  -- Step 15: Return Standardized Client Response Payload
  RETURN jsonb_build_object(
    'success', true,
    'reportId', v_report_id,
    'message', 'Report submitted successfully.',
    'report', jsonb_build_object(
      'id', v_report_id,
      'segment', v_segment,
      'subcategoryId', v_subcat_id,
      'title', v_title,
      'status', 'submitted',
      'createdAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_complaint(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_complaint(jsonb, text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. PRODUCER FOR EVENT 2: complaint.evidence_attached
-- Canonical public evidence registration RPC with strict validation and notification emission.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_public_complaint_evidence(
    p_client_submission_id TEXT,
    p_storage_path TEXT,
    p_file_name TEXT,
    p_file_size_bytes BIGINT,
    p_caption TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public, pg_temp
AS $$
DECLARE
    v_complaint_id TEXT;
    v_existing_id UUID;
    v_evidence_id UUID;
    v_mime TEXT;
    v_media_type TEXT;
    v_lower_name TEXT;
BEGIN
    -- 1. Parameter Validation
    IF p_client_submission_id IS NULL OR length(trim(p_client_submission_id)) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: Client submission identifier is required.' USING ERRCODE = '22000';
    END IF;

    IF p_storage_path IS NULL OR length(trim(p_storage_path)) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: Storage path is required.' USING ERRCODE = '22000';
    END IF;

    IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: File name is required.' USING ERRCODE = '22000';
    END IF;

    -- 2. Resolve Complaint by client_submission_id
    SELECT id INTO v_complaint_id
    FROM public.complaints
    WHERE client_submission_id = trim(p_client_submission_id);

    IF v_complaint_id IS NULL THEN
        RAISE EXCEPTION 'COMPLAINT_NOT_FOUND: No complaint found matching submission identifier %', p_client_submission_id
            USING ERRCODE = '22000';
    END IF;

    -- 3. Idempotency Check: Do not duplicate if same storage_path already registered for this complaint
    SELECT id INTO v_existing_id
    FROM public.complaint_evidence
    WHERE complaint_id = v_complaint_id
      AND storage_path = trim(p_storage_path);

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'evidence_id', v_existing_id,
            'complaint_id', v_complaint_id,
            'duplicate', true
        );
    END IF;

    -- 4. Derive Media & MIME Type
    v_lower_name := lower(trim(p_file_name));
    IF v_lower_name LIKE '%.png' THEN
        v_mime := 'image/png';
        v_media_type := 'image';
    ELSIF v_lower_name LIKE '%.jpg' OR v_lower_name LIKE '%.jpeg' THEN
        v_mime := 'image/jpeg';
        v_media_type := 'image';
    ELSIF v_lower_name LIKE '%.webp' THEN
        v_mime := 'image/webp';
        v_media_type := 'image';
    ELSIF v_lower_name LIKE '%.mp4' THEN
        v_mime := 'video/mp4';
        v_media_type := 'video';
    ELSIF v_lower_name LIKE '%.pdf' THEN
        v_mime := 'application/pdf';
        v_media_type := 'document';
    ELSE
        v_mime := 'application/octet-stream';
        v_media_type := 'attachment';
    END IF;

    -- 5. Insert Evidence Record
    INSERT INTO public.complaint_evidence (
        complaint_id,
        storage_path,
        file_name,
        mime_type,
        media_type,
        file_size_bytes,
        caption,
        created_at
    ) VALUES (
        v_complaint_id,
        trim(p_storage_path),
        trim(p_file_name),
        v_mime,
        v_media_type,
        p_file_size_bytes,
        nullif(trim(p_caption), ''),
        now()
    ) RETURNING id INTO v_evidence_id;

    -- 6. Mark complaint supporting info indicator
    UPDATE public.complaints
    SET has_supporting_info = true,
        updated_at = now()
    WHERE id = v_complaint_id;

    -- 7. Emit Notification: complaint.evidence_attached (fail-safe for public upload)
    BEGIN
        PERFORM public.admin_emit_notification(
            p_event_key := 'complaint.evidence_attached',
            p_title_en := 'Evidence attached to complaint: ' || v_complaint_id,
            p_title_bn := 'অভিযোগে প্রমাণ সংযুক্ত করা হয়েছে: ' || v_complaint_id,
            p_body_en := 'New evidence attached: ' || trim(p_file_name),
            p_body_bn := 'অভিযোগে নতুন প্রমাণ যুক্ত করা হয়েছে: ' || trim(p_file_name),
            p_actor_user_id := NULL,
            p_target_type := 'complaint',
            p_target_id := v_complaint_id,
            p_target_label := trim(p_file_name),
            p_metadata := jsonb_build_object(
                'complaint_id', v_complaint_id,
                'evidence_id', v_evidence_id,
                'evidence_type', v_media_type,
                'storage_path', trim(p_storage_path),
                'file_name', trim(p_file_name),
                'file_size_bytes', p_file_size_bytes,
                'created_at', now()
            ),
            p_required_all_permissions := ARRAY['complaints.view', 'complaints.evidence_view'],
            p_required_any_permissions := '{}'::text[],
            p_audience_mode := 'permission',
            p_route := '/complaints/' || v_complaint_id,
            p_dedupe_key := 'complaint.evidence_attached:' || v_evidence_id::text,
            p_exclude_actor := false,
            p_include_super_admin := true
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'admin_emit_notification failed for complaint.evidence_attached (%): %', v_evidence_id, SQLERRM;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'evidence_id', v_evidence_id,
        'complaint_id', v_complaint_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_public_complaint_evidence(TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_public_complaint_evidence(TEXT, TEXT, TEXT, BIGINT, TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. PRODUCERS FOR EVENTS 3, 4, 5: Moderation Workflow
-- admin_publish_complaint   -> complaint.published
-- admin_unpublish_complaint -> complaint.unpublished
-- admin_reject_complaint    -> complaint.rejected
-- ------------------------------------------------------------------------------

-- 4.1 admin_publish_complaint
CREATE OR REPLACE FUNCTION public.admin_publish_complaint(p_complaint_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_complaint record;
    v_audit_id uuid;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('complaints.publish') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to publish complaints.' USING ERRCODE = '42501';
    END IF;

    SELECT id, status INTO v_complaint
    FROM public.complaints
    WHERE id = p_complaint_id
    FOR UPDATE;

    IF v_complaint.id IS NULL THEN
        RAISE EXCEPTION 'Complaint with ID % not found', p_complaint_id USING ERRCODE = 'P0002';
    END IF;

    IF v_complaint.status IS NULL OR v_complaint.status NOT IN ('submitted', 'unpublished') THEN
        RAISE EXCEPTION 'Cannot publish complaint with status "%". Only "submitted" or "unpublished" complaints can be published.', COALESCE(v_complaint.status, 'null')
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.complaints
    SET 
        status = 'published',
        published_at = COALESCE(published_at, now()),
        updated_at = now()
    WHERE id = v_complaint.id;

    INSERT INTO public.complaint_updates (
        complaint_id, update_type, note, is_public, created_at
    ) VALUES (
        v_complaint.id, 'published', 'Complaint approved and published to public feed.', true, now()
    );

    INSERT INTO public.admin_audit_logs (
        actor_id, action, target_type, target_id, details
    ) VALUES (
        auth.uid(), 'complaint.publish', 'complaint', p_complaint_id,
        jsonb_build_object('previous_status', v_complaint.status, 'new_status', 'published', 'timestamp', now())
    )
    RETURNING id INTO v_audit_id;

    -- Emit Notification: complaint.published
    PERFORM public.admin_emit_notification(
        p_event_key := 'complaint.published',
        p_title_en := 'Complaint published: ' || p_complaint_id,
        p_title_bn := 'অভিযোগ প্রকাশ করা হয়েছে: ' || p_complaint_id,
        p_body_en := 'Complaint ' || p_complaint_id || ' was approved and published to the public feed.',
        p_body_bn := 'অভিযোগ ' || p_complaint_id || ' অনুমোদন করে পাবলিক ফিডে প্রকাশ করা হয়েছে।',
        p_actor_user_id := auth.uid(),
        p_target_type := 'complaint',
        p_target_id := p_complaint_id,
        p_target_label := p_complaint_id,
        p_metadata := jsonb_build_object(
            'complaint_id', p_complaint_id,
            'previous_status', v_complaint.status,
            'new_status', 'published',
            'actor_user_id', auth.uid(),
            'timestamp', now()
        ),
        p_required_all_permissions := ARRAY['complaints.view'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/complaints/' || p_complaint_id,
        p_dedupe_key := 'complaint.published:oversight:' || v_audit_id::text,
        p_exclude_actor := true,
        p_include_super_admin := true
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', p_complaint_id,
        'status', 'published',
        'previous_status', v_complaint.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_publish_complaint(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_complaint(text) TO authenticated, service_role;

-- 4.2 admin_unpublish_complaint
CREATE OR REPLACE FUNCTION public.admin_unpublish_complaint(p_complaint_id text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_complaint record;
    v_note_text text;
    v_audit_id uuid;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('complaints.unpublish') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to unpublish complaints.' USING ERRCODE = '42501';
    END IF;

    SELECT id, status INTO v_complaint
    FROM public.complaints
    WHERE id = p_complaint_id
    FOR UPDATE;

    IF v_complaint.id IS NULL THEN
        RAISE EXCEPTION 'Complaint with ID % not found', p_complaint_id USING ERRCODE = 'P0002';
    END IF;

    IF v_complaint.status IS NULL OR v_complaint.status <> 'published' THEN
        RAISE EXCEPTION 'Cannot unpublish complaint with status "%". Only "published" complaints can be unpublished.', COALESCE(v_complaint.status, 'null')
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.complaints
    SET status = 'unpublished', updated_at = now()
    WHERE id = v_complaint.id;

    v_note_text := COALESCE(NULLIF(TRIM(p_reason), ''), 'Complaint unpublished from public feed.');

    INSERT INTO public.complaint_updates (
        complaint_id, update_type, note, is_public, created_at
    ) VALUES (
        v_complaint.id, 'unpublished', v_note_text, false, now()
    );

    INSERT INTO public.admin_audit_logs (
        actor_id, action, target_type, target_id, details
    ) VALUES (
        auth.uid(), 'complaint.unpublish', 'complaint', p_complaint_id,
        jsonb_build_object('previous_status', v_complaint.status, 'new_status', 'unpublished', 'reason', p_reason, 'timestamp', now())
    )
    RETURNING id INTO v_audit_id;

    -- Emit Notification: complaint.unpublished
    PERFORM public.admin_emit_notification(
        p_event_key := 'complaint.unpublished',
        p_title_en := 'Complaint unpublished: ' || p_complaint_id,
        p_title_bn := 'অভিযোগ অপ্রকাশিত করা হয়েছে: ' || p_complaint_id,
        p_body_en := 'Complaint ' || p_complaint_id || ' was removed from public feed.' || CASE WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0 THEN ' Reason: ' || trim(p_reason) ELSE '' END,
        p_body_bn := 'অভিযোগ ' || p_complaint_id || ' পাবলিক ফিড থেকে প্রত্যাহার করা হয়েছে।' || CASE WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0 THEN ' কারণ: ' || trim(p_reason) ELSE '' END,
        p_actor_user_id := auth.uid(),
        p_target_type := 'complaint',
        p_target_id := p_complaint_id,
        p_target_label := p_complaint_id,
        p_metadata := jsonb_build_object(
            'complaint_id', p_complaint_id,
            'previous_status', v_complaint.status,
            'new_status', 'unpublished',
            'reason', p_reason,
            'actor_user_id', auth.uid(),
            'timestamp', now()
        ),
        p_required_all_permissions := ARRAY['complaints.view'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/complaints/' || p_complaint_id,
        p_dedupe_key := 'complaint.unpublished:oversight:' || v_audit_id::text,
        p_exclude_actor := true,
        p_include_super_admin := true
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', p_complaint_id,
        'status', 'unpublished',
        'previous_status', v_complaint.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unpublish_complaint(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unpublish_complaint(text, text) TO authenticated, service_role;

-- 4.3 admin_reject_complaint
CREATE OR REPLACE FUNCTION public.admin_reject_complaint(p_complaint_id text, p_reason_code text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_complaint record;
    v_note_text text;
    v_audit_id uuid;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('complaints.reject') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to reject complaints.' USING ERRCODE = '42501';
    END IF;

    IF p_reason_code IS NULL OR length(trim(p_reason_code)) = 0 THEN
        RAISE EXCEPTION 'Rejection reason code is required' USING ERRCODE = '22000';
    END IF;

    SELECT id, status INTO v_complaint
    FROM public.complaints
    WHERE id = p_complaint_id
    FOR UPDATE;

    IF v_complaint.id IS NULL THEN
        RAISE EXCEPTION 'Complaint with ID % not found', p_complaint_id USING ERRCODE = 'P0002';
    END IF;

    IF v_complaint.status IS NULL OR v_complaint.status <> 'submitted' THEN
        RAISE EXCEPTION 'Cannot reject complaint with status "%". Only "submitted" complaints can be rejected.', COALESCE(v_complaint.status, 'null')
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.complaints
    SET status = 'rejected', updated_at = now()
    WHERE id = v_complaint.id;

    v_note_text := COALESCE(NULLIF(TRIM(p_note), ''), NULLIF(TRIM(p_reason_code), ''), 'Rejected by administrator');

    INSERT INTO public.complaint_updates (
        complaint_id, update_type, note, is_public, created_at
    ) VALUES (
        v_complaint.id, 'rejected', v_note_text, false, now()
    );

    INSERT INTO public.admin_audit_logs (
        actor_id, action, target_type, target_id, details
    ) VALUES (
        auth.uid(), 'complaint.reject', 'complaint', p_complaint_id,
        jsonb_build_object('previous_status', v_complaint.status, 'new_status', 'rejected', 'reason_code', p_reason_code, 'note', p_note, 'timestamp', now())
    )
    RETURNING id INTO v_audit_id;

    -- Emit Notification: complaint.rejected
    PERFORM public.admin_emit_notification(
        p_event_key := 'complaint.rejected',
        p_title_en := 'Complaint rejected: ' || p_complaint_id,
        p_title_bn := 'অভিযোগ প্রত্যাখ্যান করা হয়েছে: ' || p_complaint_id,
        p_body_en := 'Complaint ' || p_complaint_id || ' was rejected. Reason: ' || p_reason_code,
        p_body_bn := 'অভিযোগ ' || p_complaint_id || ' প্রত্যাখ্যান করা হয়েছে। কারণ: ' || p_reason_code,
        p_actor_user_id := auth.uid(),
        p_target_type := 'complaint',
        p_target_id := p_complaint_id,
        p_target_label := p_complaint_id,
        p_metadata := jsonb_build_object(
            'complaint_id', p_complaint_id,
            'previous_status', v_complaint.status,
            'new_status', 'rejected',
            'reason_code', p_reason_code,
            'note', p_note,
            'actor_user_id', auth.uid(),
            'timestamp', now()
        ),
        p_required_all_permissions := ARRAY['complaints.view'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/complaints/' || p_complaint_id,
        p_dedupe_key := 'complaint.rejected:oversight:' || v_audit_id::text,
        p_exclude_actor := true,
        p_include_super_admin := true
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', p_complaint_id,
        'status', 'rejected',
        'previous_status', v_complaint.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_complaint(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_complaint(text, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. PRODUCER FOR EVENT 6: admin.created
-- Updates admin_finalize_user_membership to emit Dual-Stream (Stream A oversight & Stream B personal).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_finalize_user_membership(
    p_user_id UUID,
    p_display_name TEXT DEFAULT NULL,
    p_role_id TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_display_name TEXT;
    v_clean_role_id TEXT;
    v_auth_email TEXT;
    v_created_at TIMESTAMPTZ;
    v_role_exists BOOLEAN;
    v_role_active BOOLEAN;
    v_audit_id UUID;
    v_target_label TEXT;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrator session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION 'Access denied. Permission admin_users.manage required.' USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Target user ID cannot be null.' USING ERRCODE = '22000';
    END IF;

    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user_id) THEN
        RAISE EXCEPTION 'User % is already a member of the admin team.', p_user_id USING ERRCODE = '23505';
    END IF;

    SELECT email INTO v_auth_email
    FROM auth.users
    WHERE id = p_user_id;

    IF v_auth_email IS NULL THEN
        RAISE EXCEPTION 'Target user % does not exist in authentication store.', p_user_id USING ERRCODE = 'P0002';
    END IF;

    v_clean_display_name := nullif(trim(p_display_name), '');
    IF v_clean_display_name IS NULL THEN
        v_clean_display_name := split_part(v_auth_email, '@', 1);
    END IF;

    v_clean_role_id := nullif(trim(p_role_id), '');
    IF v_clean_role_id IS NULL THEN
        v_clean_role_id := 'moderator';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.roles WHERE id = v_clean_role_id),
           COALESCE((SELECT active FROM public.roles WHERE id = v_clean_role_id), false)
    INTO v_role_exists, v_role_active;

    IF NOT v_role_exists THEN
        RAISE EXCEPTION 'Role % does not exist.', v_clean_role_id USING ERRCODE = '22000';
    END IF;

    IF NOT v_role_active THEN
        RAISE EXCEPTION 'Cannot assign inactive role %.', v_clean_role_id USING ERRCODE = '22000';
    END IF;

    -- DELEGATION CEILING GUARD
    IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot assign a role with permissions exceeding your own authority.'
            USING ERRCODE = '42501';
    END IF;

    v_created_at := clock_timestamp();

    INSERT INTO public.admin_users (
        user_id,
        display_name,
        is_super_admin,
        active,
        created_at,
        updated_at
    )
    VALUES (
        p_user_id,
        v_clean_display_name,
        false,
        COALESCE(p_active, TRUE),
        v_created_at,
        v_created_at
    );

    INSERT INTO public.user_roles (
        user_id,
        role_id,
        created_at
    )
    VALUES (
        p_user_id,
        v_clean_role_id,
        v_created_at
    );

    v_audit_id := public.log_role_audit_event(
        'USER_MEMBERSHIP_FINALIZED',
        v_clean_role_id,
        jsonb_build_object(
            'target_user_id', p_user_id,
            'email', v_auth_email,
            'role_id', v_clean_role_id,
            'active', COALESCE(p_active, TRUE)
        )
    );

    v_target_label := COALESCE(v_clean_display_name, v_auth_email);

    -- Stream A: Administrative Oversight
    PERFORM public.admin_emit_notification(
        p_event_key := 'admin.created',
        p_title_en := 'New administrator created: ' || v_target_label,
        p_title_bn := 'নতুন প্রশাসক তৈরি করা হয়েছে: ' || v_target_label,
        p_body_en := 'New administrator account created for ' || v_target_label || ' with role ' || v_clean_role_id || '.',
        p_body_bn := 'নতুন প্রশাসক অ্যাকাউন্ট তৈরি করা হয়েছে (' || v_target_label || ', ভূমিকা: ' || v_clean_role_id || ')।',
        p_actor_user_id := auth.uid(),
        p_target_type := 'admin_user',
        p_target_id := p_user_id::text,
        p_target_label := v_target_label,
        p_metadata := jsonb_build_object(
            'target_user_id', p_user_id,
            'email', v_auth_email,
            'display_name', v_clean_display_name,
            'role_id', v_clean_role_id,
            'active', COALESCE(p_active, TRUE),
            'actor_user_id', auth.uid(),
            'timestamp', now()
        ),
        p_required_all_permissions := '{}'::text[],
        p_required_any_permissions := ARRAY['admin_users.view', 'admin_users.manage'],
        p_audience_mode := 'permission',
        p_route := '/users',
        p_dedupe_key := 'admin.created:oversight:' || v_audit_id::text,
        p_exclude_actor := true,
        p_include_super_admin := true
    );

    -- Stream B: Personal Recipient (only if resulting user is active)
    IF COALESCE(p_active, TRUE) IS TRUE THEN
        PERFORM public.admin_emit_notification(
            p_event_key := 'admin.created',
            p_title_en := 'Welcome to Sobaike Janao Admin',
            p_title_bn := 'সবাইকে জানাও অ্যাডমিনে স্বাগতম',
            p_body_en := 'Your administrator account has been set up with the ' || v_clean_role_id || ' role.',
            p_body_bn := 'আপনার প্রশাসক অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে (' || v_clean_role_id || ' ভূমিকা সহ)।',
            p_actor_user_id := auth.uid(),
            p_target_type := 'admin_user',
            p_target_id := p_user_id::text,
            p_target_label := v_target_label,
            p_metadata := jsonb_build_object(
                'user_id', p_user_id,
                'email', v_auth_email,
                'role_id', v_clean_role_id,
                'active', COALESCE(p_active, TRUE),
                'timestamp', now()
            ),
            p_required_all_permissions := '{}'::text[],
            p_required_any_permissions := '{}'::text[],
            p_audience_mode := 'personal',
            p_personal_recipient_id := p_user_id,
            p_route := '/dashboard',
            p_dedupe_key := 'admin.created:personal:' || p_user_id::text,
            p_exclude_actor := false,
            p_include_super_admin := true
        );
    END IF;

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'display_name', v_clean_display_name,
        'email', v_auth_email,
        'role_id', v_clean_role_id,
        'active', COALESCE(p_active, TRUE),
        'created_at', v_created_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_finalize_user_membership(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finalize_user_membership(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. PRODUCER FOR EVENTS 7, 8, 9: admin.activated, admin.deactivated, admin.role_changed
-- Updates admin_update_user to emit Dual-Stream events when active status or role changes.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_user_id UUID,
    p_display_name TEXT DEFAULT NULL,
    p_role_id TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_display_name TEXT;
    v_clean_role_id TEXT;
    v_existing_admin RECORD;
    v_existing_role_id TEXT;
    v_target_email TEXT;
    v_target_label TEXT;
    v_updated_at TIMESTAMPTZ;
    v_active_changed BOOLEAN := false;
    v_role_changed BOOLEAN := false;
    v_audit_id UUID;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrator session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION 'Access denied. Permission admin_users.manage required.' USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Target user ID cannot be null.' USING ERRCODE = '22000';
    END IF;

    SELECT user_id, display_name, is_super_admin, active
    INTO v_existing_admin
    FROM public.admin_users
    WHERE user_id = p_user_id;

    IF v_existing_admin.user_id IS NULL THEN
        RAISE EXCEPTION 'Target user % not found in admin_users store.', p_user_id USING ERRCODE = 'P0002';
    END IF;

    -- TARGET CEILING GUARD: Caller cannot mutate a target whose permissions exceed caller's ceiling
    IF NOT public.can_manage_user_target(p_user_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot modify an administrator whose permissions or roles exceed your own authority.'
            USING ERRCODE = '42501';
    END IF;

    SELECT role_id INTO v_existing_role_id
    FROM public.user_roles
    WHERE user_id = p_user_id;

    SELECT email INTO v_target_email
    FROM auth.users
    WHERE id = p_user_id;

    v_clean_display_name := nullif(trim(p_display_name), '');
    v_clean_role_id := nullif(trim(p_role_id), '');

    -- Track changes
    IF p_active IS NOT NULL AND p_active <> v_existing_admin.active THEN
        v_active_changed := true;
    END IF;

    IF v_clean_role_id IS NOT NULL AND v_clean_role_id <> v_existing_role_id THEN
        v_role_changed := true;
    END IF;

    -- Role Scope Ceiling Check if changing role
    IF v_role_changed THEN
        IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = v_clean_role_id AND active = true) THEN
            RAISE EXCEPTION 'Target role % is invalid or inactive.', v_clean_role_id USING ERRCODE = '22000';
        END IF;

        IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
            RAISE EXCEPTION 'Access denied. You cannot assign a role with permissions exceeding your own authority.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- LAST-MANAGER MUTATION GUARD:
    -- If deactivating or changing role of a manager, ensure at least one manager remains active.
    IF (v_active_changed AND p_active IS FALSE) OR v_role_changed THEN
        IF public.has_role_permission(v_existing_role_id, 'roles.manage') THEN
            IF public.count_effective_role_managers() <= 1 AND v_existing_admin.active = true THEN
                RAISE EXCEPTION 'Cannot modify this administrator because doing so would leave zero active administrators capable of managing roles.'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;

    v_updated_at := clock_timestamp();

    -- Update admin_users
    UPDATE public.admin_users
    SET display_name = COALESCE(v_clean_display_name, display_name),
        active = COALESCE(p_active, active),
        updated_at = v_updated_at
    WHERE user_id = p_user_id;

    -- Update user_roles if changed
    IF v_role_changed THEN
        IF v_existing_role_id IS NOT NULL THEN
            UPDATE public.user_roles
            SET role_id = v_clean_role_id,
                created_at = v_updated_at
            WHERE user_id = p_user_id;
        ELSE
            INSERT INTO public.user_roles (user_id, role_id, created_at)
            VALUES (p_user_id, v_clean_role_id, v_updated_at);
        END IF;
    END IF;

    -- Verification check for last manager
    IF public.count_effective_role_managers() = 0 THEN
        RAISE EXCEPTION 'Mutation rejected: operation would leave zero active administrators capable of managing roles.'
            USING ERRCODE = '23514';
    END IF;

    -- Audit log
    v_audit_id := public.log_role_audit_event(
        'ADMIN_USER_UPDATED',
        COALESCE(v_clean_role_id, v_existing_role_id, 'none'),
        jsonb_build_object(
            'target_user_id', p_user_id,
            'active', COALESCE(p_active, v_existing_admin.active),
            'role_id', COALESCE(v_clean_role_id, v_existing_role_id),
            'previous_role_id', v_existing_role_id,
            'display_name', COALESCE(v_clean_display_name, v_existing_admin.display_name),
            'active_changed', v_active_changed,
            'role_changed', v_role_changed
        )
    );

    v_target_label := COALESCE(v_clean_display_name, v_existing_admin.display_name, v_target_email, p_user_id::text);

    -- --------------------------------------------------------------------------
    -- Emit Events 7 & 8: admin.activated / admin.deactivated
    -- --------------------------------------------------------------------------
    IF v_active_changed THEN
        IF p_active IS TRUE THEN
            -- Stream A: Oversight
            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.activated',
                p_title_en := 'Administrator activated: ' || v_target_label,
                p_title_bn := 'প্রশাসক সক্রিয় করা হয়েছে: ' || v_target_label,
                p_body_en := 'Administrator ' || v_target_label || ' has been activated.',
                p_body_bn := 'প্রশাসক ' || v_target_label || '-কে সক্রিয় করা হয়েছে।',
                p_actor_user_id := auth.uid(),
                p_target_type := 'admin_user',
                p_target_id := p_user_id::text,
                p_target_label := v_target_label,
                p_metadata := jsonb_build_object(
                    'target_user_id', p_user_id,
                    'display_name', v_clean_display_name,
                    'active', true,
                    'previous_active', false,
                    'actor_user_id', auth.uid(),
                    'timestamp', now()
                ),
                p_required_all_permissions := '{}'::text[],
                p_required_any_permissions := ARRAY['admin_users.view', 'admin_users.manage'],
                p_audience_mode := 'permission',
                p_route := '/users',
                p_dedupe_key := 'admin.activated:oversight:' || v_audit_id::text,
                p_exclude_actor := true,
                p_include_super_admin := true
            );

            -- Stream B: Personal
            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.activated',
                p_title_en := 'Your administrator account has been activated',
                p_title_bn := 'আপনার প্রশাসক অ্যাকাউন্ট সক্রিয় করা হয়েছে',
                p_body_en := 'Your administrative account access has been restored.',
                p_body_bn := 'আপনার প্রশাসক অ্যাকাউন্ট অ্যাক্সেস পুনরায় চালু করা হয়েছে।',
                p_actor_user_id := auth.uid(),
                p_target_type := 'admin_user',
                p_target_id := p_user_id::text,
                p_target_label := v_target_label,
                p_metadata := jsonb_build_object(
                    'target_user_id', p_user_id,
                    'active', true,
                    'timestamp', now()
                ),
                p_required_all_permissions := '{}'::text[],
                p_required_any_permissions := '{}'::text[],
                p_audience_mode := 'personal',
                p_personal_recipient_id := p_user_id,
                p_route := '/dashboard',
                p_dedupe_key := 'admin.activated:personal:' || v_audit_id::text,
                p_exclude_actor := false,
                p_include_super_admin := true
            );
        ELSE
            -- Stream A: Oversight (Personal admin.deactivated is intentionally excluded)
            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.deactivated',
                p_title_en := 'Administrator deactivated: ' || v_target_label,
                p_title_bn := 'প্রশাসক নিষ্ক্রিয় করা হয়েছে: ' || v_target_label,
                p_body_en := 'Administrator ' || v_target_label || ' has been deactivated.',
                p_body_bn := 'প্রশাসক ' || v_target_label || '-কে নিষ্ক্রিয় করা হয়েছে।',
                p_actor_user_id := auth.uid(),
                p_target_type := 'admin_user',
                p_target_id := p_user_id::text,
                p_target_label := v_target_label,
                p_metadata := jsonb_build_object(
                    'target_user_id', p_user_id,
                    'display_name', v_clean_display_name,
                    'active', false,
                    'previous_active', true,
                    'actor_user_id', auth.uid(),
                    'timestamp', now()
                ),
                p_required_all_permissions := '{}'::text[],
                p_required_any_permissions := ARRAY['admin_users.view', 'admin_users.manage'],
                p_audience_mode := 'permission',
                p_route := '/users',
                p_dedupe_key := 'admin.deactivated:oversight:' || v_audit_id::text,
                p_exclude_actor := true,
                p_include_super_admin := true
            );
        END IF;
    END IF;

    -- --------------------------------------------------------------------------
    -- Emit Event 9: admin.role_changed
    -- --------------------------------------------------------------------------
    IF v_role_changed THEN
        -- Stream A: Oversight
        PERFORM public.admin_emit_notification(
            p_event_key := 'admin.role_changed',
            p_title_en := 'Administrator role changed: ' || v_target_label,
            p_title_bn := 'প্রশাসকের ভূমিকা পরিবর্তন করা হয়েছে: ' || v_target_label,
            p_body_en := 'Role for ' || v_target_label || ' was changed from ' || COALESCE(v_existing_role_id, 'none') || ' to ' || v_clean_role_id || '.',
            p_body_bn := 'প্রশাসক ' || v_target_label || '-এর ভূমিকা ' || COALESCE(v_existing_role_id, 'নেই') || ' থেকে ' || v_clean_role_id || '-এ পরিবর্তন করা হয়েছে।',
            p_actor_user_id := auth.uid(),
            p_target_type := 'admin_user',
            p_target_id := p_user_id::text,
            p_target_label := v_target_label,
            p_metadata := jsonb_build_object(
                'target_user_id', p_user_id,
                'previous_role_id', v_existing_role_id,
                'new_role_id', v_clean_role_id,
                'actor_user_id', auth.uid(),
                'timestamp', now()
            ),
            p_required_all_permissions := '{}'::text[],
            p_required_any_permissions := ARRAY['admin_users.view', 'admin_users.manage'],
            p_audience_mode := 'permission',
            p_route := '/users',
            p_dedupe_key := 'admin.role_changed:oversight:' || v_audit_id::text,
            p_exclude_actor := true,
            p_include_super_admin := true
        );

        -- Stream B: Personal (emit only when role changed AND resulting user is active)
        IF COALESCE(p_active, v_existing_admin.active) IS TRUE THEN
            PERFORM public.admin_emit_notification(
                p_event_key := 'admin.role_changed',
                p_title_en := 'Your administrator role has been updated',
                p_title_bn := 'আপনার প্রশাসকের ভূমিকা পরিবর্তন করা হয়েছে',
                p_body_en := 'Your role has been changed to ' || v_clean_role_id || '.',
                p_body_bn := 'আপনার ভূমিকা ' || v_clean_role_id || '-এ পরিবর্তন করা হয়েছে।',
                p_actor_user_id := auth.uid(),
                p_target_type := 'admin_user',
                p_target_id := p_user_id::text,
                p_target_label := v_target_label,
                p_metadata := jsonb_build_object(
                    'target_user_id', p_user_id,
                    'previous_role_id', v_existing_role_id,
                    'new_role_id', v_clean_role_id,
                    'actor_user_id', auth.uid(),
                    'timestamp', now()
                ),
                p_required_all_permissions := '{}'::text[],
                p_required_any_permissions := '{}'::text[],
                p_audience_mode := 'personal',
                p_personal_recipient_id := p_user_id,
                p_route := '/dashboard',
                p_dedupe_key := 'admin.role_changed:personal:' || v_audit_id::text,
                p_exclude_actor := false,
                p_include_super_admin := true
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'display_name', COALESCE(v_clean_display_name, v_existing_admin.display_name),
        'role_id', COALESCE(v_clean_role_id, v_existing_role_id),
        'active', COALESCE(p_active, v_existing_admin.active),
        'updated_at', v_updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. PRODUCER FOR EVENT 10: role.created
-- Updates admin_create_role to emit role.created on success.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_role(
    p_name_en TEXT,
    p_name_bn TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT TRUE,
    p_permission_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_name_en TEXT;
    v_clean_name_bn TEXT;
    v_clean_desc TEXT;
    v_slug TEXT;
    v_invalid_perms TEXT[];
    v_deduped_perms TEXT[];
    v_perm_id TEXT;
    v_created_at TIMESTAMPTZ;
    v_audit_id UUID;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrator session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('roles.manage') THEN
        RAISE EXCEPTION 'Access denied. Permission roles.manage required.' USING ERRCODE = '42501';
    END IF;

    v_clean_name_en := trim(p_name_en);
    IF v_clean_name_en IS NULL OR length(v_clean_name_en) = 0 THEN
        RAISE EXCEPTION 'English role name cannot be empty.' USING ERRCODE = '22000';
    END IF;

    v_clean_name_bn := nullif(trim(p_name_bn), '');
    v_clean_desc := nullif(trim(p_description), '');

    -- Generate ASCII slug
    v_slug := public.generate_role_slug(v_clean_name_en);
    IF v_slug IS NULL OR v_slug = '' THEN
        RAISE EXCEPTION 'English role name must contain valid alphanumeric characters to create a technical role ID.'
            USING ERRCODE = '22000';
    END IF;

    IF EXISTS (SELECT 1 FROM public.roles WHERE id = v_slug) THEN
        RAISE EXCEPTION 'A role with this ID or English name already exists.' USING ERRCODE = '23505';
    END IF;

    -- Validate permissions
    IF p_permission_ids IS NOT NULL AND cardinality(p_permission_ids) > 0 THEN
        SELECT ARRAY(
            SELECT unnest(p_permission_ids)
            EXCEPT
            SELECT id FROM public.permissions
        ) INTO v_invalid_perms;

        IF cardinality(v_invalid_perms) > 0 THEN
            RAISE EXCEPTION 'Invalid permission ID(s) provided: %', array_to_string(v_invalid_perms, ', ')
                USING ERRCODE = '22000';
        END IF;

        SELECT ARRAY(
            SELECT DISTINCT unnest(p_permission_ids)
        ) INTO v_deduped_perms;
    ELSE
        v_deduped_perms := ARRAY[]::TEXT[];
    END IF;

    -- DELEGATION CEILING GUARD: Caller cannot grant permissions they do not hold
    IF NOT public.can_delegate_permission_set(v_deduped_perms) THEN
        RAISE EXCEPTION 'Access denied. You cannot grant permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    v_created_at := clock_timestamp();

    INSERT INTO public.roles (
        id, name_en, name_bn, description, active, is_system, created_at, updated_at
    )
    VALUES (
        v_slug, v_clean_name_en, v_clean_name_bn, v_clean_desc, COALESCE(p_active, TRUE), false, v_created_at, v_created_at
    );

    IF cardinality(v_deduped_perms) > 0 THEN
        FOREACH v_perm_id IN ARRAY v_deduped_perms
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, created_at)
            VALUES (v_slug, v_perm_id, v_created_at);
        END LOOP;
    END IF;

    v_audit_id := public.log_role_audit_event(
        'ROLE_CREATED',
        v_slug,
        jsonb_build_object(
            'role_id', v_slug,
            'name_en', v_clean_name_en,
            'name_bn', v_clean_name_bn,
            'permission_count', cardinality(v_deduped_perms)
        )
    );

    -- Emit Notification: role.created
    PERFORM public.admin_emit_notification(
        p_event_key := 'role.created',
        p_title_en := 'New role created: ' || v_clean_name_en,
        p_title_bn := 'নতুন ভূমিকা তৈরি করা হয়েছে: ' || COALESCE(v_clean_name_bn, v_clean_name_en),
        p_body_en := 'New administrative role ' || v_clean_name_en || ' created with ' || cardinality(v_deduped_perms)::text || ' permissions.',
        p_body_bn := 'নতুন ভূমিকা ' || COALESCE(v_clean_name_bn, v_clean_name_en) || ' তৈরি করা হয়েছে (' || cardinality(v_deduped_perms)::text || 'টি অনুমতি সহ)।',
        p_actor_user_id := auth.uid(),
        p_target_type := 'role',
        p_target_id := v_slug,
        p_target_label := v_clean_name_en,
        p_metadata := jsonb_build_object(
            'role_id', v_slug,
            'name_en', v_clean_name_en,
            'name_bn', v_clean_name_bn,
            'permission_count', cardinality(v_deduped_perms),
            'actor_user_id', auth.uid(),
            'timestamp', now()
        ),
        p_required_all_permissions := ARRAY['roles.manage'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/roles/' || v_slug,
        p_dedupe_key := 'role.created:oversight:' || v_audit_id::text,
        p_exclude_actor := true,
        p_include_super_admin := true
    );

    RETURN jsonb_build_object(
        'id', v_slug,
        'name_en', v_clean_name_en,
        'name_bn', v_clean_name_bn,
        'description', v_clean_desc,
        'active', COALESCE(p_active, TRUE),
        'is_system', false,
        'permission_ids', to_jsonb(v_deduped_perms),
        'created_at', v_created_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_role(TEXT, TEXT, BOOLEAN, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_role(TEXT, TEXT, BOOLEAN, TEXT[], TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. PRODUCERS FOR EVENTS 11 & 12: role.updated & role.permissions_changed
-- Updates admin_update_role to emit role.updated (on metadata change) and/or
-- role.permissions_changed (on permission set change).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_role(
    p_role_id TEXT,
    p_name_en TEXT DEFAULT NULL,
    p_name_bn TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT NULL,
    p_permission_ids TEXT[] DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_id TEXT;
    v_clean_name_en TEXT;
    v_clean_name_bn TEXT;
    v_clean_desc TEXT;
    v_existing_role RECORD;
    v_existing_perms TEXT[];
    v_invalid_perms TEXT[];
    v_deduped_perms TEXT[];
    v_added_perms TEXT[] := '{}';
    v_removed_perms TEXT[] := '{}';
    v_perm_id TEXT;
    v_updated_at TIMESTAMPTZ;
    v_updated_role RECORD;
    v_meta_changed BOOLEAN := false;
    v_perms_changed BOOLEAN := false;
    v_audit_id UUID;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrator session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('roles.manage') THEN
        RAISE EXCEPTION 'Access denied. Permission roles.manage required.' USING ERRCODE = '42501';
    END IF;

    v_clean_id := trim(COALESCE(p_role_id, p_slug));
    IF v_clean_id IS NULL OR length(v_clean_id) = 0 THEN
        RAISE EXCEPTION 'Role identifier cannot be empty.' USING ERRCODE = '22000';
    END IF;

    SELECT id, name_en, name_bn, description, active, is_system
    INTO v_existing_role
    FROM public.roles
    WHERE id = v_clean_id;

    IF v_existing_role.id IS NULL THEN
        RAISE EXCEPTION 'Role % not found.', v_clean_id USING ERRCODE = 'P0002';
    END IF;

    -- Fetch existing permissions
    SELECT ARRAY(
        SELECT permission_id FROM public.role_permissions WHERE role_id = v_clean_id
    ) INTO v_existing_perms;

    -- TARGET SCOPE GUARD: Caller cannot modify a role whose permissions exceed caller's ceiling
    IF NOT public.can_manage_role_scope(v_clean_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot modify a role containing permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_name_en := COALESCE(nullif(trim(p_name_en), ''), nullif(trim(p_name), ''), v_existing_role.name_en);
    v_clean_name_bn := COALESCE(nullif(trim(p_name_bn), ''), v_existing_role.name_bn);
    v_clean_desc := COALESCE(nullif(trim(p_description), ''), v_existing_role.description);

    -- Check if metadata changed
    IF v_clean_name_en <> v_existing_role.name_en OR
       (v_clean_name_bn IS DISTINCT FROM v_existing_role.name_bn) OR
       (v_clean_desc IS DISTINCT FROM v_existing_role.description) OR
       (p_active IS NOT NULL AND p_active <> v_existing_role.active) THEN
        v_meta_changed := true;
    END IF;

    -- System role guards
    IF v_existing_role.is_system IS TRUE THEN
        IF p_active IS NOT NULL AND p_active IS FALSE THEN
            RAISE EXCEPTION 'System roles cannot be deactivated.' USING ERRCODE = '42501';
        END IF;
        IF p_permission_ids IS NOT NULL THEN
            RAISE EXCEPTION 'Permissions of system roles cannot be modified.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Handle permissions change if requested
    IF p_permission_ids IS NOT NULL THEN
        IF cardinality(p_permission_ids) > 0 THEN
            SELECT ARRAY(
                SELECT unnest(p_permission_ids)
                EXCEPT
                SELECT id FROM public.permissions
            ) INTO v_invalid_perms;

            IF cardinality(v_invalid_perms) > 0 THEN
                RAISE EXCEPTION 'Invalid permission ID(s) provided: %', array_to_string(v_invalid_perms, ', ')
                    USING ERRCODE = '22000';
            END IF;

            SELECT ARRAY(
                SELECT DISTINCT unnest(p_permission_ids)
            ) INTO v_deduped_perms;
        ELSE
            v_deduped_perms := ARRAY[]::TEXT[];
        END IF;

        -- NEW PERMISSION SET CEILING GUARD
        IF NOT public.can_delegate_permission_set(v_deduped_perms) THEN
            RAISE EXCEPTION 'Access denied. You cannot grant permissions that you do not possess.'
                USING ERRCODE = '42501';
        END IF;

        -- Compute delta
        SELECT ARRAY(SELECT unnest(v_deduped_perms) EXCEPT SELECT unnest(v_existing_perms)) INTO v_added_perms;
        SELECT ARRAY(SELECT unnest(v_existing_perms) EXCEPT SELECT unnest(v_deduped_perms)) INTO v_removed_perms;

        IF cardinality(v_added_perms) > 0 OR cardinality(v_removed_perms) > 0 THEN
            v_perms_changed := true;
        END IF;
    END IF;

    v_updated_at := clock_timestamp();

    -- Update roles table
    UPDATE public.roles
    SET name_en = v_clean_name_en,
        name_bn = v_clean_name_bn,
        description = v_clean_desc,
        active = COALESCE(p_active, active),
        updated_at = v_updated_at
    WHERE id = v_clean_id;

    -- Update permissions if provided
    IF p_permission_ids IS NOT NULL AND v_perms_changed THEN
        DELETE FROM public.role_permissions WHERE role_id = v_clean_id;

        IF cardinality(v_deduped_perms) > 0 THEN
            FOREACH v_perm_id IN ARRAY v_deduped_perms
            LOOP
                INSERT INTO public.role_permissions (role_id, permission_id, created_at)
                VALUES (v_clean_id, v_perm_id, v_updated_at);
            END LOOP;
        END IF;
    END IF;

    -- RESULTING STATE LAST-MANAGER SAFETY CHECK
    IF EXISTS (SELECT 1 FROM public.user_roles) THEN
        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION 'Mutation rejected: operation would leave no active administrators capable of managing roles.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    SELECT id, name_en, name_bn, description, active, is_system, updated_at
    INTO v_updated_role
    FROM public.roles
    WHERE id = v_clean_id;

    -- Audit log
    v_audit_id := public.log_role_audit_event(
        'ROLE_UPDATED',
        v_clean_id,
        jsonb_build_object(
            'role_id', v_clean_id,
            'name_en', v_clean_name_en,
            'name_bn', v_clean_name_bn,
            'active', v_updated_role.active,
            'meta_changed', v_meta_changed,
            'perms_changed', v_perms_changed
        )
    );

    -- --------------------------------------------------------------------------
    -- Emit Event 11: role.updated (if metadata changed)
    -- --------------------------------------------------------------------------
    IF v_meta_changed THEN
        PERFORM public.admin_emit_notification(
            p_event_key := 'role.updated',
            p_title_en := 'Role updated: ' || v_clean_name_en,
            p_title_bn := 'ভূমিকার তথ্য পরিবর্তন করা হয়েছে: ' || COALESCE(v_clean_name_bn, v_clean_name_en),
            p_body_en := 'Role details for ' || v_clean_name_en || ' were updated.',
            p_body_bn := 'ভূমিকা ' || COALESCE(v_clean_name_bn, v_clean_name_en) || '-এর বিবরণ আপডেট করা হয়েছে।',
            p_actor_user_id := auth.uid(),
            p_target_type := 'role',
            p_target_id := v_clean_id,
            p_target_label := v_clean_name_en,
            p_metadata := jsonb_build_object(
                'role_id', v_clean_id,
                'name_en', v_clean_name_en,
                'name_bn', v_clean_name_bn,
                'active', v_updated_role.active,
                'previous_name_en', v_existing_role.name_en,
                'previous_name_bn', v_existing_role.name_bn,
                'previous_active', v_existing_role.active,
                'actor_user_id', auth.uid(),
                'timestamp', now()
            ),
            p_required_all_permissions := ARRAY['roles.manage'],
            p_required_any_permissions := '{}'::text[],
            p_audience_mode := 'permission',
            p_route := '/roles/' || v_clean_id,
            p_dedupe_key := 'role.updated:oversight:' || v_audit_id::text,
            p_exclude_actor := true,
            p_include_super_admin := true
        );
    END IF;

    -- --------------------------------------------------------------------------
    -- Emit Event 12: role.permissions_changed (if permissions changed)
    -- --------------------------------------------------------------------------
    IF v_perms_changed THEN
        PERFORM public.admin_emit_notification(
            p_event_key := 'role.permissions_changed',
            p_title_en := 'Role permissions updated: ' || v_clean_name_en,
            p_title_bn := 'ভূমিকার অনুমতি পরিবর্তন করা হয়েছে: ' || COALESCE(v_clean_name_bn, v_clean_name_en),
            p_body_en := 'Permissions for role ' || v_clean_name_en || ' were modified (' || cardinality(v_added_perms)::text || ' added, ' || cardinality(v_removed_perms)::text || ' removed).',
            p_body_bn := 'ভূমিকা ' || COALESCE(v_clean_name_bn, v_clean_name_en) || '-এর অনুমতি পরিবর্তন করা হয়েছে (' || cardinality(v_added_perms)::text || 'টি যোগ, ' || cardinality(v_removed_perms)::text || 'টি অপসারিত)।',
            p_actor_user_id := auth.uid(),
            p_target_type := 'role',
            p_target_id := v_clean_id,
            p_target_label := v_clean_name_en,
            p_metadata := jsonb_build_object(
                'role_id', v_clean_id,
                'added_permissions', to_jsonb(v_added_perms),
                'removed_permissions', to_jsonb(v_removed_perms),
                'new_permission_count', cardinality(v_deduped_perms),
                'actor_user_id', auth.uid(),
                'timestamp', now()
            ),
            p_required_all_permissions := ARRAY['roles.manage'],
            p_required_any_permissions := '{}'::text[],
            p_audience_mode := 'permission',
            p_route := '/roles/' || v_clean_id,
            p_dedupe_key := 'role.permissions_changed:oversight:' || v_audit_id::text,
            p_exclude_actor := true,
            p_include_super_admin := true
        );
    END IF;

    RETURN jsonb_build_object(
        'id', v_updated_role.id,
        'name_en', v_updated_role.name_en,
        'name_bn', v_updated_role.name_bn,
        'description', v_updated_role.description,
        'active', v_updated_role.active,
        'is_system', v_updated_role.is_system,
        'permission_ids', to_jsonb(COALESCE(v_deduped_perms, v_existing_perms)),
        'updated_at', v_updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_role(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[], TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_role(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[], TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. PRODUCER FOR EVENT 12: role.permissions_changed (Explicit permission replacement)
-- Updates admin_replace_role_permissions to emit role.permissions_changed on permission change.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_replace_role_permissions(
    p_role_id TEXT,
    p_permission_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_role_id TEXT;
    v_role_name_en TEXT;
    v_role_name_bn TEXT;
    v_is_system BOOLEAN;
    v_existing_perms TEXT[];
    v_invalid_perms TEXT[];
    v_deduped_perms TEXT[];
    v_added_perms TEXT[] := '{}';
    v_removed_perms TEXT[] := '{}';
    v_perm_id TEXT;
    v_updated_at TIMESTAMPTZ;
    v_new_count INTEGER;
    v_audit_id UUID;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrator session required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('roles.manage') THEN
        RAISE EXCEPTION 'Access denied. Permission roles.manage required.' USING ERRCODE = '42501';
    END IF;

    v_clean_role_id := trim(p_role_id);
    IF v_clean_role_id IS NULL OR length(v_clean_role_id) = 0 THEN
        RAISE EXCEPTION 'Role identifier cannot be empty.' USING ERRCODE = '22000';
    END IF;

    SELECT is_system, name_en, name_bn INTO v_is_system, v_role_name_en, v_role_name_bn
    FROM public.roles
    WHERE id = v_clean_role_id;

    IF v_is_system IS NULL THEN
        RAISE EXCEPTION 'Role % does not exist.', v_clean_role_id USING ERRCODE = 'P0002';
    END IF;

    IF v_is_system IS TRUE THEN
        RAISE EXCEPTION 'Permissions of system roles cannot be modified.' USING ERRCODE = '42501';
    END IF;

    -- TARGET SCOPE GUARD: Caller cannot modify a role whose permissions exceed caller's ceiling
    IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot modify a role containing permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- Existing permissions
    SELECT ARRAY(
        SELECT permission_id FROM public.role_permissions WHERE role_id = v_clean_role_id
    ) INTO v_existing_perms;

    -- Validate permission IDs
    IF p_permission_ids IS NOT NULL AND cardinality(p_permission_ids) > 0 THEN
        SELECT ARRAY(
            SELECT unnest(p_permission_ids)
            EXCEPT
            SELECT id FROM public.permissions
        ) INTO v_invalid_perms;

        IF cardinality(v_invalid_perms) > 0 THEN
            RAISE EXCEPTION 'Invalid permission ID(s) provided: %', array_to_string(v_invalid_perms, ', ')
                USING ERRCODE = '22000';
        END IF;

        SELECT ARRAY(
            SELECT DISTINCT unnest(p_permission_ids)
        ) INTO v_deduped_perms;
    ELSE
        v_deduped_perms := ARRAY[]::TEXT[];
    END IF;

    -- NEW PERMISSION SET CEILING GUARD
    IF NOT public.can_delegate_permission_set(v_deduped_perms) THEN
        RAISE EXCEPTION 'Access denied. You cannot grant permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- Compute delta
    SELECT ARRAY(SELECT unnest(v_deduped_perms) EXCEPT SELECT unnest(v_existing_perms)) INTO v_added_perms;
    SELECT ARRAY(SELECT unnest(v_existing_perms) EXCEPT SELECT unnest(v_deduped_perms)) INTO v_removed_perms;

    -- Replace permissions
    DELETE FROM public.role_permissions WHERE role_id = v_clean_role_id;

    IF cardinality(v_deduped_perms) > 0 THEN
        FOREACH v_perm_id IN ARRAY v_deduped_perms
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, created_at)
            VALUES (v_clean_role_id, v_perm_id, clock_timestamp());
        END LOOP;
    END IF;

    v_updated_at := clock_timestamp();
    UPDATE public.roles SET updated_at = v_updated_at WHERE id = v_clean_role_id;
    v_new_count := cardinality(v_deduped_perms);

    -- RESULTING STATE LAST-MANAGER SAFETY CHECK
    IF EXISTS (SELECT 1 FROM public.user_roles) THEN
        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION 'Cannot remove roles.manage from this role because doing so would leave no active administrators capable of managing roles.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- Audit log
    v_audit_id := public.log_role_audit_event(
        'ROLE_PERMISSIONS_REPLACED',
        v_clean_role_id,
        jsonb_build_object(
            'permission_ids', to_jsonb(v_deduped_perms),
            'permission_count', v_new_count,
            'added_count', cardinality(v_added_perms),
            'removed_count', cardinality(v_removed_perms)
        )
    );

    -- --------------------------------------------------------------------------
    -- Emit Event 12: role.permissions_changed (if set actually changed)
    -- --------------------------------------------------------------------------
    IF cardinality(v_added_perms) > 0 OR cardinality(v_removed_perms) > 0 THEN
        PERFORM public.admin_emit_notification(
            p_event_key := 'role.permissions_changed',
            p_title_en := 'Role permissions updated: ' || COALESCE(v_role_name_en, v_clean_role_id),
            p_title_bn := 'ভূমিকার অনুমতি পরিবর্তন করা হয়েছে: ' || COALESCE(v_role_name_bn, v_role_name_en, v_clean_role_id),
            p_body_en := 'Permissions for role ' || COALESCE(v_role_name_en, v_clean_role_id) || ' were modified (' || cardinality(v_added_perms)::text || ' added, ' || cardinality(v_removed_perms)::text || ' removed).',
            p_body_bn := 'ভূমিকা ' || COALESCE(v_role_name_bn, v_role_name_en, v_clean_role_id) || '-এর অনুমতি পরিবর্তন করা হয়েছে (' || cardinality(v_added_perms)::text || 'টি যোগ, ' || cardinality(v_removed_perms)::text || 'টি অপসারিত)।',
            p_actor_user_id := auth.uid(),
            p_target_type := 'role',
            p_target_id := v_clean_role_id,
            p_target_label := COALESCE(v_role_name_en, v_clean_role_id),
            p_metadata := jsonb_build_object(
                'role_id', v_clean_role_id,
                'added_permissions', to_jsonb(v_added_perms),
                'removed_permissions', to_jsonb(v_removed_perms),
                'new_permission_count', v_new_count,
                'actor_user_id', auth.uid(),
                'timestamp', now()
            ),
            p_required_all_permissions := ARRAY['roles.manage'],
            p_required_any_permissions := '{}'::text[],
            p_audience_mode := 'permission',
            p_route := '/roles/' || v_clean_role_id,
            p_dedupe_key := 'role.permissions_changed:oversight:' || v_audit_id::text,
            p_exclude_actor := true,
            p_include_super_admin := true
        );
    END IF;

    RETURN jsonb_build_object(
        'role_id', v_clean_role_id,
        'permission_ids', to_jsonb(v_deduped_perms),
        'permission_count', v_new_count,
        'updated_at', v_updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_replace_role_permissions(TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_replace_role_permissions(TEXT, TEXT[]) TO authenticated, service_role;

COMMIT;
