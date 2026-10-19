-- Phase 12: trusted-source ingestion may create REVIEW CANDIDATES, never
-- automatically publish or merge public complaints. Apply with a reviewed
-- migration plan; the CI job uses only its disposable 127.0.0.1 database.

CREATE OR REPLACE FUNCTION public.process_trusted_news_intake_candidate(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Automatic sourced-report publication is disabled. Review and approve individual News Intake candidates.'
    USING errcode = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.process_trusted_news_intake_candidate(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_news_intake_review_candidate_canonical
  ON public.news_intake_run_items (public.normalize_source_url(canonical_url), created_at DESC)
  WHERE action = 'created_draft' AND review_payload IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_check_news_intake_candidate_duplicate(p_canonical_url text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_url text := public.normalize_source_url(p_canonical_url);
  v_candidate public.news_intake_run_items%rowtype;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role'
     AND (NOT public.is_active_admin() OR NOT public.has_permission('complaints.publish')) THEN
    RAISE EXCEPTION 'Access denied.' USING errcode = '42501';
  END IF;

  IF v_url IS NULL OR length(v_url) > 2000 OR v_url !~ '^https://[^/]+/.+' THEN
    RAISE EXCEPTION 'Valid HTTPS final article URL required.' USING errcode = '22023';
  END IF;

  SELECT i.* INTO v_candidate
  FROM public.news_intake_run_items i
  JOIN public.news_intake_runs r ON r.id = i.run_id
  WHERE public.normalize_source_url(i.canonical_url) = v_url
    AND i.item_kind = 'article'
    AND i.action = 'created_draft'
    AND i.review_payload IS NOT NULL
    AND i.created_at >= now() - interval '7 days'
    AND r.status IN ('running', 'completed', 'partial')
  ORDER BY i.created_at DESC, i.id DESC
  LIMIT 1;

  IF v_candidate.id IS NULL THEN
    RETURN jsonb_build_object('duplicate', false);
  END IF;

  RETURN jsonb_build_object(
    'duplicate', true,
    'runItemId', v_candidate.id,
    'linkedReportId', v_candidate.report_id,
    'reason', 'A recent review candidate with this normalized article URL already exists.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_check_news_intake_candidate_duplicate(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_check_news_intake_candidate_duplicate(text)
  TO authenticated, service_role;
