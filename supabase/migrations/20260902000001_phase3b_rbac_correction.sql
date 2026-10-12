-- ==============================================================================
-- SOBAIKE JANAO ADMIN — PHASE 3B: RBAC FOUNDATION CORRECTION MIGRATION
-- ==============================================================================
-- Repository: shihabshajib01-cell/sobaike-janao-admin
-- Target: Supabase PostgreSQL Database
-- Purpose: 
--   1. Add public.roles.active (BOOLEAN NOT NULL DEFAULT true) for Role Active/Inactive status.
--   2. Add public.admin_users.display_name (TEXT NULL) for editable User Name.
--   3. Tighten RLS policies:
--      - public.admin_users: Strict self-read only (user_id = auth.uid()).
--      - public.user_roles: Strict self-read only (user_id = auth.uid()).
--      - public.admin_audit_logs: Disallow direct client table SELECT during Phase 3B.
--      - public.roles, permissions, role_permissions: Read-only for active admins.
--   4. Update permission seeding strategy to ON CONFLICT (id) DO NOTHING.
-- Safety: Additive, idempotent, non-destructive. Transaction-wrapped.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ADD roles.active (FOR APPROVED ROLE ACTIVE/INACTIVE FLOW)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'roles'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'active'
        ) THEN
            ALTER TABLE public.roles ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;
        END IF;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. ADD admin_users.display_name (FOR APPROVED USER DISPLAY NAME FLOW)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'admin_users'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'display_name'
        ) THEN
            ALTER TABLE public.admin_users ADD COLUMN display_name TEXT NULL;
        END IF;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. CANONICAL PERMISSION SEEDING (NON-OVERWRITING)
-- ------------------------------------------------------------------------------
INSERT INTO public.permissions (id, module, action, name_en, name_bn, description)
VALUES
    -- Dashboard Module
    ('dashboard.view', 'dashboard', 'view', 'View Dashboard', 'ড্যাশবোর্ড দেখুন', 'View aggregate analytics, KPI statistics, and platform overview metrics.'),
    
    -- Complaints Management Module
    ('complaints.view', 'complaints', 'view', 'View Complaints', 'অভিযোগ দেখুন', 'View complaint dossier registry, search, filter, and read details.'),
    ('complaints.evidence_view', 'complaints', 'evidence_view', 'View Private Evidence', 'সংবেদনশীল প্রমাণাদি দেখুন', 'View citizen-submitted private photographic and video evidence media.'),
    ('complaints.export', 'complaints', 'export', 'Export Complaints', 'অভিযোগ রপ্তানি করুন', 'Export filtered complaint registries to CSV and PDF documents.'),
    ('complaints.publish', 'complaints', 'publish', 'Publish Complaint', 'অভিযোগ প্রকাশ করুন', 'Publish approved complaints to the public citizen feed.'),
    ('complaints.unpublish', 'complaints', 'unpublish', 'Unpublish Complaint', 'অভিযোগ অপ্রকাশিত করুন', 'Retract published complaints from the public citizen feed.'),
    ('complaints.reject', 'complaints', 'reject', 'Reject Complaint', 'অভিযোগ প্রত্যাখ্যান করুন', 'Reject invalid complaints with reason codes and administrative notes.'),
    
    -- Categories Taxonomy Module
    ('categories.view', 'categories', 'view', 'View Categories', 'ক্যাটাগরি দেখুন', 'View complaint taxonomy segments and subcategories.'),
    
    -- Location Activity Module (Privacy-Sensitive)
    ('location_activity.view', 'location_activity', 'view', 'View Location Activity', 'লোকেশন অ্যাক্টিভিটি দেখুন', 'View visitor telemetry, permission grant analytics, and session logs.'),
    
    -- Map Monitoring Module (Connected & Live)
    ('map.view', 'map', 'view', 'View Map Monitoring', 'ম্যাপ মনিটরিং দেখুন', 'View geospatial incident mapping, district distributions, and location markers.'),
    
    -- Responses Module (Reserved for future activation)
    ('responses.view', 'responses', 'view', 'View Responses', 'প্রতিক্রিয়া দেখুন', 'View official agency response module.'),
    
    -- Future Administration Modules (Schema definitions only; inactive in UI)
    ('admin_users.view', 'admin_users', 'view', 'View Administrators', 'অ্যাডমিন ব্যবহারকারী দেখুন', 'View administrative user directory and active statuses.'),
    ('admin_users.manage', 'admin_users', 'manage', 'Manage Administrators', 'অ্যাডমিন পরিচালনা করুন', 'Invite, activate, deactivate, and manage administrative user accounts.'),
    ('roles.manage', 'roles', 'manage', 'Manage Roles', 'ভূমিকা পরিচালনা করুন', 'Create, update, and configure role definitions and permission sets.'),
    ('audit.view', 'audit', 'view', 'View Audit Logs', 'অডিট লগ দেখুন', 'Inspect administrative security audit trail and historical logs.')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. TIGHTENED ROW-LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Ensure RLS is active on all tables
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 4.1. Tightened Policy for public.admin_users
-- Authenticated users can read ONLY their own record to verify membership and fetch their display_name.
-- Global admin directory querying belongs to Phase 3D via controlled endpoints with admin_users.view permission.
DROP POLICY IF EXISTS "Users can read own admin membership" ON public.admin_users;
CREATE POLICY "Users can read own admin membership"
    ON public.admin_users
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- 4.2. Tightened Policy for public.user_roles
-- Authenticated users can read ONLY their own role assignment for permission resolution.
-- Global role assignment querying is withheld until Phase 3D User Management.
DROP POLICY IF EXISTS "Users can read own role assignment" ON public.user_roles;
CREATE POLICY "Users can read own role assignment"
    ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- 4.3. Policies for public.permissions
