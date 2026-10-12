-- ==============================================================================
-- Migration: 20260904000004_notification_foundation.sql
-- Description: Phase 1 — Notification backend foundation & RBAC-safe recipient engine
--               (Targeted Correction Pass: audience_mode, read-time visibility, fail-closed)
--
-- Key Capabilities:
-- 1. Canonical Notification Event Catalogue (admin_notification_event_catalogue)
--    with exactly 12 approved seed keys, categorized, layered, and severity-assigned.
-- 2. Main Per-Recipient Notification Table (admin_notifications) with strict
--    domain constraints, audience_mode persistence, deduplication protection, and performance indexes.
-- 3. Dedicated Internal Recipient-Evaluation Helpers:
--    - admin_notification_get_effective_permissions(p_user_id UUID)
--    - admin_notification_can_view_user_scope(p_recipient_user_id UUID, p_target_user_id UUID)
--    - admin_notification_can_view_role_scope(p_recipient_user_id UUID, p_role_id TEXT)
-- 4. Dedicated Internal Read-Time Visibility Evaluator:
--    - admin_notification_can_currently_view(...)
--      Re-evaluates recipient authority dynamically at read-time so stale notifications
--      hide immediately if roles/permissions/scoping are revoked.
-- 5. Generic Server-Side Recipient Resolver:
--    - admin_notification_resolve_recipients(...)
--      Strict fail-closed evaluation across personal, super_admin_only, and permission modes.
-- 6. Canonical Internal Notification Emitter:
--    - admin_emit_notification(...)
--      Strict contract validation (SQLSTATE 22000), atomic multi-recipient dispatch.
-- 7. User-Facing Protected Notification RPCs:
--    - admin_list_notifications(...)
--    - admin_get_unread_notification_count()
--    - admin_mark_notification_read(p_notification_id UUID)
--    - admin_mark_all_notifications_read()
-- 8. Defense-in-Depth RLS & Privilege Lockdown:
--    - Authenticated users can only SELECT their own authorized notifications via RLS.
--    - Direct table INSERT/UPDATE/DELETE revoked from authenticated & anon.
--    - Internal helpers & emitter revoked from PUBLIC/anon/authenticated.
--    - Zero notifications.view permission added.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Canonical Notification Event Catalogue
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_notification_event_catalogue (
    event_key TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    default_layer TEXT NOT NULL,
    default_severity TEXT NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_event_catalogue_category CHECK (
        category IN ('complaint', 'administration', 'role', 'security', 'personal', 'system')
    ),
    CONSTRAINT chk_event_catalogue_default_layer CHECK (
        default_layer IN ('action_required', 'workflow_activity', 'administrative_oversight', 'security_privilege', 'personal_account', 'system_operational')
    ),
    CONSTRAINT chk_event_catalogue_default_severity CHECK (
        default_severity IN ('info', 'action_required', 'warning', 'security')
    )
);

-- Seed exactly the 12 approved Phase 1 notification event keys
INSERT INTO public.admin_notification_event_catalogue (
    event_key, category, default_layer, default_severity, description, active
)
VALUES
    ('complaint.submitted', 'complaint', 'action_required', 'action_required', 'New public complaint submitted', true),
    ('complaint.evidence_attached', 'complaint', 'action_required', 'info', 'Public evidence attached to complaint', true),
    ('complaint.published', 'complaint', 'workflow_activity', 'info', 'Complaint published to public feed', true),
    ('complaint.unpublished', 'complaint', 'workflow_activity', 'warning', 'Complaint unpublished from public feed', true),
    ('complaint.rejected', 'complaint', 'workflow_activity', 'info', 'Complaint rejected during moderation', true),
    ('admin.created', 'administration', 'administrative_oversight', 'info', 'New administrator created', true),
    ('admin.activated', 'administration', 'administrative_oversight', 'info', 'Administrator activated', true),
    ('admin.deactivated', 'administration', 'administrative_oversight', 'warning', 'Administrator deactivated', true),
    ('admin.role_changed', 'administration', 'security_privilege', 'security', 'Administrator role assignment updated', true),
    ('role.created', 'role', 'administrative_oversight', 'info', 'New role created', true),
    ('role.updated', 'role', 'administrative_oversight', 'info', 'Role details updated', true),
    ('role.permissions_changed', 'role', 'security_privilege', 'security', 'Role permissions modified', true)
