-- ==============================================================================
-- Migration: 20260904000001_phase4a_delegation_ceiling_and_scoping.sql
-- Description: Authorization delegation ceiling & role/user scoping enforcement
--
-- Key Capabilities:
-- 1. Helper: public.get_caller_effective_permission_set()
-- 2. Helper: public.can_delegate_permission_set(p_permission_ids text[])
-- 3. Helper: public.can_manage_role_scope(p_role_id text)
-- 4. Helper: public.can_manage_user_target(p_target_user_id uuid)
-- 5. Scope-safe Permission Catalogue: admin_get_permission_catalogue()
-- 6. Role Detail Access Guard: admin_get_role_detail(p_role_id text)
-- 7. Role Creation Delegation Ceiling: admin_create_role(...)
-- 8. Role Update Delegation Ceiling & Target Scope: admin_update_role(...)
-- 9. Role Permissions Delegation Ceiling: admin_replace_role_permissions(...)
-- 10. Assignable Roles Ceiling Filter: admin_get_assignable_roles()
-- 11. User Creation Membership Delegation Ceiling: admin_finalize_user_membership(...)
-- 12. User Update Target Scope & Role Ceiling: admin_update_user(...)
-- 13. Users List with Target Manageability: admin_get_users(...)
-- 14. User Detail with Target Manageability: admin_get_user(...)
-- ==============================================================================

-- 1. Helper: get caller's effective permission set
CREATE OR REPLACE FUNCTION public.get_caller_effective_permission_set()
RETURNS SETOF TEXT
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
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    -- Check if caller is active Super Admin
    SELECT COALESCE(au.is_super_admin, false) INTO v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_user_id
      AND au.active = true;

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

    -- Return distinct permissions from active roles assigned to active user
    RETURN QUERY
    SELECT DISTINCT rp.permission_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id AND r.active = true
    JOIN public.role_permissions rp ON rp.role_id = r.id
    WHERE ur.user_id = v_user_id;
END;
$$;

-- 2. Helper: can caller delegate the given permission set?
CREATE OR REPLACE FUNCTION public.can_delegate_permission_set(p_permission_ids TEXT[])
RETURNS BOOLEAN
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
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Empty or null set is always delegable
    IF p_permission_ids IS NULL OR cardinality(p_permission_ids) = 0 THEN
        RETURN TRUE;
    END IF;

    -- Super Admin can delegate all permissions
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

-- 3. Helper: can caller view/manage the role scope? (role permissions ⊆ caller permissions)
CREATE OR REPLACE FUNCTION public.can_manage_role_scope(p_role_id TEXT)
RETURNS BOOLEAN
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
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Super Admin can manage all roles
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

    -- Role is within scope if none of its permissions are outside caller's effective set
    RETURN NOT EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        WHERE rp.role_id = p_role_id
          AND rp.permission_id NOT IN (SELECT public.get_caller_effective_permission_set())
    );
END;
$$;

