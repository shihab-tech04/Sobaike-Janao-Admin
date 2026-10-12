-- Public → SQL → Admin alignment: expose citizen-submitted mentioned parties to authorized Admin complaint detail views.
-- Additive/read-only. Does not change Public behavior, complaint submission, moderation, RLS, or existing RPC contracts.

create or replace function public.admin_get_complaint_parties(p_complaint_id text)
returns table(
  id uuid,
  complaint_id text,
  name text,
  party_type text,
  role_or_designation text,
  organization text,
  phone_or_contact text,
  public_profile_handle text,
  address text,
  identifying_description text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
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
$$;

revoke all on function public.admin_get_complaint_parties(text) from public;
revoke all on function public.admin_get_complaint_parties(text) from anon;
grant execute on function public.admin_get_complaint_parties(text) to authenticated;