-- Active administrators can read canonical permission definitions.
DROP POLICY IF EXISTS "Active admins can read permissions" ON public.permissions;
CREATE POLICY "Active admins can read permissions"
    ON public.permissions
    FOR SELECT
    TO authenticated
    USING (public.is_active_admin());

-- 4.4. Policies for public.roles
-- Active administrators can read role definitions for permission resolution.
DROP POLICY IF EXISTS "Active admins can read roles" ON public.roles;
CREATE POLICY "Active admins can read roles"
    ON public.roles
    FOR SELECT
    TO authenticated
    USING (public.is_active_admin());

-- 4.5. Policies for public.role_permissions
-- Active administrators can read role-permission mapping.
DROP POLICY IF EXISTS "Active admins can read role_permissions" ON public.role_permissions;
CREATE POLICY "Active admins can read role_permissions"
    ON public.role_permissions
    FOR SELECT
    TO authenticated
    USING (public.is_active_admin());

-- 4.6. Policy for public.admin_audit_logs
-- Disallow direct table SELECT from normal browser clients during Phase 3B.
-- Audit trail reads will be mediated via controlled RPCs with audit.view permission in Phase 3H.
DROP POLICY IF EXISTS "Active admins can read audit logs" ON public.admin_audit_logs;

-- ------------------------------------------------------------------------------
-- 5. PERMISSIONS & GRANTS SANITIZATION
-- ------------------------------------------------------------------------------

-- Ensure anon has zero access to RBAC tables
REVOKE ALL ON public.admin_users FROM anon;
REVOKE ALL ON public.roles FROM anon;
REVOKE ALL ON public.permissions FROM anon;
REVOKE ALL ON public.role_permissions FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.admin_audit_logs FROM anon;

-- Grant selective SELECT to authenticated (strictly governed by RLS)
GRANT SELECT ON public.admin_users TO authenticated;
GRANT SELECT ON public.roles TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- Disallow SELECT grant on admin_audit_logs from authenticated during Phase 3B
REVOKE SELECT ON public.admin_audit_logs FROM authenticated;

COMMIT;
