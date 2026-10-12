-- ==============================================================================
-- SOBAIKE JANAO ADMIN — PHASE 3B: DATABASE & RBAC SCHEMA FOUNDATION
-- ==============================================================================
-- Repository: shihabshajib01-cell/sobaike-janao-admin
-- Target: Supabase PostgreSQL Database
-- Purpose: Create relational RBAC schema (roles, permissions, role_permissions,
--          user_roles, admin_audit_logs), seed canonical active permissions,
--          and apply restrictive Row-Level Security (RLS) policies.
-- Safety: Additive, idempotent, non-destructive. Preserves active admin_users gate.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTEND public.admin_users (NON-DESTRUCTIVE / SAFE COLUMNS ONLY)
-- ------------------------------------------------------------------------------
-- Ensure admin_users exists and add standard audit timestamps + display_name if missing.
-- Preserves verified fields: user_id (UUID PK) and active (BOOLEAN).

CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safely add columns if table already existed with fewer columns
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'display_name'
    ) THEN
        ALTER TABLE public.admin_users ADD COLUMN display_name TEXT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.admin_users ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.admin_users ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. HELPER FUNCTION: is_active_admin()
-- ------------------------------------------------------------------------------
-- Prevents recursive RLS evaluation and provides a secure, fast membership check.
-- SECURITY DEFINER with fixed search_path to prevent search_path injection.

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = auth.uid()
          AND active = true
    );
$$;

-- Secure grants for helper function
REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. RBAC TABLES CREATION
-- ------------------------------------------------------------------------------

-- Table: public.roles
CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_bn TEXT NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: public.permissions
CREATE TABLE IF NOT EXISTS public.permissions (
    id TEXT PRIMARY KEY,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    name_en TEXT NOT NULL,
    name_bn TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: public.role_permissions (Junction table)
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);

-- Table: public.user_roles (One primary role per administrator enforced for Phase 3)
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID PRIMARY KEY REFERENCES public.admin_users(user_id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
    assigned_by UUID REFERENCES public.admin_users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: public.admin_audit_logs (Immutable append-only administrative log)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.admin_users(user_id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 4. PERFORMANCE & LOOKUP INDEXES
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_permissions_module ON public.permissions(module);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON public.role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON public.admin_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs(action);

-- ------------------------------------------------------------------------------
-- 5. CANONICAL PERMISSION SEEDING (IDEMPOTENT & NON-OVERWRITING)
-- ------------------------------------------------------------------------------
-- Derived strictly from Phase 3A Architecture Specification and reconciled with
-- live connected modules (including live Map Monitoring).

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
-- 6. TIGHTENED ROW-LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 6.1. Policies for public.admin_users
-- Preserve current login flow: authenticated users can read ONLY their own record to verify membership and display name.
DROP POLICY IF EXISTS "Users can read own admin membership" ON public.admin_users;
CREATE POLICY "Users can read own admin membership"
    ON public.admin_users
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Disallow direct client-side insert/update/delete on admin_users (DENIED by default)

-- 6.2. Policies for public.permissions
-- Read-only for authenticated active admins
DROP POLICY IF EXISTS "Active admins can read permissions" ON public.permissions;
CREATE POLICY "Active admins can read permissions"
    ON public.permissions
    FOR SELECT
    TO authenticated
    USING (public.is_active_admin());

-- 6.3. Policies for public.roles
-- Read-only for authenticated active admins during Phase 3B
DROP POLICY IF EXISTS "Active admins can read roles" ON public.roles;
CREATE POLICY "Active admins can read roles"
    ON public.roles
    FOR SELECT
    TO authenticated
    USING (public.is_active_admin());

-- 6.4. Policies for public.role_permissions
-- Read-only for authenticated active admins
DROP POLICY IF EXISTS "Active admins can read role_permissions" ON public.role_permissions;
CREATE POLICY "Active admins can read role_permissions"
    ON public.role_permissions
    FOR SELECT
    TO authenticated
    USING (public.is_active_admin());

-- 6.5. Policies for public.user_roles
-- Authenticated users can read ONLY their own role assignment for permission resolution
DROP POLICY IF EXISTS "Users can read own role assignment" ON public.user_roles;
CREATE POLICY "Users can read own role assignment"
    ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Direct client-side INSERT/UPDATE/DELETE on user_roles is strictly prohibited (no mutation policies)

-- 6.6. Policies for public.admin_audit_logs
-- No direct client table SELECT during Phase 3B. (Audit trail reads will be mediated via controlled RPCs with audit.view in Phase 3H).
DROP POLICY IF EXISTS "Active admins can read audit logs" ON public.admin_audit_logs;

-- ------------------------------------------------------------------------------
-- 7. PERMISSIONS & GRANTS SANITIZATION
-- ------------------------------------------------------------------------------

-- Revoke all permissions from anon
REVOKE ALL ON public.admin_users FROM anon;
REVOKE ALL ON public.roles FROM anon;
REVOKE ALL ON public.permissions FROM anon;
REVOKE ALL ON public.role_permissions FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.admin_audit_logs FROM anon;

-- Grant selective SELECT to authenticated (governed by RLS)
GRANT SELECT ON public.admin_users TO authenticated;
GRANT SELECT ON public.roles TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- Disallow SELECT grant on admin_audit_logs from authenticated during Phase 3B
REVOKE SELECT ON public.admin_audit_logs FROM authenticated;

COMMIT;
