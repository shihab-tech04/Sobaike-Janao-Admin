-- TEST-ONLY / NEVER RUN AGAINST HOSTED OR PRODUCTION DATABASE.
-- Candidate for B4 review: match Storage's active-Admin evidence policies
-- to the existing complaint evidence read and privileged mutation permissions.
-- The citizen WebP upload and published-evidence read policies stay untouched.
-- Run only through verified loopback CI with --single-transaction and test marker;
-- the PostgreSQL container's server-side address may be a Docker bridge.
DO $guard$
BEGIN
  IF current_setting('recovery.test_only', true) IS DISTINCT FROM 'true'
     OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Refusing evidence-policy candidate outside isolated recovery Postgres';
  END IF;
END;
$guard$;

SET LOCAL ROLE supabase_storage_admin;

ALTER POLICY "active admin evidence read" ON storage.objects
  TO authenticated
  USING (bucket_id = 'complaint-evidence'
    AND public.is_active_admin()
    AND public.has_permission('complaints.evidence_view'));

ALTER POLICY "active admin evidence insert" ON storage.objects
  TO authenticated
  WITH CHECK (bucket_id = 'complaint-evidence'
    AND public.is_active_admin()
    AND public.has_permission('complaints.publish'));

ALTER POLICY "active admin evidence update" ON storage.objects
  TO authenticated
  USING (bucket_id = 'complaint-evidence'
    AND public.is_active_admin()
    AND public.has_permission('complaints.publish'))
  WITH CHECK (bucket_id = 'complaint-evidence'
    AND public.is_active_admin()
    AND public.has_permission('complaints.publish'));

ALTER POLICY "active admin evidence delete" ON storage.objects
  TO authenticated
  USING (bucket_id = 'complaint-evidence'
    AND public.is_active_admin()
    AND public.has_permission('complaints.publish'));

RESET ROLE;

DO $assert$
DECLARE
  v_matching integer;
BEGIN
  SELECT count(*) INTO v_matching FROM pg_policies
  WHERE schemaname='storage'
    AND tablename='objects'
    AND roles::text LIKE '%authenticated%'
    AND (
      (policyname='active admin evidence read'
        AND cmd='SELECT' AND qual LIKE '%complaints.evidence_view%')
      OR (policyname='active admin evidence insert'
        AND cmd='INSERT' AND with_check LIKE '%complaints.publish%')
      OR (policyname='active admin evidence update'
        AND cmd='UPDATE' AND qual LIKE '%complaints.publish%'
        AND with_check LIKE '%complaints.publish%')
      OR (policyname='active admin evidence delete'
        AND cmd='DELETE' AND qual LIKE '%complaints.publish%')
    );
  IF v_matching <> 4 THEN
    RAISE EXCEPTION 'Evidence policy candidate validation failed: % of 4', v_matching;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage'
      AND tablename='objects' AND policyname='public complaint evidence upload'
      AND with_check LIKE '%can_upload_public_complaint_evidence%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage'
      AND tablename='objects' AND policyname='published complaint evidence read'
      AND qual LIKE '%is_published_complaint_evidence%'
  ) THEN
    RAISE EXCEPTION 'Existing anonymous report/published evidence contracts changed';
  END IF;
  RAISE NOTICE 'B4_ISOLATED_EVIDENCE_POLICY_PREDICATE_PASS';
END;
$assert$;
