-- ==============================================================================
-- Migration: 20260904000003_phase2e_edge_function_service_privileges.sql
-- Description: Grant narrow service_role read privileges required by Edge Function
--              (admin-create-user) to verify super admin existence and active role status.
-- ==============================================================================

BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT ON TABLE
    public.admin_users,
    public.roles
TO service_role;

COMMIT;
