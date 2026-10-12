-- ==============================================================================
-- Migration: 20260904000002_phase4a_delegation_ceiling_correction.sql
-- Description: Targeted correction pass for Delegation Ceiling & Scoping:
--   1. Transaction wrapping (BEGIN ... COMMIT)
--   2. Audit event helper targeting public.admin_audit_logs
--   3. Helper hardening: active admin verification & role/user existence checks
--   4. RLS tightening on permissions, roles, role_permissions to prevent direct leak
--   5. Drop invalid 6-param admin_update_role; reinstate authoritative 8-param Phase 2C signature with ceiling
--   6. admin_finalize_user_membership restored to strictly creation-only (no upsert)
--   7. admin_list_roles() scoped to caller ceiling
--   8. admin_get_role_detail() fails closed for out-of-ceiling roles
--   9. admin_get_permission_catalogue() scoped and preserves genuine bootstrap
--   10. admin_create_role & admin_replace_role_permissions enforce delegation ceiling
--   11. admin_get_assignable_roles() filtered to caller ceiling
--   12. admin_update_user() enforces target scope & new role ceiling
--   13. admin_get_user() conceals unauthorized permissions for stronger targets
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. AUDIT EVENT LOGGING HELPER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_role_audit_event(
    p_action TEXT,
    p_target_id TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_id UUID;
    v_target_type TEXT;
BEGIN
    v_actor_id := auth.uid();
    
    IF p_action ILIKE '%USER%' THEN
        v_target_type := 'USER';
    ELSE
        v_target_type := 'ROLE';
    END IF;

    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        v_actor_id,
        p_action,
        v_target_type,
        p_target_id,
        COALESCE(p_details, '{}'::jsonb),
        clock_timestamp()
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. HARDENED HELPER: get caller's effective permission set
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_caller_effective_permission_set()
RETURNS SETOF TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID;
    v_is_active_admin BOOLEAN;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    -- Caller MUST be an active administrator
    SELECT (active = true) INTO v_is_active_admin
    FROM public.admin_users
    WHERE user_id = v_user_id;

    IF v_is_active_admin IS NOT TRUE THEN
        RETURN;
    END IF;

    -- Check if caller is active Super Admin
    SELECT COALESCE(au.is_super_admin, false) INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id AND au.active = true;

    IF v_is_super_admin IS TRUE THEN
        RETURN QUERY SELECT p.id FROM public.permissions p;
        RETURN;
    END IF;

    -- Check bootstrap mode (no user roles exist yet in the system)
    SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_bootstrap_mode;
    IF v_bootstrap_mode IS TRUE THEN
        RETURN QUERY SELECT p.id FROM public.permissions p;
        RETURN;
    END IF;

    -- Return distinct permissions from active roles assigned to caller
    RETURN QUERY
    SELECT DISTINCT rp.permission_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id AND r.active = true
    JOIN public.role_permissions rp ON rp.role_id = r.id
    WHERE ur.user_id = v_user_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. HARDENED HELPER: can caller delegate the given permission set?
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_delegate_permission_set(p_permission_ids TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID;
    v_is_active_admin BOOLEAN;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Caller MUST be an active administrator
    SELECT (active = true) INTO v_is_active_admin
    FROM public.admin_users
    WHERE user_id = v_user_id;

    IF v_is_active_admin IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- Empty or null set is always delegable (zero-permission roles remain valid)
    IF p_permission_ids IS NULL OR cardinality(p_permission_ids) = 0 THEN
        RETURN TRUE;
    END IF;

    -- Super Admin can delegate all canonical permissions
    SELECT COALESCE(au.is_super_admin, false) INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id AND au.active = true;

    IF v_is_super_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- Bootstrap mode
    SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_bootstrap_mode;
    IF v_bootstrap_mode IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- Check that NO element of p_permission_ids falls outside caller's effective permissions
    RETURN NOT EXISTS (
        SELECT 1
        FROM unnest(p_permission_ids) AS perm_id
        WHERE perm_id NOT IN (SELECT public.get_caller_effective_permission_set())
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. HARDENED HELPER: can caller manage role scope?
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_role_scope(p_role_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID;
    v_is_active_admin BOOLEAN;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
    v_role_exists BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Role must exist
    SELECT EXISTS (
        SELECT 1 FROM public.roles WHERE id = p_role_id
    ) INTO v_role_exists;

    IF NOT v_role_exists THEN
        RETURN FALSE;
    END IF;

    -- Caller MUST be an active administrator
    SELECT (active = true) INTO v_is_active_admin
    FROM public.admin_users
    WHERE user_id = v_user_id;

    IF v_is_active_admin IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- Super Admin can manage all role scopes
    SELECT COALESCE(au.is_super_admin, false) INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id AND au.active = true;

    IF v_is_super_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- Bootstrap mode
    SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_bootstrap_mode;
    IF v_bootstrap_mode IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- Role must NOT contain any permission outside caller's effective permission set
    RETURN NOT EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        WHERE rp.role_id = p_role_id
          AND rp.permission_id NOT IN (SELECT public.get_caller_effective_permission_set())
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. HARDENED HELPER: can caller manage target user?
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_user_target(p_target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_active_admin BOOLEAN;
    v_caller_is_super_admin BOOLEAN;
    v_target_exists BOOLEAN;
    v_target_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Target must exist in admin_users
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE user_id = p_target_user_id
    ) INTO v_target_exists;

    IF NOT v_target_exists THEN
        RETURN FALSE;
    END IF;

    -- Caller MUST be an active administrator
    SELECT (active = true) INTO v_caller_is_active_admin
    FROM public.admin_users
    WHERE user_id = v_caller_id;

    IF v_caller_is_active_admin IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- Caller MUST have admin_users.manage permission
    IF NOT public.has_permission('admin_users.manage') THEN
        RETURN FALSE;
    END IF;

    -- Super Admin target is ALWAYS immutable for everyone
    SELECT COALESCE(is_super_admin, false) INTO v_target_is_super_admin
    FROM public.admin_users
    WHERE user_id = p_target_user_id;

    IF v_target_is_super_admin IS TRUE THEN
        RETURN FALSE;
    END IF;

    -- Caller is Super Admin -> can manage all non-super-admin targets
    SELECT COALESCE(is_super_admin, false) INTO v_caller_is_super_admin
    FROM public.admin_users
    WHERE user_id = v_caller_id AND active = true;

    IF v_caller_is_super_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- Bootstrap mode
    SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_bootstrap_mode;
    IF v_bootstrap_mode IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- Target must NOT have any permissions that exceed the caller's ceiling
    RETURN NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id AND r.active = true
        JOIN public.role_permissions rp ON rp.role_id = r.id
        WHERE ur.user_id = p_target_user_id
          AND rp.permission_id NOT IN (SELECT public.get_caller_effective_permission_set())
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. DIRECT TABLE RLS HARDENING (Mitigate Permission & Role Definition Leakage)
-- ------------------------------------------------------------------------------
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- permissions: Normal admins can only direct SELECT permissions within their effective ceiling
DROP POLICY IF EXISTS "Active admins can read permissions" ON public.permissions;
DROP POLICY IF EXISTS "Scope-safe permissions direct read" ON public.permissions;
DROP POLICY IF EXISTS "Allow authenticated read permissions" ON public.permissions;
DROP POLICY IF EXISTS "Authenticated read permissions" ON public.permissions;
DROP POLICY IF EXISTS "Anyone can read permissions" ON public.permissions;

CREATE POLICY "Scope-safe permissions direct read"
    ON public.permissions
    FOR SELECT
    TO authenticated
    USING (
        id IN (SELECT public.get_caller_effective_permission_set())
    );

-- roles: Normal admins can direct SELECT caller's own assigned roles, or roles within their ceiling
DROP POLICY IF EXISTS "Active admins can read roles" ON public.roles;
DROP POLICY IF EXISTS "Scope-safe roles direct read" ON public.roles;
DROP POLICY IF EXISTS "Allow authenticated read roles" ON public.roles;
DROP POLICY IF EXISTS "Authenticated read roles" ON public.roles;
DROP POLICY IF EXISTS "Anyone can read roles" ON public.roles;

CREATE POLICY "Scope-safe roles direct read"
    ON public.roles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_users au
            WHERE au.user_id = auth.uid() AND au.active = true
              AND (
                  au.is_super_admin = true
                  OR NOT EXISTS (SELECT 1 FROM public.user_roles)
                  OR id IN (SELECT ur.role_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
                  OR public.can_manage_role_scope(id)
              )
        )
    );

-- role_permissions: Normal admins can direct SELECT their own mappings or mappings within their ceiling
DROP POLICY IF EXISTS "Active admins can read role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Scope-safe role_permissions direct read" ON public.role_permissions;
DROP POLICY IF EXISTS "Allow authenticated read role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Authenticated read role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Anyone can read role_permissions" ON public.role_permissions;

CREATE POLICY "Scope-safe role_permissions direct read"
    ON public.role_permissions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_users au
            WHERE au.user_id = auth.uid() AND au.active = true
              AND (
                  au.is_super_admin = true
                  OR NOT EXISTS (SELECT 1 FROM public.user_roles)
                  OR role_id IN (SELECT ur.role_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
                  OR public.can_manage_role_scope(role_id)
              )
        )
    );

-- ------------------------------------------------------------------------------
-- 7. SCOPE-SAFE PERMISSION CATALOGUE (Preserves Genuine Bootstrap)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_permission_catalogue()
RETURNS TABLE (
    id TEXT,
    module TEXT,
    action TEXT,
    name_en TEXT,
    name_bn TEXT,
    description TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    -- Require can_manage_roles() (which permits active admin in bootstrap mode OR roles.manage)
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to view the permissions catalogue.'
            USING ERRCODE = '42501';
    END IF;

    v_user_id := auth.uid();
    SELECT COALESCE(au.is_super_admin, false) INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id AND au.active = true;

    SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_bootstrap_mode;

    -- Super Admin or Bootstrap: return entire canonical catalogue
    IF v_is_super_admin IS TRUE OR v_bootstrap_mode IS TRUE THEN
        RETURN QUERY
        SELECT 
            p.id,
            p.module,
            p.action,
            p.name_en,
            p.name_bn,
            p.description,
            p.created_at
        FROM public.permissions p
        ORDER BY p.module ASC, p.action ASC, p.id ASC;
    ELSE
        -- Normal admin: return ONLY permissions within caller's effective ceiling
        RETURN QUERY
        SELECT 
            p.id,
            p.module,
            p.action,
            p.name_en,
            p.name_bn,
            p.description,
            p.created_at
        FROM public.permissions p
        WHERE p.id IN (SELECT public.get_caller_effective_permission_set())
        ORDER BY p.module ASC, p.action ASC, p.id ASC;
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. ROLE DETAIL ACCESS GUARD (Fails Closed for Out-of-Ceiling Roles)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_role_detail(
    p_role_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_role_id TEXT;
    v_role RECORD;
    v_perm_ids TEXT[];
    v_perm_count INT;
    v_user_count INT;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    -- Verify caller authorization via can_manage_roles()
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to view role details.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_role_id := btrim(p_role_id);
    IF v_clean_role_id IS NULL OR v_clean_role_id = '' THEN
        RAISE EXCEPTION 'Role ID cannot be empty.' USING ERRCODE = '22000';
    END IF;

    -- Fetch role
    SELECT id, name_en, name_bn, description, active, is_system, created_at, updated_at
    INTO v_role
    FROM public.roles
    WHERE id = v_clean_role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found: %', v_clean_role_id USING ERRCODE = 'P0002';
    END IF;

    -- Check Super Admin or Bootstrap
    SELECT COALESCE(is_super_admin, false) INTO v_is_super_admin
    FROM public.admin_users
    WHERE user_id = auth.uid() AND active = true;

    SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_bootstrap_mode;

    -- TARGET SCOPE GUARD: If not Super Admin and not bootstrap, caller cannot view a role whose permissions exceed their ceiling
    IF v_is_super_admin IS NOT TRUE AND v_bootstrap_mode IS NOT TRUE THEN
        IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
            RAISE EXCEPTION 'Access denied. You do not have permission to view a role exceeding your authorization scope.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Fetch assigned permissions
    SELECT COALESCE(array_agg(permission_id ORDER BY permission_id ASC), ARRAY[]::TEXT[])
    INTO v_perm_ids
    FROM public.role_permissions
    WHERE role_id = v_clean_role_id;

    v_perm_count := cardinality(v_perm_ids);

    -- Count assigned users
    SELECT COUNT(*)::INT INTO v_user_count
    FROM public.user_roles
    WHERE role_id = v_clean_role_id;

    RETURN jsonb_build_object(
        'id', v_role.id,
        'name_en', v_role.name_en,
        'name_bn', v_role.name_bn,
        'description', v_role.description,
        'active', v_role.active,
        'is_system', v_role.is_system,
        'permission_ids', to_jsonb(v_perm_ids),
        'permission_count', v_perm_count,
        'assigned_user_count', v_user_count,
        'created_at', v_role.created_at,
        'updated_at', v_role.updated_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. SCOPED ROLE LIST (admin_list_roles)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_roles()
RETURNS TABLE (
    id TEXT,
    name_en TEXT,
    name_bn TEXT,
    description TEXT,
    active BOOLEAN,
    is_system BOOLEAN,
    permission_count BIGINT,
    assigned_user_count BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to list roles.'
            USING ERRCODE = '42501';
    END IF;

    v_user_id := auth.uid();
    SELECT COALESCE(au.is_super_admin, false) INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id AND au.active = true;

    SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_bootstrap_mode;

    RETURN QUERY
    SELECT 
        r.id,
        r.name_en,
        r.name_bn,
        r.description,
        r.active,
        r.is_system,
        COUNT(DISTINCT rp.permission_id)::BIGINT AS permission_count,
        COUNT(DISTINCT ur.user_id)::BIGINT AS assigned_user_count,
        r.created_at,
        r.updated_at
    FROM public.roles r
    LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
    LEFT JOIN public.user_roles ur ON ur.role_id = r.id
    WHERE (
        v_is_super_admin IS TRUE
        OR v_bootstrap_mode IS TRUE
        OR public.can_manage_role_scope(r.id)
    )
    GROUP BY r.id, r.name_en, r.name_bn, r.description, r.active, r.is_system, r.created_at, r.updated_at
    ORDER BY r.is_system DESC, r.name_en ASC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. ROLE CREATION DELEGATION CEILING (admin_create_role)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_role(
    p_name_en TEXT,
    p_name_bn TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT TRUE,
    p_permission_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_name_en TEXT;
    v_clean_name_bn TEXT;
    v_clean_desc TEXT;
    v_slug TEXT;
    v_invalid_perms TEXT[];
    v_deduped_perms TEXT[];
    v_perm_id TEXT;
    v_new_role RECORD;
BEGIN
    -- Concurrency serialization
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_role_management_mutation_lock'));

    -- Check caller authorization via can_manage_roles()
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to create roles.'
            USING ERRCODE = '42501';
    END IF;

    -- Validate English role name
    v_clean_name_en := btrim(p_name_en);
    IF v_clean_name_en IS NULL OR v_clean_name_en = '' THEN
        RAISE EXCEPTION 'English role name is required and cannot be blank.'
            USING ERRCODE = '22000';
    END IF;

    -- Generate ASCII slug
    v_slug := public.generate_role_slug(v_clean_name_en);
    IF v_slug IS NULL OR v_slug = '' THEN
        RAISE EXCEPTION 'English role name must contain valid alphanumeric characters to create a technical role ID.'
            USING ERRCODE = '22000';
    END IF;

    -- Clean Bengali name
    v_clean_name_bn := btrim(p_name_bn);
    IF v_clean_name_bn = '' THEN
        v_clean_name_bn := NULL;
    END IF;

    -- Clean description
    v_clean_desc := btrim(p_description);
    IF v_clean_desc = '' THEN
        v_clean_desc := NULL;
    END IF;

    -- Check duplicate slug
    IF EXISTS (SELECT 1 FROM public.roles WHERE id = v_slug) THEN
        RAISE EXCEPTION 'A role with this ID or English name already exists.'
            USING ERRCODE = '23505';
    END IF;

    -- Validate permission IDs against catalogue
    IF p_permission_ids IS NOT NULL AND cardinality(p_permission_ids) > 0 THEN
        SELECT ARRAY(
            SELECT unnest(p_permission_ids)
            EXCEPT
            SELECT id FROM public.permissions
        ) INTO v_invalid_perms;

        IF cardinality(v_invalid_perms) > 0 THEN
            RAISE EXCEPTION 'Invalid permission ID(s) provided: %', array_to_string(v_invalid_perms, ', ')
                USING ERRCODE = '22000';
        END IF;

        SELECT ARRAY(
            SELECT DISTINCT unnest(p_permission_ids)
        ) INTO v_deduped_perms;
    ELSE
        v_deduped_perms := ARRAY[]::TEXT[];
    END IF;

    -- DELEGATION CEILING: Caller cannot grant permissions they do not possess
    IF NOT public.can_delegate_permission_set(v_deduped_perms) THEN
        RAISE EXCEPTION 'Access denied. You cannot grant permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- Insert role
    INSERT INTO public.roles (
        id,
        name_en,
        name_bn,
        description,
        active,
        is_system,
        created_at,
        updated_at
    ) VALUES (
        v_slug,
        v_clean_name_en,
        v_clean_name_bn,
        v_clean_desc,
        COALESCE(p_active, TRUE),
        FALSE,
        clock_timestamp(),
        clock_timestamp()
    )
    RETURNING * INTO v_new_role;

    -- Insert role permissions
    IF cardinality(v_deduped_perms) > 0 THEN
        FOREACH v_perm_id IN ARRAY v_deduped_perms
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, created_at)
            VALUES (v_slug, v_perm_id, clock_timestamp());
        END LOOP;
    END IF;

    -- Audit event
    PERFORM public.log_role_audit_event(
        'ROLE_CREATED',
        v_slug,
        jsonb_build_object(
            'name_en', v_clean_name_en,
            'name_bn', v_clean_name_bn,
            'active', v_new_role.active,
            'permission_ids', to_jsonb(v_deduped_perms),
            'description', v_clean_desc
        )
    );

    RETURN jsonb_build_object(
        'id', v_new_role.id,
        'name_en', v_new_role.name_en,
        'name_bn', v_new_role.name_bn,
        'description', v_new_role.description,
        'active', v_new_role.active,
        'is_system', v_new_role.is_system,
        'permission_ids', to_jsonb(v_deduped_perms),
        'permission_count', cardinality(v_deduped_perms),
        'assigned_user_count', 0,
        'created_at', v_new_role.created_at,
        'updated_at', v_new_role.updated_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. AUTHORITATIVE BILINGUAL ROLE UPDATE (admin_update_role - 8 Parameters)
-- ------------------------------------------------------------------------------
-- Drop any conflicting or accidental overloads
DROP FUNCTION IF EXISTS public.admin_update_role(TEXT, TEXT, TEXT, BOOLEAN, TEXT[], TEXT);
DROP FUNCTION IF EXISTS public.admin_update_role(TEXT, TEXT, BOOLEAN, TEXT[], TEXT);
DROP FUNCTION IF EXISTS public.admin_update_role(TEXT, TEXT, TEXT, BOOLEAN, TEXT[]);

CREATE OR REPLACE FUNCTION public.admin_update_role(
    p_role_id text,
    p_name_en text,
    p_name_bn text DEFAULT NULL,
    p_active boolean DEFAULT NULL,
    p_permission_ids text[] DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_update_description boolean DEFAULT NULL,
    p_update_name_bn boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_id text;
    v_clean_name_en text;
    v_clean_name_bn text;
    v_clean_desc text;
    v_existing_role record;
    v_updated_role record;
    v_invalid_perms text[];
    v_distinct_perms text[];
    v_final_perms text[];
    v_perm_id text;
    v_user_count int;
BEGIN
    -- Concurrency serialization
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_role_management_mutation_lock'));

    -- Check caller authorization via can_manage_roles()
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to update roles.'
            USING ERRCODE = '42501';
    END IF;

    -- Validate technical role ID
    v_clean_id := btrim(p_role_id);
    IF v_clean_id IS NULL OR v_clean_id = '' THEN
        RAISE EXCEPTION 'Role ID is required.' USING ERRCODE = '22000';
    END IF;

    -- Fetch existing role
    SELECT id, name_en, name_bn, description, active, is_system, created_at, updated_at
    INTO v_existing_role
    FROM public.roles
    WHERE id = v_clean_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found: %', v_clean_id USING ERRCODE = 'P0002';
    END IF;

    -- TARGET SCOPE GUARD: Caller cannot modify a role whose existing permissions exceed caller's ceiling
    IF NOT public.can_manage_role_scope(v_clean_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot modify a role containing permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- Validate English role name
    v_clean_name_en := btrim(p_name_en);
    IF v_clean_name_en IS NULL OR v_clean_name_en = '' THEN
        RAISE EXCEPTION 'English role name is required and cannot be blank.' USING ERRCODE = '22000';
    END IF;

    -- Process Bengali role name with explicit update flag
    IF p_update_name_bn IS TRUE THEN
        v_clean_name_bn := btrim(p_name_bn);
        IF v_clean_name_bn = '' THEN
            v_clean_name_bn := NULL;
        END IF;
    ELSIF p_update_name_bn IS FALSE THEN
        v_clean_name_bn := v_existing_role.name_bn;
    ELSE
        IF p_name_bn IS NOT NULL THEN
            v_clean_name_bn := btrim(p_name_bn);
            IF v_clean_name_bn = '' THEN
                v_clean_name_bn := NULL;
            END IF;
        ELSE
            v_clean_name_bn := v_existing_role.name_bn;
        END IF;
    END IF;

    -- System role protections
    IF v_existing_role.is_system IS TRUE THEN
        IF p_active IS NOT NULL AND p_active IS FALSE THEN
            RAISE EXCEPTION 'System roles cannot be deactivated.' USING ERRCODE = '42501';
        END IF;

        IF p_permission_ids IS NOT NULL THEN
            RAISE EXCEPTION 'Permissions of system roles cannot be modified.' USING ERRCODE = '42501';
        END IF;

        IF v_clean_name_en <> v_existing_role.name_en THEN
            RAISE EXCEPTION 'English name of system roles cannot be modified.' USING ERRCODE = '42501';
        END IF;

        IF (v_clean_name_bn IS DISTINCT FROM v_existing_role.name_bn) THEN
            RAISE EXCEPTION 'Bengali name of system roles cannot be modified.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Check duplicate English role name across other roles
    IF EXISTS (
        SELECT 1 FROM public.roles
        WHERE id <> v_clean_id AND lower(name_en) = lower(v_clean_name_en)
    ) THEN
        RAISE EXCEPTION 'Another role with this English name already exists.' USING ERRCODE = '23505';
    END IF;

    -- Process description with explicit update flag
    IF p_update_description IS TRUE THEN
        v_clean_desc := btrim(p_description);
        IF v_clean_desc = '' THEN
            v_clean_desc := NULL;
        END IF;
    ELSIF p_update_description IS FALSE THEN
        v_clean_desc := v_existing_role.description;
    ELSE
        IF p_description IS NOT NULL THEN
            v_clean_desc := btrim(p_description);
            IF v_clean_desc = '' THEN
                v_clean_desc := NULL;
            END IF;
        ELSE
            v_clean_desc := v_existing_role.description;
        END IF;
    END IF;

    -- Permission validation & ceiling verification if permissions are being modified
    IF p_permission_ids IS NOT NULL AND v_existing_role.is_system IS NOT TRUE THEN
        IF cardinality(p_permission_ids) > 0 THEN
            SELECT ARRAY(
                SELECT unnest(p_permission_ids)
                EXCEPT
                SELECT id FROM public.permissions
            ) INTO v_invalid_perms;

            IF cardinality(v_invalid_perms) > 0 THEN
                RAISE EXCEPTION 'Invalid permission ID(s) provided: %', array_to_string(v_invalid_perms, ', ')
                    USING ERRCODE = '22000';
            END IF;

            SELECT ARRAY(
                SELECT DISTINCT unnest(p_permission_ids)
            ) INTO v_distinct_perms;
        ELSE
            v_distinct_perms := ARRAY[]::TEXT[];
        END IF;

        -- NEW PERMISSION SET CEILING GUARD
        IF NOT public.can_delegate_permission_set(v_distinct_perms) THEN
            RAISE EXCEPTION 'Access denied. You cannot grant permissions that you do not possess.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Update role table
    UPDATE public.roles
    SET
        name_en = v_clean_name_en,
        name_bn = v_clean_name_bn,
        description = v_clean_desc,
        active = COALESCE(p_active, active),
        updated_at = clock_timestamp()
    WHERE id = v_clean_id
    RETURNING * INTO v_updated_role;

    -- Update permissions if provided
    IF p_permission_ids IS NOT NULL AND v_existing_role.is_system IS NOT TRUE THEN
        DELETE FROM public.role_permissions WHERE role_id = v_clean_id;

        IF cardinality(v_distinct_perms) > 0 THEN
            FOREACH v_perm_id IN ARRAY v_distinct_perms
            LOOP
                INSERT INTO public.role_permissions (role_id, permission_id, created_at)
                VALUES (v_clean_id, v_perm_id, clock_timestamp());
            END LOOP;
        END IF;

        v_final_perms := v_distinct_perms;
    ELSE
        SELECT COALESCE(array_agg(permission_id ORDER BY permission_id ASC), ARRAY[]::TEXT[])
        INTO v_final_perms
        FROM public.role_permissions
        WHERE role_id = v_clean_id;
    END IF;

    -- RESULTING STATE LAST-MANAGER SAFETY CHECK:
    -- When user_roles assignments exist, no mutation may leave zero active administrators capable of managing roles.
    -- Atomically rolls back if either removing roles.manage or deactivating an active role containing roles.manage
    -- results in zero effective role managers.
    IF EXISTS (SELECT 1 FROM public.user_roles) THEN
        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION 'Cannot update or deactivate this role because doing so would leave no active administrators capable of managing roles.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- Count assigned users
    SELECT COUNT(*)::INT INTO v_user_count
    FROM public.user_roles
    WHERE role_id = v_clean_id;

    -- Audit log
    PERFORM public.log_role_audit_event(
        'ROLE_UPDATED',
        v_clean_id,
        jsonb_build_object(
            'name_en', v_clean_name_en,
            'name_bn', v_clean_name_bn,
            'active', v_updated_role.active,
            'permission_ids', to_jsonb(v_final_perms),
            'description', v_clean_desc
        )
    );

    RETURN jsonb_build_object(
        'id', v_updated_role.id,
        'name_en', v_updated_role.name_en,
        'name_bn', v_updated_role.name_bn,
        'description', v_updated_role.description,
        'active', v_updated_role.active,
        'is_system', v_updated_role.is_system,
        'permission_ids', to_jsonb(v_final_perms),
        'permission_count', cardinality(v_final_perms),
        'assigned_user_count', v_user_count,
        'created_at', v_updated_role.created_at,
        'updated_at', v_updated_role.updated_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. ROLE PERMISSION REPLACEMENT (admin_replace_role_permissions)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_replace_role_permissions(
    p_role_id TEXT,
    p_permission_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_role_id TEXT;
    v_is_system BOOLEAN;
    v_invalid_perms TEXT[];
    v_deduped_perms TEXT[];
    v_perm_id TEXT;
    v_new_count INT;
    v_updated_at TIMESTAMPTZ;
BEGIN
    -- Concurrency serialization
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_role_management_mutation_lock'));

    -- Check caller authorization via can_manage_roles()
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to manage role permissions.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_role_id := btrim(p_role_id);
    IF v_clean_role_id IS NULL OR v_clean_role_id = '' THEN
        RAISE EXCEPTION 'Role ID is required.' USING ERRCODE = '22000';
    END IF;

    -- Check role existence and system status
    SELECT is_system INTO v_is_system
    FROM public.roles
    WHERE id = v_clean_role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found: %', v_clean_role_id USING ERRCODE = 'P0002';
    END IF;

    IF v_is_system IS TRUE THEN
        RAISE EXCEPTION 'Permissions of system roles cannot be modified.' USING ERRCODE = '42501';
    END IF;

    -- TARGET SCOPE GUARD: Caller cannot modify a role whose permissions exceed caller's ceiling
    IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot modify a role containing permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- Validate permission IDs
    IF p_permission_ids IS NOT NULL AND cardinality(p_permission_ids) > 0 THEN
        SELECT ARRAY(
            SELECT unnest(p_permission_ids)
            EXCEPT
            SELECT id FROM public.permissions
        ) INTO v_invalid_perms;

        IF cardinality(v_invalid_perms) > 0 THEN
            RAISE EXCEPTION 'Invalid permission ID(s) provided: %', array_to_string(v_invalid_perms, ', ')
                USING ERRCODE = '22000';
        END IF;

        SELECT ARRAY(
            SELECT DISTINCT unnest(p_permission_ids)
        ) INTO v_deduped_perms;
    ELSE
        v_deduped_perms := ARRAY[]::TEXT[];
    END IF;

    -- NEW PERMISSION SET CEILING GUARD
    IF NOT public.can_delegate_permission_set(v_deduped_perms) THEN
        RAISE EXCEPTION 'Access denied. You cannot grant permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- Replace permissions
    DELETE FROM public.role_permissions WHERE role_id = v_clean_role_id;

    IF cardinality(v_deduped_perms) > 0 THEN
        FOREACH v_perm_id IN ARRAY v_deduped_perms
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, created_at)
            VALUES (v_clean_role_id, v_perm_id, clock_timestamp());
        END LOOP;
    END IF;

    v_updated_at := clock_timestamp();
    UPDATE public.roles SET updated_at = v_updated_at WHERE id = v_clean_role_id;
    v_new_count := cardinality(v_deduped_perms);

    -- RESULTING STATE LAST-MANAGER SAFETY CHECK:
    -- When user_roles assignments exist, no mutation may leave zero active administrators capable of managing roles.
    IF EXISTS (SELECT 1 FROM public.user_roles) THEN
        IF public.count_effective_role_managers() = 0 THEN
            RAISE EXCEPTION 'Cannot remove roles.manage from this role because doing so would leave no active administrators capable of managing roles.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- Audit log
    PERFORM public.log_role_audit_event(
        'ROLE_PERMISSIONS_REPLACED',
        v_clean_role_id,
        jsonb_build_object(
            'permission_ids', to_jsonb(v_deduped_perms),
            'permission_count', v_new_count
        )
    );

    RETURN jsonb_build_object(
        'role_id', v_clean_role_id,
        'permission_ids', to_jsonb(v_deduped_perms),
        'permission_count', v_new_count,
        'updated_at', v_updated_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. ASSIGNABLE ROLES CEILING FILTER (admin_get_assignable_roles)
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
DECLARE
    v_user_id UUID;
    v_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION 'Access denied. User management authorization required.'
            USING ERRCODE = '42501';
    END IF;

    v_user_id := auth.uid();
    SELECT COALESCE(au.is_super_admin, false) INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id AND au.active = true;

    SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_bootstrap_mode;

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
      AND (
          v_is_super_admin IS TRUE
          OR v_bootstrap_mode IS TRUE
          OR public.can_manage_role_scope(r.id)
      )
    ORDER BY r.name_en ASC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 14. CREATION-ONLY USER MEMBERSHIP FINALIZATION (admin_finalize_user_membership)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_finalize_user_membership(
    p_user_id UUID,
    p_display_name TEXT DEFAULT NULL,
    p_role_id TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_role_id TEXT;
    v_clean_display_name TEXT;
    v_role_exists BOOLEAN;
    v_super_admin_configured BOOLEAN;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_auth_email TEXT;
BEGIN
    -- Concurrency serialization
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_user_management_mutation_lock'));

    -- Check caller authorization
    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to manage administrative users.'
            USING ERRCODE = '42501';
    END IF;

    -- Validate user ID
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'A valid user ID is required.' USING ERRCODE = '22000';
    END IF;

    -- Super Admin prerequisite: active Super Admin must be configured before normal administrator provisioning
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE is_super_admin = true AND active = true
    ) INTO v_super_admin_configured;

    IF NOT v_super_admin_configured THEN
        RAISE EXCEPTION 'Super Administrator must be configured before administrators can be created.'
            USING ERRCODE = '42501',
                  DETAIL = 'SUPER_ADMIN_NOT_CONFIGURED';
    END IF;

    -- Retrieve email from auth.users (user must have been created in auth.users by the Edge Function)
    SELECT email INTO v_auth_email
    FROM auth.users
    WHERE id = p_user_id;

    IF v_auth_email IS NULL THEN
        RAISE EXCEPTION 'Authentication user record does not exist.' USING ERRCODE = 'P0002';
    END IF;

    -- CREATION-ONLY GUARD: Reject if administrator record already exists
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user_id) THEN
        RAISE EXCEPTION 'Administrator profile already exists for this account.'
            USING ERRCODE = '23505';
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id) THEN
        RAISE EXCEPTION 'Role assignment already exists for this account.'
            USING ERRCODE = '23505';
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

    -- DELEGATION CEILING: Caller cannot assign a role containing permissions they do not possess
    IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot assign a role containing permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- Clean display name
    v_clean_display_name := btrim(p_display_name);
    IF v_clean_display_name = '' THEN
        v_clean_display_name := NULL;
    END IF;

    -- Strictly INSERT into public.admin_users (Creation only - no upsert/mutation)
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
        COALESCE(p_active, TRUE),
        FALSE,
        v_now,
        v_now
    );

    -- Strictly INSERT into public.user_roles (Creation only - no upsert/mutation)
    INSERT INTO public.user_roles (user_id, role_id, created_at)
    VALUES (p_user_id, v_clean_role_id, v_now);

    -- Audit event
    PERFORM public.log_role_audit_event(
        'USER_MEMBERSHIP_FINALIZED',
        v_clean_role_id,
        jsonb_build_object(
            'target_user_id', p_user_id,
            'email', v_auth_email,
            'role_id', v_clean_role_id,
            'active', COALESCE(p_active, TRUE)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'email', v_auth_email,
        'role_id', v_clean_role_id,
        'active', COALESCE(p_active, TRUE)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 15. USER UPDATE TARGET SCOPE & ROLE CEILING (admin_update_user)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_user_id UUID,
    p_display_name TEXT DEFAULT NULL,
    p_role_id TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_role_id TEXT;
    v_clean_display_name TEXT;
    v_existing_admin RECORD;
    v_role_exists BOOLEAN;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- Concurrency serialization
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_user_management_mutation_lock'));

    -- Check caller authorization
    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to update administrative users.'
            USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required.' USING ERRCODE = '22000';
    END IF;

    -- Check existing admin profile
    SELECT user_id, display_name, active, is_super_admin
    INTO v_existing_admin
    FROM public.admin_users
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Administrator account not found.' USING ERRCODE = 'P0002';
    END IF;

    -- SUPER ADMIN IMMUTABILITY GUARD
    IF v_existing_admin.is_super_admin IS TRUE THEN
        RAISE EXCEPTION 'Protected Super Administrator accounts cannot be modified or deactivated.'
            USING ERRCODE = '42501';
    END IF;

    -- TARGET SCOPE GUARD: Caller cannot manage an administrator whose current permissions exceed caller's ceiling
    IF NOT public.can_manage_user_target(p_user_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot manage an administrator with permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- Validate new role if specified
    IF p_role_id IS NOT NULL THEN
        v_clean_role_id := btrim(p_role_id);
        IF v_clean_role_id = '' THEN
            RAISE EXCEPTION 'Role ID cannot be blank.' USING ERRCODE = '22000';
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

        -- NEW ROLE DELEGATION CEILING: Caller cannot assign a role containing permissions they do not possess
        IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
            RAISE EXCEPTION 'Access denied. You cannot assign a role containing permissions that you do not possess.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Clean display name
    IF p_display_name IS NOT NULL THEN
        v_clean_display_name := btrim(p_display_name);
        IF v_clean_display_name = '' THEN
            v_clean_display_name := NULL;
        END IF;
    ELSE
        v_clean_display_name := v_existing_admin.display_name;
    END IF;

    -- Update admin profile
    UPDATE public.admin_users
    SET
        display_name = v_clean_display_name,
        active = COALESCE(p_active, active),
        updated_at = v_now
    WHERE user_id = p_user_id;

    -- Update role assignment if specified
    IF v_clean_role_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role_id, created_at)
        VALUES (p_user_id, v_clean_role_id, v_now)
        ON CONFLICT (user_id) DO UPDATE
        SET
            role_id = EXCLUDED.role_id,
            created_at = v_now;
    END IF;

    -- Audit log
    PERFORM public.log_role_audit_event(
        'ADMIN_USER_UPDATED',
        COALESCE(v_clean_role_id, 'user_update'),
        jsonb_build_object(
            'target_user_id', p_user_id,
            'display_name', v_clean_display_name,
            'role_id', v_clean_role_id,
            'active', COALESCE(p_active, v_existing_admin.active)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'display_name', v_clean_display_name,
        'role_id', v_clean_role_id,
        'active', COALESCE(p_active, v_existing_admin.active)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 16. USERS LIST WITH TARGET MANAGEABILITY (admin_get_users)
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
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_search TEXT;
    v_limit INT;
    v_offset INT;
    v_total_count INT;
    v_users JSONB;
BEGIN
    -- Check caller authorization: requires admin_users.view or admin_users.manage
    IF NOT (public.has_permission('admin_users.view') OR public.has_permission('admin_users.manage')) THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to view administrative users.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_search := btrim(p_search);
    IF v_clean_search = '' THEN
        v_clean_search := NULL;
    END IF;

    v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
    v_offset := GREATEST(0, COALESCE(p_offset, 0));

    -- Total count query
    SELECT COUNT(*)::INT INTO v_total_count
    FROM public.admin_users au
    JOIN auth.users u ON u.id = au.user_id
    LEFT JOIN public.user_roles ur ON ur.user_id = au.user_id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    WHERE
        (v_clean_search IS NULL OR (
            u.email ILIKE '%' || v_clean_search || '%' OR
            au.display_name ILIKE '%' || v_clean_search || '%'
        ))
        AND (p_role_id IS NULL OR (
            CASE 
                WHEN p_role_id = 'super_admin' THEN au.is_super_admin = true
                ELSE ur.role_id = p_role_id
            END
        ))
        AND (p_status IS NULL OR (
            CASE
                WHEN p_status = 'active' THEN au.active = true
                WHEN p_status = 'inactive' THEN au.active = false
                ELSE true
            END
        ));

    -- User rows with authoritative can_manage_target flag
    SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB) INTO v_users
    FROM (
        SELECT jsonb_build_object(
            'user_id', au.user_id,
            'display_name', au.display_name,
            'email', u.email,
            'active', au.active,
            'is_super_admin', au.is_super_admin,
            'role_id', ur.role_id,
            'role_name_en', r.name_en,
            'role_name_bn', r.name_bn,
            'can_manage_target', public.can_manage_user_target(au.user_id),
            'created_at', au.created_at
        ) AS row_data
        FROM public.admin_users au
        JOIN auth.users u ON u.id = au.user_id
        LEFT JOIN public.user_roles ur ON ur.user_id = au.user_id
        LEFT JOIN public.roles r ON r.id = ur.role_id
        WHERE
            (v_clean_search IS NULL OR (
                u.email ILIKE '%' || v_clean_search || '%' OR
                au.display_name ILIKE '%' || v_clean_search || '%'
            ))
            AND (p_role_id IS NULL OR (
                CASE 
                    WHEN p_role_id = 'super_admin' THEN au.is_super_admin = true
                    ELSE ur.role_id = p_role_id
                END
            ))
            AND (p_status IS NULL OR (
                CASE
                    WHEN p_status = 'active' THEN au.active = true
                    WHEN p_status = 'inactive' THEN au.active = false
                    ELSE true
                END
            ))
        ORDER BY au.is_super_admin DESC, au.created_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) sub;

    RETURN jsonb_build_object(
        'users', v_users,
        'total_count', v_total_count,
        'limit', v_limit,
        'offset', v_offset
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 17. USER DETAIL WITH PERMISSION CONCEALMENT (admin_get_user)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_user(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_super_admin BOOLEAN;
    v_admin RECORD;
    v_auth_email TEXT;
    v_role RECORD;
    v_perms TEXT[];
    v_can_manage BOOLEAN;
BEGIN
    -- Check caller authorization: requires admin_users.view or admin_users.manage
    IF NOT (public.has_permission('admin_users.view') OR public.has_permission('admin_users.manage')) THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to view administrative user details.'
            USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required.' USING ERRCODE = '22000';
    END IF;

    v_caller_id := auth.uid();
    SELECT COALESCE(is_super_admin, false) INTO v_caller_is_super_admin
    FROM public.admin_users
    WHERE user_id = v_caller_id AND active = true;

    -- Fetch profile
    SELECT user_id, display_name, active, is_super_admin, created_at, updated_at
    INTO v_admin
    FROM public.admin_users
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Administrator account not found.' USING ERRCODE = 'P0002';
    END IF;

    -- Fetch email
    SELECT email INTO v_auth_email
    FROM auth.users
    WHERE id = p_user_id;

    -- Super Admin target
    IF v_admin.is_super_admin IS TRUE THEN
        IF v_caller_is_super_admin IS TRUE THEN
            SELECT array_agg(id ORDER BY id ASC) INTO v_perms
            FROM public.permissions;
        ELSE
            -- Normal admin: conceal permissions of protected Super Admin
            v_perms := ARRAY[]::TEXT[];
        END IF;

        RETURN jsonb_build_object(
            'user_id', v_admin.user_id,
            'display_name', v_admin.display_name,
            'email', v_auth_email,
            'active', v_admin.active,
            'is_super_admin', true,
            'role', null,
            'effective_permissions', to_jsonb(v_perms),
            'can_manage_target', false,
            'created_at', v_admin.created_at,
            'updated_at', v_admin.updated_at
        );
    END IF;

    -- Fetch assigned role
    SELECT r.id, r.name_en, r.name_bn, r.description, r.active, r.is_system
    INTO v_role
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id;

    v_can_manage := public.can_manage_user_target(v_admin.user_id);

    -- CEILING VISIBILITY ENFORCEMENT:
    -- If caller cannot manage target AND is not Super Admin: do not leak unauthorized permission IDs!
    IF v_caller_is_super_admin IS NOT TRUE AND v_can_manage IS FALSE THEN
        v_perms := ARRAY[]::TEXT[];
    ELSE
        IF v_role.id IS NOT NULL THEN
            SELECT COALESCE(array_agg(rp.permission_id ORDER BY rp.permission_id ASC), ARRAY[]::TEXT[])
            INTO v_perms
            FROM public.role_permissions rp
            WHERE rp.role_id = v_role.id;
        ELSE
            v_perms := ARRAY[]::TEXT[];
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'user_id', v_admin.user_id,
        'display_name', v_admin.display_name,
        'email', v_auth_email,
        'active', v_admin.active,
        'is_super_admin', false,
        'role', CASE 
            WHEN v_role.id IS NOT NULL THEN jsonb_build_object(
                'id', v_role.id,
                'name_en', v_role.name_en,
                'name_bn', v_role.name_bn,
                'description', v_role.description,
                'active', v_role.active,
                'is_system', v_role.is_system
            )
            ELSE null
        END,
        'effective_permissions', to_jsonb(v_perms),
        'can_manage_target', v_can_manage,
        'created_at', v_admin.created_at,
        'updated_at', v_admin.updated_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 18. EXECUTION PRIVILEGES & GRANTS
-- ------------------------------------------------------------------------------
-- Revoke all from PUBLIC and anon for all helpers & RPCs
REVOKE ALL ON FUNCTION public.log_role_audit_event(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_caller_effective_permission_set() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_delegate_permission_set(TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_role_scope(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_user_target(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_permission_catalogue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_role_detail(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_role(TEXT, TEXT, BOOLEAN, TEXT[], TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_role(TEXT, TEXT, TEXT, BOOLEAN, TEXT[], TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_replace_role_permissions(TEXT, TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_assignable_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_finalize_user_membership(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_users(TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_user(UUID) FROM PUBLIC, anon;

-- Explicitly grant execute only to authenticated (and service_role as needed)
GRANT EXECUTE ON FUNCTION public.get_caller_effective_permission_set() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_role_scope(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_permission_catalogue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_role_detail(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_roles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_role(TEXT, TEXT, BOOLEAN, TEXT[], TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_role(TEXT, TEXT, TEXT, BOOLEAN, TEXT[], TEXT, BOOLEAN, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_replace_role_permissions(TEXT, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_assignable_roles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finalize_user_membership(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_users(TEXT, TEXT, TEXT, INT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user(UUID) TO authenticated, service_role;

COMMIT;
