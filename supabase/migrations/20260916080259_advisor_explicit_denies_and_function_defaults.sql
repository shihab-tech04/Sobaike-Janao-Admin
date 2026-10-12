create policy "deny_direct_client_access_additional_info_submissions"
on public.additional_info_submissions
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access_admin_audit_logs"
on public.admin_audit_logs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access_admin_notification_event_catalogue"
on public.admin_notification_event_catalogue
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access_complaint_responses"
on public.complaint_responses
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access_complaint_submission_contexts"
on public.complaint_submission_contexts
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny_direct_client_access_subject_responses"
on public.subject_responses
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
