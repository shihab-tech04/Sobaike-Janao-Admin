-- ==============================================================================
-- SOBAIKE JANAO ADMIN — ACTIVITY LOG AUTHORITATIVE READ RPC
-- ==============================================================================
-- Migration: 20260904000007_activity_log_read_rpc.sql
-- Purpose:
--   1. Provide secure, authoritative RPC public.admin_list_audit_logs(...) for
--      retrieving administrative audit logs.
--   2. Enforces caller is active admin (public.is_active_admin()) AND possesses
--      the canonical 'audit.view' permission (public.has_permission('audit.view')).
--   3. Resolves actor information safely (display_name from public.admin_users,
--      email from auth.users) without exposing sensitive auth metadata or credentials.
--   4. Preserves authentic stored audit action codes (e.g. complaint.publish,
--      complaint.unpublish, complaint.reject, USER_MEMBERSHIP_FINALIZED,
--      ADMIN_USER_UPDATED, ROLE_CREATED, ROLE_UPDATED, ROLE_PERMISSIONS_REPLACED).
--   5. Normalizes target_type output & filtering to canonical values:
--      'complaint', 'admin_user', 'role'.
--   6. Resolves effective admin user target reference: for admin_user targets,
--      if details->>'target_user_id' is non-empty, use it as target_id;
--      otherwise fall back to stored target_id.
--   7. Provides server-side filtering (search, action, target_type, actor_id, date range).
--   8. Provides deterministic server-side pagination with explicit ordering
--      (ORDER BY created_at DESC, id DESC) in both query CTE and jsonb_agg.
--   9. Recursively sanitizes audit details JSONB to ensure no secrets, credentials,
--      tokens, private evidence URLs, or password hashes leak to client.
--  10. Sanitizer helper function is internal-only (EXECUTE revoked from authenticated).
--  11. Direct SELECT on public.admin_audit_logs remains revoked from client roles.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. HELPER: Recursive JSONB Sanitizer for Audit Details (Internal Only)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sanitize_audit_details(p_val jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_type text;
    v_result jsonb;
BEGIN
    IF p_val IS NULL THEN
        RETURN NULL;
    END IF;

    v_type := jsonb_typeof(p_val);

    IF v_type = 'object' THEN
        SELECT COALESCE(
            jsonb_object_agg(
                key,
                public.sanitize_audit_details(value)
            ),
            '{}'::jsonb
        )
        INTO v_result
        FROM jsonb_each(p_val)
        WHERE NOT (key ~* '(password|token|secret|credential|api_key|auth_key|private_key|hash|evidence_url|signed_url|access_token|refresh_token)');

        RETURN v_result;
    ELSIF v_type = 'array' THEN
        SELECT COALESCE(
            jsonb_agg(
                public.sanitize_audit_details(value)
            ),
            '[]'::jsonb
        )
        INTO v_result
        FROM jsonb_array_elements(p_val);

        RETURN v_result;
    ELSE
        RETURN p_val;
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. AUTHORITATIVE RPC: public.admin_list_audit_logs
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(
    p_limit INT DEFAULT 15,
    p_offset INT DEFAULT 0,
    p_search TEXT DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    p_target_type TEXT DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL,
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_limit INT;
    v_offset INT;
    v_search TEXT;
    v_action TEXT;
    v_target_type_raw TEXT;
    v_norm_target_type TEXT;
    v_total_count BIGINT;
    v_logs_json JSONB;
BEGIN
    -- 1. Authorization: Fail closed. Require active admin session AND audit.view permission
    IF NOT public.is_active_admin() OR NOT public.has_permission('audit.view') THEN
        RAISE EXCEPTION 'Access denied. Audit log view authorization required.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate & normalize pagination parameters
    v_limit := COALESCE(p_limit, 15);
    IF v_limit < 1 THEN
        v_limit := 1;
    ELSIF v_limit > 100 THEN
        v_limit := 100;
    END IF;

    v_offset := COALESCE(p_offset, 0);
    IF v_offset < 0 THEN
        v_offset := 0;
    END IF;

    -- 3. Clean & normalize filter inputs
    v_search := nullif(btrim(p_search), '');
    v_action := nullif(btrim(p_action), '');
    IF v_action = 'all' THEN
        v_action := NULL;
    END IF;

    v_target_type_raw := nullif(btrim(p_target_type), '');
    IF v_target_type_raw = 'all' THEN
        v_target_type_raw := NULL;
    END IF;

    IF v_target_type_raw IS NOT NULL THEN
        v_norm_target_type := CASE
            WHEN lower(v_target_type_raw) = 'complaint' THEN 'complaint'
            WHEN lower(v_target_type_raw) IN ('user', 'admin_user') THEN 'admin_user'
            WHEN lower(v_target_type_raw) = 'role' THEN 'role'
            ELSE lower(v_target_type_raw)
        END;
    ELSE
        v_norm_target_type := NULL;
    END IF;

    -- 4. Execute query with CTE for consistent count and paginated items
    WITH filtered_logs AS (
        SELECT
            a.id,
            a.actor_id,
            au.email AS actor_email,
            u.display_name AS actor_display_name,
            a.action,
            CASE
                WHEN lower(btrim(a.target_type)) = 'complaint' THEN 'complaint'
                WHEN lower(btrim(a.target_type)) IN ('user', 'admin_user') THEN 'admin_user'
                WHEN lower(btrim(a.target_type)) = 'role' THEN 'role'
                ELSE lower(btrim(a.target_type))
            END AS target_type,
            CASE
                WHEN lower(btrim(a.target_type)) IN ('user', 'admin_user')
                     AND nullif(btrim(a.details->>'target_user_id'), '') IS NOT NULL
                THEN btrim(a.details->>'target_user_id')
                ELSE a.target_id
            END AS target_id,
            a.details,
            a.created_at
        FROM public.admin_audit_logs a
        LEFT JOIN public.admin_users u ON u.user_id = a.actor_id
        LEFT JOIN auth.users au ON au.id = a.actor_id
        WHERE
            -- Search: case-insensitive across safe fields including effective target reference
            (v_search IS NULL OR (
                a.action ILIKE ('%' || v_search || '%')
                OR a.target_id ILIKE ('%' || v_search || '%')
                OR (
                    lower(btrim(a.target_type)) IN ('user', 'admin_user')
                    AND (a.details->>'target_user_id') ILIKE ('%' || v_search || '%')
                )
                OR u.display_name ILIKE ('%' || v_search || '%')
                OR au.email ILIKE ('%' || v_search || '%')
            ))
            -- Action: exact stored match
            AND (v_action IS NULL OR a.action = v_action)
            -- Target type: normalized match
            AND (v_norm_target_type IS NULL OR (
                CASE
                    WHEN lower(btrim(a.target_type)) = 'complaint' THEN 'complaint'
                    WHEN lower(btrim(a.target_type)) IN ('user', 'admin_user') THEN 'admin_user'
                    WHEN lower(btrim(a.target_type)) = 'role' THEN 'role'
                    ELSE lower(btrim(a.target_type))
                END
            ) = v_norm_target_type)
            -- Actor ID: exact UUID match
            AND (p_actor_id IS NULL OR a.actor_id = p_actor_id)
            -- Date range filters
            AND (p_date_from IS NULL OR a.created_at >= p_date_from)
            AND (p_date_to IS NULL OR a.created_at <= p_date_to)
    ),
    counted AS (
        SELECT count(*)::bigint AS total FROM filtered_logs
    ),
    paginated AS (
        SELECT
            id,
            actor_id,
            actor_email,
            actor_display_name,
            action,
            target_type,
            target_id,
            public.sanitize_audit_details(details) AS details,
            created_at
        FROM filtered_logs
        ORDER BY created_at DESC, id DESC
        LIMIT v_limit
        OFFSET v_offset
    )
    SELECT
        (SELECT total FROM counted),
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', id,
                        'actor_id', actor_id,
                        'actor_email', actor_email,
                        'actor_display_name', actor_display_name,
                        'action', action,
                        'target_type', target_type,
                        'target_id', target_id,
                        'details', details,
                        'created_at', created_at
                    )
                    ORDER BY created_at DESC, id DESC
                )
                FROM paginated
            ),
            '[]'::jsonb
        )
    INTO v_total_count, v_logs_json;

    -- 5. Return authoritative JSON response
    RETURN jsonb_build_object(
        'logs', v_logs_json,
        'total_count', COALESCE(v_total_count, 0)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. PERMISSION HARDENING & PRIVILEGES
-- ------------------------------------------------------------------------------
-- Sanitizer helper is strictly internal to SECURITY DEFINER RPCs
REVOKE ALL ON FUNCTION public.sanitize_audit_details(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sanitize_audit_details(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.sanitize_audit_details(jsonb) FROM authenticated;

-- Only admin_list_audit_logs is callable by authenticated admins
REVOKE ALL ON FUNCTION public.admin_list_audit_logs(INT, INT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_audit_logs(INT, INT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(INT, INT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- Ensure direct table access on admin_audit_logs remains revoked from client roles
REVOKE ALL ON public.admin_audit_logs FROM anon;
REVOKE ALL ON public.admin_audit_logs FROM authenticated;

COMMIT;
