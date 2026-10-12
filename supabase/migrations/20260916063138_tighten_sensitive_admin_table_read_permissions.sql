drop policy if exists "active admins can read complaint evidence" on public.complaint_evidence;
create policy "authorized admins can read complaint evidence"
on public.complaint_evidence
for select
to authenticated
using (public.has_permission('complaints.evidence_view'));

drop policy if exists "active admins can read complaint parties" on public.complaint_parties;
create policy "authorized admins can read complaint parties"
on public.complaint_parties
for select
to authenticated
using (public.has_permission('complaints.view'));

drop policy if exists "active admins can read public visit sessions" on public.public_visit_sessions;
create policy "authorized admins can read public visit sessions"
on public.public_visit_sessions
for select
to authenticated
using (public.has_permission('location_activity.view'));
