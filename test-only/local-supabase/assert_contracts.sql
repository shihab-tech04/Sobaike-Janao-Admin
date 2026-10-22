-- Contract assertions against the disposable test-only baseline.
-- Run only against the loopback database created by the adjacent GitHub Actions job.
DO $assertions$
BEGIN
  IF NOT has_table_privilege('anon', 'public.complaints', 'INSERT')
       AND NOT has_table_privilege('anon', 'public.complaints', 'UPDATE')
       AND NOT has_table_privilege('anon', 'public.complaints', 'DELETE') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Anonymous direct complaint writes are unexpectedly granted';
  END IF;

  IF has_function_privilege('anon', 'public.submit_public_complaint_v2(jsonb,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers can execute the privileged submission RPC directly';
  END IF;
  IF has_function_privilege('anon', 'public.register_public_complaint_evidence(text,text,text,bigint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers can execute the privileged evidence-registration RPC directly';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.submit_public_complaint_v2(jsonb,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'The local public-write gateway role cannot execute the verified submission RPC';
  END IF;

  IF has_function_privilege('anon', 'public.admin_create_sourced_report_from_intake(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers can execute the Admin sourced-report RPC';
  END IF;
  IF has_function_privilege('anon', 'public.admin_save_banner_draft(text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers can execute the Admin banner-draft RPC';
  END IF;
  IF has_function_privilege('anon', 'public.admin_publish_banner(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers can execute the Admin banner-publish RPC';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_public_site_banners()', 'EXECUTE') THEN
    RAISE EXCEPTION 'The public-only banner read RPC is not executable by anon';
  END IF;
  IF NOT has_table_privilege('anon', 'public.segments', 'SELECT')
       OR NOT has_table_privilege('anon', 'public.subcategories', 'SELECT') THEN
    RAISE EXCEPTION 'The active taxonomy read contract is not granted to anon';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.segments'::regclass)
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subcategories'::regclass) THEN
    RAISE EXCEPTION 'Public taxonomy relations unexpectedly have RLS disabled';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
    RAISE EXCEPTION 'Storage object RLS is unexpectedly disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'public complaint evidence upload'
      AND cmd = 'INSERT' AND roles @> ARRAY['anon']::name[]
  ) THEN
    RAISE EXCEPTION 'The verified anonymous evidence-upload policy is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    RAISE EXCEPTION 'A captured installed extension was not reconstructed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_notify_segments' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'A captured taxonomy trigger was not reconstructed';
  END IF;
END
$assertions$;

SELECT 'TEST_ONLY_CONTRACT_ASSERTIONS_PASS' AS result;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000007';
DO $denied_admin$
DECLARE
  denied boolean;
BEGIN
  denied := false;
  BEGIN
    PERFORM public.admin_get_site_banners();
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'A synthetic authenticated user without banners.manage read Admin banners'; END IF;

  denied := false;
  BEGIN
    PERFORM public.admin_save_banner_draft('harassment', '{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'A synthetic authenticated user without banners.manage saved a banner draft'; END IF;

  denied := false;
  BEGIN
    PERFORM public.admin_publish_banner('harassment');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'A synthetic authenticated user without banners.manage published a banner'; END IF;

  denied := false;
  BEGIN
    PERFORM public.admin_create_sourced_report_from_intake('{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'A synthetic authenticated user without complaints.publish created a sourced report'; END IF;
END
$denied_admin$;
ROLLBACK;

SELECT 'TEST_ONLY_DENIED_PERMISSION_ASSERTIONS_PASS' AS result;
