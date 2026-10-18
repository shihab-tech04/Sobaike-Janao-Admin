-- Sobaike Janao read-only catalog recovery, 2026-10-18. TEST ONLY.
-- This is NOT an historical migration, production delta, or permission grant plan.
-- Contains only pg_get_functiondef metadata; no application records or runtime secrets.
-- Must be replayed only after the test-only baseline on disposable loopback Supabase.
DO $recovery_guard$ BEGIN
  IF current_setting('recovery.test_only', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Refusing recovery test-only function catalog outside isolated test session';
  END IF;
END $recovery_guard$;

-- private.claim_public_engagement_slot(p_action text, p_report_id text, p_subject text, p_interval interval)
CREATE OR REPLACE FUNCTION private.claim_public_engagement_slot(p_action text, p_report_id text, p_subject text, p_interval interval)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_actor bytea;
  v_bucket timestamptz;
  v_rows integer := 0;
begin
  if p_action not in ('view', 'share') then
    raise exception 'SECURITY_CONFIGURATION_ERROR: invalid engagement action.';
  end if;
  if p_interval is null or p_interval <= interval '0 seconds' then
    raise exception 'SECURITY_CONFIGURATION_ERROR: invalid engagement interval.';
  end if;

  v_actor := private.public_actor_fingerprint(p_subject);
  v_bucket := date_bin(p_interval, now(), timestamptz '2000-01-01 00:00:00+00');

  insert into private.public_engagement_dedupe(
    action, report_id, actor_fingerprint, bucket_start, created_at
  ) values (
    p_action,
    upper(btrim(p_report_id)),
    v_actor,
    v_bucket,
    now()
  )
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$function$
REVOKE ALL ON FUNCTION private.claim_public_engagement_slot(p_action text, p_report_id text, p_subject text, p_interval interval) FROM PUBLIC, anon, authenticated, service_role;

-- private.prune_public_security_events()
CREATE OR REPLACE FUNCTION private.prune_public_security_events()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
begin
  delete from private.public_api_rate_events
  where created_at < now() - interval '2 days';

  delete from private.public_engagement_dedupe
  where created_at < now() - interval '2 days';
end;
$function$
REVOKE ALL ON FUNCTION private.prune_public_security_events() FROM PUBLIC, anon, authenticated, service_role;

-- private.prune_reporter_submission_contexts()
CREATE OR REPLACE FUNCTION private.prune_reporter_submission_contexts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_deleted integer := 0;
begin
  delete from public.complaint_submission_contexts sc
  using public.complaints c
  where c.id = sc.complaint_id
    and (
      (c.status <> 'submitted' and sc.created_at < now() - interval '24 hours')
      or
      (c.status = 'submitted' and sc.created_at < now() - interval '7 days')
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$
REVOKE ALL ON FUNCTION private.prune_reporter_submission_contexts() FROM PUBLIC, anon, authenticated, service_role;

-- private.public_actor_fingerprint(p_subject text)
CREATE OR REPLACE FUNCTION private.public_actor_fingerprint(p_subject text)
 RETURNS bytea
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_ip bytea;
  v_subject bytea;
begin
  v_ip := private.public_request_ip_fingerprint();
  v_subject := private.public_subject_fingerprint(p_subject);

  if v_subject is null then
    return private.public_abuse_hmac('actor:' || encode(v_ip, 'hex'));
  end if;

  return private.public_abuse_hmac(
    'actor:' || encode(v_ip, 'hex') || ':' || encode(v_subject, 'hex')
  );
end;
$function$
REVOKE ALL ON FUNCTION private.public_actor_fingerprint(p_subject text) FROM PUBLIC, anon, authenticated, service_role;

-- private.recover_abandoned_news_intake_runs()
CREATE OR REPLACE FUNCTION private.recover_abandoned_news_intake_runs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_count integer;
begin
  update public.news_intake_runs
  set status = 'failed',
      completed_at = clock_timestamp(),
      error_summary = concat_ws(' ', nullif(error_summary, ''), 'Automatic recovery: scan exceeded the established 20-minute run timeout.')
  where status = 'running'
    and started_at < clock_timestamp() - interval '20 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
REVOKE ALL ON FUNCTION private.recover_abandoned_news_intake_runs() FROM PUBLIC, anon, authenticated, service_role;

-- private.refresh_public_category_popularity_snapshot(p_force boolean)
CREATE OR REPLACE FUNCTION private.refresh_public_category_popularity_snapshot(p_force boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
declare
  v_last_snapshot_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('sobaike_janao'),
    pg_catalog.hashtext('public_category_popularity_snapshot')
  );

  select max(snapshot_at)
  into v_last_snapshot_at
  from public.public_category_popularity_snapshot;

  if not coalesce(p_force, false)
     and v_last_snapshot_at is not null
     and v_last_snapshot_at > pg_catalog.now() - interval '72 hours'
  then
    return false;
  end if;

  delete from public.public_category_popularity_snapshot;

  insert into public.public_category_popularity_snapshot (
    segment_id,
    published_post_count,
    view_count,
    share_count,
    popularity_score,
    popularity_rank,
    snapshot_at
  )
  with published as (
    select item
    from pg_catalog.jsonb_array_elements(public.get_public_published_reports()) item
  ),
  metrics as (
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
  normalized as (
    select
      metrics.*,
      coalesce(
        metrics.published_post_count::numeric /
        nullif(max(metrics.published_post_count) over (), 0),
        0
      ) as post_norm,
      coalesce(
        metrics.view_count::numeric /
        nullif(max(metrics.view_count) over (), 0),
        0
      ) as view_norm,
      coalesce(
        metrics.share_count::numeric /
        nullif(max(metrics.share_count) over (), 0),
        0
      ) as share_norm
    from metrics
  ),
  ranked as (
    select
      normalized.segment_id,
      normalized.published_post_count,
      normalized.view_count,
      normalized.share_count,
      round(
        (normalized.post_norm * 0.30) +
        (normalized.view_norm * 0.45) +
        (normalized.share_norm * 0.25),
        6
      ) as popularity_score,
      row_number() over (
        order by
          ((normalized.post_norm * 0.30) +
           (normalized.view_norm * 0.45) +
           (normalized.share_norm * 0.25)) desc,
          normalized.published_post_count desc,
          normalized.view_count desc,
          normalized.share_count desc,
          normalized.sort_order asc,
          normalized.segment_id asc
      )::bigint as popularity_rank
    from normalized
  )
  select
    ranked.segment_id,
    ranked.published_post_count,
    ranked.view_count,
    ranked.share_count,
    ranked.popularity_score,
    ranked.popularity_rank,
    pg_catalog.now()
  from ranked;

  return true;
end;
$function$
REVOKE ALL ON FUNCTION private.refresh_public_category_popularity_snapshot(p_force boolean) FROM PUBLIC, anon, authenticated, service_role;

-- public.admin_check_report_duplicate(p_complaint_id text)
CREATE OR REPLACE FUNCTION public.admin_check_report_duplicate(p_complaint_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if not public.is_active_admin()
     or not (
       public.has_permission('complaints.view')
       or public.has_permission('complaints.publish')
     ) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  return public.evaluate_sourced_report_duplicate_internal(p_complaint_id);
end;
$function$
REVOKE ALL ON FUNCTION public.admin_check_report_duplicate(p_complaint_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_check_report_duplicate(p_complaint_id text) TO authenticated;

-- public.admin_confirm_reports_are_distinct(p_complaint_id text, p_candidate_complaint_id text, p_review_note text)
CREATE OR REPLACE FUNCTION public.admin_confirm_reports_are_distinct(p_complaint_id text, p_candidate_complaint_id text, p_review_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_left public.complaints%rowtype;
  v_right public.complaints%rowtype;
  v_eval jsonb;
  v_a_id text;
  v_b_id text;
  v_a_signature text;
  v_b_signature text;
  v_left_signature text;
  v_right_signature text;
begin
  if not public.is_active_admin()
     or not public.has_permission('complaints.publish') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  if p_complaint_id is null
     or p_candidate_complaint_id is null
     or p_complaint_id = p_candidate_complaint_id then
    raise exception 'Two different report IDs are required.' using errcode='22023';
  end if;

  if char_length(btrim(coalesce(p_review_note, ''))) < 8 then
    raise exception 'A review note of at least 8 characters is required.' using errcode='22023';
  end if;

  select * into v_left
  from public.complaints
  where id = p_complaint_id
  for update;

  select * into v_right
  from public.complaints
  where id = p_candidate_complaint_id
  for update;

  if v_left.id is null or v_right.id is null then
    raise exception 'One or both reports were not found.' using errcode='P0002';
  end if;

  if v_left.origin_type <> 'sourced_report'
     or v_right.origin_type <> 'sourced_report' then
    raise exception 'Distinct-incident review is only available for sourced reports.' using errcode='22023';
  end if;

  v_eval := public.evaluate_sourced_report_duplicate_internal(v_left.id);

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_eval->'candidates', '[]'::jsonb)) item
    where item->>'complaintId' = v_right.id
  ) then
    raise exception 'This report is not an active duplicate candidate.' using errcode='22023';
  end if;

  v_left_signature := public.duplicate_report_signature_values(
    v_left.segment_id, v_left.subcategory_id, v_left.title, v_left.title_en,
    v_left.incident_date, v_left.district, v_left.upazila_or_thana, v_left.area
  );
  v_right_signature := public.duplicate_report_signature_values(
    v_right.segment_id, v_right.subcategory_id, v_right.title, v_right.title_en,
    v_right.incident_date, v_right.district, v_right.upazila_or_thana, v_right.area
  );

  v_a_id := least(v_left.id, v_right.id);
  v_b_id := greatest(v_left.id, v_right.id);
  v_a_signature := case when v_left.id < v_right.id then v_left_signature else v_right_signature end;
  v_b_signature := case when v_left.id < v_right.id then v_right_signature else v_left_signature end;

  insert into public.report_duplicate_overrides (
    report_a_id,
    report_b_id,
    report_a_signature,
    report_b_signature,
    review_note,
    reviewed_by,
    reviewed_at
  )
  values (
    v_a_id,
    v_b_id,
    v_a_signature,
    v_b_signature,
    btrim(p_review_note),
    auth.uid(),
    now()
  )
  on conflict (report_a_id, report_b_id)
  do update set
    report_a_signature = excluded.report_a_signature,
    report_b_signature = excluded.report_b_signature,
    review_note = excluded.review_note,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at;

  insert into public.admin_audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    auth.uid(),
    'complaint.duplicate_distinct_confirmed',
    'complaint',
    v_left.id,
    jsonb_build_object(
      'candidate_complaint_id', v_right.id,
      'review_note', btrim(p_review_note),
      'report_signature', v_left_signature,
      'candidate_signature', v_right_signature,
      'timestamp', now()
    )
  );

  return public.evaluate_sourced_report_duplicate_internal(v_left.id);
end;
$function$
REVOKE ALL ON FUNCTION public.admin_confirm_reports_are_distinct(p_complaint_id text, p_candidate_complaint_id text, p_review_note text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_confirm_reports_are_distinct(p_complaint_id text, p_candidate_complaint_id text, p_review_note text) TO authenticated;

-- public.admin_create_role(p_name_en text, p_name_bn text, p_active boolean, p_permission_ids text[], p_description text)
CREATE OR REPLACE FUNCTION public.admin_create_role(p_name_en text, p_name_bn text DEFAULT NULL::text, p_active boolean DEFAULT true, p_permission_ids text[] DEFAULT ARRAY[]::text[], p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
        RAISE EXCEPTION
          'Access denied. Active administrator session required.'
          USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('roles.manage') THEN
        RAISE EXCEPTION
          'Access denied. Permission roles.manage required.'
          USING ERRCODE = '42501';
    END IF;

    v_clean_name_en := trim(p_name_en);

    IF v_clean_name_en IS NULL
       OR length(v_clean_name_en) = 0 THEN
        RAISE EXCEPTION
          'English role name cannot be empty.'
          USING ERRCODE = '22000';
    END IF;

    v_clean_name_bn :=
      nullif(trim(p_name_bn), '');

    v_clean_desc :=
      nullif(trim(p_description), '');

    v_slug :=
      public.generate_role_slug(v_clean_name_en);

    IF v_slug IS NULL OR v_slug = '' THEN
        RAISE EXCEPTION
          'English role name must contain valid alphanumeric characters to create a technical role ID.'
          USING ERRCODE = '22000';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.roles
      WHERE id = v_slug
    ) THEN
        RAISE EXCEPTION
          'A role with this ID or English name already exists.'
          USING ERRCODE = '23505';
    END IF;

    IF p_permission_ids IS NOT NULL
       AND cardinality(p_permission_ids) > 0 THEN

        SELECT ARRAY(
            SELECT unnest(p_permission_ids)
            EXCEPT
            SELECT id
            FROM public.permissions
        )
        INTO v_invalid_perms;

        IF cardinality(v_invalid_perms) > 0 THEN
            RAISE EXCEPTION
              'Invalid permission ID(s) provided: %',
              array_to_string(
                v_invalid_perms,
                ', '
              )
              USING ERRCODE = '22000';
        END IF;

        SELECT ARRAY(
            SELECT DISTINCT unnest(p_permission_ids)
        )
        INTO v_deduped_perms;

    ELSE
        v_deduped_perms :=
          ARRAY[]::TEXT[];
    END IF;

    IF NOT public.can_delegate_permission_set(
      v_deduped_perms
    ) THEN
        RAISE EXCEPTION
          'Access denied. You cannot grant permissions that you do not possess.'
          USING ERRCODE = '42501';
    END IF;

    v_created_at :=
      clock_timestamp();

    INSERT INTO public.roles (
        id,
        name_en,
        name_bn,
        description,
        active,
        is_system,
        created_at,
        updated_at
    ) VALUES (
        v_slug,
        v_clean_name_en,
        v_clean_name_bn,
        v_clean_desc,
        COALESCE(p_active, TRUE),
        false,
        v_created_at,
        v_created_at
    );

    IF cardinality(v_deduped_perms) > 0 THEN
        FOREACH v_perm_id
        IN ARRAY v_deduped_perms
        LOOP
            INSERT INTO public.role_permissions (
              role_id,
              permission_id,
              created_at
            )
            VALUES (
              v_slug,
              v_perm_id,
              v_created_at
            );
        END LOOP;
    END IF;

    v_audit_id :=
      public.log_role_audit_event(
        'ROLE_CREATED',
        v_slug,
        jsonb_build_object(
            'role_id', v_slug,
            'name_en', v_clean_name_en,
            'name_bn', v_clean_name_bn,
            'permission_count',
              cardinality(v_deduped_perms)
        )
      );

    PERFORM public.admin_emit_notification(
        p_event_key := 'role.created',
        p_title_en :=
          'New role created: ' ||
          v_clean_name_en,
        p_title_bn :=
          'নতুন ভূমিকা তৈরি করা হয়েছে: ' ||
          COALESCE(
            v_clean_name_bn,
            v_clean_name_en
          ),
        p_body_en :=
          'New administrative role ' ||
          v_clean_name_en ||
          ' created with ' ||
          cardinality(v_deduped_perms)::text ||
          ' permissions.',
        p_body_bn :=
          'নতুন ভূমিকা ' ||
          COALESCE(
            v_clean_name_bn,
            v_clean_name_en
          ) ||
          ' তৈরি করা হয়েছে (' ||
          cardinality(v_deduped_perms)::text ||
          'টি অনুমতি সহ)।',
        p_actor_user_id := auth.uid(),
        p_target_type := 'role',
        p_target_id := v_slug,
        p_target_label := v_clean_name_en,
        p_metadata := jsonb_build_object(
            'role_id', v_slug,
            'name_en', v_clean_name_en,
            'name_bn', v_clean_name_bn,
            'permission_count',
              cardinality(v_deduped_perms),
            'actor_user_id', auth.uid(),
            'timestamp', now()
        ),
        p_required_all_permissions :=
          ARRAY['roles.manage'],
        p_required_any_permissions :=
          '{}'::text[],
        p_audience_mode :=
          'permission',
        p_route :=
          '/roles/' || v_slug,
        p_dedupe_key :=
          'role.created:oversight:' ||
          v_audit_id::text,
        p_exclude_actor :=
          true,
        p_include_super_admin :=
          true
    );

    RETURN jsonb_build_object(
        'id', v_slug,
        'name_en', v_clean_name_en,
        'name_bn', v_clean_name_bn,
        'description', v_clean_desc,
        'active', COALESCE(p_active, TRUE),
        'is_system', false,
        'permission_ids',
          to_jsonb(v_deduped_perms),
        'created_at',
          v_created_at
    );
END;
$function$
REVOKE ALL ON FUNCTION public.admin_create_role(p_name_en text, p_name_bn text, p_active boolean, p_permission_ids text[], p_description text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_role(p_name_en text, p_name_bn text, p_active boolean, p_permission_ids text[], p_description text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_role(p_name_en text, p_name_bn text, p_active boolean, p_permission_ids text[], p_description text) TO service_role;

-- public.admin_create_taxonomy_item(p_item_type text, p_item_id text, p_parent_segment_id text, p_name_en text, p_name_bn text, p_sort_order integer)
CREATE OR REPLACE FUNCTION public.admin_create_taxonomy_item(p_item_type text, p_item_id text, p_parent_segment_id text, p_name_en text, p_name_bn text, p_sort_order integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_item_type text := lower(nullif(btrim(p_item_type), ''));
  v_item_id text := lower(nullif(btrim(p_item_id), ''));
  v_parent_segment_id text := nullif(btrim(p_parent_segment_id), '');
  v_name_en text := nullif(btrim(p_name_en), '');
  v_name_bn text := nullif(btrim(p_name_bn), '');
  v_slug text;
  v_created jsonb;
  v_schema_id uuid;
  v_banner jsonb;
begin
  if not public.is_active_admin() or not public.has_permission('categories.manage') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  if v_item_type not in ('segment','subcategory') then
    raise exception 'Invalid taxonomy item type.' using errcode='22023';
  end if;

  if v_item_id is null or v_item_id !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' then
    raise exception 'ID must use lowercase letters, numbers, and underscores only.' using errcode='22023';
  end if;

  if v_name_en is null or v_name_bn is null then
    raise exception 'Both English and Bangla names are required.' using errcode='22023';
  end if;

  if p_sort_order is null or p_sort_order < 1 or p_sort_order > 999 then
    raise exception 'Sort order must be an integer from 1 to 999.' using errcode='22023';
  end if;

  if v_item_type = 'segment' then
    if exists(select 1 from public.segments where id=v_item_id) then
      raise exception 'Segment already exists: %', v_item_id using errcode='23505';
    end if;

    v_slug := replace(v_item_id,'_','-');

    if exists(select 1 from public.segments where slug=v_slug) then
      raise exception 'Category slug already exists: %', v_slug using errcode='23505';
    end if;

    insert into public.segments(
      id,name_en,name_bn,short_name_en,short_name_bn,
      description_en,description_bn,slug,icon_key,theme_key,
      active,sort_order,config_status
    )
    values(
      v_item_id,v_name_en,v_name_bn,v_name_en,v_name_bn,
      '','',v_slug,'shield','sky',
      false,p_sort_order,'draft'
    );

    v_banner := jsonb_build_object(
      'titleBn',v_name_bn,
      'titleEn',v_name_en,
      'mobileDescriptionBn','',
      'mobileDescriptionEn','',
      'tabletDescriptionBn','',
      'tabletDescriptionEn','',
      'desktopDescriptionBn','',
      'desktopDescriptionEn','',
      'illustrationSrc','',
      'primaryCtaBn','রিপোর্ট করুন',
      'primaryCtaEn','Report now',
      'showOnHome',false,
      'isActive',false,
      'sortOrder',least(p_sort_order,99)
    );

    insert into public.site_banners(
      category_key,draft_content,published_content,draft_updated_by,published_by
    )
    values(v_item_id,v_banner,v_banner,auth.uid(),auth.uid())
    on conflict(category_key) do nothing;

    v_created := jsonb_build_object(
      'id',v_item_id,'item_type','segment','name_en',v_name_en,'name_bn',v_name_bn,
      'slug',v_slug,'active',false,'sort_order',p_sort_order,'config_status','draft'
    );
  else
    if v_parent_segment_id is null then
      raise exception 'Parent segment is required for a subcategory.' using errcode='22023';
    end if;

    if not exists(
      select 1 from public.segments
      where id=v_parent_segment_id and config_status <> 'archived'
    ) then
      raise exception 'Parent segment not found or archived: %', v_parent_segment_id using errcode='P0002';
    end if;

    if exists(select 1 from public.subcategories where id=v_item_id) then
      raise exception 'Subcategory already exists: %', v_item_id using errcode='23505';
    end if;

    insert into public.subcategories(
      id,segment_id,name_en,name_bn,description_en,description_bn,
      is_sensitive,active,sort_order,config_status
    )
    values(
      v_item_id,v_parent_segment_id,v_name_en,v_name_bn,'','',
      false,false,p_sort_order,'draft'
    );

    insert into public.reporting_form_schemas(
      scope_type,scope_id,version,status,engine_mode,notes,created_by
    )
    values(
      'subcategory',v_item_id,1,'draft','schema',
      'Initial Admin-created form schema draft. Not visible to Public.',auth.uid()
    )
    returning id into v_schema_id;

    insert into public.reporting_form_schema_fields(
      schema_id,field_key,field_type,storage_mode,storage_key,
      label_en,label_bn,helper_en,helper_bn,required,active,sort_order,options,validation,config
    ) values
      (v_schema_id,'title','text','core_column','title','Report title','প্রতিবেদনের শিরোনাম',
       'Keep it short and specific.','সংক্ষিপ্ত ও নির্দিষ্ট রাখুন।',true,true,10,'[]','{"maxLength":100}','{"locked":true}'),
      (v_schema_id,'description','textarea','core_column','description','What happened?','কি ঘটেছে?',
       'Describe the incident clearly.','ঘটনাটি স্পষ্টভাবে বর্ণনা করুন।',true,true,20,'[]','{"maxLength":2000}','{"locked":true}'),
      (v_schema_id,'incident_date','date','core_column','incidentDate','Incident date','ঘটনার তারিখ',
       null,null,false,true,30,'[]','{}','{}'),
      (v_schema_id,'location','location','system_block','location','Location','লোকেশন',
       null,null,true,true,40,'[]','{}','{"block":"location"}'),
      (v_schema_id,'evidence','evidence','system_block','evidence','Supporting information','সহায়ক তথ্য',
       null,null,false,true,90,'[]','{}','{"block":"evidence"}'),
      (v_schema_id,'privacy','privacy','system_block','privacy','Privacy','গোপনীয়তা',
       null,null,false,true,100,'[]','{}','{"block":"privacy"}');

    v_created := jsonb_build_object(
      'id',v_item_id,'item_type','subcategory','segment_id',v_parent_segment_id,
      'name_en',v_name_en,'name_bn',v_name_bn,'active',false,'sort_order',p_sort_order,
      'config_status','draft','form_schema_id',v_schema_id,'form_schema_version',1
    );
  end if;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'taxonomy.draft_create',v_item_type,v_item_id,
    jsonb_build_object('item',v_created,'timestamp',clock_timestamp()));

  return jsonb_build_object('success',true,'item',v_created);
end;
$function$
REVOKE ALL ON FUNCTION public.admin_create_taxonomy_item(p_item_type text, p_item_id text, p_parent_segment_id text, p_name_en text, p_name_bn text, p_sort_order integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_taxonomy_item(p_item_type text, p_item_id text, p_parent_segment_id text, p_name_en text, p_name_bn text, p_sort_order integer) TO authenticated;

-- public.admin_edit_complaint(p_complaint_id text, p_title_en text, p_title_bn text, p_description_en text, p_description_bn text, p_segment_id text, p_subcategory_id text, p_priority text, p_ward text, p_zone text, p_address_en text, p_address_bn text, p_notes text)
CREATE OR REPLACE FUNCTION public.admin_edit_complaint(p_complaint_id text, p_title_en text DEFAULT NULL::text, p_title_bn text DEFAULT NULL::text, p_description_en text DEFAULT NULL::text, p_description_bn text DEFAULT NULL::text, p_segment_id text DEFAULT NULL::text, p_subcategory_id text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_ward text DEFAULT NULL::text, p_zone text DEFAULT NULL::text, p_address_en text DEFAULT NULL::text, p_address_bn text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_complaint public.complaints%ROWTYPE;
    v_complaint_id text;
    v_segment_id text;
    v_subcategory_id text;
    v_priority text;
    v_title_bn text;
    v_title_en text;
    v_description_bn text;
    v_description_en text;
    v_ward text;
    v_district text;
    v_address text;
    v_notes text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
    END IF;

    -- Match the current Admin UI contract exactly: Edit is available only to
    -- active admins who already hold at least one complaint moderation authority.
    IF NOT (
        public.has_permission('complaints.publish') OR
        public.has_permission('complaints.unpublish') OR
        public.has_permission('complaints.reject')
    ) THEN
        RAISE EXCEPTION 'Access denied. Complaint moderation permission required.' USING ERRCODE = '42501';
    END IF;

    v_complaint_id := NULLIF(btrim(p_complaint_id), '');
    IF v_complaint_id IS NULL THEN
        RAISE EXCEPTION 'Complaint ID cannot be empty.' USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_complaint
      FROM public.complaints
     WHERE id = v_complaint_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint with ID % not found.', v_complaint_id USING ERRCODE = 'P0002';
    END IF;

    v_segment_id := COALESCE(NULLIF(btrim(p_segment_id), ''), v_complaint.segment_id);

    IF v_segment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM public.segments s
         WHERE s.id = v_segment_id
           AND COALESCE(s.active, true) = true
    ) THEN
        RAISE EXCEPTION 'Invalid active complaint segment: %', v_segment_id USING ERRCODE = '22023';
    END IF;

    v_subcategory_id := COALESCE(NULLIF(btrim(p_subcategory_id), ''), v_complaint.subcategory_id);

    IF v_subcategory_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM public.subcategories sc
         WHERE sc.id = v_subcategory_id
           AND sc.segment_id = v_segment_id
           AND COALESCE(sc.active, true) = true
    ) THEN
        RAISE EXCEPTION 'Invalid subcategory % for segment %', v_subcategory_id, v_segment_id USING ERRCODE = '22023';
    END IF;

    v_priority := COALESCE(NULLIF(lower(btrim(p_priority)), ''), lower(COALESCE(v_complaint.priority, 'medium')));
    IF v_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
        RAISE EXCEPTION 'Invalid priority: %', v_priority USING ERRCODE = '22023';
    END IF;

    -- Live schema stores Bengali/default text in title/description and English in *_en.
    v_title_bn := COALESCE(NULLIF(btrim(p_title_bn), ''), v_complaint.title);
    v_title_en := COALESCE(NULLIF(btrim(p_title_en), ''), v_complaint.title_en);
    v_description_bn := COALESCE(NULLIF(btrim(p_description_bn), ''), v_complaint.description);
    v_description_en := COALESCE(NULLIF(btrim(p_description_en), ''), v_complaint.description_en);

    IF COALESCE(NULLIF(btrim(v_title_bn), ''), NULLIF(btrim(v_title_en), '')) IS NULL THEN
        RAISE EXCEPTION 'At least one complaint title is required.' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(NULLIF(btrim(v_description_bn), ''), NULLIF(btrim(v_description_en), '')) IS NULL THEN
        RAISE EXCEPTION 'At least one complaint description is required.' USING ERRCODE = '22023';
    END IF;

    -- Admin domain mapping is:
    --   location.ward -> upazila_or_thana (fallback area)
    --   location.zone -> district (fallback division)
    --   addressEn/addressBn -> single live formatted_address field
    v_ward := COALESCE(NULLIF(btrim(p_ward), ''), v_complaint.upazila_or_thana);
    v_district := COALESCE(NULLIF(btrim(p_zone), ''), v_complaint.district);
    v_address := COALESCE(
        NULLIF(btrim(p_address_bn), ''),
        NULLIF(btrim(p_address_en), ''),
        v_complaint.formatted_address
    );
    v_notes := NULLIF(btrim(p_notes), '');

    UPDATE public.complaints
       SET title = v_title_bn,
           title_en = v_title_en,
           description = v_description_bn,
           description_en = v_description_en,
           segment_id = v_segment_id,
           subcategory_id = v_subcategory_id,
           priority = v_priority,
           upazila_or_thana = v_ward,
           district = v_district,
           formatted_address = v_address,
           updated_at = now()
     WHERE id = v_complaint.id;

    -- Preserve moderation state, reporter/device data, coordinates, evidence,
    -- publication preferences, submission context, and creation metadata.

    INSERT INTO public.complaint_updates (
        complaint_id,
        update_type,
        note,
        is_public,
        created_at
    ) VALUES (
        v_complaint.id,
        'edited',
        COALESCE(v_notes, 'Complaint details updated by administrator.'),
        false,
        now()
    );

    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        auth.uid(),
        'complaint.edit',
        'complaint',
        v_complaint.id,
        jsonb_build_object(
            'complaint_id', v_complaint.id,
            'status_preserved', v_complaint.status,
            'segment_id', v_segment_id,
            'subcategory_id', v_subcategory_id,
            'priority', v_priority,
            'ward', v_ward,
            'district', v_district,
            'notes', v_notes
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', v_complaint.id,
        'status', v_complaint.status,
        'message', 'Complaint updated successfully.'
    );
END;
$function$
REVOKE ALL ON FUNCTION public.admin_edit_complaint(p_complaint_id text, p_title_en text, p_title_bn text, p_description_en text, p_description_bn text, p_segment_id text, p_subcategory_id text, p_priority text, p_ward text, p_zone text, p_address_en text, p_address_bn text, p_notes text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_edit_complaint(p_complaint_id text, p_title_en text, p_title_bn text, p_description_en text, p_description_bn text, p_segment_id text, p_subcategory_id text, p_priority text, p_ward text, p_zone text, p_address_en text, p_address_bn text, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_edit_complaint(p_complaint_id text, p_title_en text, p_title_bn text, p_description_en text, p_description_bn text, p_segment_id text, p_subcategory_id text, p_priority text, p_ward text, p_zone text, p_address_en text, p_address_bn text, p_notes text) TO service_role;

-- public.admin_get_assignable_roles()
CREATE OR REPLACE FUNCTION public.admin_get_assignable_roles()
 RETURNS TABLE(id text, name_en text, name_bn text, description text, active boolean, is_system boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION
            'Access denied. User management authorization required.'
            USING ERRCODE = '42501';
    END IF;

    v_user_id := auth.uid();

    SELECT COALESCE(au.is_super_admin, false)
    INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id
      AND au.active = true;

    SELECT NOT EXISTS (
        SELECT 1
        FROM public.user_roles
    )
    INTO v_bootstrap_mode;

    RETURN QUERY
    SELECT
        r.id,
        r.name_en,
        r.name_bn,
        r.description,
        r.active,
        r.is_system
    FROM public.roles r
    WHERE r.active = true
      AND (
          v_is_super_admin IS TRUE
          OR v_bootstrap_mode IS TRUE
          OR public.can_manage_role_scope(r.id)
      )
    ORDER BY r.name_en ASC;
END;
$function$
REVOKE ALL ON FUNCTION public.admin_get_assignable_roles() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_assignable_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_assignable_roles() TO service_role;

-- public.admin_get_audit_log_filter_options()
CREATE OR REPLACE FUNCTION public.admin_get_audit_log_filter_options()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actions jsonb;
  v_target_types jsonb;
begin
  if not public.is_active_admin()
     or not public.has_permission('audit.view') then
    raise exception 'Access denied. Audit log view authorization required.'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(action order by action), '[]'::jsonb)
  into v_actions
  from (
    select distinct a.action
    from public.admin_audit_logs a
    where nullif(btrim(a.action), '') is not null
  ) actions;

  select coalesce(jsonb_agg(target_type order by target_type), '[]'::jsonb)
  into v_target_types
  from (
    select distinct
      case
        when lower(btrim(a.target_type)) = 'complaint' then 'complaint'
        when lower(btrim(a.target_type)) in ('user', 'admin_user') then 'admin_user'
        when lower(btrim(a.target_type)) = 'role' then 'role'
        else lower(btrim(a.target_type))
      end as target_type
    from public.admin_audit_logs a
    where nullif(btrim(a.target_type), '') is not null
  ) targets;

  return jsonb_build_object(
    'actions', v_actions,
    'target_types', v_target_types
  );
end;
$function$
REVOKE ALL ON FUNCTION public.admin_get_audit_log_filter_options() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_audit_log_filter_options() TO authenticated;

-- public.admin_get_complaint_configured_fields(p_complaint_id text)
CREATE OR REPLACE FUNCTION public.admin_get_complaint_configured_fields(p_complaint_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_complaint public.complaints%rowtype;
  v_schema_id uuid;
  v_fields jsonb;
begin
  if not public.is_active_admin()
     or not (public.has_permission('complaints.view') or public.has_permission('complaints.manage')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select * into v_complaint from public.complaints where id=p_complaint_id;
  if v_complaint.id is null then
    raise exception 'Complaint not found.' using errcode='P0002';
  end if;

  select id into v_schema_id
  from public.reporting_form_schemas
  where scope_type='subcategory' and scope_id=v_complaint.subcategory_id
    and version=v_complaint.form_schema_version
  order by case status when 'published' then 0 else 1 end
  limit 1;

  if v_schema_id is null then
    return jsonb_build_object(
      'formSchemaVersion',v_complaint.form_schema_version,
      'answers',v_complaint.custom_field_answers,
      'fields','[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'fieldKey',f.field_key,
    'labelEn',f.label_en,
    'labelBn',f.label_bn,
    'fieldType',f.field_type,
    'storageMode',f.storage_mode,
    'storageKey',f.storage_key,
    'sortOrder',f.sort_order,
    'options',f.options,
    'config',f.config,
    'value',case
      when f.storage_mode='custom_json' then v_complaint.custom_field_answers->f.storage_key
      else null
    end
  ) order by f.sort_order,f.field_key),'[]'::jsonb)
  into v_fields
  from public.reporting_form_schema_fields f
  where f.schema_id=v_schema_id and f.active=true;

  return jsonb_build_object(
    'formSchemaVersion',v_complaint.form_schema_version,
    'answers',v_complaint.custom_field_answers,
    'fields',v_fields
  );
end;
$function$
REVOKE ALL ON FUNCTION public.admin_get_complaint_configured_fields(p_complaint_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_complaint_configured_fields(p_complaint_id text) TO authenticated;

-- public.admin_get_complaint_evidence(p_complaint_id text)
CREATE OR REPLACE FUNCTION public.admin_get_complaint_evidence(p_complaint_id text)
 RETURNS TABLE(id uuid, complaint_id text, storage_path text, file_url text, file_name text, mime_type text, media_type text, file_size_bytes bigint, caption text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    -- -------------------------------------------------------------------------
    -- Active Admin only
    -- -------------------------------------------------------------------------
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION
            'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;


    -- -------------------------------------------------------------------------
    -- Evidence permission required
    -- -------------------------------------------------------------------------
    IF NOT public.has_permission('complaints.evidence_view') THEN
        RAISE EXCEPTION
            'Access denied. You do not have permission to view private complaint evidence.'
            USING ERRCODE = '42501';
    END IF;


    -- -------------------------------------------------------------------------
    -- Return only evidence fields already required by Admin frontend.
    -- Explicit casts protect the RPC contract from type-alignment issues.
    -- -------------------------------------------------------------------------
    RETURN QUERY
    SELECT
        ce.id::UUID,
        ce.complaint_id::TEXT,
        ce.storage_path::TEXT,
        ce.file_url::TEXT,
        ce.file_name::TEXT,
        ce.mime_type::TEXT,
        ce.media_type::TEXT,
        ce.file_size_bytes::BIGINT,
        ce.caption::TEXT,
        ce.created_at::TIMESTAMPTZ
    FROM public.complaint_evidence AS ce
    WHERE ce.complaint_id::TEXT = p_complaint_id
    ORDER BY ce.created_at ASC;
END;
$function$
REVOKE ALL ON FUNCTION public.admin_get_complaint_evidence(p_complaint_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_complaint_evidence(p_complaint_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_complaint_evidence(p_complaint_id text) TO service_role;

-- public.admin_get_complaint_parties(p_complaint_id text)
CREATE OR REPLACE FUNCTION public.admin_get_complaint_parties(p_complaint_id text)
 RETURNS TABLE(id uuid, complaint_id text, name text, party_type text, role_or_designation text, organization text, phone_or_contact text, public_profile_handle text, address text, identifying_description text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if not public.is_active_admin() then
    raise exception 'Access denied. Active administrative session required.' using errcode = '42501';
  end if;

  if not public.has_permission('complaints.view') then
    raise exception 'Access denied. You do not have permission to view complaint details.' using errcode = '42501';
  end if;

  return query
  select
    cp.id::uuid,
    cp.complaint_id::text,
    cp.name::text,
    cp.party_type::text,
    cp.role_or_designation::text,
    cp.organization::text,
    cp.phone_or_contact::text,
    cp.public_profile_handle::text,
    cp.address::text,
    cp.identifying_description::text,
    cp.created_at::timestamptz
  from public.complaint_parties cp
  where cp.complaint_id = p_complaint_id
  order by cp.created_at asc, cp.id asc;
end;
$function$
REVOKE ALL ON FUNCTION public.admin_get_complaint_parties(p_complaint_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_complaint_parties(p_complaint_id text) TO authenticated;

-- public.admin_get_complaint_reporter_location(p_complaint_id text)
CREATE OR REPLACE FUNCTION public.admin_get_complaint_reporter_location(p_complaint_id text)
 RETURNS TABLE(complaint_id text, reporter_latitude double precision, reporter_longitude double precision, accuracy_meters double precision, captured_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
    v_is_super_admin boolean := false;
begin
    if not public.is_active_admin() then
        raise exception
            'Access denied. Active administrative session required.'
            using errcode = '42501';
    end if;

    if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
        raise exception
            'Access denied. AAL2 authentication is required for private reporter device telemetry.'
            using errcode = '42501';
    end if;

    select coalesce(au.is_super_admin, false)
    into v_is_super_admin
    from public.admin_users as au
    where au.user_id = auth.uid()
      and au.active = true
    limit 1;

    if v_is_super_admin is not true then
        raise exception
            'Access denied. Private reporter device telemetry is restricted to Super Administrators.'
            using errcode = '42501';
    end if;

    return query
    select
        sc.complaint_id::text,
        sc.reporter_latitude::double precision,
        sc.reporter_longitude::double precision,
        sc.accuracy_meters::double precision,
        sc.captured_at::timestamptz
    from public.complaint_submission_contexts as sc
    where sc.complaint_id::text = p_complaint_id
      and sc.reporter_latitude is not null
      and sc.reporter_longitude is not null
      and sc.accuracy_meters is not null
    limit 1;
end;
$function$
REVOKE ALL ON FUNCTION public.admin_get_complaint_reporter_location(p_complaint_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_complaint_reporter_location(p_complaint_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_complaint_reporter_location(p_complaint_id text) TO service_role;

-- public.admin_get_complaint_sources(p_complaint_id text)
CREATE OR REPLACE FUNCTION public.admin_get_complaint_sources(p_complaint_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_result jsonb;
begin
  if not public.is_active_admin()
     or not (public.has_permission('complaints.view') or public.has_permission('complaints.manage')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',s.id,
        'sourceType',s.source_type,
        'publisherName',s.publisher_name,
        'sourceTitle',s.source_title,
        'canonicalUrl',s.canonical_url,
        'sourcePublishedDate',to_char(s.source_published_date,'YYYY-MM-DD'),
        'verificationStatus',s.verification_status,
        'isFinalDetailPage',s.is_final_detail_page,
        'sourceVersion',s.source_version,
        'verificationNote',s.verification_note,
        'verifiedAt',s.verified_at,
        'createdAt',s.created_at,
        'updatedAt',s.updated_at
      )
      order by s.created_at
    ),
    '[]'::jsonb
  )
  into v_result
  from public.complaint_sources s
  where s.complaint_id=p_complaint_id;

  return v_result;
end;
$function$
REVOKE ALL ON FUNCTION public.admin_get_complaint_sources(p_complaint_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_complaint_sources(p_complaint_id text) TO authenticated;

-- public.admin_get_dashboard_aggregates()
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_aggregates()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_stats jsonb;
    v_category_counts jsonb;

    v_total bigint;
    v_submitted bigint;
    v_published bigint;
    v_unpublished bigint;
    v_rejected bigint;
    v_edited bigint;
BEGIN
    -- Step 1: active administrator required.
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION
            'Access denied. Active administrator session required.'
            USING ERRCODE = '42501';
    END IF;

    -- Step 2: dashboard.view required.
    IF NOT public.has_permission('dashboard.view') THEN
        RAISE EXCEPTION
            'Access denied. Dashboard view authorization required.'
            USING ERRCODE = '42501';
    END IF;

    -- Step 3: lifecycle aggregates.
    SELECT
        COUNT(*) FILTER (
            WHERE status IN (
                'submitted',
                'published',
                'unpublished',
                'rejected',
                'edited'
            )
        ),
        COUNT(*) FILTER (WHERE status = 'submitted'),
        COUNT(*) FILTER (WHERE status = 'published'),
        COUNT(*) FILTER (WHERE status = 'unpublished'),
        COUNT(*) FILTER (WHERE status = 'rejected'),
        COUNT(*) FILTER (WHERE status = 'edited')
    INTO
        v_total,
        v_submitted,
        v_published,
        v_unpublished,
        v_rejected,
        v_edited
    FROM public.complaints;

    v_stats := jsonb_build_object(
        'totalComplaints', COALESCE(v_total, 0),
        'submitted', COALESCE(v_submitted, 0),
        'published', COALESCE(v_published, 0),
        'unpublished', COALESCE(v_unpublished, 0),
        'rejected', COALESCE(v_rejected, 0),
        'edited', COALESCE(v_edited, 0)
    );

    -- Step 4: aggregate complaint distribution by active segment.
    SELECT COALESCE(
        jsonb_agg(cat_row),
        '[]'::jsonb
    )
    INTO v_category_counts
    FROM (
        SELECT
            s.id,
            s.name_en AS "nameEn",
            s.name_bn AS "nameBn",
            COUNT(c.id)::int AS count,
            CASE
                WHEN COALESCE(v_total, 0) > 0
                THEN ROUND(
                    (
                        COUNT(c.id)::numeric
                        / v_total::numeric
                    ) * 100,
                    2
                )::float
                ELSE 0::float
            END AS percentage
        FROM public.segments s
        LEFT JOIN public.complaints c
            ON c.segment_id = s.id
            AND c.status IN (
                'submitted',
                'published',
                'unpublished',
                'rejected',
                'edited'
            )
        WHERE s.active IS NOT FALSE
        GROUP BY
            s.id,
            s.name_en,
            s.name_bn,
            s.sort_order
        ORDER BY
            s.sort_order ASC,
            s.name_en ASC
    ) cat_row;

    RETURN jsonb_build_object(
        'stats', v_stats,
        'categorySummary', v_category_counts
    );
END;
$function$
REVOKE ALL ON FUNCTION public.admin_get_dashboard_aggregates() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_aggregates() TO authenticated;

-- public.admin_get_location_taxonomy()
CREATE OR REPLACE FUNCTION public.admin_get_location_taxonomy()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_result jsonb;
begin
  if not public.is_active_admin() then
    raise exception 'Access denied.' using errcode='42501';
  end if;
  select jsonb_build_object(
    'divisions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nameEn',name_en,'nameBn',name_bn) order by id),'[]'::jsonb) from public.bangladesh_divisions),
    'districts',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'divisionId',division_id,'nameEn',name_en,'nameBn',name_bn) order by id),'[]'::jsonb) from public.bangladesh_districts),
    'upazilas',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'districtId',district_id,'nameEn',name_en,'nameBn',name_bn) order by id),'[]'::jsonb) from public.bangladesh_upazilas)
  ) into v_result;
  return v_result;
end
$function$
REVOKE ALL ON FUNCTION public.admin_get_location_taxonomy() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_location_taxonomy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_location_taxonomy() TO service_role;

-- public.admin_get_map_dataset()
CREATE OR REPLACE FUNCTION public.admin_get_map_dataset()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
    v_complaints jsonb;
    v_segments jsonb;
    v_subcategories jsonb;
    v_unsupported_status_count int;
begin
    if not public.is_active_admin() then
        raise exception 'Access denied. Active administrator session required.' using errcode = '42501';
    end if;

    if not public.has_permission('map.view') then
        raise exception 'Access denied. Map view authorization required.' using errcode = '42501';
    end if;

    select count(*)::int
    into v_unsupported_status_count
    from public.complaints c
    where c.status is null
       or c.status not in ('submitted', 'published', 'unpublished', 'rejected', 'edited');

    select coalesce(jsonb_agg(comp_row), '[]'::jsonb)
    into v_complaints
    from (
        select
            c.id,
            c.segment_id,
            c.subcategory_id,
            c.title,
            c.title_en,
            c.status,
            c.formatted_address,
            c.division,
            c.district,
            c.upazila_or_thana,
            c.area,
            c.road,
            c.landmark,
            c.latitude,
            c.longitude,
            c.affected_person_age_group,
            c.alleged_abuser_relationship,
            c.reporting_for,
            c.created_at
        from public.complaints c
        where c.status in ('submitted', 'published', 'unpublished', 'rejected', 'edited')
        order by c.created_at desc, c.id desc
    ) comp_row;

    select coalesce(jsonb_agg(seg_row), '[]'::jsonb)
    into v_segments
    from (
        select s.id, s.name_en, s.name_bn
        from public.segments s
        order by s.sort_order asc, s.name_en asc
    ) seg_row;

    select coalesce(jsonb_agg(sub_row), '[]'::jsonb)
    into v_subcategories
    from (
        select sc.id, sc.segment_id, sc.name_en, sc.name_bn
        from public.subcategories sc
        order by sc.sort_order asc, sc.name_en asc
    ) sub_row;

    return jsonb_build_object(
        'complaints', v_complaints,
        'segments', v_segments,
        'subcategories', v_subcategories,
        'unsupportedStatusCount', v_unsupported_status_count
    );
end;
$function$
REVOKE ALL ON FUNCTION public.admin_get_map_dataset() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_map_dataset() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_map_dataset() TO service_role;

-- public.admin_get_permission_catalogue()
CREATE OR REPLACE FUNCTION public.admin_get_permission_catalogue()
 RETURNS TABLE(id text, module text, action text, name_en text, name_bn text, description text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION
            'Access denied. You do not have permission to view the permissions catalogue.'
            USING ERRCODE = '42501';
    END IF;

    v_user_id := auth.uid();

    SELECT COALESCE(au.is_super_admin, false)
    INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id
      AND au.active = true;

    SELECT NOT EXISTS (
        SELECT 1
        FROM public.user_roles
    )
    INTO v_bootstrap_mode;

    IF v_is_super_admin IS TRUE
       OR v_bootstrap_mode IS TRUE THEN

        RETURN QUERY
        SELECT
            p.id,
            p.module,
            p.action,
            p.name_en,
            p.name_bn,
            p.description,
            p.created_at
        FROM public.permissions p
        ORDER BY p.module ASC, p.action ASC, p.id ASC;

    ELSE

        RETURN QUERY
        SELECT
            p.id,
            p.module,
            p.action,
            p.name_en,
            p.name_bn,
            p.description,
            p.created_at
        FROM public.permissions p
        WHERE p.id IN (
            SELECT public.get_caller_effective_permission_set()
        )
        ORDER BY p.module ASC, p.action ASC, p.id ASC;

    END IF;
END;
$function$
REVOKE ALL ON FUNCTION public.admin_get_permission_catalogue() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_permission_catalogue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_permission_catalogue() TO service_role;

-- public.admin_get_reporting_form(p_subcategory_id text)
CREATE OR REPLACE FUNCTION public.admin_get_reporting_form(p_subcategory_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_schema public.reporting_form_schemas%rowtype;
  v_fields jsonb;
begin
  if not public.is_active_admin() or not public.has_permission('categories.view') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  if not exists(select 1 from public.subcategories where id=p_subcategory_id) then
    raise exception 'Subcategory not found.' using errcode='P0002';
  end if;

  select * into v_schema
  from public.reporting_form_schemas
  where scope_type='subcategory' and scope_id=p_subcategory_id
  order by
    case status when 'draft' then 0 when 'published' then 1 else 2 end,
    version desc
  limit 1;

  if v_schema.id is null then
    return jsonb_build_object('schema',null,'fields','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,
    'fieldKey',f.field_key,
    'fieldType',f.field_type,
    'storageMode',f.storage_mode,
    'storageKey',f.storage_key,
    'labelEn',f.label_en,
    'labelBn',f.label_bn,
    'helperEn',f.helper_en,
    'helperBn',f.helper_bn,
    'placeholderEn',f.placeholder_en,
    'placeholderBn',f.placeholder_bn,
    'required',f.required,
    'active',f.active,
    'sortOrder',f.sort_order,
    'options',f.options,
    'validation',f.validation,
    'config',f.config
  ) order by f.sort_order,f.field_key),'[]'::jsonb)
  into v_fields
  from public.reporting_form_schema_fields f
  where f.schema_id=v_schema.id;

  return jsonb_build_object(
    'schema',jsonb_build_object(
      'id',v_schema.id,'scopeType',v_schema.scope_type,'scopeId',v_schema.scope_id,
      'version',v_schema.version,'status',v_schema.status,'engineMode',v_schema.engine_mode,
      'notes',v_schema.notes,'updatedAt',v_schema.updated_at,'publishedAt',v_schema.published_at
    ),
    'fields',v_fields
  );
end;
$function$
REVOKE ALL ON FUNCTION public.admin_get_reporting_form(p_subcategory_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_reporting_form(p_subcategory_id text) TO authenticated;

-- public.admin_get_response_detail(p_response_id text)
CREATE OR REPLACE FUNCTION public.admin_get_response_detail(p_response_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_id text;
    v_response_json jsonb;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.view') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to view responses.'
            USING ERRCODE = '42501';
    END IF;

    v_id := NULLIF(trim(p_response_id), '');
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'Response ID is required'
            USING ERRCODE = '22000';
    END IF;

    SELECT jsonb_build_object(
        'id', r.id,
        'complaint_id', r.complaint_id,
        'complaint', jsonb_build_object(
            'id', c.id,
            'title', c.title,
            'segment_id', c.segment_id,
            'segment_name_en', s.name_en,
            'segment_name_bn', s.name_bn,
            'district', c.district,
            'status', c.status
        ),
        'response_type', r.response_type,
        'responder_type', r.responder_type,
        'responder_name', r.responder_name,
        'designation', r.designation,
        'organization_name', r.organization_name,
        'official_statement', r.official_statement,
        'supporting_documents_note', r.supporting_documents_note,
        'request_correction_or_removal', COALESCE(r.request_correction_or_removal, false),
        'correction_details', r.correction_details,
        'status', r.status,
        'content', r.content,
        'incident_date', r.incident_date,
        'rejection_reason', r.rejection_reason,
        'rejection_note', r.rejection_note,
        'unpublish_reason', r.unpublish_reason,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'published_at', r.published_at,
        'contact_consent', COALESCE(r.contact_consent, false),
        'contact_info', CASE
            WHEN COALESCE(r.contact_consent, false) = true THEN r.contact_info
            ELSE NULL
        END,
        'contact_email_or_phone', r.contact_email_or_phone
    )
    INTO v_response_json
    FROM public.complaint_responses r
    JOIN public.complaints c ON c.id = r.complaint_id
    LEFT JOIN public.segments s ON s.id = c.segment_id
    WHERE r.id::text = v_id;

    IF v_response_json IS NULL THEN
        RAISE EXCEPTION 'Response with ID % not found', v_id
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_response_json;
END;
$function$
REVOKE ALL ON FUNCTION public.admin_get_response_detail(p_response_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_response_detail(p_response_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_response_detail(p_response_id text) TO service_role;

-- public.admin_get_responses(p_search text, p_status text, p_response_type text, p_start_date date, p_end_date date, p_page integer, p_limit integer, p_sort_by text, p_sort_direction text)
CREATE OR REPLACE FUNCTION public.admin_get_responses(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_response_type text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_page integer DEFAULT 1, p_limit integer DEFAULT 20, p_sort_by text DEFAULT 'created_at'::text, p_sort_direction text DEFAULT 'desc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_search text;
  v_status text;
  v_response_type text;
  v_page int := COALESCE(p_page, 1);
  v_limit int := COALESCE(p_limit, 20);
  v_offset int;
  v_total_count bigint;
  v_total_pages int;
  v_responses_json jsonb;
  v_status_counts jsonb;
  v_sort_by text;
  v_sort_direction text;
BEGIN
  IF NOT public.is_active_admin()
     OR NOT public.has_permission('responses.view') THEN
    RAISE EXCEPTION
      'Access denied. You do not have permission to view responses.'
      USING ERRCODE = '42501';
  END IF;

  IF v_page < 1 THEN
    RAISE EXCEPTION 'Page number must be greater than or equal to 1.' USING ERRCODE = '22000';
  END IF;
  IF v_limit < 1 OR v_limit > 100 THEN
    RAISE EXCEPTION 'Limit must be between 1 and 100.' USING ERRCODE = '22000';
  END IF;

  v_status := NULLIF(trim(p_status), '');
  IF v_status = 'all' THEN v_status := NULL; END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('pending_review', 'published', 'rejected', 'unpublished') THEN
    RAISE EXCEPTION 'Invalid status filter.' USING ERRCODE = '22000';
  END IF;

  v_response_type := NULLIF(trim(p_response_type), '');
  IF v_response_type = 'all' THEN v_response_type := NULL; END IF;
  IF v_response_type IS NOT NULL AND v_response_type NOT IN ('citizen_information', 'subject_response') THEN
    RAISE EXCEPTION 'Invalid response type filter.' USING ERRCODE = '22000';
  END IF;

  v_sort_by := lower(COALESCE(NULLIF(btrim(p_sort_by), ''), 'created_at'));
  v_sort_direction := lower(COALESCE(NULLIF(btrim(p_sort_direction), ''), 'desc'));
  IF v_sort_by NOT IN ('id', 'complaint_id', 'response_type', 'content', 'status', 'created_at') THEN
    RAISE EXCEPTION 'Invalid response sort column.' USING ERRCODE = '22000';
  END IF;
  IF v_sort_direction NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid sort direction.' USING ERRCODE = '22000';
  END IF;

  v_search := NULLIF(trim(p_search), '');
  v_offset := (v_page - 1) * v_limit;

  SELECT jsonb_build_object(
    'all', count(*)::int,
    'pending_review', count(*) FILTER (WHERE r.status = 'pending_review')::int,
    'published', count(*) FILTER (WHERE r.status = 'published')::int,
    'rejected', count(*) FILTER (WHERE r.status = 'rejected')::int,
    'unpublished', count(*) FILTER (WHERE r.status = 'unpublished')::int
  )
  INTO v_status_counts
  FROM public.complaint_responses r;

  WITH filtered AS (
    SELECT
      r.id,
      r.complaint_id,
      r.response_type,
      r.status,
      r.content,
      r.incident_date,
      r.created_at,
      r.updated_at,
      r.published_at,
      r.contact_consent,
      r.responder_type,
      r.responder_name,
      r.designation,
      r.organization_name,
      r.official_statement,
      r.supporting_documents_note,
      r.request_correction_or_removal,
      r.correction_details,
      c.id AS comp_id,
      c.title AS comp_title,
      c.segment_id AS comp_segment_id,
      s.name_en AS comp_segment_name_en,
      s.name_bn AS comp_segment_name_bn,
      c.district AS comp_district,
      c.status AS comp_status
    FROM public.complaint_responses r
    JOIN public.complaints c ON c.id = r.complaint_id
    LEFT JOIN public.segments s ON s.id = c.segment_id
    WHERE
      (v_status IS NULL OR r.status = v_status)
      AND (v_response_type IS NULL OR r.response_type = v_response_type)
      AND (p_start_date IS NULL OR r.created_at >= p_start_date::timestamptz)
      AND (p_end_date IS NULL OR r.created_at < (p_end_date + 1)::timestamptz)
      AND (
        v_search IS NULL
        OR r.id::text ILIKE '%' || v_search || '%'
        OR r.complaint_id::text ILIKE '%' || v_search || '%'
        OR r.content ILIKE '%' || v_search || '%'
        OR r.responder_name ILIKE '%' || v_search || '%'
        OR r.organization_name ILIKE '%' || v_search || '%'
        OR c.title ILIKE '%' || v_search || '%'
      )
  ),
  numbered AS (
    SELECT
      filtered.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_sort_by = 'id' AND v_sort_direction = 'asc' THEN id END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'id' AND v_sort_direction = 'desc' THEN id END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'complaint_id' AND v_sort_direction = 'asc' THEN complaint_id END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'complaint_id' AND v_sort_direction = 'desc' THEN complaint_id END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'response_type' AND v_sort_direction = 'asc' THEN response_type END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'response_type' AND v_sort_direction = 'desc' THEN response_type END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'content' AND v_sort_direction = 'asc' THEN lower(content) END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'content' AND v_sort_direction = 'desc' THEN lower(content) END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'status' AND v_sort_direction = 'asc' THEN status END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'status' AND v_sort_direction = 'desc' THEN status END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'created_at' AND v_sort_direction = 'asc' THEN created_at END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'created_at' AND v_sort_direction = 'desc' THEN created_at END DESC NULLS LAST,
          id ASC
      ) AS row_order
    FROM filtered
  ),
  page_rows AS (
    SELECT * FROM numbered
    ORDER BY row_order
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    (SELECT count(*)::bigint FROM filtered),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'complaint_id', complaint_id,
          'response_type', response_type,
          'status', status,
          'content', content,
          'incident_date', incident_date,
          'created_at', created_at,
          'updated_at', updated_at,
          'published_at', published_at,
          'contact_consent', COALESCE(contact_consent, false),
          'responder_type', responder_type,
          'responder_name', responder_name,
          'designation', designation,
          'organization_name', organization_name,
          'official_statement', official_statement,
          'supporting_documents_note', supporting_documents_note,
          'request_correction_or_removal', COALESCE(request_correction_or_removal, false),
          'correction_details', correction_details,
          'complaint', jsonb_build_object(
            'id', comp_id,
            'title', comp_title,
            'segment_id', comp_segment_id,
            'segment_name_en', comp_segment_name_en,
            'segment_name_bn', comp_segment_name_bn,
            'district', comp_district,
            'status', comp_status
          )
        )
        ORDER BY row_order
      ),
      '[]'::jsonb
    )
  INTO v_total_count, v_responses_json
  FROM page_rows;

  v_total_count := COALESCE(v_total_count, 0);
  v_total_pages := CASE
    WHEN v_total_count = 0 THEN 1
    ELSE CEIL(v_total_count::float / v_limit::float)::int
  END;

  RETURN jsonb_build_object(
    'responses', v_responses_json,
    'total', v_total_count,
    'page', v_page,
    'limit', v_limit,
    'totalPages', v_total_pages,
    'statusCounts', v_status_counts
  );
END;
$function$
REVOKE ALL ON FUNCTION public.admin_get_responses(p_search text, p_status text, p_response_type text, p_start_date date, p_end_date date, p_page integer, p_limit integer, p_sort_by text, p_sort_direction text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_responses(p_search text, p_status text, p_response_type text, p_start_date date, p_end_date date, p_page integer, p_limit integer, p_sort_by text, p_sort_direction text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_responses(p_search text, p_status text, p_response_type text, p_start_date date, p_end_date date, p_page integer, p_limit integer, p_sort_by text, p_sort_direction text) TO service_role;

-- public.admin_get_role_detail(p_role_id text)
CREATE OR REPLACE FUNCTION public.admin_get_role_detail(p_role_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_clean_role_id TEXT;
    v_role RECORD;
    v_perm_ids TEXT[];
    v_perm_count INT;
    v_user_count INT;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION
            'Access denied. You do not have permission to view role details.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_role_id := btrim(p_role_id);

    IF v_clean_role_id IS NULL
       OR v_clean_role_id = '' THEN
        RAISE EXCEPTION 'Role ID cannot be empty.'
            USING ERRCODE = '22000';
    END IF;

    SELECT
        id,
        name_en,
        name_bn,
        description,
        active,
        is_system,
        created_at,
        updated_at
    INTO v_role
    FROM public.roles
    WHERE id = v_clean_role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Role not found: %',
            v_clean_role_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(is_super_admin, false)
    INTO v_is_super_admin
    FROM public.admin_users
    WHERE user_id = auth.uid()
      AND active = true;

    SELECT NOT EXISTS (
        SELECT 1
        FROM public.user_roles
    )
    INTO v_bootstrap_mode;

    IF v_is_super_admin IS NOT TRUE
       AND v_bootstrap_mode IS NOT TRUE THEN

        IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
            RAISE EXCEPTION
                'Access denied. You do not have permission to view a role exceeding your authorization scope.'
                USING ERRCODE = '42501';
        END IF;

    END IF;

    SELECT COALESCE(
        array_agg(permission_id ORDER BY permission_id ASC),
        ARRAY[]::TEXT[]
    )
    INTO v_perm_ids
    FROM public.role_permissions
    WHERE role_id = v_clean_role_id;

    v_perm_count := cardinality(v_perm_ids);

    SELECT COUNT(*)::INT
    INTO v_user_count
    FROM public.user_roles
    WHERE role_id = v_clean_role_id;

    RETURN jsonb_build_object(
        'id', v_role.id,
        'name_en', v_role.name_en,
        'name_bn', v_role.name_bn,
        'description', v_role.description,
        'active', v_role.active,
        'is_system', v_role.is_system,
        'permission_ids', to_jsonb(v_perm_ids),
        'permission_count', v_perm_count,
        'assigned_user_count', v_user_count,
        'created_at', v_role.created_at,
        'updated_at', v_role.updated_at
    );
END;
$function$
REVOKE ALL ON FUNCTION public.admin_get_role_detail(p_role_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_role_detail(p_role_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_role_detail(p_role_id text) TO service_role;

-- public.admin_get_taxonomy()
CREATE OR REPLACE FUNCTION public.admin_get_taxonomy()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_segments jsonb;
  v_subcategories jsonb;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Access denied. Active administrative session required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission('categories.view') THEN
    RAISE EXCEPTION 'Access denied. Missing categories.view permission.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name_en', s.name_en,
        'name_bn', s.name_bn,
        'active', s.active,
        'sort_order', s.sort_order
      ) ORDER BY s.sort_order, s.id
    ),
    '[]'::jsonb
  )
  INTO v_segments
  FROM public.segments s;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', sc.id,
        'segment_id', sc.segment_id,
        'name_en', sc.name_en,
        'name_bn', sc.name_bn,
        'active', sc.active,
        'sort_order', sc.sort_order
      ) ORDER BY sc.segment_id, sc.sort_order, sc.id
    ),
    '[]'::jsonb
  )
  INTO v_subcategories
  FROM public.subcategories sc;

  RETURN jsonb_build_object(
    'segments', v_segments,
    'subcategories', v_subcategories
  );
END;
$function$
REVOKE ALL ON FUNCTION public.admin_get_taxonomy() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_taxonomy() TO authenticated;

-- public.admin_get_taxonomy_configuration()
CREATE OR REPLACE FUNCTION public.admin_get_taxonomy_configuration()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_segments jsonb;
  v_subcategories jsonb;
  v_schemas jsonb;
begin
  if not public.is_active_admin() then
    raise exception 'Access denied. Active administrative session required.'
      using errcode = '42501';
  end if;

  if not public.has_permission('categories.view') then
    raise exception 'Access denied. Missing categories.view permission.'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name_en', s.name_en,
      'name_bn', s.name_bn,
      'short_name_en', s.short_name_en,
      'short_name_bn', s.short_name_bn,
      'description_en', s.description_en,
      'description_bn', s.description_bn,
      'slug', s.slug,
      'icon_key', s.icon_key,
      'theme_key', s.theme_key,
      'active', s.active,
      'config_status', s.config_status,
      'sort_order', s.sort_order
    ) order by s.sort_order, s.id
  ), '[]'::jsonb)
  into v_segments
  from public.segments s;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', sc.id,
      'segment_id', sc.segment_id,
      'name_en', sc.name_en,
      'name_bn', sc.name_bn,
      'description_en', sc.description_en,
      'description_bn', sc.description_bn,
      'category_group', sc.category_group,
      'is_sensitive', sc.is_sensitive,
      'active', sc.active,
      'config_status', sc.config_status,
      'sort_order', sc.sort_order
    ) order by sc.segment_id, sc.sort_order, sc.id
  ), '[]'::jsonb)
  into v_subcategories
  from public.subcategories sc;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', rfs.id,
      'scope_type', rfs.scope_type,
      'scope_id', rfs.scope_id,
      'version', rfs.version,
      'status', rfs.status,
      'engine_mode', rfs.engine_mode,
      'field_count', (
        select count(*)
        from public.reporting_form_schema_fields rf
        where rf.schema_id = rfs.id
      ),
      'updated_at', rfs.updated_at,
      'published_at', rfs.published_at
    ) order by rfs.scope_type, rfs.scope_id, rfs.version desc
  ), '[]'::jsonb)
  into v_schemas
  from public.reporting_form_schemas rfs;

  return jsonb_build_object(
    'segments', v_segments,
    'subcategories', v_subcategories,
    'form_schemas', v_schemas
  );
