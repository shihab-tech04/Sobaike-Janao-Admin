-- Admin Harassment classification map alignment
-- Additive extension only: same active-admin + map.view contract, same output structure,
-- with three harassment classification fields included per complaint row for client-side filtering.

create or replace function public.admin_get_map_dataset()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
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
$$;

revoke all on function public.admin_get_map_dataset() from public;
grant execute on function public.admin_get_map_dataset() to authenticated, service_role;
