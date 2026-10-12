-- ==============================================================================
-- SOBAIKE JANAO ADMIN — PHASE 3B: PRIVILEGE HARDENING MIGRATION
-- ==============================================================================
-- Repository: shihabshajib01-cell/sobaike-janao-admin
-- Target: Supabase PostgreSQL Database
-- Purpose: Explicitly revoke mutation privileges (INSERT, UPDATE, DELETE, TRUNCATE,
--          REFERENCES, TRIGGER) on all RBAC & admin security tables from
--          authenticated browser roles for defense-in-depth security.
-- Safety: Additive, idempotent, non-destructive. Transaction-wrapped.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXPLICITLY REVOKE MUTATION PRIVILEGES FROM authenticated
-- ------------------------------------------------------------------------------
-- Normal browser clients must NEVER be granted direct table mutation rights.
-- Mutations will be mediated exclusively via controlled SECURITY DEFINER RPCs
-- in subsequent phases (Phase 3D, 3E, 3H) with explicit permission checks.

DO $$
BEGIN
    -- 1.1. public.admin_users
    IF to_regclass('public.admin_users') IS NOT NULL THEN
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.admin_users FROM authenticated;
        GRANT SELECT ON public.admin_users TO authenticated;
    END IF;

    -- 1.2. public.roles
    IF to_regclass('public.roles') IS NOT NULL THEN
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.roles FROM authenticated;
        GRANT SELECT ON public.roles TO authenticated;
    END IF;

    -- 1.3. public.permissions
    IF to_regclass('public.permissions') IS NOT NULL THEN
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.permissions FROM authenticated;
        GRANT SELECT ON public.permissions TO authenticated;
    END IF;

    -- 1.4. public.role_permissions
    IF to_regclass('public.role_permissions') IS NOT NULL THEN
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.role_permissions FROM authenticated;
        GRANT SELECT ON public.role_permissions TO authenticated;
    END IF;

    -- 1.5. public.user_roles
    IF to_regclass('public.user_roles') IS NOT NULL THEN
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_roles FROM authenticated;
        GRANT SELECT ON public.user_roles TO authenticated;
    END IF;

    -- 1.6. public.admin_audit_logs
    IF to_regclass('public.admin_audit_logs') IS NOT NULL THEN
        REVOKE ALL ON public.admin_audit_logs FROM authenticated;
        -- Direct client SELECT is also withheld during Phase 3B
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. ENSURE COMPLETE ISOLATION FROM anon
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.admin_users') IS NOT NULL THEN
        REVOKE ALL ON public.admin_users FROM anon;
    END IF;
    IF to_regclass('public.roles') IS NOT NULL THEN
        REVOKE ALL ON public.roles FROM anon;
    END IF;
    IF to_regclass('public.permissions') IS NOT NULL THEN
        REVOKE ALL ON public.permissions FROM anon;
    END IF;
    IF to_regclass('public.role_permissions') IS NOT NULL THEN
        REVOKE ALL ON public.role_permissions FROM anon;
    END IF;
    IF to_regclass('public.user_roles') IS NOT NULL THEN
        REVOKE ALL ON public.user_roles FROM anon;
    END IF;
    IF to_regclass('public.admin_audit_logs') IS NOT NULL THEN
        REVOKE ALL ON public.admin_audit_logs FROM anon;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. ENSURE HELPER FUNCTION EXECUTION PRIVILEGES
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'is_active_admin'
    ) THEN
        REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC;
        REVOKE ALL ON FUNCTION public.is_active_admin() FROM anon;
        GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;
    END IF;
END $$;

COMMIT;
