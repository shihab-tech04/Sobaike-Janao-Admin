-- Read only. Must be run against the unlinked disposable database after the
-- captured baseline and 90-function supplement. Two hosted cron dispatchers
-- containing URL configuration are intentionally excluded from this fixture.
DO $verify$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p
  JOIN pg_namespace s ON s.oid = p.pronamespace
  WHERE s.nspname IN ('public', 'private');
  IF n <> 209 THEN
    RAISE EXCEPTION 'Expected 209 non-cron catalog functions, got %', n;
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.admin_get_taxonomy()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.admin_get_response_detail(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.admin_create_role(text,text,boolean,text[],text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Authenticated Admin function grants not recovered';
  END IF;

  IF has_function_privilege('anon', 'public.admin_get_taxonomy()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_create_role(text,text,boolean,text[],text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_publish_response(text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Anonymous user unexpectedly executes privileged Admin RPC';
  END IF;

  IF NOT has_function_privilege('anon','public.get_public_category_popularity()','EXECUTE') THEN
    RAISE EXCEPTION 'Public popularity RPC must remain readable';
  END IF;
END
$verify$;

SELECT 'ISOLATED_PHASE02_FUNCTION_SUPPLEMENT_PASS' AS result;
