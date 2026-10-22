-- TEST-ONLY: assert the production migration against the disposable local database.
DO $guard$
BEGIN
  IF current_setting('recovery.test_only', true) IS DISTINCT FROM 'true'
     OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Refusing evidence-policy assertions outside isolated recovery Postgres';
  END IF;
END;
$guard$;

DO $assert$
DECLARE
  v_matching integer;
  v_banner integer;
BEGIN
  SELECT count(*) INTO v_matching
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND roles::text LIKE '%authenticated%'
    AND (
      (policyname = 'active admin evidence read'
        AND cmd = 'SELECT'
        AND qual LIKE '%is_active_admin%'
        AND qual LIKE '%complaints.evidence_view%')
      OR (policyname = 'active admin evidence insert'
        AND cmd = 'INSERT'
        AND with_check LIKE '%is_active_admin%'
        AND with_check LIKE '%complaints.publish%')
      OR (policyname = 'active admin evidence update'
        AND cmd = 'UPDATE'
        AND qual LIKE '%complaints.publish%'
        AND with_check LIKE '%complaints.publish%')
      OR (policyname = 'active admin evidence delete'
        AND cmd = 'DELETE'
        AND qual LIKE '%complaints.publish%')
    );

  IF v_matching <> 4 THEN
    RAISE EXCEPTION 'Complaint evidence Storage permissions failed: % of 4', v_matching;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'public complaint evidence upload'
      AND roles::text LIKE '%anon%'
      AND with_check LIKE '%can_upload_public_complaint_evidence%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'published complaint evidence read'
      AND roles::text LIKE '%anon%'
      AND qual LIKE '%is_published_complaint_evidence%'
  ) THEN
    RAISE EXCEPTION 'Public complaint upload or published evidence read contract changed';
  END IF;

  SELECT count(*) INTO v_banner
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname LIKE 'banner media admin %'
    AND (
      coalesce(qual, '') LIKE '%banners.manage%'
      OR coalesce(with_check, '') LIKE '%banners.manage%'
    );

  IF v_banner <> 4 THEN
    RAISE EXCEPTION 'Banner Storage permission policies changed: % of 4', v_banner;
  END IF;

  RAISE NOTICE 'B4_EVIDENCE_STORAGE_PERMISSION_ASSERTIONS_PASS';
END;
$assert$;