ON CONFLICT (event_key) DO UPDATE
SET category = EXCLUDED.category,
    default_layer = EXCLUDED.default_layer,
    default_severity = EXCLUDED.default_severity,
    description = EXCLUDED.description,
    active = EXCLUDED.active,
    updated_at = now();

-- ------------------------------------------------------------------------------
-- 2. Main Per-Recipient Notification Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_group_id UUID NOT NULL,
    dedupe_key TEXT NULL,
    recipient_user_id UUID NOT NULL REFERENCES public.admin_users(user_id) ON DELETE CASCADE,
    event_key TEXT NOT NULL REFERENCES public.admin_notification_event_catalogue(event_key) ON UPDATE CASCADE ON DELETE RESTRICT,
    category TEXT NOT NULL,
    layer TEXT NOT NULL,
    severity TEXT NOT NULL,
    audience_mode TEXT NOT NULL DEFAULT 'permission',
    actor_user_id UUID NULL,
    actor_display_name TEXT NULL,
    target_type TEXT NULL,
    target_id TEXT NULL,
    target_label TEXT NULL,
    title_en TEXT NOT NULL,
    title_bn TEXT NOT NULL,
    body_en TEXT NULL,
    body_bn TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    required_all_permissions TEXT[] NOT NULL DEFAULT '{}',
    required_any_permissions TEXT[] NOT NULL DEFAULT '{}',
    route TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ NULL,
    CONSTRAINT chk_notifications_category CHECK (
        category IN ('complaint', 'administration', 'role', 'security', 'personal', 'system')
    ),
    CONSTRAINT chk_notifications_layer CHECK (
        layer IN ('action_required', 'workflow_activity', 'administrative_oversight', 'security_privilege', 'personal_account', 'system_operational')
    ),
    CONSTRAINT chk_notifications_severity CHECK (
        severity IN ('info', 'action_required', 'warning', 'security')
    ),
    CONSTRAINT chk_notifications_audience_mode CHECK (
        audience_mode IN ('permission', 'super_admin_only', 'personal')
    ),
    CONSTRAINT chk_notifications_target_type CHECK (
        target_type IS NULL OR target_type IN ('complaint', 'admin_user', 'role')
    ),
    CONSTRAINT chk_notifications_titles CHECK (
        length(trim(title_en)) > 0 AND length(trim(title_bn)) > 0
    ),
    CONSTRAINT chk_notifications_route CHECK (
        route IS NULL OR route ~ '^/[^\s]*$'
    ),
    CONSTRAINT chk_notifications_metadata CHECK (
        jsonb_typeof(metadata) = 'object'
    )
);

