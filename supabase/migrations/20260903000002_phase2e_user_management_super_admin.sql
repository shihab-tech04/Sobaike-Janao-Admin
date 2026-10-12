-- ==============================================================================
-- Migration: 20260903000002_phase2e_user_management_super_admin.sql
-- Module: Phase 2E — User Management + User-Role Assignment + Protected Super Admin
-- Safety: Strict Transactional, Single Super Admin Invariant, Super Admin Protection,
--         Dynamic Permissions for Super Admin, Preserves Last Manager Protection,
--         Fail-Closed Permission Verification, Atomic User Creation/Update.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTEND public.admin_users WITH is_super_admin
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = 'admin_users' 
          AND column_name = 'is_super_admin'
    ) THEN
        ALTER TABLE public.admin_users 
        ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. ENFORCE SINGLE SUPER ADMIN & ACTIVE INVARIANTS
-- ------------------------------------------------------------------------------
-- Partial unique index ensuring at most ONE active Super Admin in the system
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_single_super_admin_idx 
ON public.admin_users (is_super_admin) 
WHERE (is_super_admin = true);

-- Super admin must always remain active
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'admin_users_super_admin_must_be_active'
    ) THEN
        ALTER TABLE public.admin_users 
        ADD CONSTRAINT admin_users_super_admin_must_be_active 
        CHECK (is_super_admin = false OR active = true);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. TRIGGER: PROTECT SUPER ADMIN AGAINST DELETION, DEMOTION, OR DEACTIVATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_super_admin_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_super_admin THEN
            RAISE EXCEPTION 'Operation rejected: Super Administrator account cannot be deleted.'
                USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.is_super_admin THEN
            -- Prevent demoting from super admin
            IF NEW.is_super_admin IS DISTINCT FROM true THEN
                RAISE EXCEPTION 'Operation rejected: Super Administrator account cannot be demoted.'
                    USING ERRCODE = '42501';
            END IF;
            -- Prevent deactivating super admin
            IF NEW.active IS DISTINCT FROM true THEN
                RAISE EXCEPTION 'Operation rejected: Super Administrator account cannot be deactivated.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin ON public.admin_users;
CREATE TRIGGER trg_protect_super_admin
BEFORE UPDATE OR DELETE ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.protect_super_admin_invariants();

-- Prevent direct user_roles manipulation for Super Admin
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
            -- Allow cleanup of stale legacy rows if needed, but not through standard admin operations
            RETURN OLD;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_user_roles ON public.user_roles;
CREATE TRIGGER trg_protect_super_admin_user_roles
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.protect_super_admin_user_roles();

-- ------------------------------------------------------------------------------
-- 4. UPDATE count_effective_role_managers() TO COUNT SUPER ADMIN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_effective_role_managers()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT COUNT(DISTINCT au.user_id)::BIGINT
    FROM public.admin_users au
    LEFT JOIN public.user_roles ur ON ur.user_id = au.user_id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    LEFT JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.permission_id = 'roles.manage'
    WHERE au.active = true
      AND (
          au.is_super_admin = true
          OR (r.active = true AND rp.permission_id = 'roles.manage')
      );
$$;

