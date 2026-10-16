-- Synthetic category metadata for testing the authorized active-taxonomy read.
-- No reports, users, contact details, storage objects, or production records are seeded.
INSERT INTO public.segments (id, slug, name_bn, name_en, active, sort_order, config_status)
VALUES
  ('harassment', 'harassment', 'হয়রানি ও নির্যাতন', 'Harassment & abuse', true, 1, 'draft'),
  ('public_safety', 'public-safety', 'জননিরাপত্তা', 'Public Safety', true, 2, 'draft'),
  ('road_transport', 'road-transport', 'সড়ক ও যাতায়াত সমস্যা', 'Road & Transport Issues', true, 3, 'draft'),
  ('illegal_occupation', 'illegal-occupation', 'অবৈধ দখল', 'Illegal Occupation', true, 4, 'draft'),
  ('rickshaw', 'rickshaw', 'অবৈধ অটো চার্জিং', 'Illegal auto-rickshaw charging', true, 5, 'draft'),
  ('extortion', 'extortion', 'চাঁদাবাজি', 'Extortion', true, 6, 'draft'),
  ('load_shedding', 'load-shedding', 'ইউটিলিটি সমস্যা', 'Utility issues', true, 7, 'draft');

BEGIN;
SET LOCAL ROLE anon;
DO $taxonomy_read$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.segments WHERE active;
  IF visible_count <> 7 THEN
    RAISE EXCEPTION 'Expected seven synthetic active taxonomy categories through the anonymous read policy, found %', visible_count;
  END IF;
END
$taxonomy_read$;
ROLLBACK;