-- Performance and Query Indexes
CREATE INDEX IF NOT EXISTS idx_admin_notifications_recipient_created 
    ON public.admin_notifications(recipient_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_recipient_read 
    ON public.admin_notifications(recipient_user_id, read_at);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_recipient_audience 
    ON public.admin_notifications(recipient_user_id, audience_mode);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_event_group 
    ON public.admin_notifications(event_group_id);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_event_key 
    ON public.admin_notifications(event_key);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_category 
    ON public.admin_notifications(category);

-- Partial index for fast unread count and queries
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread 
    ON public.admin_notifications(recipient_user_id, created_at DESC) 
    WHERE read_at IS NULL;

-- Idempotency protection index (per-recipient deduplication)
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notifications_dedupe 
    ON public.admin_notifications(recipient_user_id, dedupe_key) 
    WHERE dedupe_key IS NOT NULL;

-- Prevent duplicate recipients within one emitted event group
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notifications_event_group_recipient 
    ON public.admin_notifications(event_group_id, recipient_user_id);

-- ------------------------------------------------------------------------------
-- 3. Dedicated Internal Recipient-Evaluation Helper: Effective Permissions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_notification_get_effective_permissions(
    p_user_id UUID
)
RETURNS SETOF TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_is_active BOOLEAN;
    v_is_super_admin BOOLEAN;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN;
    END IF;

    -- Verify administrator exists and is active
    SELECT COALESCE(au.active, false), COALESCE(au.is_super_admin, false)
    INTO v_is_active, v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = p_user_id;

    -- Inactive or missing admin receives empty set
    IF v_is_active IS NOT TRUE THEN
        RETURN;
    END IF;

    -- Active Super Admin dynamically receives the full canonical permission catalogue
    IF v_is_super_admin IS TRUE THEN
        RETURN QUERY SELECT p.id FROM public.permissions p;
        RETURN;
    END IF;

    -- Normal active admin receives distinct permissions from currently assigned active roles
    RETURN QUERY
    SELECT DISTINCT rp.permission_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id AND r.active = true
    JOIN public.role_permissions rp ON rp.role_id = r.id
    WHERE ur.user_id = p_user_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Dedicated Internal Recipient-Evaluation Helper: User-Scope Ceiling
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_notification_can_view_user_scope(
    p_recipient_user_id UUID,
    p_target_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_recip_active BOOLEAN;
    v_recip_is_super_admin BOOLEAN;
    v_target_exists BOOLEAN;
    v_target_is_super_admin BOOLEAN;
    v_has_user_view BOOLEAN;
    v_has_user_manage BOOLEAN;
BEGIN
    IF p_recipient_user_id IS NULL OR p_target_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Recipient must exist and be active
    SELECT COALESCE(active, false), COALESCE(is_super_admin, false)
    INTO v_recip_active, v_recip_is_super_admin
    FROM public.admin_users
    WHERE user_id = p_recipient_user_id;

    IF v_recip_active IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- Target must exist in admin_users
    SELECT true, COALESCE(is_super_admin, false)
    INTO v_target_exists, v_target_is_super_admin
    FROM public.admin_users
    WHERE user_id = p_target_user_id;

    IF v_target_exists IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- Active Super Admin recipient may view administrative targets
    IF v_recip_is_super_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- Normal administrator must NEVER receive sensitive notifications about protected Super Admin
    IF v_target_is_super_admin IS TRUE THEN
        RETURN FALSE;
    END IF;

    -- Normal administrator must have at least one of admin_users.view or admin_users.manage
    SELECT
        EXISTS (SELECT 1 FROM public.admin_notification_get_effective_permissions(p_recipient_user_id) AS p_id WHERE p_id = 'admin_users.view'),
        EXISTS (SELECT 1 FROM public.admin_notification_get_effective_permissions(p_recipient_user_id) AS p_id WHERE p_id = 'admin_users.manage')
    INTO v_has_user_view, v_has_user_manage;

    IF NOT (v_has_user_view OR v_has_user_manage) THEN
        RETURN FALSE;
    END IF;

    -- Target authority must not exceed candidate recipient's effective permission ceiling
    RETURN NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id AND r.active = true
        JOIN public.role_permissions rp ON rp.role_id = r.id
        WHERE ur.user_id = p_target_user_id
          AND rp.permission_id NOT IN (
              SELECT p_id FROM public.admin_notification_get_effective_permissions(p_recipient_user_id) AS p_id
          )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Dedicated Internal Recipient-Evaluation Helper: Role-Scope Ceiling
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_notification_can_view_role_scope(
    p_recipient_user_id UUID,
    p_role_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_recip_active BOOLEAN;
    v_recip_is_super_admin BOOLEAN;
    v_role_exists BOOLEAN;
    v_has_roles_manage BOOLEAN;
BEGIN
    IF p_recipient_user_id IS NULL OR p_role_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Recipient must exist and be active
    SELECT COALESCE(active, false), COALESCE(is_super_admin, false)
    INTO v_recip_active, v_recip_is_super_admin
    FROM public.admin_users
    WHERE user_id = p_recipient_user_id;

    IF v_recip_active IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- Target role must exist
    SELECT true INTO v_role_exists
    FROM public.roles
    WHERE id = p_role_id;

    IF v_role_exists IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- Super Admin can receive role events
    IF v_recip_is_super_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- Normal recipient must have roles.manage
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_notification_get_effective_permissions(p_recipient_user_id) AS p_id
        WHERE p_id = 'roles.manage'
    ) INTO v_has_roles_manage;

    IF v_has_roles_manage IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- Target role's permissions must be entirely inside recipient's effective permission ceiling
    RETURN NOT EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        WHERE rp.role_id = p_role_id
          AND rp.permission_id NOT IN (
              SELECT p_id FROM public.admin_notification_get_effective_permissions(p_recipient_user_id) AS p_id
          )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Dedicated Internal Read-Time Visibility Evaluator (Caller-Bound to auth.uid())
-- ------------------------------------------------------------------------------
-- Evaluates whether the currently authenticated caller possesses the authority to view
-- a notification addressed to them. Applied across RLS and all read/mark-read RPCs so that
-- revoked permissions or demotions immediately hide historical notifications.
-- Hard-bound to auth.uid(): the caller can NEVER supply an arbitrary user ID.

DROP FUNCTION IF EXISTS public.admin_notification_can_currently_view(UUID, TEXT, TEXT[], TEXT[], TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.admin_notification_can_currently_view(UUID, UUID);

CREATE OR REPLACE FUNCTION public.admin_notification_can_currently_view(
    p_recipient_user_id UUID,
    p_audience_mode TEXT,
    p_required_all_permissions TEXT[],
    p_required_any_permissions TEXT[],
    p_target_type TEXT,
    p_target_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_is_active BOOLEAN;
    v_is_super_admin BOOLEAN;
    v_eff_perms TEXT[];
    v_target_uuid UUID;
    v_scope_ok BOOLEAN;
BEGIN
    -- 1. Caller identity derived strictly from auth.uid()
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR p_recipient_user_id IS NULL OR v_caller_id <> p_recipient_user_id THEN
        RETURN FALSE;
    END IF;

    -- 2. Recipient/Caller must exist in admin_users and currently be active
    SELECT COALESCE(au.active, false), COALESCE(au.is_super_admin, false)
    INTO v_is_active, v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = v_caller_id;

    IF v_is_active IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- 3. Super Admin recipient can view all modes addressed to them
    IF v_is_super_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- 4. Normal administrator: evaluate based on audience_mode
    IF p_audience_mode = 'personal' THEN
        -- Active personal recipient is allowed (e.g., role changed, personal alert)
        -- Does not require roles.manage or admin_users.manage
        RETURN TRUE;
    ELSIF p_audience_mode = 'super_admin_only' THEN
        -- Normal administrator must NEVER see super_admin_only notifications
        RETURN FALSE;
    ELSIF p_audience_mode = 'permission' THEN
        -- Fetch current effective permissions for caller
        v_eff_perms := ARRAY(
            SELECT p_id FROM public.admin_notification_get_effective_permissions(v_caller_id) AS p_id
        );

        -- Check required_all_permissions (caller must possess all listed permissions)
        IF p_required_all_permissions IS NOT NULL AND cardinality(p_required_all_permissions) > 0 THEN
            IF NOT (p_required_all_permissions <@ v_eff_perms) THEN
                RETURN FALSE;
            END IF;
        END IF;

        -- Check required_any_permissions (caller must possess at least one listed permission)
        IF p_required_any_permissions IS NOT NULL AND cardinality(p_required_any_permissions) > 0 THEN
            IF NOT (p_required_any_permissions && v_eff_perms) THEN
                RETURN FALSE;
            END IF;
        END IF;

        -- Check target scoping
        IF p_target_type = 'admin_user' THEN
            IF p_target_id IS NULL OR length(btrim(p_target_id)) = 0 THEN
                RETURN FALSE;
            END IF;
            BEGIN
                v_target_uuid := btrim(p_target_id)::UUID;
            EXCEPTION WHEN OTHERS THEN
                RETURN FALSE;
            END;
            v_scope_ok := public.admin_notification_can_view_user_scope(v_caller_id, v_target_uuid);
            IF v_scope_ok IS NOT TRUE THEN
                RETURN FALSE;
            END IF;
        ELSIF p_target_type = 'role' THEN
            IF p_target_id IS NULL OR length(btrim(p_target_id)) = 0 THEN
                RETURN FALSE;
            END IF;
            v_scope_ok := public.admin_notification_can_view_role_scope(v_caller_id, btrim(p_target_id));
            IF v_scope_ok IS NOT TRUE THEN
                RETURN FALSE;
            END IF;
        ELSIF p_target_type = 'complaint' THEN
            -- Complaint authorization is governed by required permissions
            NULL;
        ELSIF p_target_type IS NULL THEN
            -- No target-specific scope
            NULL;
        ELSE
            -- Unknown target type: fail-closed!
            RETURN FALSE;
        END IF;

        RETURN TRUE;
    END IF;

    -- Unknown audience mode -> fail-closed
    RETURN FALSE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. Generic Server-Side Recipient Resolver
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_notification_resolve_recipients(
    p_audience_mode TEXT DEFAULT 'permission',
    p_required_all_permissions TEXT[] DEFAULT '{}',
    p_required_any_permissions TEXT[] DEFAULT '{}',
    p_target_type TEXT DEFAULT NULL,
    p_target_id TEXT DEFAULT NULL,
    p_personal_recipient_id UUID DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_exclude_actor BOOLEAN DEFAULT true,
    p_include_super_admin BOOLEAN DEFAULT true
)
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_cand RECORD;
    v_eff_perms TEXT[];
    v_target_uuid UUID;
    v_scope_ok BOOLEAN;
BEGIN
    -- 1. Personal audience mode
    IF p_audience_mode = 'personal' THEN
        IF p_personal_recipient_id IS NULL THEN
            RETURN;
        END IF;

        IF p_exclude_actor IS TRUE AND p_actor_user_id IS NOT NULL AND p_personal_recipient_id = p_actor_user_id THEN
            RETURN;
        END IF;

        RETURN QUERY
        SELECT au.user_id
        FROM public.admin_users au
        WHERE au.user_id = p_personal_recipient_id
          AND au.active = true;
        RETURN;
    END IF;

    -- 2. Super admin only audience mode
    IF p_audience_mode = 'super_admin_only' THEN
        RETURN QUERY
        SELECT au.user_id
        FROM public.admin_users au
        WHERE au.active = true
          AND au.is_super_admin = true
          AND (NOT p_exclude_actor OR p_actor_user_id IS NULL OR au.user_id <> p_actor_user_id);
        RETURN;
    END IF;

    -- 3. Permission audience mode
    IF p_audience_mode = 'permission' THEN
        -- Defense in depth: validate supported target types
        IF p_target_type IS NOT NULL AND p_target_type NOT IN ('complaint', 'admin_user', 'role') THEN
            RETURN;
        END IF;

        -- Defense in depth: validate target_id for scoped target types
        IF p_target_type = 'admin_user' THEN
            IF p_target_id IS NULL OR length(btrim(p_target_id)) = 0 THEN
                RETURN;
            END IF;
            BEGIN
                v_target_uuid := btrim(p_target_id)::UUID;
            EXCEPTION WHEN OTHERS THEN
                RETURN;
            END;
        ELSIF p_target_type = 'role' THEN
            IF p_target_id IS NULL OR length(btrim(p_target_id)) = 0 THEN
                RETURN;
            END IF;
        END IF;

        FOR v_cand IN
            SELECT au.user_id, au.is_super_admin
            FROM public.admin_users au
            WHERE au.active = true
        LOOP
            -- Check actor exclusion
            IF p_exclude_actor IS TRUE AND p_actor_user_id IS NOT NULL AND v_cand.user_id = p_actor_user_id THEN
                CONTINUE;
            END IF;

            -- If Super Admin candidate
            IF v_cand.is_super_admin IS TRUE THEN
                IF p_include_super_admin IS TRUE THEN
                    RETURN NEXT v_cand.user_id;
                END IF;
                CONTINUE;
            END IF;

            -- Normal administrator: resolve effective permissions
            v_eff_perms := ARRAY(
                SELECT p_id FROM public.admin_notification_get_effective_permissions(v_cand.user_id) AS p_id
            );

            -- Check required_all_permissions (must possess every listed permission)
            IF p_required_all_permissions IS NOT NULL AND cardinality(p_required_all_permissions) > 0 THEN
                IF NOT (p_required_all_permissions <@ v_eff_perms) THEN
                    CONTINUE;
                END IF;
            END IF;

            -- Check required_any_permissions (must possess at least one listed permission)
            IF p_required_any_permissions IS NOT NULL AND cardinality(p_required_any_permissions) > 0 THEN
                IF NOT (p_required_any_permissions && v_eff_perms) THEN
                    CONTINUE;
                END IF;
            END IF;

            -- Check target scoping
            IF p_target_type = 'admin_user' THEN
                v_scope_ok := public.admin_notification_can_view_user_scope(v_cand.user_id, v_target_uuid);
                IF v_scope_ok IS NOT TRUE THEN
                    CONTINUE;
                END IF;
            ELSIF p_target_type = 'role' THEN
                v_scope_ok := public.admin_notification_can_view_role_scope(v_cand.user_id, btrim(p_target_id));
                IF v_scope_ok IS NOT TRUE THEN
                    CONTINUE;
                END IF;
            ELSIF p_target_type = 'complaint' THEN
                -- Complaint authorization is governed by required permissions
                NULL;
            ELSIF p_target_type IS NULL THEN
                -- No target-specific scope
                NULL;
            ELSE
                -- Unknown target type: fail-closed!
                CONTINUE;
            END IF;

            RETURN NEXT v_cand.user_id;
        END LOOP;
        RETURN;
    END IF;

    -- Unknown audience mode -> fail closed
    RETURN;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. Canonical Internal Notification Emitter
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_emit_notification(
    p_event_key TEXT,
    p_title_en TEXT,
    p_title_bn TEXT,
    p_body_en TEXT DEFAULT NULL,
    p_body_bn TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT auth.uid(),
    p_actor_display_name TEXT DEFAULT NULL,
    p_target_type TEXT DEFAULT NULL,
    p_target_id TEXT DEFAULT NULL,
    p_target_label TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_required_all_permissions TEXT[] DEFAULT '{}',
    p_required_any_permissions TEXT[] DEFAULT '{}',
    p_audience_mode TEXT DEFAULT 'permission',
    p_personal_recipient_id UUID DEFAULT NULL,
    p_route TEXT DEFAULT NULL,
    p_dedupe_key TEXT DEFAULT NULL,
    p_exclude_actor BOOLEAN DEFAULT true,
    p_include_super_admin BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_cat RECORD;
    v_actor_display_name TEXT;
    v_event_group_id UUID;
    v_inserted_count INTEGER := 0;
BEGIN
    -- 1. Validate event_key against active catalogue
    SELECT event_key, category, default_layer, default_severity, active
    INTO v_cat
    FROM public.admin_notification_event_catalogue
    WHERE event_key = p_event_key;

    IF v_cat.event_key IS NULL OR v_cat.active IS NOT TRUE THEN
        RAISE EXCEPTION 'Unknown or inactive notification event key: %', p_event_key
            USING ERRCODE = '22000';
    END IF;

    -- 2. Validate EN and BN titles
    IF p_title_en IS NULL OR length(trim(p_title_en)) = 0 THEN
        RAISE EXCEPTION 'English title (title_en) must not be empty' USING ERRCODE = '22000';
    END IF;
    IF p_title_bn IS NULL OR length(trim(p_title_bn)) = 0 THEN
        RAISE EXCEPTION 'Bengali title (title_bn) must not be empty' USING ERRCODE = '22000';
    END IF;

    -- 3. Validate audience mode contract
    IF p_audience_mode IS NULL OR p_audience_mode NOT IN ('permission', 'super_admin_only', 'personal') THEN
        RAISE EXCEPTION 'Invalid audience mode: %. Must be permission, super_admin_only, or personal', p_audience_mode
            USING ERRCODE = '22000';
    END IF;

    IF p_audience_mode = 'personal' AND p_personal_recipient_id IS NULL THEN
        RAISE EXCEPTION 'personal_recipient_id is required when audience_mode is personal'
            USING ERRCODE = '22000';
    END IF;

    -- 4. Validate target type and identifier format
    IF p_target_type IS NOT NULL THEN
        IF p_target_type NOT IN ('complaint', 'admin_user', 'role') THEN
            RAISE EXCEPTION 'Invalid target type: %. Must be complaint, admin_user, or role', p_target_type
                USING ERRCODE = '22000';
        END IF;

        IF p_target_type = 'admin_user' THEN
            IF p_target_id IS NULL OR length(btrim(p_target_id)) = 0 THEN
                RAISE EXCEPTION 'target_id is required and must be a valid UUID for admin_user target'
                    USING ERRCODE = '22000';
            END IF;
            BEGIN
                PERFORM btrim(p_target_id)::UUID;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid target_id for admin_user: must be a valid UUID'
                    USING ERRCODE = '22000';
            END;
        ELSIF p_target_type = 'role' THEN
            IF p_target_id IS NULL OR length(btrim(p_target_id)) = 0 THEN
                RAISE EXCEPTION 'target_id is required and must be non-empty for role target'
                    USING ERRCODE = '22000';
            END IF;
        END IF;
    END IF;

    -- 5. Validate internal route if provided
    IF p_route IS NOT NULL AND NOT (p_route ~ '^/[^\s]*$') THEN
        RAISE EXCEPTION 'Route must be an internal path beginning with /' USING ERRCODE = '22000';
    END IF;

    -- 6. Snapshot actor display name
    IF p_actor_display_name IS NOT NULL AND length(trim(p_actor_display_name)) > 0 THEN
        v_actor_display_name := trim(p_actor_display_name);
    ELSIF p_actor_user_id IS NOT NULL THEN
        SELECT display_name INTO v_actor_display_name
        FROM public.admin_users
        WHERE user_id = p_actor_user_id;
    END IF;

    -- 7. Generate event_group_id
    v_event_group_id := gen_random_uuid();

    -- 8. Insert one notification row per resolved authorized recipient
    INSERT INTO public.admin_notifications (
        event_group_id,
        dedupe_key,
        recipient_user_id,
        event_key,
        category,
        layer,
        severity,
        audience_mode,
        actor_user_id,
        actor_display_name,
        target_type,
        target_id,
        target_label,
        title_en,
        title_bn,
        body_en,
        body_bn,
        metadata,
        required_all_permissions,
        required_any_permissions,
        route
    )
    SELECT
        v_event_group_id,
        p_dedupe_key,
        r.recipient_id,
        p_event_key,
        v_cat.category,
        v_cat.default_layer,
        v_cat.default_severity,
        p_audience_mode,
        p_actor_user_id,
        v_actor_display_name,
        p_target_type,
        p_target_id,
        p_target_label,
        trim(p_title_en),
        trim(p_title_bn),
        p_body_en,
        p_body_bn,
        COALESCE(p_metadata, '{}'::jsonb),
        COALESCE(p_required_all_permissions, '{}'::text[]),
        COALESCE(p_required_any_permissions, '{}'::text[]),
        p_route
    FROM (
        SELECT DISTINCT rec_id AS recipient_id
        FROM public.admin_notification_resolve_recipients(
            p_audience_mode,
            p_required_all_permissions,
            p_required_any_permissions,
            p_target_type,
            p_target_id,
            p_personal_recipient_id,
            p_actor_user_id,
            p_exclude_actor,
            p_include_super_admin
        ) AS rec_id
    ) r
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'event_group_id', v_event_group_id,
        'recipient_count', v_inserted_count
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. User-Facing Authenticated RPC: List Notifications (Keyset Pagination)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_notifications(
    p_limit INTEGER DEFAULT 20,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id UUID DEFAULT NULL,
    p_unread_only BOOLEAN DEFAULT false,
    p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    event_group_id UUID,
    event_key TEXT,
    category TEXT,
    layer TEXT,
    severity TEXT,
    audience_mode TEXT,
    actor_user_id UUID,
    actor_display_name TEXT,
    target_type TEXT,
    target_id TEXT,
    target_label TEXT,
    title_en TEXT,
    title_bn TEXT,
    body_en TEXT,
    body_bn TEXT,
    metadata JSONB,
    route TEXT,
    created_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_safe_limit INTEGER;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Active administrator required' USING ERRCODE = '42501';
    END IF;

    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN;
    END IF;

    -- Clamp page size safely (1-50)
    v_safe_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

    RETURN QUERY
    SELECT 
        n.id,
        n.event_group_id,
        n.event_key,
        n.category,
        n.layer,
        n.severity,
        n.audience_mode,
        n.actor_user_id,
        n.actor_display_name,
        n.target_type,
        n.target_id,
        n.target_label,
        n.title_en,
        n.title_bn,
        n.body_en,
        n.body_bn,
        n.metadata,
        n.route,
        n.created_at,
        n.read_at
    FROM public.admin_notifications n
    WHERE n.recipient_user_id = v_caller_id
      AND public.admin_notification_can_currently_view(
          n.recipient_user_id,
          n.audience_mode,
          n.required_all_permissions,
          n.required_any_permissions,
          n.target_type,
          n.target_id
      )
      AND (p_unread_only IS NOT TRUE OR n.read_at IS NULL)
      AND (p_category IS NULL OR n.category = p_category)
      AND (
          p_before_created_at IS NULL
          OR (n.created_at, n.id) < (p_before_created_at, COALESCE(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT v_safe_limit;
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. User-Facing Authenticated RPC: Unread Notification Count
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_unread_notification_count()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_count BIGINT;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Active administrator required' USING ERRCODE = '42501';
    END IF;

    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.admin_notifications n
    WHERE n.recipient_user_id = v_caller_id
      AND n.read_at IS NULL
      AND public.admin_notification_can_currently_view(
          n.recipient_user_id,
          n.audience_mode,
          n.required_all_permissions,
          n.required_any_permissions,
          n.target_type,
          n.target_id
      );

    RETURN v_count;
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. User-Facing Authenticated RPC: Mark Single Notification Read
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_mark_notification_read(
    p_notification_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_updated_count INTEGER;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Active administrator required' USING ERRCODE = '42501';
    END IF;

    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR p_notification_id IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.admin_notifications n
    SET read_at = COALESCE(n.read_at, now())
    WHERE n.id = p_notification_id
      AND n.recipient_user_id = v_caller_id
      AND public.admin_notification_can_currently_view(
          n.recipient_user_id,
          n.audience_mode,
          n.required_all_permissions,
          n.required_any_permissions,
          n.target_type,
          n.target_id
      );

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN (v_updated_count > 0);
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. User-Facing Authenticated RPC: Mark All Notifications Read
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_updated_count INTEGER;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Active administrator required' USING ERRCODE = '42501';
    END IF;

    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN 0;
    END IF;

    UPDATE public.admin_notifications n
    SET read_at = now()
    WHERE n.recipient_user_id = v_caller_id
      AND n.read_at IS NULL
      AND public.admin_notification_can_currently_view(
          n.recipient_user_id,
          n.audience_mode,
          n.required_all_permissions,
          n.required_any_permissions,
          n.target_type,
          n.target_id
      );

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. Row Level Security & Privilege Lockdown
-- ------------------------------------------------------------------------------
-- Event Catalogue Table: Infrastructure only
ALTER TABLE public.admin_notification_event_catalogue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_notification_event_catalogue FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_notification_event_catalogue FROM anon;
REVOKE ALL ON TABLE public.admin_notification_event_catalogue FROM authenticated;
GRANT SELECT ON TABLE public.admin_notification_event_catalogue TO service_role;

-- Notifications Table: RLS & Direct Mutation Revocations
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_notifications_select_own" ON public.admin_notifications;
CREATE POLICY "admin_notifications_select_own"
ON public.admin_notifications
FOR SELECT
TO authenticated
USING (
    recipient_user_id = auth.uid()
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

REVOKE ALL ON TABLE public.admin_notifications FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.admin_notifications FROM authenticated;
GRANT SELECT ON TABLE public.admin_notifications TO authenticated;
GRANT ALL ON TABLE public.admin_notifications TO service_role;

-- Internal Evaluation Helpers: Revoke from browser clients, grant to service_role
REVOKE ALL ON FUNCTION public.admin_notification_get_effective_permissions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_notification_get_effective_permissions(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.admin_notification_get_effective_permissions(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notification_get_effective_permissions(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.admin_notification_can_view_user_scope(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_notification_can_view_user_scope(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.admin_notification_can_view_user_scope(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notification_can_view_user_scope(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.admin_notification_can_view_role_scope(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_notification_can_view_role_scope(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_notification_can_view_role_scope(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notification_can_view_role_scope(UUID, TEXT) TO service_role;

-- Read-Time Visibility Helper: Grant execute to authenticated (needed for RLS evaluation) & service_role
REVOKE ALL ON FUNCTION public.admin_notification_can_currently_view(UUID, TEXT, TEXT[], TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_notification_can_currently_view(UUID, TEXT, TEXT[], TEXT[], TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_notification_can_currently_view(UUID, TEXT, TEXT[], TEXT[], TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notification_can_currently_view(UUID, TEXT, TEXT[], TEXT[], TEXT, TEXT) TO service_role;

-- Server-Side Resolver & Emitter: Service role only
REVOKE ALL ON FUNCTION public.admin_notification_resolve_recipients(TEXT, TEXT[], TEXT[], TEXT, TEXT, UUID, UUID, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_notification_resolve_recipients(TEXT, TEXT[], TEXT[], TEXT, TEXT, UUID, UUID, BOOLEAN, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.admin_notification_resolve_recipients(TEXT, TEXT[], TEXT[], TEXT, TEXT, UUID, UUID, BOOLEAN, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notification_resolve_recipients(TEXT, TEXT[], TEXT[], TEXT, TEXT, UUID, UUID, BOOLEAN, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.admin_emit_notification(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT[], TEXT, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_emit_notification(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT[], TEXT, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.admin_emit_notification(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT[], TEXT, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_emit_notification(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT[], TEXT, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) TO service_role;

-- User-Facing Protected RPCs: Grant to authenticated & service_role
REVOKE ALL ON FUNCTION public.admin_list_notifications(INTEGER, TIMESTAMPTZ, UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_notifications(INTEGER, TIMESTAMPTZ, UUID, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_notifications(INTEGER, TIMESTAMPTZ, UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_notifications(INTEGER, TIMESTAMPTZ, UUID, BOOLEAN, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_unread_notification_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_unread_notification_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_unread_notification_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unread_notification_count() TO service_role;

REVOKE ALL ON FUNCTION public.admin_mark_notification_read(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_notification_read(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_notification_read(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.admin_mark_all_notifications_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_all_notifications_read() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_all_notifications_read() TO service_role;

COMMIT;
