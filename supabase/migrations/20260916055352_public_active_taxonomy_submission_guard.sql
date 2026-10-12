CREATE OR REPLACE FUNCTION public.submit_public_complaint_v2(
  p_payload jsonb,
  p_client_submission_id text,
  p_reporter_context jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_segment text;
  v_subcategory text;
  v_age_group text;
  v_relationship text;
  v_reporting_for text;
  v_result jsonb;
  v_report_id text;
BEGIN
  v_segment := trim(coalesce(p_payload->>'segment', ''));
  v_subcategory := trim(coalesce(p_payload->>'subcategoryId', p_payload->>'subcategory_id', ''));

  IF v_segment = '' OR NOT EXISTS (
    SELECT 1
    FROM public.segments s
    WHERE s.id = v_segment
      AND s.active = true
  ) THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Selected reporting segment is not active.';
  END IF;

  IF v_subcategory = '' OR NOT EXISTS (
    SELECT 1
    FROM public.subcategories sc
    WHERE sc.id = v_subcategory
      AND sc.segment_id = v_segment
      AND sc.active = true
  ) THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Selected complaint type is not active for this reporting segment.';
  END IF;

  IF v_segment = 'harassment' THEN
    v_age_group := nullif(trim(coalesce(p_payload->>'affectedPersonAgeGroup', p_payload->>'affected_person_age_group', '')), '');
    v_relationship := nullif(trim(coalesce(p_payload->>'allegedAbuserRelationship', p_payload->>'alleged_abuser_relationship', '')), '');
    v_reporting_for := nullif(trim(coalesce(p_payload->>'reportingFor', p_payload->>'reporting_for', '')), '');

    IF v_age_group IS NULL OR v_age_group NOT IN ('under_18', '18_29', '30_59', '60_plus', 'prefer_not_to_say') THEN
      RAISE EXCEPTION 'VALIDATION_FAILED: A valid affected person age group is required for harassment reports.';
    END IF;

    IF v_relationship IS NULL OR v_relationship NOT IN ('intimate_partner', 'household_family', 'other_relative', 'friend_acquaintance', 'coworker_classmate', 'authority_caregiver_service_provider', 'stranger', 'other_or_unknown') THEN
      RAISE EXCEPTION 'VALIDATION_FAILED: A valid relationship with the alleged abuser is required for harassment reports.';
    END IF;

    IF v_reporting_for IS NULL OR v_reporting_for NOT IN ('self', 'someone_else') THEN
      RAISE EXCEPTION 'VALIDATION_FAILED: Reporting-for selection is required for harassment reports.';
    END IF;
  ELSE
    v_age_group := NULL;
    v_relationship := NULL;
    v_reporting_for := NULL;
  END IF;

  v_result := public.submit_public_complaint(p_payload, p_client_submission_id, p_reporter_context);
  v_report_id := nullif(trim(coalesce(v_result->>'reportId', '')), '');

  IF v_report_id IS NULL THEN
    RAISE EXCEPTION 'SUBMISSION_FAILED: Missing report identifier from the underlying submission.';
  END IF;

  UPDATE public.complaints
  SET affected_person_age_group = v_age_group,
      alleged_abuser_relationship = v_relationship,
      reporting_for = v_reporting_for,
      updated_at = now()
  WHERE id = v_report_id;

  RETURN v_result;
END;
$function$;