-- 4. Helper: can caller manage the target user?
CREATE OR REPLACE FUNCTION public.can_manage_user_target(p_target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_is_super_admin BOOLEAN;
    v_target_is_super_admin BOOLEAN;
    v_bootstrap_mode BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
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

-- 5. Scope-safe Permission Catalogue
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
    -- Require roles.view or roles.manage permission
    IF NOT (public.has_permission('roles.view') OR public.has_permission('roles.manage')) THEN
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

-- 6. Role Detail Access Guard
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
    v_role RECORD;
    v_perm_ids TEXT[];
    v_perm_count INT;
    v_user_count INT;
BEGIN
    -- Verify authorization: require roles.view or roles.manage
    IF NOT (public.has_permission('roles.view') OR public.has_permission('roles.manage')) THEN
        RAISE EXCEPTION 'Access denied. Insufficient permissions to view role details.'
            USING ERRCODE = '42501';
    END IF;

    -- Fetch role record
    SELECT id, name_en, name_bn, description, active, is_system, created_at, updated_at
    INTO v_role
    FROM public.roles
    WHERE id = p_role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found: %', p_role_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Scope guard: caller cannot inspect a role whose permissions exceed caller's ceiling
    IF NOT public.can_manage_role_scope(p_role_id) THEN
        RAISE EXCEPTION 'Access denied. This role contains permissions that you are not authorized to view or manage.'
            USING ERRCODE = '42501';
    END IF;

    -- Fetch assigned permission IDs
    SELECT COALESCE(array_agg(permission_id ORDER BY permission_id ASC), ARRAY[]::TEXT[])
    INTO v_perm_ids
    FROM public.role_permissions
    WHERE role_id = p_role_id;

    v_perm_count := cardinality(v_perm_ids);

    -- Fetch assigned user count
    SELECT COUNT(*)::INT
    INTO v_user_count
    FROM public.user_roles
    WHERE role_id = p_role_id;

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

-- 7. Role Creation Delegation Ceiling
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

    -- Check caller authorization
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

        -- Deduplicate
        SELECT ARRAY(
            SELECT DISTINCT unnest(p_permission_ids)
        ) INTO v_deduped_perms;
    ELSE
        v_deduped_perms := ARRAY[]::TEXT[];
    END IF;

    -- ENFORCE DELEGATION CEILING: Caller cannot grant permissions they do not possess
    IF NOT public.can_delegate_permission_set(v_deduped_perms) THEN
        RAISE EXCEPTION 'Access denied. You cannot grant permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- Insert new role
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

    -- Insert permissions
    IF cardinality(v_deduped_perms) > 0 THEN
        FOREACH v_perm_id IN ARRAY v_deduped_perms
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, created_at)
            VALUES (v_slug, v_perm_id, clock_timestamp());
        END LOOP;
    END IF;

    -- Audit log
    PERFORM public.log_role_audit_event(
        'ROLE_CREATED',
        v_slug,
        jsonb_build_object(
            'name_en', v_clean_name_en,
            'name_bn', v_clean_name_bn,
            'active', COALESCE(p_active, TRUE),
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

-- 8. Role Update Delegation Ceiling & Target Scope
CREATE OR REPLACE FUNCTION public.admin_update_role(
    p_id TEXT,
    p_name_en TEXT,
    p_name_bn TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT TRUE,
    p_permission_ids TEXT[] DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_id TEXT;
    v_clean_name_en TEXT;
    v_clean_name_bn TEXT;
    v_clean_desc TEXT;
    v_existing_role RECORD;
    v_invalid_perms TEXT[];
    v_deduped_perms TEXT[];
    v_final_perms TEXT[];
    v_perm_id TEXT;
    v_updated_role RECORD;
    v_user_count INT;
BEGIN
    -- Concurrency serialization
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_role_management_mutation_lock'));

    -- Check caller authorization
    IF NOT public.can_manage_roles() THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to manage roles.'
            USING ERRCODE = '42501';
    END IF;

    -- Validate role ID
    v_clean_id := btrim(p_id);
    IF v_clean_id IS NULL OR v_clean_id = '' THEN
        RAISE EXCEPTION 'Role ID is required.' USING ERRCODE = '22000';
    END IF;

    -- Retrieve existing role
    SELECT id, name_en, name_bn, description, active, is_system, created_at, updated_at
    INTO v_existing_role
    FROM public.roles
    WHERE id = v_clean_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role not found: %', v_clean_id USING ERRCODE = 'P0002';
    END IF;

    -- TARGET SCOPE GUARD: Caller cannot modify a role whose permissions exceed caller's ceiling
    IF NOT public.can_manage_role_scope(v_clean_id) THEN
        RAISE EXCEPTION 'Access denied. You cannot modify a role containing permissions that you do not possess.'
            USING ERRCODE = '42501';
    END IF;

    -- System role protection
    IF v_existing_role.is_system IS TRUE THEN
        IF p_name_en IS NOT NULL AND btrim(p_name_en) <> v_existing_role.name_en THEN
            RAISE EXCEPTION 'System role name cannot be modified.' USING ERRCODE = '42501';
        END IF;

        IF p_active IS NOT NULL AND p_active IS FALSE THEN
            RAISE EXCEPTION 'System roles cannot be deactivated.' USING ERRCODE = '42501';
        END IF;

        IF p_permission_ids IS NOT NULL THEN
            RAISE EXCEPTION 'Permissions of system roles cannot be modified.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Validate and clean English name
    v_clean_name_en := btrim(p_name_en);
    IF v_clean_name_en IS NULL OR v_clean_name_en = '' THEN
        RAISE EXCEPTION 'English role name is required and cannot be blank.' USING ERRCODE = '22000';
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

    -- Validate permission updates if provided
    IF p_permission_ids IS NOT NULL THEN
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
            ) INTO v_deduped_perms;
        ELSE
            v_deduped_perms := ARRAY[]::TEXT[];
        END IF;

        -- NEW PERMISSION SET CEILING GUARD: Caller cannot grant permissions they do not possess
        IF NOT public.can_delegate_permission_set(v_deduped_perms) THEN
            RAISE EXCEPTION 'Access denied. You cannot grant permissions that you do not possess.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Last effective manager safety check
    IF (p_active IS FALSE AND v_existing_role.active IS TRUE) OR
       (p_permission_ids IS NOT NULL AND NOT ('roles.manage' = ANY(v_deduped_perms))) THEN
        IF EXISTS (
            SELECT 1 FROM public.role_permissions
            WHERE role_id = v_clean_id AND permission_id = 'roles.manage'
        ) THEN
            IF public.count_effective_role_managers() <= (
                SELECT COUNT(DISTINCT user_id)::INT
                FROM public.user_roles
                WHERE role_id = v_clean_id
            ) THEN
                RAISE EXCEPTION 'Cannot modify or deactivate this role because doing so would leave no active administrators capable of managing roles.'
                    USING ERRCODE = '23514';
            END IF;
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

        IF cardinality(v_deduped_perms) > 0 THEN
            FOREACH v_perm_id IN ARRAY v_deduped_perms
            LOOP
                INSERT INTO public.role_permissions (role_id, permission_id, created_at)
                VALUES (v_clean_id, v_perm_id, clock_timestamp());
            END LOOP;
        END IF;

        v_final_perms := v_deduped_perms;
    ELSE
        SELECT COALESCE(array_agg(permission_id ORDER BY permission_id ASC), ARRAY[]::TEXT[])
        INTO v_final_perms
        FROM public.role_permissions
        WHERE role_id = v_clean_id;
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

-- 9. Role Permissions Delegation Ceiling: admin_replace_role_permissions(...)
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
    v_role_exists BOOLEAN;
    v_invalid_perms TEXT[];
    v_deduped_perms TEXT[];
    v_perm_id TEXT;
    v_new_count INT;
    v_updated_at TIMESTAMPTZ;
BEGIN
    -- Concurrency serialization
    PERFORM pg_advisory_xact_lock(hashtext('sobaike_role_management_mutation_lock'));

    -- Check caller authorization
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

    -- Last effective manager safety check
    IF NOT ('roles.manage' = ANY(v_deduped_perms)) THEN
        IF EXISTS (
            SELECT 1 FROM public.role_permissions
            WHERE role_id = v_clean_role_id AND permission_id = 'roles.manage'
        ) THEN
            IF public.count_effective_role_managers() <= (
                SELECT COUNT(DISTINCT user_id)::INT
                FROM public.user_roles
                WHERE role_id = v_clean_role_id
            ) THEN
                RAISE EXCEPTION 'Cannot remove roles.manage from this role because doing so would leave no active administrators capable of managing roles.'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
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

-- 10. Assignable Roles Ceiling Filter
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

-- 11. User Creation Membership Delegation Ceiling
CREATE OR REPLACE FUNCTION public.admin_finalize_user_membership(
    p_user_id UUID,
    p_display_name TEXT,
    p_role_id TEXT,
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

    -- Retrieve email from auth.users
    SELECT email INTO v_auth_email
    FROM auth.users
    WHERE id = p_user_id;

    IF v_auth_email IS NULL THEN
        RAISE EXCEPTION 'Authentication user record does not exist.' USING ERRCODE = 'P0002';
    END IF;

    -- Insert or update public.admin_users
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
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
        display_name = EXCLUDED.display_name,
        active = EXCLUDED.active,
        updated_at = v_now;

    -- Assign role in public.user_roles
    INSERT INTO public.user_roles (user_id, role_id, created_at)
    VALUES (p_user_id, v_clean_role_id, v_now)
    ON CONFLICT (user_id) DO UPDATE
    SET
        role_id = EXCLUDED.role_id,
        created_at = v_now;

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

-- 12. User Update Target Scope & Role Ceiling
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
    v_active_super_admin_count INT;
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

-- 13. Users List with Target Manageability
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

-- 14. User Detail with Target Manageability
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
    v_admin RECORD;
    v_auth_email TEXT;
    v_role RECORD;
    v_perms TEXT[];
BEGIN
    -- Check caller authorization: requires admin_users.view or admin_users.manage
    IF NOT (public.has_permission('admin_users.view') OR public.has_permission('admin_users.manage')) THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to view administrative user details.'
            USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required.' USING ERRCODE = '22000';
    END IF;

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

    IF v_admin.is_super_admin IS TRUE THEN
        -- Super Admin effective permissions: all canonical
        SELECT array_agg(id ORDER BY id ASC) INTO v_perms
        FROM public.permissions;

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

    IF FOUND THEN
        SELECT COALESCE(array_agg(rp.permission_id ORDER BY rp.permission_id ASC), ARRAY[]::TEXT[])
        INTO v_perms
        FROM public.role_permissions rp
        WHERE rp.role_id = v_role.id;
    ELSE
        v_perms := ARRAY[]::TEXT[];
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
        'can_manage_target', public.can_manage_user_target(v_admin.user_id),
        'created_at', v_admin.created_at,
        'updated_at', v_admin.updated_at
    );
END;
$$;

-- 15. Permissions Grants
GRANT EXECUTE ON FUNCTION public.get_caller_effective_permission_set() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_delegate_permission_set(TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_role_scope(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_user_target(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_permission_catalogue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_role_detail(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_role(TEXT, TEXT, BOOLEAN, TEXT[], TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_role(TEXT, TEXT, TEXT, BOOLEAN, TEXT[], TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_replace_role_permissions(TEXT, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_assignable_roles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finalize_user_membership(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_users(TEXT, TEXT, TEXT, INT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user(UUID) TO authenticated, service_role;
