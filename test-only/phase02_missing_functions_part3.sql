-- Sobaike Janao read-only catalog recovery, 2026-10-18. TEST ONLY.
-- This is NOT an historical migration, production delta, or permission grant plan.
-- Contains only pg_get_functiondef metadata; no application records or runtime secrets.
-- Must be replayed only after the test-only baseline on disposable loopback Supabase.
DO $recovery_guard$ BEGIN
  IF current_setting('recovery.test_only', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Refusing recovery test-only function catalog outside isolated test session';
  END IF;
END $recovery_guard$;

-- public.can_upload_public_evidence(p_storage_path text)
CREATE OR REPLACE FUNCTION public.can_upload_public_evidence(p_storage_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.complaints c
    WHERE c.client_submission_id IS NOT NULL
      AND c.status = 'submitted'
      AND split_part(p_storage_path, '/', 1) = 'public-submissions'
      AND split_part(p_storage_path, '/', 2) = c.client_submission_id
      AND p_storage_path LIKE
        'public-submissions/' || c.client_submission_id || '/%'
  );
$function$
REVOKE ALL ON FUNCTION public.can_upload_public_evidence(p_storage_path text) FROM PUBLIC, anon, authenticated, service_role;

-- public.count_effective_role_managers()
CREATE OR REPLACE FUNCTION public.count_effective_role_managers()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    SELECT COUNT(DISTINCT au.user_id)::BIGINT
    FROM public.admin_users au
    LEFT JOIN public.user_roles ur
        ON ur.user_id = au.user_id
    LEFT JOIN public.roles r
        ON r.id = ur.role_id
    LEFT JOIN public.role_permissions rp
        ON rp.role_id = r.id
       AND rp.permission_id = 'roles.manage'
    WHERE au.active = true
      AND (
          au.is_super_admin = true
          OR (
              r.active = true
              AND rp.permission_id = 'roles.manage'
          )
      );
$function$
REVOKE ALL ON FUNCTION public.count_effective_role_managers() FROM PUBLIC, anon, authenticated, service_role;

-- public.generate_role_slug(p_name text)
CREATE OR REPLACE FUNCTION public.generate_role_slug(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_slug TEXT;
BEGIN
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Role name cannot be empty' USING ERRCODE = '22000';
    END IF;

    -- Trim, lowercase, replace non-alphanumeric chars with hyphen, collapse hyphens, trim edges
    v_slug := lower(btrim(p_name));
    v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');

    IF v_slug IS NULL OR v_slug = '' THEN
        RAISE EXCEPTION 'Role name must contain valid alphanumeric characters' USING ERRCODE = '22000';
    END IF;

    RETURN v_slug;
END;
$function$
REVOKE ALL ON FUNCTION public.generate_role_slug(p_name text) FROM PUBLIC, anon, authenticated, service_role;

-- public.get_public_category_popularity()
CREATE OR REPLACE FUNCTION public.get_public_category_popularity()
 RETURNS TABLE(segment_id text, published_post_count bigint, view_count bigint, share_count bigint, popularity_score numeric, popularity_rank bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with published as (
    select item
    from pg_catalog.jsonb_array_elements(public.get_public_published_reports()) item
  ),
  live_metrics as (
    select
      segment.id as segment_id,
      segment.sort_order,
      coalesce(count(published.item), 0)::bigint as published_post_count,
      coalesce(sum(coalesce((published.item->>'viewCount')::bigint, 0)), 0)::bigint as view_count,
      coalesce(sum(coalesce((published.item->>'shareCount')::bigint, 0)), 0)::bigint as share_count
    from public.segments segment
    left join published on published.item->>'segment' = segment.id
    where segment.active = true
    group by segment.id, segment.sort_order
  ),
  combined as (
    select
      live.segment_id,
      live.sort_order,
      live.published_post_count,
      live.view_count,
      live.share_count,
      snapshot.popularity_score,
      snapshot.popularity_rank as snapshot_rank
    from live_metrics live
    left join public.public_category_popularity_snapshot snapshot
      on snapshot.segment_id = live.segment_id
  ),
  ordered as (
    select
      combined.*,
      row_number() over (
        order by
          case when combined.snapshot_rank is null then 1 else 0 end,
          combined.snapshot_rank asc nulls last,
          combined.sort_order asc,
          combined.segment_id asc
      )::bigint as effective_rank
    from combined
  )
  select
    ordered.segment_id,
    ordered.published_post_count,
    ordered.view_count,
    ordered.share_count,
    coalesce(ordered.popularity_score, 0)::numeric,
    ordered.effective_rank
  from ordered
  order by ordered.effective_rank;
$function$
REVOKE ALL ON FUNCTION public.get_public_category_popularity() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_category_popularity() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_category_popularity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_category_popularity() TO service_role;

-- public.get_public_feed_update_state(p_since timestamp with time zone, p_district text)
CREATE OR REPLACE FUNCTION public.get_public_feed_update_state(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_district text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_clean_district text;
  v_result jsonb;
BEGIN
  v_clean_district := lower(trim(coalesce(p_district, 'all')));

  WITH current_publications AS (
    SELECT
      c.id,
      coalesce(c.published_at,c.created_at) AS published_at
    FROM public.complaints c
    WHERE c.status='published'
      AND (
        v_clean_district='all'
        OR (
          (c.publication_preferences->'showGeneralLocation')='true'::jsonb
          AND lower(c.district) LIKE '%' || v_clean_district || '%'
        )
      )
  )
  SELECT jsonb_build_object(
    'newCount', count(*) FILTER (
      WHERE p_since IS NOT NULL
        AND cp.published_at > p_since
    ),
    'newestPublishedAt', max(cp.published_at),
    'checkedAt', now()
  )
  INTO v_result
  FROM current_publications cp;

  RETURN v_result;
END;
$function$
REVOKE ALL ON FUNCTION public.get_public_feed_update_state(p_since timestamp with time zone, p_district text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_feed_update_state(p_since timestamp with time zone, p_district text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_feed_update_state(p_since timestamp with time zone, p_district text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_feed_update_state(p_since timestamp with time zone, p_district text) TO service_role;

-- public.get_public_home_feed_page(p_visitor_lat double precision, p_visitor_lng double precision, p_filter text, p_district text, p_offset integer, p_limit integer)
CREATE OR REPLACE FUNCTION public.get_public_home_feed_page(p_visitor_lat double precision DEFAULT NULL::double precision, p_visitor_lng double precision DEFAULT NULL::double precision, p_filter text DEFAULT 'all'::text, p_district text DEFAULT 'all'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_limit integer := least(greatest(coalesce(p_limit,10),1),50);
  v_filter text := lower(trim(coalesce(p_filter,'all')));
  v_clean_district text;
  v_has_visitor_loc boolean := false;
  v_query_geog extensions.geography;
  v_candidate_ids text[] := '{}'::text[];
  v_page_ids text[] := '{}'::text[];
  v_geo_ids text[] := '{}'::text[];
  v_fallback_ids text[] := '{}'::text[];
  v_geo_count integer := 0;
  v_needed integer := 0;
  v_total_count integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
begin
  if v_filter not in ('all','latest','popular','most_shared') then
    v_filter := 'all';
  end if;

  if p_visitor_lat is not null and p_visitor_lng is not null
     and p_visitor_lat between -90.0 and 90.0
     and p_visitor_lng between -180.0 and 180.0
     and not (p_visitor_lat=0.0 and p_visitor_lng=0.0) then
    v_has_visitor_loc := true;
    v_query_geog := extensions.st_setsrid(
      extensions.st_makepoint(p_visitor_lng,p_visitor_lat),
      4326
    )::extensions.geography;
  end if;

  v_clean_district := lower(
    coalesce(
      public.canonical_district_name(p_district),
      trim(coalesce(p_district,'all'))
    )
  );

  select count(*)
  into v_total_count
  from public.complaints c
  where c.status='published'
    and (
      v_clean_district='all'
      or (
        (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        and lower(c.district)=v_clean_district
      )
    );

  if v_filter='all' and v_has_visitor_loc then
    select coalesce(
      array_agg(q.id order by q.geo_distance asc,q.created_at desc,q.id desc),
      '{}'::text[]
    )
    into v_geo_ids
    from (
      select
        c.id,c.published_at as created_at,
        (extensions.st_setsrid(extensions.st_makepoint(c.longitude,c.latitude),4326)::extensions.geography)
          operator(extensions.<->) v_query_geog as geo_distance
      from public.complaints c
      where c.status='published'
        and (v_clean_district='all' or lower(c.district)=v_clean_district)
        and (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        and c.latitude is not null and c.longitude is not null
        and not (c.latitude=0.0 and c.longitude=0.0)
        and c.latitude between -90.0 and 90.0
        and c.longitude between -180.0 and 180.0
      order by
        (extensions.st_setsrid(extensions.st_makepoint(c.longitude,c.latitude),4326)::extensions.geography)
          operator(extensions.<->) v_query_geog asc,
        c.published_at desc,c.id desc
      offset v_offset
      limit v_limit + 1
    ) q;

    v_candidate_ids := coalesce(v_geo_ids,'{}'::text[]);

    if cardinality(v_candidate_ids) < v_limit + 1 then
      if cardinality(v_candidate_ids) > 0 then
        v_geo_count := v_offset + cardinality(v_candidate_ids);
      else
        select count(*) into v_geo_count
        from public.complaints c
        where c.status='published'
          and (v_clean_district='all' or lower(c.district)=v_clean_district)
          and (c.publication_preferences->'showGeneralLocation')='true'::jsonb
          and c.latitude is not null and c.longitude is not null
          and not (c.latitude=0.0 and c.longitude=0.0)
          and c.latitude between -90.0 and 90.0
          and c.longitude between -180.0 and 180.0;
      end if;

      v_needed := (v_limit + 1) - cardinality(v_candidate_ids);

      select coalesce(array_agg(q.id order by q.created_at desc,q.id desc),'{}'::text[])
      into v_fallback_ids
      from (
        select c.id,c.published_at as created_at
        from public.complaints c
        where c.status='published'
          and (
            v_clean_district='all'
            or (
              (c.publication_preferences->'showGeneralLocation')='true'::jsonb
              and lower(c.district)=v_clean_district
            )
          )
          and not (
            (c.publication_preferences->'showGeneralLocation')='true'::jsonb
            and c.latitude is not null and c.longitude is not null
            and not (c.latitude=0.0 and c.longitude=0.0)
            and c.latitude between -90.0 and 90.0
            and c.longitude between -180.0 and 180.0
          )
        order by c.published_at desc,c.id desc
        offset greatest(v_offset-v_geo_count,0)
        limit v_needed
      ) q;

      v_candidate_ids := v_candidate_ids || coalesce(v_fallback_ids,'{}'::text[]);
    end if;

  elsif v_filter in ('all','latest') and not v_has_visitor_loc then
    select coalesce(
      array_agg(q.id order by q.created_at desc,q.id desc),
      '{}'::text[]
    )
    into v_candidate_ids
    from (
      select c.id,c.published_at as created_at
      from public.complaints c
      where c.status='published'
        and (
          v_clean_district='all'
          or (
            (c.publication_preferences->'showGeneralLocation')='true'::jsonb
            and lower(c.district)=v_clean_district
          )
        )
      order by c.published_at desc,c.id desc
      offset v_offset
      limit v_limit + 1
    ) q;

  elsif v_filter='latest' and v_has_visitor_loc then
    select coalesce(
      array_agg(
        q.id
        order by q.created_at desc,q.geo_distance asc nulls last,q.id desc
      ),
      '{}'::text[]
    )
    into v_candidate_ids
    from (
      select
        c.id,
        c.published_at as created_at,
        case
          when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
           and c.latitude is not null
           and c.longitude is not null
           and not (c.latitude=0.0 and c.longitude=0.0)
           and c.latitude between -90.0 and 90.0
           and c.longitude between -180.0 and 180.0
          then extensions.st_distance(
            extensions.st_setsrid(
              extensions.st_makepoint(c.longitude,c.latitude),
              4326
            )::extensions.geography,
            v_query_geog,
            false
          )
          else null
        end as geo_distance
      from public.complaints c
      where c.status='published'
        and (
          v_clean_district='all'
          or (
            (c.publication_preferences->'showGeneralLocation')='true'::jsonb
            and lower(c.district)=v_clean_district
          )
        )
      order by
        c.published_at desc,
        case
          when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
           and c.latitude is not null
           and c.longitude is not null
           and not (c.latitude=0.0 and c.longitude=0.0)
           and c.latitude between -90.0 and 90.0
           and c.longitude between -180.0 and 180.0
          then extensions.st_distance(
            extensions.st_setsrid(
              extensions.st_makepoint(c.longitude,c.latitude),
              4326
            )::extensions.geography,
            v_query_geog,
            false
          )
          else null
        end asc nulls last,
        c.id desc
      offset v_offset
      limit v_limit + 1
    ) q;

  elsif v_filter='popular' and not v_has_visitor_loc then
    select coalesce(
      array_agg(
        q.id
        order by
          q.views desc,
          q.shares desc,
          q.published_second desc,
          q.created_at desc,
          q.id desc
      ),
      '{}'::text[]
    )
    into v_candidate_ids
    from (
      select
        c.id,
        c.published_at as created_at,
        c.public_view_count as views,
        c.public_share_count as shares,
        date_trunc('second',c.published_at at time zone 'UTC') as published_second
      from public.complaints c
      where c.status='published'
        and (
          v_clean_district='all'
          or (
            (c.publication_preferences->'showGeneralLocation')='true'::jsonb
            and lower(c.district)=v_clean_district
          )
        )
      order by
        c.public_view_count desc,
        c.public_share_count desc,
        date_trunc('second',c.published_at at time zone 'UTC') desc,
        c.published_at desc,
        c.id desc
      offset v_offset
      limit v_limit + 1
    ) q;

  elsif v_filter='popular' and v_has_visitor_loc then
    select coalesce(
      array_agg(
        q.id
        order by
          q.views desc,
          q.shares desc,
          q.published_second desc,
          q.geo_distance asc nulls last,
          q.created_at desc,
          q.id desc
      ),
      '{}'::text[]
    )
    into v_candidate_ids
    from (
      select
        c.id,
        c.published_at as created_at,
        c.public_view_count as views,
        c.public_share_count as shares,
        date_trunc('second',c.published_at at time zone 'UTC') as published_second,
        case
          when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
           and c.latitude is not null
           and c.longitude is not null
           and not (c.latitude=0.0 and c.longitude=0.0)
           and c.latitude between -90.0 and 90.0
           and c.longitude between -180.0 and 180.0
          then extensions.st_distance(
            extensions.st_setsrid(
              extensions.st_makepoint(c.longitude,c.latitude),
              4326
            )::extensions.geography,
            v_query_geog,
            false
          )
          else null
        end as geo_distance
      from public.complaints c
      where c.status='published'
        and (
          v_clean_district='all'
          or (
            (c.publication_preferences->'showGeneralLocation')='true'::jsonb
            and lower(c.district)=v_clean_district
          )
        )
      order by
        c.public_view_count desc,
        c.public_share_count desc,
        date_trunc('second',c.published_at at time zone 'UTC') desc,
        case
          when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
           and c.latitude is not null
           and c.longitude is not null
           and not (c.latitude=0.0 and c.longitude=0.0)
           and c.latitude between -90.0 and 90.0
           and c.longitude between -180.0 and 180.0
          then extensions.st_distance(
            extensions.st_setsrid(
              extensions.st_makepoint(c.longitude,c.latitude),
              4326
            )::extensions.geography,
            v_query_geog,
            false
          )
          else null
        end asc nulls last,
        c.published_at desc,
        c.id desc
      offset v_offset
      limit v_limit + 1
    ) q;

  elsif v_filter='most_shared' and not v_has_visitor_loc then
    select coalesce(
      array_agg(
        q.id
        order by
          q.shares desc,
          q.views desc,
          q.created_at desc,
          q.id desc
      ),
      '{}'::text[]
    )
    into v_candidate_ids
    from (
      select
        c.id,
        c.published_at as created_at,
        c.public_share_count as shares,
        c.public_view_count as views
      from public.complaints c
      where c.status='published'
        and (
          v_clean_district='all'
          or (
            (c.publication_preferences->'showGeneralLocation')='true'::jsonb
            and lower(c.district)=v_clean_district
          )
        )
      order by
        c.public_share_count desc,
        c.public_view_count desc,
        c.published_at desc,
        c.id desc
      offset v_offset
      limit v_limit + 1
    ) q;

  else
    select coalesce(
      array_agg(
        q.id
        order by
          q.shares desc,
          q.views desc,
          q.geo_distance asc nulls last,
          q.created_at desc,
          q.id desc
      ),
      '{}'::text[]
    )
    into v_candidate_ids
    from (
      select
        c.id,
        c.published_at as created_at,
        c.public_share_count as shares,
        c.public_view_count as views,
        case
          when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
           and c.latitude is not null
           and c.longitude is not null
           and not (c.latitude=0.0 and c.longitude=0.0)
           and c.latitude between -90.0 and 90.0
           and c.longitude between -180.0 and 180.0
          then extensions.st_distance(
            extensions.st_setsrid(
              extensions.st_makepoint(c.longitude,c.latitude),
              4326
            )::extensions.geography,
            v_query_geog,
            false
          )
          else null
        end as geo_distance
      from public.complaints c
      where c.status='published'
        and (
          v_clean_district='all'
          or (
            (c.publication_preferences->'showGeneralLocation')='true'::jsonb
            and lower(c.district)=v_clean_district
          )
        )
      order by
        c.public_share_count desc,
        c.public_view_count desc,
        case
          when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
           and c.latitude is not null
           and c.longitude is not null
           and not (c.latitude=0.0 and c.longitude=0.0)
           and c.latitude between -90.0 and 90.0
           and c.longitude between -180.0 and 180.0
          then extensions.st_distance(
            extensions.st_setsrid(
              extensions.st_makepoint(c.longitude,c.latitude),
              4326
            )::extensions.geography,
            v_query_geog,
            false
          )
          else null
        end asc nulls last,
        c.published_at desc,
        c.id desc
      offset v_offset
      limit v_limit + 1
    ) q;
  end if;

  v_has_more := coalesce(cardinality(v_candidate_ids),0) > v_limit;

  if v_has_more then
    v_page_ids := v_candidate_ids[1:v_limit];
  else
    v_page_ids := coalesce(v_candidate_ids,'{}'::text[]);
  end if;

  with selected_ids as (
    select s.id,s.ordinality
    from unnest(v_page_ids) with ordinality as s(id,ordinality)
  ),
  base_complaints as (
    select
      s.ordinality,
      c.id,
      c.segment_id,
      c.subcategory_id,
      c.origin_type,
      case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else coalesce(
        nullif(trim(c.publication_preferences->>'publicTitleBn'),''),
        c.title
      ) end as title_bn,
      case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(
        nullif(trim(c.publication_preferences->>'publicTitleEn'),''),
        nullif(trim(c.title_en),''),
        nullif(trim(c.publication_preferences->>'publicTitleBn'),''),
        c.title
      ) end as title_en,
      case
        when (c.publication_preferences->'showDescription')='true'::jsonb
        then case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else coalesce(
          nullif(trim(c.publication_preferences->>'publicSummaryBn'),''),
          c.description
        ) end
        else null
      end as summary_bn,
      case
        when (c.publication_preferences->'showDescription')='true'::jsonb
        then case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(
          nullif(trim(c.publication_preferences->>'publicSummaryEn'),''),
          nullif(trim(c.description_en),''),
          nullif(trim(c.publication_preferences->>'publicSummaryBn'),''),
          c.description
        ) end
        else null
      end as summary_en,
      case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else case
        when (c.publication_preferences->'showDescription')='true'::jsonb
        then c.description
        else null
      end end as description_bn,
      case
        when (c.publication_preferences->'showDescription')='true'::jsonb
        then case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(nullif(trim(c.description_en),''),c.description) end
        else null
      end as description_en,
      case
        when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        then c.district
        else null
      end as district,
      case
        when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        then coalesce(
          loc_d.name_bn,
          case when public.location_text_language(c.district)='bn' then c.district end
        )
        else null
      end as district_bn,
      case
        when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        then coalesce(
          loc_d.name_en,
          case when public.location_text_language(c.district)='en' then c.district end
        )
        else null
      end as district_en,
      case
        when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        then c.area
        else null
      end as area,
      case
        when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        then public.compose_public_area(c.area,loc_u.name_bn,loc_d.name_bn,'bn')
        else null
      end as area_bn,
      case
        when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        then public.compose_public_area(c.area,loc_u.name_en,loc_d.name_en,'en')
        else null
      end as area_en,
      case
        when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        then coalesce(
          c.formatted_address,
          c.road,
          c.area,
          c.landmark,
          c.upazila_or_thana,
          c.district
        )
        else null
      end as location_display,
      case
        when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        then public.compose_public_location(
          c.formatted_address,
          c.road,
          c.area,
          c.landmark,
          loc_u.name_bn,
          loc_d.name_bn,
          'bn'
        )
        else null
      end as location_bn,
      case
        when (c.publication_preferences->'showGeneralLocation')='true'::jsonb
        then public.compose_public_location(
          c.formatted_address,
          c.road,
          c.area,
          c.landmark,
          loc_u.name_en,
          loc_d.name_en,
          'en'
        )
        else null
      end as location_en,
      c.incident_date,
      c.affected_person_age_group,
      c.alleged_abuser_relationship,
      c.reporting_for,
      c.incident_time,
      c.published_at as created_at,
      c.updated_at as updated_at,
      c.has_supporting_info,
      c.status,
      c.public_view_count,
      c.public_share_count,
      c.recent_bill_month,
      c.recent_bill_amount,
      c.previous_bill_month,
      c.previous_bill_amount,
      c.utility_end_time,
      case
        when (c.publication_preferences->'showSubjectName')='true'::jsonb
        then party.name
        else null
      end as party_name,
      case
        when (c.publication_preferences->'showOrganization')='true'::jsonb
        then party.organization
        else null
      end as party_org,
      sc.name_bn as subcategory_bn,
      sc.name_en as subcategory_en
    from selected_ids s
    join public.complaints c on c.id=s.id
    left join public.subcategories sc on sc.id=c.subcategory_id
    left join public.bangladesh_districts loc_d
      on loc_d.name_en=c.district
    left join public.bangladesh_upazilas loc_u
      on loc_u.district_id=loc_d.id
     and loc_u.name_en=c.upazila_or_thana
    left join lateral (
      select
        case when count(*)=1
          then max(nullif(trim(cp.name),''))
          else null
        end as name,
        case when count(*)=1
          then max(nullif(trim(cp.organization),''))
          else null
        end as organization
      from public.complaint_parties cp
      where cp.complaint_id=c.id
        and (
          nullif(trim(cp.name),'') is not null
          or nullif(trim(cp.organization),'') is not null
          or nullif(trim(cp.role_or_designation),'') is not null
          or nullif(trim(cp.phone_or_contact),'') is not null
          or nullif(trim(cp.public_profile_handle),'') is not null
          or nullif(trim(cp.identifying_description),'') is not null
          or nullif(trim(cp.address),'') is not null
          or trim(coalesce(cp.party_type,'')) in (
            'individual','business','group','organization'
          )
        )
    ) party on true
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',bc.id,
        'segment',bc.segment_id,
        'subcategoryId',bc.subcategory_id,
        'postOrigin',case when bc.origin_type='sourced_report' then 'admin' else 'user' end,
        'subcategoryBn',coalesce(bc.subcategory_bn,bc.subcategory_id),
        'subcategoryEn',coalesce(bc.subcategory_en,bc.subcategory_id),
        'titleBn',bc.title_bn,
        'titleEn',bc.title_en,
        'summaryBn',bc.summary_bn,
        'summaryEn',bc.summary_en,
        'descriptionBn',bc.description_bn,
        'descriptionEn',bc.description_en,
        'reportedSubject',bc.party_name,
        'organization',bc.party_org,
        'district',bc.district,
        'districtBn',bc.district_bn,
        'districtEn',bc.district_en,
        'area',bc.area,
        'areaBn',bc.area_bn,
        'areaEn',bc.area_en,
        'location',coalesce(bc.location_en,bc.location_bn,bc.location_display),
        'locationBn',bc.location_bn,
        'locationEn',bc.location_en,
        'incidentDate',to_char(bc.incident_date,'YYYY-MM-DD'),
        'affectedPersonAgeGroup',bc.affected_person_age_group,
        'allegedAbuserRelationship',bc.alleged_abuser_relationship,
        'reportingFor',bc.reporting_for,
        'incidentTime',
          case
            when bc.segment_id='load_shedding'
             and bc.subcategory_id in ('load-shedding-outage','gas-shortage')
            then bc.incident_time
            else null
          end,
        'incident_time',
          case
            when bc.segment_id='load_shedding'
             and bc.subcategory_id in ('load-shedding-outage','gas-shortage')
            then bc.incident_time
            else null
          end,
        'publishedAt',
          to_char(
            bc.created_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"'
          ),
        'updatedAt', to_char(bc.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'priority','medium',
        'hasSupportingInfo',bc.has_supporting_info,
        'status',bc.status,
        'viewCount',bc.public_view_count,
        'shareCount',bc.public_share_count,
        'recentBillMonth',bc.recent_bill_month,
        'recentBillAmount',bc.recent_bill_amount,
        'previousBillMonth',bc.previous_bill_month,
        'previousBillAmount',bc.previous_bill_amount,
        'recent_bill_month',bc.recent_bill_month,
        'recent_bill_amount',bc.recent_bill_amount,
        'previous_bill_month',bc.previous_bill_month,
        'previous_bill_amount',bc.previous_bill_amount,
        'utilityEndTime',
          case
            when bc.segment_id='load_shedding'
             and bc.subcategory_id in ('load-shedding-outage','gas-shortage')
            then bc.utility_end_time
            else null
          end,
        'utility_end_time',
          case
            when bc.segment_id='load_shedding'
             and bc.subcategory_id in ('load-shedding-outage','gas-shortage')
            then bc.utility_end_time
            else null
          end
      )
      order by bc.ordinality
    ),
    '[]'::jsonb
  )
  into v_items
  from base_complaints bc;

  return jsonb_build_object(
    'items',v_items,
    'hasMore',v_has_more,
    'nextOffset',
      case when v_has_more then v_offset+v_limit else null end,
    'offset',v_offset,
    'limit',v_limit,
    'totalCount',v_total_count
  );
end;
$function$
REVOKE ALL ON FUNCTION public.get_public_home_feed_page(p_visitor_lat double precision, p_visitor_lng double precision, p_filter text, p_district text, p_offset integer, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_home_feed_page(p_visitor_lat double precision, p_visitor_lng double precision, p_filter text, p_district text, p_offset integer, p_limit integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_home_feed_page(p_visitor_lat double precision, p_visitor_lng double precision, p_filter text, p_district text, p_offset integer, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_home_feed_page(p_visitor_lat double precision, p_visitor_lng double precision, p_filter text, p_district text, p_offset integer, p_limit integer) TO service_role;

-- public.get_public_home_feed_with_engagement(p_visitor_lat double precision, p_visitor_lng double precision, p_filter text, p_district text)
CREATE OR REPLACE FUNCTION public.get_public_home_feed_with_engagement(p_visitor_lat double precision DEFAULT NULL::double precision, p_visitor_lng double precision DEFAULT NULL::double precision, p_filter text DEFAULT 'all'::text, p_district text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with params as (
    select case when lower(coalesce(nullif(btrim(p_filter), ''), 'all')) in ('popular', 'most_shared') then lower(coalesce(nullif(btrim(p_filter), ''), 'all')) when lower(coalesce(nullif(btrim(p_filter), ''), 'all')) = 'latest' then 'latest' else 'all' end as requested_filter
  ),
  base as (
    select public.get_public_home_feed(p_visitor_lat, p_visitor_lng, case when params.requested_filter in ('popular', 'most_shared') then 'all' else params.requested_filter end, p_district) as payload, params.requested_filter from params
  ),
  items as (
    select x.item, x.ordinality, base.requested_filter, coalesce(c.public_view_count, 0) as view_count, coalesce(c.public_share_count, 0) as share_count
    from base
    cross join lateral jsonb_array_elements(coalesce(base.payload, '[]'::jsonb)) with ordinality as x(item, ordinality)
    left join public.complaints c on c.id = x.item ->> 'id' and c.status = 'published'
  )
  select coalesce(jsonb_agg(items.item || jsonb_build_object('viewCount', items.view_count, 'shareCount', items.share_count) order by case when items.requested_filter = 'popular' then items.view_count end desc nulls last, case when items.requested_filter = 'popular' then items.share_count end desc nulls last, case when items.requested_filter = 'most_shared' then items.share_count end desc nulls last, case when items.requested_filter = 'most_shared' then items.view_count end desc nulls last, items.ordinality), '[]'::jsonb)
  from items;
$function$
REVOKE ALL ON FUNCTION public.get_public_home_feed_with_engagement(p_visitor_lat double precision, p_visitor_lng double precision, p_filter text, p_district text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_home_feed_with_engagement(p_visitor_lat double precision, p_visitor_lng double precision, p_filter text, p_district text) TO service_role;

-- public.get_public_published_report_with_engagement(p_report_id text)
CREATE OR REPLACE FUNCTION public.get_public_published_report_with_engagement(p_report_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with base as (select public.get_public_published_report(p_report_id) as payload)
  select case when base.payload is null or jsonb_typeof(base.payload) <> 'object' then base.payload else base.payload || jsonb_build_object('viewCount', coalesce(c.public_view_count, 0), 'shareCount', coalesce(c.public_share_count, 0)) end
  from base
  left join public.complaints c on c.id = base.payload ->> 'id' and c.status = 'published';
$function$
REVOKE ALL ON FUNCTION public.get_public_published_report_with_engagement(p_report_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_published_report_with_engagement(p_report_id text) TO service_role;

-- public.get_public_published_reports_with_engagement()
CREATE OR REPLACE FUNCTION public.get_public_published_reports_with_engagement()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with base as (select public.get_public_published_reports() as payload),
  items as (select x.item, x.ordinality from base cross join lateral jsonb_array_elements(coalesce(base.payload, '[]'::jsonb)) with ordinality as x(item, ordinality))
  select coalesce(jsonb_agg(items.item || jsonb_build_object('viewCount', coalesce(c.public_view_count, 0), 'shareCount', coalesce(c.public_share_count, 0)) order by items.ordinality), '[]'::jsonb)
  from items
  left join public.complaints c on c.id = items.item ->> 'id' and c.status = 'published';
$function$
REVOKE ALL ON FUNCTION public.get_public_published_reports_with_engagement() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_published_reports_with_engagement() TO service_role;

-- public.get_public_report_configured_fields(p_report_id text)
CREATE OR REPLACE FUNCTION public.get_public_report_configured_fields(p_report_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with complaint as (
    select
      c.id,
      c.subcategory_id,
      c.form_schema_version,
      c.custom_field_answers
    from public.complaints c
    where c.id = p_report_id
      and c.status = 'published'
    limit 1
  ),
  schema_match as (
    select rfs.id
    from complaint c
    join public.reporting_form_schemas rfs
      on rfs.scope_type = 'subcategory'
     and rfs.scope_id = c.subcategory_id
     and rfs.version = c.form_schema_version
    order by case rfs.status when 'published' then 0 else 1 end
    limit 1
  )
  select jsonb_build_object(
    'fields',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'fieldKey', f.field_key,
            'labelEn', f.label_en,
            'labelBn', f.label_bn,
            'fieldType', f.field_type,
            'sortOrder', f.sort_order,
            'options', f.options,
            'value', c.custom_field_answers -> f.storage_key
          )
          order by f.sort_order, f.field_key
        )
        from complaint c
        cross join schema_match s
        join public.reporting_form_schema_fields f
          on f.schema_id = s.id
        where f.active = true
          and f.storage_mode = 'custom_json'
          and f.field_type not in ('phone', 'email')
          and coalesce((f.config ->> 'publicVisible')::boolean, true) = true
          and c.custom_field_answers ? f.storage_key
      ),
      '[]'::jsonb
    )
  );
$function$
REVOKE ALL ON FUNCTION public.get_public_report_configured_fields(p_report_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_report_configured_fields(p_report_id text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_report_configured_fields(p_report_id text) TO authenticated;

-- public.get_public_report_engagement_counts()
CREATE OR REPLACE FUNCTION public.get_public_report_engagement_counts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'viewCount', c.public_view_count, 'shareCount', c.public_share_count) order by c.created_at desc, c.id desc), '[]'::jsonb)
  from public.complaints as c
  where c.status = 'published';
$function$
REVOKE ALL ON FUNCTION public.get_public_report_engagement_counts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_report_engagement_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_report_engagement_counts() TO authenticated;

-- public.get_public_report_origins(p_report_ids text[])
CREATE OR REPLACE FUNCTION public.get_public_report_origins(p_report_ids text[] DEFAULT ARRAY[]::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT COALESCE(
    jsonb_object_agg(
      upper(c.id),
      CASE WHEN c.origin_type = 'sourced_report' THEN 'admin' ELSE 'user' END
    ),
    '{}'::jsonb
  )
  FROM public.complaints c
  WHERE c.status = 'published'
    AND EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p_report_ids, ARRAY[]::text[])) AS requested_id
      WHERE upper(btrim(requested_id)) = upper(c.id)
    );
$function$
REVOKE ALL ON FUNCTION public.get_public_report_origins(p_report_ids text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_report_origins(p_report_ids text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_report_origins(p_report_ids text[]) TO authenticated;

-- public.get_public_report_sources(p_report_id text)
CREATE OR REPLACE FUNCTION public.get_public_report_sources(p_report_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_result jsonb;
  v_clean_id text := upper(trim(coalesce(p_report_id,'')));
begin
  if v_clean_id = '' then return '[]'::jsonb; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'publisherName', s.publisher_name,
        'sourceTitle', s.source_title,
        'sourceType', s.source_type,
        'canonicalUrl', s.canonical_url,
        'sourcePublishedDate', to_char(s.source_published_date,'YYYY-MM-DD'),
        'verifiedAt', to_char(s.verified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'sourceVersion', s.source_version
      )
      order by s.source_published_date desc nulls last, s.created_at
    ),
    '[]'::jsonb
  )
  into v_result
  from public.complaint_sources s
  join public.complaints c on c.id=s.complaint_id
  where upper(c.id)=v_clean_id
    and c.status='published'
    and s.verification_status='verified'
    and s.is_final_detail_page=true
    and s.verified_at is not null;

  return v_result;
end;
$function$
REVOKE ALL ON FUNCTION public.get_public_report_sources(p_report_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_report_sources(p_report_id text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_report_sources(p_report_id text) TO authenticated;

-- public.get_public_reporting_configuration()
CREATE OR REPLACE FUNCTION public.get_public_reporting_configuration()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_segments jsonb;
  v_subcategories jsonb;
  v_forms jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'slug',s.slug,'nameEn',s.name_en,'nameBn',s.name_bn,
    'shortNameEn',coalesce(s.short_name_en,s.name_en),
    'shortNameBn',coalesce(s.short_name_bn,s.name_bn),
    'descriptionEn',coalesce(s.description_en,''),
    'descriptionBn',coalesce(s.description_bn,''),
    'iconKey',coalesce(s.icon_key,'shield'),
    'themeKey',coalesce(s.theme_key,'sky'),
    'sortOrder',s.sort_order
  ) order by s.sort_order,s.id),'[]'::jsonb)
  into v_segments
  from public.segments s
  where s.active=true and s.config_status='published';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',sc.id,'segmentId',sc.segment_id,'nameEn',sc.name_en,'nameBn',sc.name_bn,
    'descriptionEn',coalesce(sc.description_en,''),
    'descriptionBn',coalesce(sc.description_bn,''),
    'categoryGroup',sc.category_group,'isSensitive',sc.is_sensitive,
    'sortOrder',sc.sort_order
  ) order by sc.segment_id,sc.sort_order,sc.id),'[]'::jsonb)
  into v_subcategories
  from public.subcategories sc
  join public.segments s on s.id=sc.segment_id
  where sc.active=true and sc.config_status='published'
    and s.active=true and s.config_status='published';

  select coalesce(jsonb_agg(jsonb_build_object(
    'subcategoryId',rfs.scope_id,
    'schemaId',rfs.id,
    'version',rfs.version,
    'engineMode',rfs.engine_mode,
    'fields',coalesce((
      select jsonb_agg(jsonb_build_object(
        'fieldKey',f.field_key,'fieldType',f.field_type,'storageMode',f.storage_mode,
        'storageKey',f.storage_key,'labelEn',f.label_en,'labelBn',f.label_bn,
        'helperEn',f.helper_en,'helperBn',f.helper_bn,
        'placeholderEn',f.placeholder_en,'placeholderBn',f.placeholder_bn,
        'required',f.required,'active',f.active,'sortOrder',f.sort_order,
        'options',f.options,'validation',f.validation,'config',f.config
      ) order by f.sort_order,f.field_key)
      from public.reporting_form_schema_fields f
      where f.schema_id=rfs.id and f.active=true
    ),'[]'::jsonb)
  ) order by rfs.scope_id),'[]'::jsonb)
  into v_forms
  from public.reporting_form_schemas rfs
  join public.subcategories sc on sc.id=rfs.scope_id
  join public.segments s on s.id=sc.segment_id
  where rfs.scope_type='subcategory' and rfs.status='published'
    and sc.active=true and sc.config_status='published'
    and s.active=true and s.config_status='published';

  return jsonb_build_object(
    'segments',v_segments,
    'subcategories',v_subcategories,
    'forms',v_forms
  );
end;
$function$
REVOKE ALL ON FUNCTION public.get_public_reporting_configuration() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_reporting_configuration() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_reporting_configuration() TO authenticated;

-- public.get_public_segment_feed(p_segment text, p_visitor_lat double precision, p_visitor_lng double precision)
CREATE OR REPLACE FUNCTION public.get_public_segment_feed(p_segment text, p_visitor_lat double precision DEFAULT NULL::double precision, p_visitor_lng double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_segment text := trim(coalesce(p_segment, ''));
  v_has_visitor_loc boolean := false;
  v_source jsonb;
  v_result jsonb;
begin
  if v_segment = '' then
    return '[]'::jsonb;
  end if;

  if p_visitor_lat is not null and p_visitor_lng is not null
     and p_visitor_lat >= -90.0 and p_visitor_lat <= 90.0
     and p_visitor_lng >= -180.0 and p_visitor_lng <= 180.0
     and not (p_visitor_lat = 0.0 and p_visitor_lng = 0.0) then
    v_has_visitor_loc := true;
  end if;

  -- Preserve the exact current category behavior:
  -- location-aware categories use the ranked Home feed; otherwise the
  -- chronological published-report contract remains authoritative.
  if v_has_visitor_loc then
    v_source := public.get_public_home_feed(
      p_visitor_lat,
      p_visitor_lng,
      'all',
      'all'
    );
  else
    v_source := public.get_public_published_reports();
  end if;

  select coalesce(jsonb_agg(elem order by ordinality), '[]'::jsonb)
  into v_result
  from jsonb_array_elements(coalesce(v_source, '[]'::jsonb))
    with ordinality as t(elem, ordinality)
  where elem->>'segment' = v_segment;

  return v_result;
end;
$function$
REVOKE ALL ON FUNCTION public.get_public_segment_feed(p_segment text, p_visitor_lat double precision, p_visitor_lng double precision) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_segment_feed(p_segment text, p_visitor_lat double precision, p_visitor_lng double precision) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_segment_feed(p_segment text, p_visitor_lat double precision, p_visitor_lng double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_segment_feed(p_segment text, p_visitor_lat double precision, p_visitor_lng double precision) TO service_role;

-- public.get_public_sexual_harassment_context(p_report_id text)
CREATE OR REPLACE FUNCTION public.get_public_sexual_harassment_context(p_report_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_result jsonb;
begin
  select jsonb_strip_nulls(jsonb_build_object(
    'sexualHarassmentType', c.sexual_harassment_type,
    'sexualHarassmentContext', c.sexual_harassment_context,
    'sexualHarassmentInstitution', c.sexual_harassment_institution,
    'frequency', c.frequency,
    'affectedPersonAgeGroup', c.affected_person_age_group,
    'allegedAbuserRelationship', c.alleged_abuser_relationship,
    'reportingFor', c.reporting_for
  ))
  into v_result
  from public.complaints c
  where upper(c.id)=upper(trim(coalesce(p_report_id,'')))
    and c.status='published'
    and c.segment_id='harassment'
    and c.subcategory_id='sexual-harassment';

  return coalesce(v_result,'{}'::jsonb);
end;
$function$
REVOKE ALL ON FUNCTION public.get_public_sexual_harassment_context(p_report_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_sexual_harassment_context(p_report_id text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_sexual_harassment_context(p_report_id text) TO authenticated;

-- public.is_public_published_evidence(p_storage_path text)
CREATE OR REPLACE FUNCTION public.is_public_published_evidence(p_storage_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.complaint_evidence e
    JOIN public.complaints c
      ON c.id = e.complaint_id
    WHERE e.storage_path = p_storage_path
      AND c.status = 'published'
  );
$function$
REVOKE ALL ON FUNCTION public.is_public_published_evidence(p_storage_path text) FROM PUBLIC, anon, authenticated, service_role;

-- public.localize_district_name(p_value text, p_lang text)
CREATE OR REPLACE FUNCTION public.localize_district_name(p_value text, p_lang text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case lower(coalesce(p_lang,'en')) when 'bn' then d.name_bn else d.name_en end
  from public.bangladesh_districts d
  where d.name_en=public.canonical_district_name(p_value)
  limit 1
$function$
REVOKE ALL ON FUNCTION public.localize_district_name(p_value text, p_lang text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.localize_district_name(p_value text, p_lang text) TO anon;
GRANT EXECUTE ON FUNCTION public.localize_district_name(p_value text, p_lang text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.localize_district_name(p_value text, p_lang text) TO service_role;

-- public.localize_division_name(p_value text, p_lang text)
CREATE OR REPLACE FUNCTION public.localize_division_name(p_value text, p_lang text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case lower(coalesce(p_lang,'en')) when 'bn' then d.name_bn else d.name_en end
  from public.bangladesh_divisions d
  where d.name_en=public.canonical_division_name(p_value)
  limit 1
$function$
REVOKE ALL ON FUNCTION public.localize_division_name(p_value text, p_lang text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.localize_division_name(p_value text, p_lang text) TO anon;
GRANT EXECUTE ON FUNCTION public.localize_division_name(p_value text, p_lang text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.localize_division_name(p_value text, p_lang text) TO service_role;

-- public.localize_upazila_name(p_value text, p_district text, p_lang text)
CREATE OR REPLACE FUNCTION public.localize_upazila_name(p_value text, p_district text, p_lang text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case lower(coalesce(p_lang,'en')) when 'bn' then u.name_bn else u.name_en end
  from public.bangladesh_upazilas u
  join public.bangladesh_districts d on d.id=u.district_id
  where u.name_en=public.canonical_upazila_name(p_value,p_district)
    and (public.canonical_district_id(p_district) is null or d.id=public.canonical_district_id(p_district))
  limit 1
$function$
REVOKE ALL ON FUNCTION public.localize_upazila_name(p_value text, p_district text, p_lang text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.localize_upazila_name(p_value text, p_district text, p_lang text) TO anon;
GRANT EXECUTE ON FUNCTION public.localize_upazila_name(p_value text, p_district text, p_lang text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.localize_upazila_name(p_value text, p_district text, p_lang text) TO service_role;

-- public.location_district_matches(p_stored text, p_requested text)
CREATE OR REPLACE FUNCTION public.location_district_matches(p_stored text, p_requested text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_req text:=lower(btrim(coalesce(p_requested,'all')));
  v_stored_id text;
  v_req_id text;
begin
  if v_req='' or v_req='all' then return true; end if;
  v_stored_id:=public.canonical_district_id(p_stored);
  v_req_id:=public.canonical_district_id(p_requested);
  if v_stored_id is not null and v_req_id is not null then
    return v_stored_id=v_req_id;
  end if;
  return lower(btrim(coalesce(p_stored,'')))=v_req
    or lower(btrim(coalesce(p_stored,''))) like '%'||v_req||'%';
end
$function$
REVOKE ALL ON FUNCTION public.location_district_matches(p_stored text, p_requested text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.location_district_matches(p_stored text, p_requested text) TO anon;
GRANT EXECUTE ON FUNCTION public.location_district_matches(p_stored text, p_requested text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.location_district_matches(p_stored text, p_requested text) TO service_role;

-- public.rls_auto_enable()
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;

-- public.sanitize_audit_details(p_val jsonb)
CREATE OR REPLACE FUNCTION public.sanitize_audit_details(p_val jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_type text;
    v_result jsonb;
BEGIN
    IF p_val IS NULL THEN
        RETURN NULL;
    END IF;

    v_type := jsonb_typeof(p_val);

    IF v_type = 'object' THEN
        SELECT COALESCE(
            jsonb_object_agg(
                key,
                public.sanitize_audit_details(value)
            ),
            '{}'::jsonb
        )
        INTO v_result
        FROM jsonb_each(p_val)
        WHERE NOT (
            key ~* '(password|token|secret|credential|api_key|auth_key|private_key|hash|evidence_url|signed_url|access_token|refresh_token)'
        );

        RETURN v_result;

    ELSIF v_type = 'array' THEN
        SELECT COALESCE(
            jsonb_agg(
                public.sanitize_audit_details(value)
            ),
            '[]'::jsonb
        )
        INTO v_result
        FROM jsonb_array_elements(p_val);

        RETURN v_result;

    ELSE
        RETURN p_val;
    END IF;
END;
$function$
REVOKE ALL ON FUNCTION public.sanitize_audit_details(p_val jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- public.track_public_report_share(p_report_id text)
CREATE OR REPLACE FUNCTION public.track_public_report_share(p_report_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_id text := upper(btrim(coalesce(p_report_id, '')));
  v_view_count bigint;
  v_share_count bigint;
begin
  if not exists (
    select 1 from public.complaints c
    where upper(c.id) = v_id and c.status = 'published'
  ) then
    return null;
  end if;

  perform private.enforce_public_rate_limit(
    'engagement_share', null, 120, null, interval '1 hour'
  );

  if private.claim_public_engagement_slot('share', v_id, null, interval '10 minutes') then
    return public.track_public_report_share_internal(v_id);
  end if;

  select c.public_view_count, c.public_share_count
  into v_view_count, v_share_count
  from public.complaints c
  where upper(c.id) = v_id and c.status = 'published';

  return jsonb_build_object(
    'viewCount', coalesce(v_view_count, 0),
    'shareCount', coalesce(v_share_count, 0)
  );
end;
$function$
REVOKE ALL ON FUNCTION public.track_public_report_share(p_report_id text) FROM PUBLIC, anon, authenticated, service_role;

-- public.track_public_report_share_internal(p_report_id text)
CREATE OR REPLACE FUNCTION public.track_public_report_share_internal(p_report_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_view_count bigint;
  v_share_count bigint;
begin
  update public.complaints as c
  set public_share_count = c.public_share_count + 1
  where upper(c.id) = upper(nullif(btrim(p_report_id), ''))
    and c.status = 'published'
  returning c.public_view_count, c.public_share_count
    into v_view_count, v_share_count;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'viewCount', v_view_count,
    'shareCount', v_share_count
  );
end;
$function$
REVOKE ALL ON FUNCTION public.track_public_report_share_internal(p_report_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.track_public_report_share_internal(p_report_id text) TO service_role;

-- public.track_public_report_share_v2(p_report_id text, p_visitor_id text)
CREATE OR REPLACE FUNCTION public.track_public_report_share_v2(p_report_id text, p_visitor_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_id text := upper(btrim(coalesce(p_report_id, '')));
  v_visitor text := nullif(btrim(coalesce(p_visitor_id, '')), '');
  v_view_count bigint;
  v_share_count bigint;
begin
  if not exists (
    select 1 from public.complaints c
    where upper(c.id) = v_id and c.status = 'published'
  ) then
    return null;
  end if;

  perform private.enforce_public_rate_limit(
    'engagement_share', v_visitor, 120, 40, interval '1 hour'
  );

  if private.claim_public_engagement_slot('share', v_id, v_visitor, interval '10 minutes') then
    return public.track_public_report_share_internal(v_id);
  end if;

  select c.public_view_count, c.public_share_count
  into v_view_count, v_share_count
  from public.complaints c
  where upper(c.id) = v_id and c.status = 'published';

  return jsonb_build_object(
    'viewCount', coalesce(v_view_count, 0),
    'shareCount', coalesce(v_share_count, 0)
  );
end;
$function$
REVOKE ALL ON FUNCTION public.track_public_report_share_v2(p_report_id text, p_visitor_id text) FROM PUBLIC, anon, authenticated, service_role;

-- public.track_public_report_view(p_report_id text)
CREATE OR REPLACE FUNCTION public.track_public_report_view(p_report_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_id text := upper(btrim(coalesce(p_report_id, '')));
  v_view_count bigint;
  v_share_count bigint;
begin
  if not exists (
    select 1 from public.complaints c
    where upper(c.id) = v_id and c.status = 'published'
  ) then
    return null;
  end if;

  perform private.enforce_public_rate_limit(
    'engagement_view', null, 300, null, interval '1 hour'
  );

  if private.claim_public_engagement_slot('view', v_id, null, interval '10 minutes') then
    return public.track_public_report_view_internal(v_id);
  end if;

  select c.public_view_count, c.public_share_count
  into v_view_count, v_share_count
  from public.complaints c
  where upper(c.id) = v_id and c.status = 'published';

  return jsonb_build_object(
    'viewCount', coalesce(v_view_count, 0),
    'shareCount', coalesce(v_share_count, 0)
  );
end;
$function$
REVOKE ALL ON FUNCTION public.track_public_report_view(p_report_id text) FROM PUBLIC, anon, authenticated, service_role;

-- public.track_public_report_view_internal(p_report_id text)
CREATE OR REPLACE FUNCTION public.track_public_report_view_internal(p_report_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_view_count bigint;
  v_share_count bigint;
begin
  update public.complaints as c
  set public_view_count = c.public_view_count + 1
  where upper(c.id) = upper(nullif(btrim(p_report_id), ''))
    and c.status = 'published'
  returning c.public_view_count, c.public_share_count
    into v_view_count, v_share_count;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'viewCount', v_view_count,
    'shareCount', v_share_count
  );
end;
$function$
REVOKE ALL ON FUNCTION public.track_public_report_view_internal(p_report_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.track_public_report_view_internal(p_report_id text) TO service_role;

-- public.track_public_report_view_v2(p_report_id text, p_visitor_id text)
CREATE OR REPLACE FUNCTION public.track_public_report_view_v2(p_report_id text, p_visitor_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_id text := upper(btrim(coalesce(p_report_id, '')));
  v_visitor text := nullif(btrim(coalesce(p_visitor_id, '')), '');
  v_view_count bigint;
  v_share_count bigint;
begin
  if not exists (
    select 1 from public.complaints c
    where upper(c.id) = v_id and c.status = 'published'
  ) then
    return null;
  end if;

  perform private.enforce_public_rate_limit(
    'engagement_view', v_visitor, 300, 120, interval '1 hour'
  );

  if private.claim_public_engagement_slot('view', v_id, v_visitor, interval '10 minutes') then
    return public.track_public_report_view_internal(v_id);
  end if;

  select c.public_view_count, c.public_share_count
  into v_view_count, v_share_count
  from public.complaints c
  where upper(c.id) = v_id and c.status = 'published';

  return jsonb_build_object(
    'viewCount', coalesce(v_view_count, 0),
    'shareCount', coalesce(v_share_count, 0)
  );
end;
$function$
REVOKE ALL ON FUNCTION public.track_public_report_view_v2(p_report_id text, p_visitor_id text) FROM PUBLIC, anon, authenticated, service_role;

-- public.validate_reporting_form_fields(p_fields jsonb)
CREATE OR REPLACE FUNCTION public.validate_reporting_form_fields(p_fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_field jsonb;
  v_key text;
  v_type text;
  v_storage_mode text;
  v_storage_key text;
  v_order integer;
  v_seen text[] := array[]::text[];
  v_has_title boolean := false;
  v_has_description boolean := false;
  v_platform_max integer;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    raise exception 'Form fields must be a JSON array.' using errcode='22023';
  end if;

  if jsonb_array_length(p_fields) > 60 then
    raise exception 'A form may contain at most 60 fields.' using errcode='22023';
  end if;

  for v_field in select * from jsonb_array_elements(p_fields)
  loop
    if jsonb_typeof(v_field) <> 'object' then
      raise exception 'Every form field must be a JSON object.' using errcode='22023';
    end if;

    v_key := lower(nullif(btrim(v_field->>'fieldKey'),''));
    v_type := lower(nullif(btrim(v_field->>'fieldType'),''));
    v_storage_mode := lower(nullif(btrim(v_field->>'storageMode'),''));
    v_storage_key := nullif(btrim(v_field->>'storageKey'),'');
    v_order := coalesce((v_field->>'sortOrder')::integer, 0);

    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{0,63}$' then
      raise exception 'Invalid field key: %', coalesce(v_key,'') using errcode='22023';
    end if;

    if v_key = any(v_seen) then
      raise exception 'Duplicate field key: %', v_key using errcode='22023';
    end if;
    v_seen := array_append(v_seen, v_key);

    if v_type not in (
      'text','textarea','number','currency','date','time','month',
      'select','radio','checkbox','multiselect','phone','email','url',
      'location','subject_party','evidence','privacy','mob_justice_details'
    ) then
      raise exception 'Unsupported field type: %', coalesce(v_type,'') using errcode='22023';
    end if;

    if v_storage_mode not in ('core_column','custom_json','system_block') then
      raise exception 'Unsupported storage mode: %', coalesce(v_storage_mode,'') using errcode='22023';
    end if;

    if v_storage_key is null then
      raise exception 'Storage key is required for field %', v_key using errcode='22023';
    end if;

    if nullif(btrim(v_field->>'labelEn'),'') is null
       or nullif(btrim(v_field->>'labelBn'),'') is null then
      raise exception 'English and Bangla labels are required for field %', v_key using errcode='22023';
    end if;

    if v_order < 1 or v_order > 999 then
      raise exception 'Sort order for field % must be between 1 and 999.', v_key using errcode='22023';
    end if;

    if coalesce(v_field->'options','[]'::jsonb) is not null
       and jsonb_typeof(coalesce(v_field->'options','[]'::jsonb)) <> 'array' then
      raise exception 'Options for field % must be an array.', v_key using errcode='22023';
    end if;

    if coalesce(v_field->'validation','{}'::jsonb) is not null
       and jsonb_typeof(coalesce(v_field->'validation','{}'::jsonb)) <> 'object' then
      raise exception 'Validation for field % must be an object.', v_key using errcode='22023';
    end if;

    if coalesce(v_field->'config','{}'::jsonb) is not null
       and jsonb_typeof(coalesce(v_field->'config','{}'::jsonb)) <> 'object' then
      raise exception 'Config for field % must be an object.', v_key using errcode='22023';
    end if;

    if v_type in ('select','radio','multiselect') then
      if jsonb_array_length(coalesce(v_field->'options','[]'::jsonb)) = 0 then
        raise exception 'Field % requires at least one option.', v_key using errcode='22023';
      end if;

      if not public.reporting_field_options_are_bilingual(v_field->'options') then
        raise exception 'Every option for field % requires a unique value plus English and Bangla labels.',
          v_key using errcode='22023';
      end if;
    end if;

    if v_storage_mode='core_column' and v_storage_key in ('title','description') then
      if v_type not in ('text','textarea') then
        raise exception 'Core field % must remain text-compatible.', v_storage_key using errcode='22023';
      end if;

      if not coalesce((v_field->>'active')::boolean,true)
         or not coalesce((v_field->>'required')::boolean,false) then
        raise exception 'Core field % must remain active and required.', v_storage_key using errcode='22023';
      end if;

      v_platform_max := case when v_storage_key='title' then 100 else 2000 end;
      if v_field->'validation' ? 'maxLength'
         and (v_field->'validation'->>'maxLength')::integer > v_platform_max then
        raise exception 'Core field % cannot exceed platform maximum %.', v_storage_key, v_platform_max
          using errcode='22023';
      end if;

      if v_storage_key='title' then
        v_has_title := true;
      else
        v_has_description := true;
      end if;
    end if;
  end loop;

  if not v_has_title then
    raise exception 'Every form must keep the required Title storage field.' using errcode='22023';
  end if;

  if not v_has_description then
    raise exception 'Every form must keep the required Description storage field.' using errcode='22023';
  end if;
end;
$function$
REVOKE ALL ON FUNCTION public.validate_reporting_form_fields(p_fields jsonb) FROM PUBLIC, anon, authenticated, service_role;
