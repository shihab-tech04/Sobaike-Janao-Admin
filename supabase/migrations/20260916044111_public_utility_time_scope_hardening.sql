-- Privacy/scope hardening for the published utility timing contract.
-- Only load-shedding and gas-shortage reports may expose incident start/end time.
-- Other categories retain stable JSON keys with null values.

CREATE OR REPLACE FUNCTION public.get_public_published_reports()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'segment', c.segment_id,
        'subcategoryId', c.subcategory_id,
        'titleBn', c.title,
        'titleEn', c.title,
        'descriptionBn', c.description,
        'descriptionEn', c.description,
        'reportedSubject', party.name,
        'organization', party.organization,
        'district', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN c.district ELSE NULL END,
        'area', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN c.area ELSE NULL END,
        'location', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN coalesce(c.formatted_address, c.area, c.district) ELSE NULL END,
        'incidentDate', to_char(c.incident_date, 'YYYY-MM-DD'),
        'incidentTime', CASE WHEN c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN c.incident_time ELSE NULL END,
        'incident_time', CASE WHEN c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN c.incident_time ELSE NULL END,
        'publishedAt', to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'priority', 'medium',
        'hasSupportingInfo', c.has_supporting_info,
        'status', c.status,
        'recentBillMonth', c.recent_bill_month,
        'recentBillAmount', c.recent_bill_amount,
        'previousBillMonth', c.previous_bill_month,
        'previousBillAmount', c.previous_bill_amount,
        'recent_bill_month', c.recent_bill_month,
        'recent_bill_amount', c.recent_bill_amount,
        'previous_bill_month', c.previous_bill_month,
        'previous_bill_amount', c.previous_bill_amount,
        'utilityEndTime', CASE WHEN c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN c.utility_end_time ELSE NULL END,
        'utility_end_time', CASE WHEN c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN c.utility_end_time ELSE NULL END
      ) ORDER BY c.created_at DESC, c.id DESC
    ),
    '[]'::jsonb
  ) INTO v_result
  FROM public.complaints c
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN count(*) = 1 THEN max(nullif(trim(cp.name), '')) ELSE NULL END AS name,
      CASE WHEN count(*) = 1 THEN max(nullif(trim(cp.organization), '')) ELSE NULL END AS organization
    FROM public.complaint_parties cp
    WHERE cp.complaint_id = c.id
      AND (
        nullif(trim(cp.name), '') IS NOT NULL
        OR nullif(trim(cp.organization), '') IS NOT NULL
        OR nullif(trim(cp.role_or_designation), '') IS NOT NULL
        OR nullif(trim(cp.phone_or_contact), '') IS NOT NULL
        OR nullif(trim(cp.public_profile_handle), '') IS NOT NULL
        OR nullif(trim(cp.identifying_description), '') IS NOT NULL
        OR nullif(trim(cp.address), '') IS NOT NULL
        OR trim(coalesce(cp.party_type, '')) IN ('individual', 'business', 'group', 'organization')
      )
  ) party ON true
  WHERE c.status = 'published';
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_published_report(p_report_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_clean_id text;
BEGIN
  v_clean_id := upper(trim(coalesce(p_report_id, '')));
  IF v_clean_id = '' THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'id', c.id,
    'segment', c.segment_id,
    'subcategoryId', c.subcategory_id,
    'titleBn', c.title,
    'titleEn', c.title,
    'descriptionBn', c.description,
    'descriptionEn', c.description,
    'reportedSubject', party.name,
    'organization', party.organization,
    'district', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN c.district ELSE NULL END,
    'area', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN c.area ELSE NULL END,
    'location', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN coalesce(c.formatted_address, c.area, c.district) ELSE NULL END,
    'incidentDate', to_char(c.incident_date, 'YYYY-MM-DD'),
    'incidentTime', CASE WHEN c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN c.incident_time ELSE NULL END,
    'incident_time', CASE WHEN c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN c.incident_time ELSE NULL END,
    'publishedAt', to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'priority', 'medium',
    'hasSupportingInfo', c.has_supporting_info,
    'status', c.status,
    'recentBillMonth', c.recent_bill_month,
    'recentBillAmount', c.recent_bill_amount,
    'previousBillMonth', c.previous_bill_month,
    'previousBillAmount', c.previous_bill_amount,
    'recent_bill_month', c.recent_bill_month,
    'recent_bill_amount', c.recent_bill_amount,
    'previous_bill_month', c.previous_bill_month,
    'previous_bill_amount', c.previous_bill_amount,
    'utilityEndTime', CASE WHEN c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN c.utility_end_time ELSE NULL END,
    'utility_end_time', CASE WHEN c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN c.utility_end_time ELSE NULL END
  ) INTO v_result
  FROM public.complaints c
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN count(*) = 1 THEN max(nullif(trim(cp.name), '')) ELSE NULL END AS name,
      CASE WHEN count(*) = 1 THEN max(nullif(trim(cp.organization), '')) ELSE NULL END AS organization
    FROM public.complaint_parties cp
    WHERE cp.complaint_id = c.id
      AND (
        nullif(trim(cp.name), '') IS NOT NULL
        OR nullif(trim(cp.organization), '') IS NOT NULL
        OR nullif(trim(cp.role_or_designation), '') IS NOT NULL
        OR nullif(trim(cp.phone_or_contact), '') IS NOT NULL
        OR nullif(trim(cp.public_profile_handle), '') IS NOT NULL
        OR nullif(trim(cp.identifying_description), '') IS NOT NULL
        OR nullif(trim(cp.address), '') IS NOT NULL
        OR trim(coalesce(cp.party_type, '')) IN ('individual', 'business', 'group', 'organization')
      )
  ) party ON true
  WHERE upper(c.id) = v_clean_id
    AND c.status = 'published';
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_home_feed(
  p_visitor_lat double precision DEFAULT NULL::double precision,
  p_visitor_lng double precision DEFAULT NULL::double precision,
  p_filter text DEFAULT 'all'::text,
  p_district text DEFAULT 'all'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_has_visitor_loc boolean := false;
  v_clean_filter text;
  v_clean_district text;
BEGIN
  IF p_visitor_lat IS NOT NULL AND p_visitor_lng IS NOT NULL
     AND p_visitor_lat >= -90.0 AND p_visitor_lat <= 90.0
     AND p_visitor_lng >= -180.0 AND p_visitor_lng <= 180.0
     AND NOT (p_visitor_lat = 0.0 AND p_visitor_lng = 0.0) THEN
    v_has_visitor_loc := true;
  END IF;

  v_clean_filter := lower(trim(coalesce(p_filter, 'all')));
  IF v_clean_filter NOT IN ('all', 'latest', 'popular', 'most_shared') THEN
    v_clean_filter := 'all';
  END IF;

  v_clean_district := lower(trim(coalesce(p_district, 'all')));

  WITH base_complaints AS (
    SELECT
      c.id,
      c.segment_id,
      c.subcategory_id,
      c.title,
      c.description,
      CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN c.district ELSE NULL END AS district,
      CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN c.area ELSE NULL END AS area,
      CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN coalesce(c.formatted_address, c.area, c.district) ELSE NULL END AS location_display,
      c.incident_date,
      c.incident_time,
      c.created_at,
      c.has_supporting_info,
      c.status,
      c.recent_bill_month,
      c.recent_bill_amount,
      c.previous_bill_month,
      c.previous_bill_amount,
      c.utility_end_time,
      party.name AS party_name,
      party.organization AS party_org,
      CASE
        WHEN v_has_visitor_loc
             AND (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb
             AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
             AND NOT (c.latitude = 0.0 AND c.longitude = 0.0)
             AND c.latitude >= -90.0 AND c.latitude <= 90.0
             AND c.longitude >= -180.0 AND c.longitude <= 180.0
        THEN 6371.0 * 2.0 * atan2(
          sqrt(
            sin(radians(c.latitude - p_visitor_lat) / 2.0) * sin(radians(c.latitude - p_visitor_lat) / 2.0)
            + cos(radians(p_visitor_lat)) * cos(radians(c.latitude))
            * sin(radians(c.longitude - p_visitor_lng) / 2.0) * sin(radians(c.longitude - p_visitor_lng) / 2.0)
          ),
          sqrt(greatest(0.0, 1.0 - (
            sin(radians(c.latitude - p_visitor_lat) / 2.0) * sin(radians(c.latitude - p_visitor_lat) / 2.0)
            + cos(radians(p_visitor_lat)) * cos(radians(c.latitude))
            * sin(radians(c.longitude - p_visitor_lng) / 2.0) * sin(radians(c.longitude - p_visitor_lng) / 2.0)
          )))
        )
        ELSE NULL
      END AS internal_distance_km
    FROM public.complaints c
    LEFT JOIN LATERAL (
      SELECT
        CASE WHEN count(*) = 1 THEN max(nullif(trim(cp.name), '')) ELSE NULL END AS name,
        CASE WHEN count(*) = 1 THEN max(nullif(trim(cp.organization), '')) ELSE NULL END AS organization
      FROM public.complaint_parties cp
      WHERE cp.complaint_id = c.id
        AND (
          nullif(trim(cp.name), '') IS NOT NULL
          OR nullif(trim(cp.organization), '') IS NOT NULL
          OR nullif(trim(cp.role_or_designation), '') IS NOT NULL
          OR nullif(trim(cp.phone_or_contact), '') IS NOT NULL
          OR nullif(trim(cp.public_profile_handle), '') IS NOT NULL
          OR nullif(trim(cp.identifying_description), '') IS NOT NULL
          OR nullif(trim(cp.address), '') IS NOT NULL
          OR trim(coalesce(cp.party_type, '')) IN ('individual', 'business', 'group', 'organization')
        )
    ) party ON true
    WHERE c.status = 'published'
      AND (
        v_clean_district = 'all'
        OR (
          (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb
          AND lower(coalesce(c.district, '')) LIKE '%' || v_clean_district || '%'
        )
      )
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', bc.id,
        'segment', bc.segment_id,
        'subcategoryId', bc.subcategory_id,
        'titleBn', bc.title,
        'titleEn', bc.title,
        'descriptionBn', bc.description,
        'descriptionEn', bc.description,
        'reportedSubject', bc.party_name,
        'organization', bc.party_org,
        'district', bc.district,
        'area', bc.area,
        'location', bc.location_display,
        'incidentDate', to_char(bc.incident_date, 'YYYY-MM-DD'),
        'incidentTime', CASE WHEN bc.segment_id = 'load_shedding' AND bc.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN bc.incident_time ELSE NULL END,
        'incident_time', CASE WHEN bc.segment_id = 'load_shedding' AND bc.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN bc.incident_time ELSE NULL END,
        'publishedAt', to_char(bc.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'priority', 'medium',
        'hasSupportingInfo', bc.has_supporting_info,
        'status', bc.status,
        'recentBillMonth', bc.recent_bill_month,
        'recentBillAmount', bc.recent_bill_amount,
        'previousBillMonth', bc.previous_bill_month,
        'previousBillAmount', bc.previous_bill_amount,
        'recent_bill_month', bc.recent_bill_month,
        'recent_bill_amount', bc.recent_bill_amount,
        'previous_bill_month', bc.previous_bill_month,
        'previous_bill_amount', bc.previous_bill_amount,
        'utilityEndTime', CASE WHEN bc.segment_id = 'load_shedding' AND bc.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN bc.utility_end_time ELSE NULL END,
        'utility_end_time', CASE WHEN bc.segment_id = 'load_shedding' AND bc.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN bc.utility_end_time ELSE NULL END
      )
      ORDER BY
        CASE WHEN v_clean_filter = 'all' AND v_has_visitor_loc THEN bc.internal_distance_km END ASC NULLS LAST,
        CASE WHEN v_clean_filter = 'latest' THEN bc.created_at END DESC NULLS LAST,
        CASE WHEN v_clean_filter = 'latest' AND v_has_visitor_loc THEN bc.internal_distance_km END ASC NULLS LAST,
        CASE WHEN v_clean_filter = 'popular' AND v_has_visitor_loc THEN bc.internal_distance_km END ASC NULLS LAST,
        CASE WHEN v_clean_filter = 'popular' THEN bc.created_at END DESC NULLS LAST,
        CASE WHEN v_clean_filter = 'most_shared' THEN bc.created_at END DESC NULLS LAST,
        CASE WHEN v_clean_filter = 'most_shared' AND v_has_visitor_loc THEN bc.internal_distance_km END ASC NULLS LAST,
        bc.created_at DESC,
        bc.id DESC
    ),
    '[]'::jsonb
  ) INTO v_result
  FROM base_complaints bc;

  RETURN v_result;
END;
$function$;
