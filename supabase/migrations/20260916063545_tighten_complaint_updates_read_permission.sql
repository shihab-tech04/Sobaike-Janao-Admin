drop policy if exists "active admins can read complaint updates" on public.complaint_updates;
create policy "authorized admins can read complaint updates"
on public.complaint_updates
for select
to authenticated
using (public.has_permission('complaints.view'));
