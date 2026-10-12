revoke execute on function public.can_manage_roles() from authenticated;
revoke execute on function public.count_effective_role_managers() from authenticated;
revoke execute on function public.generate_role_slug(text) from authenticated;
revoke execute on function public.log_role_audit_event(text, text, jsonb) from authenticated;
