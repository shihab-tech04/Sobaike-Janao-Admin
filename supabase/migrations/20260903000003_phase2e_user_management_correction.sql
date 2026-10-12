-- ==============================================================================
-- Migration: 20260903000003_phase2e_user_management_correction.sql
-- Description: Phase 2E targeted corrections:
--   1. Recreate trg_protect_super_admin_user_roles on public.user_roles to cover
--      BEFORE INSERT OR UPDATE OR DELETE, enforcing delete protection for Super Admin.
--   2. Add public.admin_get_user_filter_roles() for admin_users.view-only users
--      so they can populate the Role filter dropdown without admin_users.manage.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENFORCE SUPER ADMIN user_roles DELETE PROTECTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_super_admin_user_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_is_super BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        SELECT is_super_admin INTO v_is_super 
        FROM public.admin_users 
        WHERE user_id = NEW.user_id;

        IF v_is_super IS TRUE THEN
            RAISE EXCEPTION 'Operation rejected: Super Administrator permissions are system-level and cannot be bound to an editable role.'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        SELECT is_super_admin INTO v_is_super 
        FROM public.admin_users 
        WHERE user_id = OLD.user_id;

        IF v_is_super IS TRUE THEN
            RAISE EXCEPTION 'Operation rejected: Super Administrator account role mapping cannot be deleted.'
                USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_user_roles ON public.user_roles;
CREATE TRIGGER trg_protect_super_admin_user_roles
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.protect_super_admin_user_roles();

-- ------------------------------------------------------------------------------
-- 2. READ-SAFE ROLE FILTER RPC FOR VIEW-ONLY USERS: public.admin_get_user_filter_roles()
--    Requires admin_users.view permission (does not require admin_users.manage).
--    Returns only id, name_en, name_bn, active for the filter dropdown.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_user_filter_roles()
RETURNS TABLE (
    id TEXT,
    name_en TEXT,
    name_bn TEXT,
    active BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Caller must have admin_users.view permission
    IF NOT public.has_permission('admin_users.view') THEN
        RAISE EXCEPTION 'Access denied. User view authorization required.'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.name_en,
        r.name_bn,
        r.active
    FROM public.roles r
    ORDER BY r.name_en ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_filter_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_user_filter_roles() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_filter_roles() TO authenticated;