REVOKE ALL ON FUNCTION public.count_effective_role_managers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_effective_role_managers() FROM anon;
GRANT EXECUTE ON FUNCTION public.count_effective_role_managers() TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. UPDATE has_permission() TO GRANT FULL ACCESS TO SUPER ADMIN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_id text)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_is_super_admin BOOLEAN;
    v_perm_exists BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    -- Step 1: Check if caller is an active Super Admin
    SELECT COALESCE(is_super_admin, false)
    INTO v_is_super_admin
    FROM public.admin_users
    WHERE user_id = auth.uid() AND active = true;

    IF v_is_super_admin IS TRUE THEN
        -- Super Admin automatically holds all valid permissions in the canonical permissions table
        SELECT EXISTS (
            SELECT 1 FROM public.permissions WHERE id = p_permission_id
        ) INTO v_perm_exists;
        RETURN v_perm_exists;
    END IF;

    -- Step 2: Normal admin role-based permission lookup
    RETURN EXISTS (
        SELECT 1
        FROM public.admin_users au
        JOIN public.user_roles ur ON ur.user_id = au.user_id
        JOIN public.roles r ON r.id = ur.role_id
        JOIN public.role_permissions rp ON rp.role_id = r.id
        WHERE au.user_id = auth.uid()
          AND au.active = true
          AND r.active = true
          AND rp.permission_id = p_permission_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. UPDATE admin_get_my_authorization_context()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_my_authorization_context()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID;
    v_is_active_admin BOOLEAN;
    v_is_super_admin BOOLEAN;
    v_has_any_user_roles BOOLEAN;
    v_role_record RECORD;
    v_permissions_json JSONB;
    v_role_json JSONB;
BEGIN
    v_user_id := auth.uid();

    -- Step 1: Check if caller is authenticated
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'is_admin', false,
            'is_super_admin', false,
            'is_bootstrap', false,
            'role', NULL,
            'permission_ids', '[]'::jsonb
        );
    END IF;

    -- Step 2: Check active admin status and super admin flag
    SELECT active, COALESCE(is_super_admin, false)
    INTO v_is_active_admin, v_is_super_admin
    FROM public.admin_users
    WHERE user_id = v_user_id;

    IF v_is_active_admin IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'is_admin', false,
            'is_super_admin', false,
            'is_bootstrap', false,
            'role', NULL,
            'permission_ids', '[]'::jsonb
        );
    END IF;

    -- Step 3: If Super Admin -> Dynamic all canonical permissions, no editable role dependence
    IF v_is_super_admin IS TRUE THEN
        SELECT COALESCE(jsonb_agg(p.id ORDER BY p.id), '[]'::jsonb)
        INTO v_permissions_json
        FROM public.permissions p;

        RETURN jsonb_build_object(
            'is_admin', true,
            'is_super_admin', true,
            'is_bootstrap', false,
            'role', NULL,
            'permission_ids', COALESCE(v_permissions_json, '[]'::jsonb)
        );
    END IF;

    -- Step 4: Normal user -> Check assigned role in public.user_roles
    SELECT 
        r.id,
        r.name_en,
        r.name_bn,
        r.description,
        r.active,
        r.is_system
    INTO v_role_record
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id;

    IF FOUND THEN
        v_role_json := jsonb_build_object(
            'id', v_role_record.id,
            'name_en', v_role_record.name_en,
            'name_bn', v_role_record.name_bn,
            'description', v_role_record.description,
            'active', v_role_record.active,
            'is_system', v_role_record.is_system
        );

        IF v_role_record.active THEN
            SELECT COALESCE(jsonb_agg(rp.permission_id ORDER BY rp.permission_id), '[]'::jsonb)
            INTO v_permissions_json
            FROM public.role_permissions rp
            WHERE rp.role_id = v_role_record.id;

            RETURN jsonb_build_object(
                'is_admin', true,
                'is_super_admin', false,
                'is_bootstrap', false,
                'role', v_role_json,
                'permission_ids', COALESCE(v_permissions_json, '[]'::jsonb)
            );
        ELSE
            RETURN jsonb_build_object(
                'is_admin', true,
                'is_super_admin', false,
                'is_bootstrap', false,
                'role', v_role_json,
                'permission_ids', '[]'::jsonb
            );
        END IF;
    END IF;

    -- Step 5: User has no role assigned. Check genuine bootstrap mode.
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
    ) INTO v_has_any_user_roles;

    IF NOT v_has_any_user_roles THEN
        RETURN jsonb_build_object(
            'is_admin', true,
            'is_super_admin', false,
            'is_bootstrap', true,
            'role', jsonb_build_object(
                'id', 'bootstrap_admin',
                'name_en', 'Bootstrap Administrator',
                'name_bn', 'বুটস্ট্র্যাপ অ্যাডমিনিস্ট্রেটর',
                'description', 'Initial system administrator in bootstrap setup mode',
                'active', true,
                'is_system', true
            ),
            'permission_ids', jsonb_build_array('roles.manage')
        );
    END IF;

    -- Normal admin with no role assigned -> 0 permissions
    RETURN jsonb_build_object(
        'is_admin', true,
        'is_super_admin', false,
        'is_bootstrap', false,
        'role', NULL,
        'permission_ids', '[]'::jsonb
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_my_authorization_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_my_authorization_context() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_my_authorization_context() TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. READ RPC: public.admin_get_assignable_roles()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_assignable_roles()
RETURNS TABLE (
    id TEXT,
    name_en TEXT,
    name_bn TEXT,
    description TEXT,
    active BOOLEAN,
    is_system BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Caller must have admin_users.manage permission or be Super Admin
    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION 'Access denied. User management authorization required.'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.name_en,
        r.name_bn,
        r.description,
        r.active,
        r.is_system
    FROM public.roles r
    WHERE r.active = true
    ORDER BY r.name_en ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_assignable_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_assignable_roles() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_assignable_roles() TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. READ RPC: public.admin_get_users(...)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_users(
    p_search TEXT DEFAULT NULL,
    p_role_id TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_clean_search TEXT;
    v_clean_role TEXT;
    v_clean_status TEXT;
    v_limit INT;
    v_offset INT;
    v_total_count BIGINT;
    v_users_json JSONB;
BEGIN
    -- Validate caller has admin_users.view permission
    IF NOT public.has_permission('admin_users.view') THEN
        RAISE EXCEPTION 'Access denied. User view authorization required.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_search := NULLIF(btrim(p_search), '');
    v_clean_role := NULLIF(btrim(p_role_id), '');
    v_clean_status := NULLIF(lower(btrim(p_status)), '');
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);

    -- Calculate total matching count
    SELECT COUNT(*)
    INTO v_total_count
    FROM public.admin_users au
    JOIN auth.users u ON u.id = au.user_id
    LEFT JOIN public.user_roles ur ON ur.user_id = au.user_id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    WHERE (
        v_clean_search IS NULL
        OR au.display_name ILIKE ('%' || v_clean_search || '%')
        OR u.email ILIKE ('%' || v_clean_search || '%')
    )
    AND (
        v_clean_role IS NULL
        OR ur.role_id = v_clean_role
    )
    AND (
        v_clean_status IS NULL
        OR v_clean_status = 'all'
        OR (v_clean_status = 'active' AND au.active = true)
        OR (v_clean_status = 'inactive' AND au.active = false)
    );

    -- Fetch paginated results
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'user_id', au.user_id,
                'display_name', au.display_name,
                'email', u.email,
                'active', au.active,
                'is_super_admin', au.is_super_admin,
                'role_id', r.id,
                'role_name_en', r.name_en,
                'role_name_bn', r.name_bn,
                'created_at', au.created_at
            )
            ORDER BY au.is_super_admin DESC, au.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_users_json
    FROM (
        SELECT au.user_id, au.display_name, au.active, au.is_super_admin, au.created_at, ur.role_id
        FROM public.admin_users au
        JOIN auth.users u ON u.id = au.user_id
        LEFT JOIN public.user_roles ur ON ur.user_id = au.user_id
        LEFT JOIN public.roles r ON r.id = ur.role_id
        WHERE (
            v_clean_search IS NULL
            OR au.display_name ILIKE ('%' || v_clean_search || '%')
            OR u.email ILIKE ('%' || v_clean_search || '%')
        )
        AND (
            v_clean_role IS NULL
            OR ur.role_id = v_clean_role
        )
        AND (
            v_clean_status IS NULL
            OR v_clean_status = 'all'
            OR (v_clean_status = 'active' AND au.active = true)
            OR (v_clean_status = 'inactive' AND au.active = false)
        )
        ORDER BY au.is_super_admin DESC, au.created_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) sub
    JOIN public.admin_users au ON au.user_id = sub.user_id
    JOIN auth.users u ON u.id = au.user_id
    LEFT JOIN public.user_roles ur ON ur.user_id = au.user_id
    LEFT JOIN public.roles r ON r.id = ur.role_id;

    RETURN jsonb_build_object(
        'users', v_users_json,
        'total_count', v_total_count,
        'limit', v_limit,
        'offset', v_offset
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_users(text, text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_users(text, text, text, int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_users(text, text, text, int, int) TO authenticated;

-- ------------------------------------------------------------------------------
-- 9. READ RPC: public.admin_get_user(p_user_id uuid)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_admin RECORD;
    v_user_email TEXT;
    v_role_record RECORD;
    v_perms JSONB;
BEGIN
    IF NOT public.has_permission('admin_users.view') THEN
        RAISE EXCEPTION 'Access denied. User view authorization required.'
            USING ERRCODE = '42501';
    END IF;

    SELECT au.user_id, au.display_name, au.active, au.is_super_admin, au.created_at, au.updated_at
    INTO v_admin
    FROM public.admin_users au
    WHERE au.user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Administrator account not found.' USING ERRCODE = 'P0002';
    END IF;

    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = p_user_id;

    -- If Super Admin: return dynamic full permissions list
    IF v_admin.is_super_admin THEN
        SELECT COALESCE(jsonb_agg(p.id ORDER BY p.id), '[]'::jsonb)
        INTO v_perms
        FROM public.permissions p;

        RETURN jsonb_build_object(
            'user_id', v_admin.user_id,
            'display_name', v_admin.display_name,
            'email', v_user_email,
            'active', v_admin.active,
            'is_super_admin', true,
            'role', NULL,
            'effective_permissions', v_perms,
            'created_at', v_admin.created_at,
            'updated_at', v_admin.updated_at
        );
    END IF;

    -- Normal Admin: get assigned role and its permissions
    SELECT 
        r.id,
        r.name_en,
        r.name_bn,
        r.description,
        r.active,
        r.is_system
    INTO v_role_record
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id;

    IF FOUND THEN
        IF v_role_record.active THEN
            SELECT COALESCE(jsonb_agg(rp.permission_id ORDER BY rp.permission_id), '[]'::jsonb)
            INTO v_perms
            FROM public.role_permissions rp
            WHERE rp.role_id = v_role_record.id;
        ELSE
            v_perms := '[]'::jsonb;
        END IF;

        RETURN jsonb_build_object(
            'user_id', v_admin.user_id,
            'display_name', v_admin.display_name,
            'email', v_user_email,
            'active', v_admin.active,
            'is_super_admin', false,
            'role', jsonb_build_object(
                'id', v_role_record.id,
                'name_en', v_role_record.name_en,
                'name_bn', v_role_record.name_bn,
                'description', v_role_record.description,
                'active', v_role_record.active,
                'is_system', v_role_record.is_system
            ),
            'effective_permissions', v_perms,
            'created_at', v_admin.created_at,
            'updated_at', v_admin.updated_at
        );
    ELSE
        RETURN jsonb_build_object(
            'user_id', v_admin.user_id,
            'display_name', v_admin.display_name,
            'email', v_user_email,
            'active', v_admin.active,
            'is_super_admin', false,
            'role', NULL,
            'effective_permissions', '[]'::jsonb,
            'created_at', v_admin.created_at,
            'updated_at', v_admin.updated_at
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 10. WRITE RPC: public.admin_finalize_user_membership(...)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_finalize_user_membership(
    p_user_id UUID,
    p_display_name TEXT DEFAULT NULL,
    p_role_id TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_caller_id UUID;
    v_clean_display_name TEXT;
    v_clean_role_id TEXT;
    v_clean_active BOOLEAN;
    v_role_exists BOOLEAN;
    v_super_admin_configured BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION 'Access denied. User management authorization required.' USING ERRCODE = '42501';
    END IF;

    -- SAFETY CHECK: A designated Super Admin must exist before normal users are created
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE is_super_admin = true AND active = true
    ) INTO v_super_admin_configured;

    IF NOT v_super_admin_configured THEN
        RAISE EXCEPTION 'A Super Administrator must be designated before normal administrators can be created.'
            USING ERRCODE = 'P0001', DETAIL = 'SUPER_ADMIN_NOT_CONFIGURED';
    END IF;

    -- Validate user exists in auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'Target authentication account does not exist.' USING ERRCODE = 'P0002';
    END IF;

    -- Validate user does not already exist in admin_users
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user_id) THEN
        RAISE EXCEPTION 'Administrator profile already exists for this account.' USING ERRCODE = '23505';
    END IF;

    -- Validate role
    v_clean_role_id := btrim(p_role_id);
    IF v_clean_role_id IS NULL OR v_clean_role_id = '' THEN
        RAISE EXCEPTION 'A valid role assignment is required.' USING ERRCODE = '22000';
    END IF;

    SELECT active INTO v_role_exists
    FROM public.roles
    WHERE id = v_clean_role_id;

    IF v_role_exists IS NULL THEN
        RAISE EXCEPTION 'Specified role does not exist.' USING ERRCODE = 'P0002';
    END IF;

    IF v_role_exists IS FALSE THEN
        RAISE EXCEPTION 'Cannot assign an inactive role.' USING ERRCODE = '22000';
    END IF;

    v_clean_display_name := NULLIF(btrim(p_display_name), '');
    v_clean_active := COALESCE(p_active, true);

    -- Insert into public.admin_users (NEVER as super admin)
    INSERT INTO public.admin_users (
        user_id,
        display_name,
        active,
        is_super_admin,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        v_clean_display_name,
        v_clean_active,
        false,
        now(),
        now()
    );

    -- Insert into public.user_roles (exactly one primary role)
    INSERT INTO public.user_roles (
        user_id,
        role_id,
        created_at
    ) VALUES (
        p_user_id,
        v_clean_role_id,
        now()
    );

    -- Write administrative audit log
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        v_caller_id,
        'user.created',
        'admin_user',
        p_user_id::text,
        jsonb_build_object(
            'display_name', v_clean_display_name,
            'role_id', v_clean_role_id,
            'active', v_clean_active
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'display_name', v_clean_display_name,
        'role_id', v_clean_role_id,
        'active', v_clean_active
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_finalize_user_membership(uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_finalize_user_membership(uuid, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_finalize_user_membership(uuid, text, text, boolean) TO authenticated;

-- ------------------------------------------------------------------------------
-- 11. WRITE RPC: public.admin_update_user(...)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_user_id UUID,
    p_display_name TEXT,
    p_role_id TEXT,
    p_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_existing_admin RECORD;
    v_clean_display_name TEXT;
    v_clean_role_id TEXT;
    v_clean_active BOOLEAN;
    v_role_exists BOOLEAN;
    v_old_role_id TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION 'Access denied. User management authorization required.' USING ERRCODE = '42501';
    END IF;

    -- Advisory lock for user mutations
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_user_management_mutation_lock'));

    SELECT * INTO v_existing_admin
    FROM public.admin_users
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Administrator account not found.' USING ERRCODE = 'P0002';
    END IF;

    -- BACKEND SUPER ADMIN PROTECTION
    IF v_existing_admin.is_super_admin THEN
        RAISE EXCEPTION 'Protected system account: Super Administrator cannot be modified, deactivated, or demoted.'
            USING ERRCODE = '42501';
    END IF;

    -- Validate role
    v_clean_role_id := btrim(p_role_id);
    IF v_clean_role_id IS NULL OR v_clean_role_id = '' THEN
        RAISE EXCEPTION 'A valid role assignment is required.' USING ERRCODE = '22000';
    END IF;

    SELECT active INTO v_role_exists
    FROM public.roles
    WHERE id = v_clean_role_id;

    IF v_role_exists IS NULL THEN
        RAISE EXCEPTION 'Specified role does not exist.' USING ERRCODE = 'P0002';
    END IF;

    IF v_role_exists IS FALSE THEN
        RAISE EXCEPTION 'Cannot assign an inactive role.' USING ERRCODE = '22000';
    END IF;

    v_clean_display_name := NULLIF(btrim(p_display_name), '');
    v_clean_active := COALESCE(p_active, v_existing_admin.active);

    -- Get old role for audit
    SELECT role_id INTO v_old_role_id
    FROM public.user_roles
    WHERE user_id = p_user_id;

    -- Update admin_users
    UPDATE public.admin_users
    SET 
        display_name = v_clean_display_name,
        active = v_clean_active,
        updated_at = now()
    WHERE user_id = p_user_id;

    -- Upsert user_roles
    INSERT INTO public.user_roles (user_id, role_id, created_at)
    VALUES (p_user_id, v_clean_role_id, now())
    ON CONFLICT (user_id) 
    DO UPDATE SET role_id = EXCLUDED.role_id;

    -- Check last effective role manager safety
    IF public.count_effective_role_managers() = 0 THEN
        RAISE EXCEPTION 'Operation rejected: Updating this administrator would leave no active role managers in the system.'
            USING ERRCODE = '23514';
    END IF;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        v_caller_id,
        'user.updated',
        'admin_user',
        p_user_id::text,
        jsonb_build_object(
            'display_name', v_clean_display_name,
            'role_id', v_clean_role_id,
            'previous_role_id', v_old_role_id,
            'active', v_clean_active,
            'previous_active', v_existing_admin.active
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'display_name', v_clean_display_name,
        'role_id', v_clean_role_id,
        'active', v_clean_active
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user(uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_user(uuid, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text, boolean) TO authenticated;

COMMIT;
