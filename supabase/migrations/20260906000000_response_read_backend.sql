-- ==============================================================================
-- SOBAIKE JANAO ADMIN — RESPONSE READ BACKEND
-- ==============================================================================
-- Migration: 20260906000000_response_read_backend.sql
-- Description:
--   1. Authoritative read-only RPCs for administrative response review queue & detail.
--   2. Enforces active administrative session (public.is_active_admin()) AND
--      canonical response view permission (public.has_permission('responses.view')).
--   3. Provides public.admin_get_responses(...) for server-side paginated list & status counts.
--   4. Provides public.admin_get_response_detail(p_response_id text) for single response inspection.
--   5. Excludes private/sensitive citizen contact data (contact_info, contact_email_or_phone).
--   6. Hardens privileges: revokes from PUBLIC/anon, grants EXECUTE to authenticated,
--      keeps direct SELECT on public.complaint_responses revoked from client roles.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PREREQUISITE VALIDATION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.complaint_responses') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.complaint_responses table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF to_regclass('public.complaints') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.complaints table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF to_regclass('public.permissions') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite failed: public.permissions table does not exist.'
            USING ERRCODE = '42P01';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'is_active_admin'
          AND oidvectortypes(p.proargtypes) = ''
    ) THEN
        RAISE EXCEPTION 'Prerequisite failed: public.is_active_admin() function does not exist.'
            USING ERRCODE = '42883';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'has_permission'
          AND oidvectortypes(p.proargtypes) = 'text'
    ) THEN
        RAISE EXCEPTION 'Prerequisite failed: public.has_permission(text) function does not exist.'
            USING ERRCODE = '42883';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.permissions WHERE id = 'responses.view'
    ) THEN
        RAISE EXCEPTION 'Prerequisite failed: permission responses.view does not exist in public.permissions.'
            USING ERRCODE = 'P0002';
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. LIST RPC: public.admin_get_responses
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_responses(
    p_search text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_response_type text DEFAULT NULL,
    p_start_date date DEFAULT NULL,
    p_end_date date DEFAULT NULL,
    p_page integer DEFAULT 1,
    p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_search text;
    v_status text;
    v_response_type text;
    v_page int := COALESCE(p_page, 1);
    v_limit int := COALESCE(p_limit, 20);
    v_offset int;
    v_total_count bigint;
    v_total_pages int;
    v_responses_json jsonb;
    v_status_counts jsonb;
BEGIN
    -- 1. Authorization
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.view') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to view responses.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Parameter Validation
    IF v_page < 1 THEN
        RAISE EXCEPTION 'Page number must be greater than or equal to 1.'
            USING ERRCODE = '22000';
    END IF;

    IF v_limit < 1 OR v_limit > 100 THEN
        RAISE EXCEPTION 'Limit must be between 1 and 100.'
            USING ERRCODE = '22000';
    END IF;

    v_status := NULLIF(trim(p_status), '');
    IF v_status IS NOT NULL AND v_status <> 'all' THEN
        IF v_status NOT IN ('pending_review', 'published', 'rejected', 'unpublished') THEN
            RAISE EXCEPTION 'Invalid status filter. Allowed values: pending_review, published, rejected, unpublished.'
                USING ERRCODE = '22000';
        END IF;
    ELSE
        v_status := NULL;
    END IF;

    v_response_type := NULLIF(trim(p_response_type), '');
    IF v_response_type IS NOT NULL AND v_response_type <> 'all' THEN
        IF v_response_type NOT IN ('citizen_information', 'subject_response') THEN
            RAISE EXCEPTION 'Invalid response type filter. Allowed values: citizen_information, subject_response.'
                USING ERRCODE = '22000';
        END IF;
    ELSE
        v_response_type := NULL;
    END IF;

    v_search := NULLIF(trim(p_search), '');
    v_offset := (v_page - 1) * v_limit;

    -- 3. Calculate status counts from real database rows
    SELECT jsonb_build_object(
        'all', count(*)::int,
        'pending_review', count(*) FILTER (WHERE r.status = 'pending_review')::int,
        'published', count(*) FILTER (WHERE r.status = 'published')::int,
        'rejected', count(*) FILTER (WHERE r.status = 'rejected')::int,
        'unpublished', count(*) FILTER (WHERE r.status = 'unpublished')::int
    )
    INTO v_status_counts
    FROM public.complaint_responses r;

    -- 4. Filtered responses query
    WITH filtered_responses AS (
        SELECT
            r.id,
            r.complaint_id,
            r.response_type,
            r.status,
            r.content,
            r.incident_date,
            r.created_at,
            r.updated_at,
            r.published_at,
            r.contact_consent,
            r.responder_type,
            r.responder_name,
            r.designation,
            r.organization_name,
            r.official_statement,
            r.supporting_documents_note,
            r.request_correction_or_removal,
            r.correction_details,
            c.id AS comp_id,
            c.title AS comp_title,
            c.segment_id AS comp_segment_id,
            s.name_en AS comp_segment_name_en,
            s.name_bn AS comp_segment_name_bn,
            c.district AS comp_district,
            c.status AS comp_status
        FROM public.complaint_responses r
        JOIN public.complaints c ON c.id = r.complaint_id
        LEFT JOIN public.segments s ON s.id = c.segment_id
        WHERE
            (v_status IS NULL OR r.status = v_status)
            AND (v_response_type IS NULL OR r.response_type = v_response_type)
            AND (p_start_date IS NULL OR r.created_at >= p_start_date::timestamptz)
            AND (p_end_date IS NULL OR r.created_at < (p_end_date + 1)::timestamptz)
            AND (
                v_search IS NULL OR (
                    r.id::text ILIKE ('%' || v_search || '%')
                    OR r.complaint_id::text ILIKE ('%' || v_search || '%')
                    OR r.content ILIKE ('%' || v_search || '%')
                    OR (r.responder_name IS NOT NULL AND r.responder_name ILIKE ('%' || v_search || '%'))
                    OR (r.organization_name IS NOT NULL AND r.organization_name ILIKE ('%' || v_search || '%'))
                    OR (c.title IS NOT NULL AND c.title ILIKE ('%' || v_search || '%'))
                )
            )
    ),
    counted AS (
        SELECT count(*)::bigint AS total FROM filtered_responses
    ),
    paginated AS (
        SELECT *
        FROM filtered_responses
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
                        'complaint_id', complaint_id,
                        'response_type', response_type,
                        'status', status,
                        'content', content,
                        'incident_date', incident_date,
                        'created_at', created_at,
                        'updated_at', updated_at,
                        'published_at', published_at,
                        'contact_consent', COALESCE(contact_consent, false),
                        'responder_type', responder_type,
                        'responder_name', responder_name,
                        'designation', designation,
                        'organization_name', organization_name,
                        'official_statement', official_statement,
                        'supporting_documents_note', supporting_documents_note,
                        'request_correction_or_removal', COALESCE(request_correction_or_removal, false),
                        'correction_details', correction_details,
                        'complaint', jsonb_build_object(
                            'id', comp_id,
                            'title', comp_title,
                            'segment_id', comp_segment_id,
                            'segment_name_en', comp_segment_name_en,
                            'segment_name_bn', comp_segment_name_bn,
                            'district', comp_district,
                            'status', comp_status
                        )
                    )
                    ORDER BY created_at DESC, id DESC
                )
                FROM paginated
            ),
            '[]'::jsonb
        )
    INTO v_total_count, v_responses_json;

    v_total_count := COALESCE(v_total_count, 0);
    IF v_total_count = 0 THEN
        v_total_pages := 1;
    ELSE
        v_total_pages := CEIL(v_total_count::float / v_limit::float)::int;
    END IF;

    RETURN jsonb_build_object(
        'responses', v_responses_json,
        'total', v_total_count,
        'page', v_page,
        'limit', v_limit,
        'totalPages', v_total_pages,
        'statusCounts', v_status_counts
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. DETAIL RPC: public.admin_get_response_detail
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_response_detail(
    p_response_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_id text;
    v_response_json jsonb;
BEGIN
    -- 1. Authorization
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Access denied. Active administrative session required.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('responses.view') THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to view responses.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Input validation
    v_id := NULLIF(trim(p_response_id), '');
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'Response ID is required.'
            USING ERRCODE = '22000';
    END IF;

    -- 3. Query response with safe fields
    SELECT jsonb_build_object(
        'id', r.id,
        'complaint_id', r.complaint_id,
        'response_type', r.response_type,
        'status', r.status,
        'content', r.content,
        'incident_date', r.incident_date,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'published_at', r.published_at,
        'contact_consent', COALESCE(r.contact_consent, false),
        'responder_type', r.responder_type,
        'responder_name', r.responder_name,
        'designation', r.designation,
        'organization_name', r.organization_name,
        'official_statement', r.official_statement,
        'supporting_documents_note', r.supporting_documents_note,
        'request_correction_or_removal', COALESCE(r.request_correction_or_removal, false),
        'correction_details', r.correction_details,
        'complaint', jsonb_build_object(
            'id', c.id,
            'title', c.title,
            'segment_id', c.segment_id,
            'segment_name_en', s.name_en,
            'segment_name_bn', s.name_bn,
            'district', c.district,
            'status', c.status
        )
    )
    INTO v_response_json
    FROM public.complaint_responses r
    JOIN public.complaints c ON c.id = r.complaint_id
    LEFT JOIN public.segments s ON s.id = c.segment_id
    WHERE r.id::text = v_id;

    IF v_response_json IS NULL THEN
        RAISE EXCEPTION 'Response not found.'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_response_json;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. PERMISSION HARDENING & PRIVILEGES
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_get_responses(text, text, text, date, date, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_responses(text, text, text, date, date, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_responses(text, text, text, date, date, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_response_detail(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_response_detail(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_response_detail(text) TO authenticated;

-- Direct table access on complaint_responses remains blocked from client roles
REVOKE SELECT ON public.complaint_responses FROM anon;
REVOKE SELECT ON public.complaint_responses FROM authenticated;

-- ------------------------------------------------------------------------------
-- 5. PRE-COMMIT VERIFICATION ASSERTIONS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_list_oid OID;
    v_detail_oid OID;
    v_list_secdef BOOLEAN;
    v_detail_secdef BOOLEAN;
    v_list_config TEXT[];
    v_detail_config TEXT[];
BEGIN
    IF to_regclass('public.complaint_responses') IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: public.complaint_responses does not exist.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.view') THEN
        RAISE EXCEPTION 'Pre-commit check failed: responses.view permission does not exist.';
    END IF;

    -- Exact signature resolution for admin_get_responses
    SELECT p.oid, p.prosecdef, p.proconfig
    INTO v_list_oid, v_list_secdef, v_list_config
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_get_responses'
      AND oidvectortypes(p.proargtypes) = 'text, text, text, date, date, integer, integer';

    IF v_list_oid IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_get_responses RPC with exact signature (text, text, text, date, date, integer, integer) not found.';
    END IF;

    IF NOT v_list_secdef THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_get_responses must be SECURITY DEFINER.';
    END IF;

    IF NOT (
        v_list_config @> ARRAY['search_path=pg_catalog, public']
        OR v_list_config @> ARRAY['search_path=pg_catalog,public']
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_get_responses must have search_path = pg_catalog, public.';
    END IF;

    -- Exact signature resolution for admin_get_response_detail
    SELECT p.oid, p.prosecdef, p.proconfig
    INTO v_detail_oid, v_detail_secdef, v_detail_config
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_get_response_detail'
      AND oidvectortypes(p.proargtypes) = 'text';

    IF v_detail_oid IS NULL THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_get_response_detail RPC with exact signature (text) not found.';
    END IF;

    IF NOT v_detail_secdef THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_get_response_detail must be SECURITY DEFINER.';
    END IF;

    IF NOT (
        v_detail_config @> ARRAY['search_path=pg_catalog, public']
        OR v_detail_config @> ARRAY['search_path=pg_catalog,public']
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: admin_get_response_detail must have search_path = pg_catalog, public.';
    END IF;

    -- Verify PUBLIC execute is completely blocked via ACL examination (no public execute ACL)
    IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
        WHERE n.nspname = 'public'
          AND (
              (p.proname = 'admin_get_responses' AND oidvectortypes(p.proargtypes) = 'text, text, text, date, date, integer, integer')
              OR (p.proname = 'admin_get_response_detail' AND oidvectortypes(p.proargtypes) = 'text')
          )
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Pre-commit check failed: PUBLIC execute must be blocked.';
    END IF;

    IF has_function_privilege('anon', v_list_oid, 'EXECUTE') OR has_function_privilege('anon', v_detail_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'Pre-commit check failed: anon execute must be blocked.';
    END IF;

    IF NOT has_function_privilege('authenticated', v_list_oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_detail_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'Pre-commit check failed: authenticated execute must be granted.';
    END IF;

    IF has_table_privilege('authenticated', 'public.complaint_responses', 'SELECT') THEN
        RAISE EXCEPTION 'Pre-commit check failed: authenticated raw SELECT on complaint_responses must remain blocked.';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------------------------
-- 6. POST-COMMIT CATALOG-DERIVED VERIFICATION
-- ------------------------------------------------------------------------------
SELECT
    (SELECT to_regclass('public.complaint_responses') IS NOT NULL) AS response_table,
    (SELECT EXISTS (SELECT 1 FROM public.permissions WHERE id = 'responses.view')) AS response_view_permission,
    (SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_get_responses'
          AND oidvectortypes(p.proargtypes) = 'text, text, text, date, date, integer, integer'
    )) AS response_list_rpc,
    (SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_get_response_detail'
          AND oidvectortypes(p.proargtypes) = 'text'
    )) AS response_detail_rpc,
    (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_get_responses'
       AND oidvectortypes(p.proargtypes) = 'text, text, text, date, date, integer, integer'
    ) AS list_security_definer,
    (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_get_response_detail'
       AND oidvectortypes(p.proargtypes) = 'text'
    ) AS detail_security_definer,
    (SELECT p.proconfig @> ARRAY['search_path=pg_catalog, public'] OR p.proconfig @> ARRAY['search_path=pg_catalog,public']
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_get_responses'
       AND oidvectortypes(p.proargtypes) = 'text, text, text, date, date, integer, integer'
    ) AS list_safe_search_path,
    (SELECT p.proconfig @> ARRAY['search_path=pg_catalog, public'] OR p.proconfig @> ARRAY['search_path=pg_catalog,public']
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'admin_get_response_detail'
       AND oidvectortypes(p.proargtypes) = 'text'
    ) AS detail_safe_search_path,
    (
        SELECT NOT EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            WHERE n.nspname = 'public'
              AND (
                  (p.proname = 'admin_get_responses' AND oidvectortypes(p.proargtypes) = 'text, text, text, date, date, integer, integer')
                  OR (p.proname = 'admin_get_response_detail' AND oidvectortypes(p.proargtypes) = 'text')
              )
              AND acl.grantee = 0
              AND acl.privilege_type = 'EXECUTE'
        )
    ) AS public_execute_blocked,
    (SELECT NOT has_function_privilege('anon', 'public.admin_get_responses(text, text, text, date, date, integer, integer)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.admin_get_response_detail(text)', 'EXECUTE')) AS anon_execute_blocked,
    (SELECT has_function_privilege('authenticated', 'public.admin_get_responses(text, text, text, date, date, integer, integer)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.admin_get_response_detail(text)', 'EXECUTE')) AS authenticated_execute_allowed,
    (SELECT NOT has_table_privilege('authenticated', 'public.complaint_responses', 'SELECT')) AS authenticated_raw_select_blocked;
