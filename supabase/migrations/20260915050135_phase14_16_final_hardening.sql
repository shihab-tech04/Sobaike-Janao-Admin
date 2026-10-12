-- Phase 14/16 final hardening: preserve product behavior while tightening RBAC,
-- fixing function search_path, reducing RLS overhead, and adding verified query/FK indexes.

-- 1) Fix mutable search_path on shared trigger helper.
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public;

-- 2) Trigger/event-trigger functions are internal implementation details, not RPC endpoints.
REVOKE ALL ON FUNCTION public.protect_super_admin_invariants() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_super_admin_user_roles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- 3) Restore complaint RBAC: remove the permissive policy that let every active admin
-- read complaint rows regardless of complaints.view. The permission-gated policy remains.
DROP POLICY IF EXISTS "active admins can read complaints" ON public.complaints;

-- 4) Remove redundant admin_users SELECT policy. The remaining own-membership policy
-- preserves the existing effective access (including visibility of inactive own membership).
DROP POLICY IF EXISTS "admin can read own membership" ON public.admin_users;

-- 5) Optimize auth.uid() calls in RLS policies without changing access semantics.
ALTER POLICY "Users can read own admin membership"
ON public.admin_users
USING (user_id = (SELECT auth.uid()));

ALTER POLICY "Users can read own role assignment"
ON public.user_roles
USING (user_id = (SELECT auth.uid()));

ALTER POLICY "Scope-safe roles direct read"
ON public.roles
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.active = true
      AND (
        au.is_super_admin = true
        OR NOT EXISTS (SELECT 1 FROM public.user_roles)
        OR roles.id IN (
          SELECT ur.role_id
          FROM public.user_roles ur
          WHERE ur.user_id = (SELECT auth.uid())
        )
        OR public.can_manage_role_scope(roles.id)
      )
  )
);

ALTER POLICY "Scope-safe role_permissions direct read"
ON public.role_permissions
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.active = true
      AND (
        au.is_super_admin = true
        OR NOT EXISTS (SELECT 1 FROM public.user_roles)
        OR role_permissions.role_id IN (
          SELECT ur.role_id
          FROM public.user_roles ur
          WHERE ur.user_id = (SELECT auth.uid())
        )
        OR public.can_manage_role_scope(role_permissions.role_id)
      )
  )
);

ALTER POLICY "admin_notifications_select_own"
ON public.admin_notifications
USING (
  recipient_user_id = (SELECT auth.uid())
  AND public.is_active_admin()
  AND public.admin_notification_can_currently_view(
    recipient_user_id,
    audience_mode,
    required_all_permissions,
    required_any_permissions,
    target_type,
    target_id
  )
);

-- 6) High-value public-feed index (status filter + chronological ordering).
CREATE INDEX IF NOT EXISTS idx_complaints_status_created_at_id
  ON public.complaints (status, created_at DESC, id DESC);

-- 7) Cover live foreign-key / lookup paths identified by the database advisor.
CREATE INDEX IF NOT EXISTS idx_additional_info_submissions_complaint_id
  ON public.additional_info_submissions (complaint_id);

CREATE INDEX IF NOT EXISTS idx_complaint_evidence_complaint_id
  ON public.complaint_evidence (complaint_id);

CREATE INDEX IF NOT EXISTS idx_complaint_parties_complaint_id
  ON public.complaint_parties (complaint_id);

CREATE INDEX IF NOT EXISTS idx_complaint_updates_complaint_id
  ON public.complaint_updates (complaint_id);

CREATE INDEX IF NOT EXISTS idx_complaints_segment_id
  ON public.complaints (segment_id);

CREATE INDEX IF NOT EXISTS idx_complaints_subcategory_id
  ON public.complaints (subcategory_id);

CREATE INDEX IF NOT EXISTS idx_subcategories_segment_id
  ON public.subcategories (segment_id);

CREATE INDEX IF NOT EXISTS idx_subject_responses_complaint_id
  ON public.subject_responses (complaint_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by
  ON public.user_roles (assigned_by);