end;
$function$
REVOKE ALL ON FUNCTION public.admin_get_taxonomy_configuration() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_taxonomy_configuration() TO authenticated;

-- public.admin_get_unread_notification_count()
CREATE OR REPLACE FUNCTION public.admin_get_unread_notification_count()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_caller_id UUID;
    v_count BIGINT;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION
            'Active administrator required'
            USING ERRCODE = '42501';
    END IF;

    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.admin_notifications n
    WHERE n.recipient_user_id = v_caller_id
      AND n.read_at IS NULL
      AND public.admin_notification_can_currently_view(
          n.recipient_user_id,
          n.audience_mode,
          n.required_all_permissions,
          n.required_any_permissions,
          n.target_type,
          n.target_id
      );

    RETURN v_count;
END;
$function$
REVOKE ALL ON FUNCTION public.admin_get_unread_notification_count() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_unread_notification_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unread_notification_count() TO service_role;

-- public.admin_get_user(p_user_id uuid)
CREATE OR REPLACE FUNCTION public.admin_get_user(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_caller_id UUID;
    v_caller_is_super_admin BOOLEAN;
    v_admin RECORD;
    v_auth_email TEXT;
    v_role RECORD;
    v_perms TEXT[];
    v_can_manage BOOLEAN;
BEGIN
    IF NOT (
        public.has_permission('admin_users.view')
        OR public.has_permission('admin_users.manage')
    ) THEN
        RAISE EXCEPTION
            'Access denied. You do not have permission to view administrative user details.'
            USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required.' USING ERRCODE = '22000';
    END IF;

    v_caller_id := auth.uid();

    SELECT COALESCE(is_super_admin, false)
    INTO v_caller_is_super_admin
    FROM public.admin_users
    WHERE user_id = v_caller_id
      AND active = TRUE;

    SELECT user_id, display_name, active, is_super_admin, created_at, updated_at
    INTO v_admin
    FROM public.admin_users
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Administrator account not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_admin.is_super_admin IS TRUE
       AND v_admin.user_id IS DISTINCT FROM v_caller_id THEN
        RAISE EXCEPTION 'Administrator account not found.' USING ERRCODE = 'P0002';
    END IF;

    SELECT email INTO v_auth_email
    FROM auth.users
    WHERE id = p_user_id;

    IF v_admin.is_super_admin IS TRUE THEN
        IF v_caller_is_super_admin IS TRUE THEN
            SELECT array_agg(id ORDER BY id ASC)
            INTO v_perms
            FROM public.permissions;
        ELSE
            v_perms := ARRAY[]::TEXT[];
        END IF;

        RETURN jsonb_build_object(
            'user_id', v_admin.user_id,
            'display_name', v_admin.display_name,
            'email', v_auth_email,
            'active', v_admin.active,
            'is_super_admin', TRUE,
            'role', NULL,
            'effective_permissions', to_jsonb(v_perms),
            'can_manage_target', FALSE,
            'created_at', v_admin.created_at,
            'updated_at', v_admin.updated_at
        );
    END IF;

    SELECT r.id, r.name_en, r.name_bn, r.description, r.active, r.is_system
    INTO v_role
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id;

    v_can_manage := public.can_manage_user_target(v_admin.user_id);

    IF v_caller_is_super_admin IS NOT TRUE AND v_can_manage IS FALSE THEN
        v_perms := ARRAY[]::TEXT[];
    ELSE
        IF v_role.id IS NOT NULL THEN
            SELECT COALESCE(
                array_agg(rp.permission_id ORDER BY rp.permission_id ASC),
                ARRAY[]::TEXT[]
            )
            INTO v_perms
            FROM public.role_permissions rp
            WHERE rp.role_id = v_role.id;
        ELSE
            v_perms := ARRAY[]::TEXT[];
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'user_id', v_admin.user_id,
        'display_name', v_admin.display_name,
        'email', v_auth_email,
        'active', v_admin.active,
        'is_super_admin', FALSE,
        'role',
            CASE
                WHEN v_role.id IS NOT NULL THEN
                    jsonb_build_object(
                        'id', v_role.id,
                        'name_en', v_role.name_en,
                        'name_bn', v_role.name_bn,
                        'description', v_role.description,
                        'active', v_role.active,
                        'is_system', v_role.is_system
                    )
                ELSE NULL
            END,
        'effective_permissions', to_jsonb(v_perms),
        'can_manage_target', v_can_manage,
        'created_at', v_admin.created_at,
        'updated_at', v_admin.updated_at
    );
END;
$function$
REVOKE ALL ON FUNCTION public.admin_get_user(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user(p_user_id uuid) TO service_role;
