-- TEST-ONLY EVIDENCE-DERIVED CURRENT-STATE BASELINE.
-- Not historical migration source. Never link or deploy this file to a hosted project.
-- Source: read-only production catalog metadata captured 2026-10-16; no application rows copied.
-- Function source hashes and migration gaps are recorded in the companion recovery evidence addendum.
BEGIN;
SET LOCAL search_path = public, private, extensions, pg_catalog;
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS vault;

-- Install only the extensions observed as installed in the current catalog.
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";

-- Recreate only the four application-owned sequences; sequence counters are not copied.
CREATE SEQUENCE IF NOT EXISTS "private"."public_api_rate_events_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS "public"."public_response_rate_events_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS "public"."public_write_rate_events_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS "public"."system_health_snapshots_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

-- Create all captured application tables before constraints, routines, or policies.
CREATE TABLE "private"."public_api_rate_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "action" text NOT NULL,
  "ip_fingerprint" bytea NOT NULL,
  "subject_fingerprint" bytea,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "private"."public_engagement_dedupe" (
  "action" text NOT NULL,
  "report_id" text NOT NULL,
  "actor_fingerprint" bytea NOT NULL,
  "bucket_start" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "private"."security_runtime_secrets" (
  "key" text NOT NULL,
  "secret" bytea NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."additional_info_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "complaint_id" text NOT NULL,
  "message" text,
  "evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."admin_audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."admin_notification_event_catalogue" (
  "event_key" text NOT NULL,
  "category" text NOT NULL,
  "default_layer" text NOT NULL,
  "default_severity" text NOT NULL,
  "description" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."admin_notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_group_id" uuid NOT NULL,
  "dedupe_key" text,
  "recipient_user_id" uuid NOT NULL,
  "event_key" text NOT NULL,
  "category" text NOT NULL,
  "layer" text NOT NULL,
  "severity" text NOT NULL,
  "audience_mode" text DEFAULT 'permission'::text NOT NULL,
  "actor_user_id" uuid,
  "actor_display_name" text,
  "target_type" text,
  "target_id" text,
  "target_label" text,
  "title_en" text NOT NULL,
  "title_bn" text NOT NULL,
  "body_en" text,
  "body_bn" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "required_all_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
  "required_any_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
  "route" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "read_at" timestamp with time zone
);
CREATE TABLE "public"."admin_users" (
  "user_id" uuid NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "display_name" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_super_admin" boolean DEFAULT false NOT NULL
);
CREATE TABLE "public"."bangladesh_districts" (
  "id" text NOT NULL,
  "division_id" text NOT NULL,
  "name_en" text NOT NULL,
  "name_bn" text NOT NULL,
  "aliases" text[] DEFAULT '{}'::text[] NOT NULL,
  "adm2_pcode" text
);
CREATE TABLE "public"."bangladesh_divisions" (
  "id" text NOT NULL,
  "name_en" text NOT NULL,
  "name_bn" text NOT NULL,
  "aliases" text[] DEFAULT '{}'::text[] NOT NULL
);
CREATE TABLE "public"."bangladesh_upazilas" (
  "id" text NOT NULL,
  "district_id" text NOT NULL,
  "name_en" text NOT NULL,
  "name_bn" text NOT NULL,
  "aliases" text[] DEFAULT '{}'::text[] NOT NULL
);
CREATE TABLE "public"."complaint_evidence" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "complaint_id" text NOT NULL,
  "storage_path" text,
  "file_url" text,
  "file_name" text,
  "mime_type" text,
  "media_type" text,
  "file_size_bytes" bigint,
  "caption" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."complaint_parties" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "complaint_id" text NOT NULL,
  "name" text,
  "party_type" text DEFAULT 'unknown'::text NOT NULL,
  "role_or_designation" text,
  "organization" text,
  "phone_or_contact" text,
  "public_profile_handle" text,
  "address" text,
  "identifying_description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."complaint_responses" (
  "id" text NOT NULL,
  "complaint_id" text NOT NULL,
  "response_type" text NOT NULL,
  "status" text DEFAULT 'pending_review'::text NOT NULL,
  "content" text NOT NULL,
  "incident_date" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone,
  "contact_consent" boolean DEFAULT false NOT NULL,
  "contact_info" text,
  "responder_type" text,
  "responder_name" text,
  "designation" text,
  "organization_name" text,
  "contact_email_or_phone" text,
  "official_statement" text,
  "supporting_documents_note" text,
  "request_correction_or_removal" boolean DEFAULT false NOT NULL,
  "correction_details" text,
  "rejection_reason" text,
  "rejection_note" text,
  "unpublish_reason" text
);
CREATE TABLE "public"."complaint_sources" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "complaint_id" text NOT NULL,
  "source_type" text DEFAULT 'news'::text NOT NULL,
  "publisher_name" text NOT NULL,
  "source_title" text,
  "canonical_url" text NOT NULL,
  "source_published_date" date,
  "verification_status" text DEFAULT 'unverified'::text NOT NULL,
  "is_final_detail_page" boolean DEFAULT false NOT NULL,
  "source_version" integer DEFAULT 1 NOT NULL,
  "verification_note" text,
  "verified_at" timestamp with time zone,
  "verified_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."complaint_submission_contexts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "complaint_id" text NOT NULL,
  "client_submission_id" text NOT NULL,
  "visitor_id" text NOT NULL,
  "session_id" text NOT NULL,
  "reporter_latitude" double precision,
  "reporter_longitude" double precision,
  "accuracy_meters" double precision,
  "captured_at" timestamp with time zone NOT NULL,
  "browser_name" text,
  "browser_version" text,
  "os_name" text,
  "device_category" text,
  "platform" text,
  "language" text,
  "timezone" text,
  "screen_width" integer,
  "screen_height" integer,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ui_language" text
);
CREATE TABLE "public"."complaint_updates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "complaint_id" text NOT NULL,
  "update_type" text,
  "note" text NOT NULL,
  "is_public" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."complaints" (
  "id" text NOT NULL,
  "segment_id" text NOT NULL,
  "subcategory_id" text NOT NULL,
  "title" text NOT NULL,
  "title_en" text,
  "description" text NOT NULL,
  "description_en" text,
  "incident_date" date,
  "incident_time" time without time zone,
  "frequency" text DEFAULT 'one-time'::text NOT NULL,
  "status" text DEFAULT 'submitted'::text NOT NULL,
  "priority" text DEFAULT 'medium'::text NOT NULL,
  "privacy_choice" text NOT NULL,
  "reporter_name" text,
  "reporter_contact" text,
  "confirm_public_identity" boolean DEFAULT false NOT NULL,
  "intimate_what_happened" jsonb,
  "intimate_platform" jsonb,
  "division" text,
  "district" text,
  "upazila_or_thana" text,
  "area" text,
  "road" text,
  "landmark" text,
  "formatted_address" text,
  "latitude" double precision,
  "longitude" double precision,
  "evidence_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_description" text,
  "publication_preferences" jsonb DEFAULT '{"showDescription": true, "showSubjectName": true, "showOrganization": true, "showGeneralLocation": true}'::jsonb NOT NULL,
  "pin_hash" text,
  "rejection_reason_code" text,
  "rejection_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "relationship_context" text,
  "has_supporting_info" boolean DEFAULT false NOT NULL,
  "place_id" text,
  "client_submission_id" text,
  "recent_bill_month" text,
  "recent_bill_amount" numeric,
  "previous_bill_month" text,
  "previous_bill_amount" numeric,
  "utility_end_time" time without time zone,
  "affected_person_age_group" text,
  "alleged_abuser_relationship" text,
  "reporting_for" text,
  "bribery_department" text,
  "bribery_service" text,
  "bribery_amount" numeric,
  "mob_justice_details" jsonb,
  "public_view_count" bigint DEFAULT 0 NOT NULL,
  "public_share_count" bigint DEFAULT 0 NOT NULL,
  "taxonomy_snapshot" jsonb,
  "form_schema_version" integer,
  "custom_field_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "origin_type" text DEFAULT 'citizen'::text NOT NULL,
  "sexual_harassment_type" text,
  "sexual_harassment_context" text,
  "sexual_harassment_institution" text,
  "published_at" timestamp with time zone
);
CREATE TABLE "public"."news_intake_automation_settings" (
  "singleton" boolean DEFAULT true NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "interval_hours" integer DEFAULT 36 NOT NULL,
  "last_auto_dispatched_at" timestamp with time zone,
  "next_auto_due_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."news_intake_run_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "source_hostname" text NOT NULL,
  "publisher_name" text NOT NULL,
  "canonical_url" text NOT NULL,
  "source_title" text,
  "source_published_date" date,
  "content_language" text DEFAULT 'unknown'::text NOT NULL,
  "segment_id" text,
  "subcategory_id" text,
  "confidence" numeric(5,4),
  "duplicate_status" text,
  "action" text NOT NULL,
  "report_id" text,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "item_kind" text DEFAULT 'article'::text NOT NULL,
  "review_payload" jsonb
);
CREATE TABLE "public"."news_intake_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "status" text DEFAULT 'running'::text NOT NULL,
  "started_by" uuid,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "source_count" integer DEFAULT 0 NOT NULL,
  "discovered_count" integer DEFAULT 0 NOT NULL,
  "classified_count" integer DEFAULT 0 NOT NULL,
  "duplicate_count" integer DEFAULT 0 NOT NULL,
  "created_count" integer DEFAULT 0 NOT NULL,
  "merged_count" integer DEFAULT 0 NOT NULL,
  "review_count" integer DEFAULT 0 NOT NULL,
  "skipped_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "error_summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "trigger_type" text DEFAULT 'manual'::text NOT NULL
);
CREATE TABLE "public"."news_source_domains" (
  "hostname" text NOT NULL,
  "publisher_name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "homepage_url" text,
  "language_hint" text DEFAULT 'auto'::text NOT NULL,
  "scan_enabled" boolean DEFAULT false NOT NULL,
  "scan_priority" smallint DEFAULT 50 NOT NULL,
  "last_scanned_at" timestamp with time zone,
  "automation_note" text
);
CREATE TABLE "public"."permissions" (
  "id" text NOT NULL,
  "module" text NOT NULL,
  "action" text NOT NULL,
  "name_en" text NOT NULL,
  "name_bn" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."public_category_popularity_snapshot" (
  "segment_id" text NOT NULL,
  "published_post_count" bigint DEFAULT 0 NOT NULL,
  "view_count" bigint DEFAULT 0 NOT NULL,
  "share_count" bigint DEFAULT 0 NOT NULL,
  "popularity_score" numeric DEFAULT 0 NOT NULL,
  "popularity_rank" bigint NOT NULL,
  "snapshot_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."public_engagement_events" (
  "report_id" text NOT NULL,
  "visitor_id" text NOT NULL,
  "session_id" text NOT NULL,
  "event_type" text NOT NULL,
  "event_day" date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."public_response_rate_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "report_id" text NOT NULL,
  "visitor_id" text NOT NULL,
  "session_id" text NOT NULL,
  "response_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."public_visit_sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "visitor_id" text NOT NULL,
  "session_id" text NOT NULL,
  "permission_status" text DEFAULT 'prompt'::text NOT NULL,
  "latitude" numeric(9,6),
  "longitude" numeric(9,6),
  "accuracy_meters" numeric(10,2),
  "browser_name" text,
  "browser_version" text,
  "os_name" text,
  "device_category" text,
  "platform" text,
  "language" text,
  "timezone" text,
  "screen_width" integer,
  "screen_height" integer,
  "user_agent" text,
  "consented_at" timestamp with time zone,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "location_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ui_language" text
);
CREATE TABLE "public"."public_write_rate_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "source_fingerprint" text NOT NULL,
  "action" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."report_duplicate_overrides" (
  "report_a_id" text NOT NULL,
  "report_b_id" text NOT NULL,
  "report_a_signature" text NOT NULL,
  "report_b_signature" text NOT NULL,
  "review_note" text NOT NULL,
  "reviewed_by" uuid NOT NULL,
  "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."reporting_form_schema_fields" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "schema_id" uuid NOT NULL,
  "field_key" text NOT NULL,
  "field_type" text NOT NULL,
  "storage_mode" text NOT NULL,
  "storage_key" text NOT NULL,
  "label_en" text NOT NULL,
  "label_bn" text NOT NULL,
  "helper_en" text,
  "helper_bn" text,
  "placeholder_en" text,
  "placeholder_bn" text,
  "required" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."reporting_form_schemas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "scope_type" text NOT NULL,
  "scope_id" text NOT NULL,
  "version" integer NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "engine_mode" text DEFAULT 'legacy'::text NOT NULL,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_by" uuid,
  "published_at" timestamp with time zone
);
CREATE TABLE "public"."role_permissions" (
  "role_id" text NOT NULL,
  "permission_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."roles" (
  "id" text NOT NULL,
  "name_en" text NOT NULL,
  "name_bn" text,
  "description" text,
  "active" boolean DEFAULT true NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."segments" (
  "id" text NOT NULL,
  "name_bn" text NOT NULL,
  "name_en" text NOT NULL,
  "active" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "slug" text,
  "short_name_en" text,
  "short_name_bn" text,
  "description_en" text,
  "description_bn" text,
  "icon_key" text,
  "theme_key" text,
  "config_status" text DEFAULT 'draft'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."site_banners" (
  "category_key" text NOT NULL,
  "draft_content" jsonb NOT NULL,
  "published_content" jsonb NOT NULL,
  "draft_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "draft_updated_by" uuid,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_by" uuid,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."subcategories" (
  "id" text NOT NULL,
  "segment_id" text NOT NULL,
  "name_bn" text NOT NULL,
  "name_en" text NOT NULL,
  "active" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "description_en" text,
  "description_bn" text,
  "category_group" text,
  "is_sensitive" boolean DEFAULT false NOT NULL,
  "config_status" text DEFAULT 'draft'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "slug" text
);
CREATE TABLE "public"."subject_responses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "complaint_id" text NOT NULL,
  "subject_name" text NOT NULL,
  "subject_role" text,
  "organization" text,
  "contact_info" text,
  "statement" text NOT NULL,
  "evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'submitted'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."system_health_incidents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "recovered_at" timestamp with time zone,
  "initial_status" text NOT NULL,
  "current_status" text NOT NULL,
  "last_snapshot_id" bigint,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE "public"."system_health_snapshots" (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "overall_status" text NOT NULL,
  "public_site" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "admin_site" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prometheus" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "infrastructure" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "collector_version" text DEFAULT '1'::text NOT NULL
);
CREATE TABLE "public"."user_roles" (
  "user_id" uuid NOT NULL,
  "role_id" text NOT NULL,
  "assigned_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Attach captured sequence ownership to its source column.
ALTER SEQUENCE "private"."public_api_rate_events_id_seq" OWNED BY "private"."public_api_rate_events"."id";
REVOKE ALL PRIVILEGES ON SEQUENCE "private"."public_api_rate_events_id_seq" FROM PUBLIC, anon, authenticated, service_role;
ALTER SEQUENCE "public"."public_response_rate_events_id_seq" OWNED BY "public"."public_response_rate_events"."id";
REVOKE ALL PRIVILEGES ON SEQUENCE "public"."public_response_rate_events_id_seq" FROM PUBLIC, anon, authenticated, service_role;
ALTER SEQUENCE "public"."public_write_rate_events_id_seq" OWNED BY "public"."public_write_rate_events"."id";
REVOKE ALL PRIVILEGES ON SEQUENCE "public"."public_write_rate_events_id_seq" FROM PUBLIC, anon, authenticated, service_role;
ALTER SEQUENCE "public"."system_health_snapshots_id_seq" OWNED BY "public"."system_health_snapshots"."id";
REVOKE ALL PRIVILEGES ON SEQUENCE "public"."system_health_snapshots_id_seq" FROM PUBLIC, anon, authenticated, service_role;

-- Apply captured application schema ACLs before creating policies and routines.
REVOKE ALL PRIVILEGES ON SCHEMA "public" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON SCHEMA "private" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON SCHEMA "extensions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON SCHEMA "storage" FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA "extensions" TO "anon";
GRANT USAGE ON SCHEMA "extensions" TO "authenticated";
GRANT CREATE ON SCHEMA "extensions" TO "dashboard_user";
GRANT USAGE ON SCHEMA "extensions" TO "dashboard_user";
GRANT USAGE ON SCHEMA "extensions" TO "service_role";
GRANT USAGE ON SCHEMA "private" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT CREATE ON SCHEMA "public" TO "pg_database_owner";
GRANT USAGE ON SCHEMA "public" TO "pg_database_owner";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "storage" TO "anon";
GRANT USAGE ON SCHEMA "storage" TO "authenticated";
GRANT CREATE ON SCHEMA "storage" TO "dashboard_user";
GRANT USAGE ON SCHEMA "storage" TO "dashboard_user";
GRANT USAGE ON SCHEMA "storage" TO "service_role";
GRANT CREATE ON SCHEMA "storage" TO "supabase_admin";
GRANT USAGE ON SCHEMA "storage" TO "supabase_admin";
GRANT CREATE ON SCHEMA "storage" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT USAGE ON SCHEMA "storage" TO "supabase_storage_admin" WITH GRANT OPTION;

-- Add primary/unique/foreign-key constraints before routines and check constraints.
ALTER TABLE "private"."public_api_rate_events" ADD CONSTRAINT "public_api_rate_events_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."public_engagement_dedupe" ADD CONSTRAINT "public_engagement_dedupe_pkey" PRIMARY KEY (action, report_id, actor_fingerprint, bucket_start);
ALTER TABLE "private"."security_runtime_secrets" ADD CONSTRAINT "security_runtime_secrets_pkey" PRIMARY KEY (key);
ALTER TABLE "public"."additional_info_submissions" ADD CONSTRAINT "additional_info_submissions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."admin_notification_event_catalogue" ADD CONSTRAINT "admin_notification_event_catalogue_pkey" PRIMARY KEY (event_key);
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."admin_users" ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY (user_id);
ALTER TABLE "public"."bangladesh_districts" ADD CONSTRAINT "bangladesh_districts_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."bangladesh_divisions" ADD CONSTRAINT "bangladesh_divisions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."bangladesh_upazilas" ADD CONSTRAINT "bangladesh_upazilas_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."complaint_evidence" ADD CONSTRAINT "complaint_evidence_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."complaint_parties" ADD CONSTRAINT "complaint_parties_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."complaint_sources" ADD CONSTRAINT "complaint_sources_complaint_id_canonical_url_key" UNIQUE (complaint_id, canonical_url);
ALTER TABLE "public"."complaint_sources" ADD CONSTRAINT "complaint_sources_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."complaint_submission_contexts" ADD CONSTRAINT "complaint_submission_contexts_client_sub_id_key" UNIQUE (client_submission_id);
ALTER TABLE "public"."complaint_submission_contexts" ADD CONSTRAINT "complaint_submission_contexts_complaint_id_key" UNIQUE (complaint_id);
ALTER TABLE "public"."complaint_submission_contexts" ADD CONSTRAINT "complaint_submission_contexts_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."complaint_updates" ADD CONSTRAINT "complaint_updates_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."news_intake_automation_settings" ADD CONSTRAINT "news_intake_automation_settings_pkey" PRIMARY KEY (singleton);
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_run_id_canonical_url_key" UNIQUE (run_id, canonical_url);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."news_source_domains" ADD CONSTRAINT "news_source_domains_pkey" PRIMARY KEY (hostname);
ALTER TABLE "public"."permissions" ADD CONSTRAINT "permissions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."public_category_popularity_snapshot" ADD CONSTRAINT "public_category_popularity_snapshot_pkey" PRIMARY KEY (segment_id);
ALTER TABLE "public"."public_engagement_events" ADD CONSTRAINT "public_engagement_events_pkey" PRIMARY KEY (report_id, visitor_id, event_type, event_day);
ALTER TABLE "public"."public_response_rate_events" ADD CONSTRAINT "public_response_rate_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_session_id_key" UNIQUE (session_id);
ALTER TABLE "public"."public_write_rate_events" ADD CONSTRAINT "public_write_rate_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."report_duplicate_overrides" ADD CONSTRAINT "report_duplicate_overrides_pkey" PRIMARY KEY (report_a_id, report_b_id);
ALTER TABLE "public"."reporting_form_schema_fields" ADD CONSTRAINT "reporting_form_schema_fields_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."reporting_form_schema_fields" ADD CONSTRAINT "reporting_form_schema_fields_schema_key_unique" UNIQUE (schema_id, field_key);
ALTER TABLE "public"."reporting_form_schemas" ADD CONSTRAINT "reporting_form_schemas_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."reporting_form_schemas" ADD CONSTRAINT "reporting_form_schemas_scope_version_unique" UNIQUE (scope_type, scope_id, version);
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY (role_id, permission_id);
ALTER TABLE "public"."roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."segments" ADD CONSTRAINT "segments_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."site_banners" ADD CONSTRAINT "site_banners_pkey" PRIMARY KEY (category_key);
ALTER TABLE "public"."subcategories" ADD CONSTRAINT "subcategories_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."subject_responses" ADD CONSTRAINT "subject_responses_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."system_health_incidents" ADD CONSTRAINT "system_health_incidents_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."system_health_snapshots" ADD CONSTRAINT "system_health_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (user_id);
ALTER TABLE "public"."additional_info_submissions" ADD CONSTRAINT "additional_info_submissions_complaint_id_fkey" FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES admin_users(user_id) ON DELETE SET NULL;
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_event_key_fkey" FOREIGN KEY (event_key) REFERENCES admin_notification_event_catalogue(event_key) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES admin_users(user_id) ON DELETE CASCADE;
ALTER TABLE "public"."admin_users" ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."bangladesh_districts" ADD CONSTRAINT "bangladesh_districts_division_id_fkey" FOREIGN KEY (division_id) REFERENCES bangladesh_divisions(id) ON UPDATE CASCADE;
ALTER TABLE "public"."bangladesh_upazilas" ADD CONSTRAINT "bangladesh_upazilas_district_id_fkey" FOREIGN KEY (district_id) REFERENCES bangladesh_districts(id) ON UPDATE CASCADE;
ALTER TABLE "public"."complaint_evidence" ADD CONSTRAINT "complaint_evidence_complaint_id_fkey" FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."complaint_parties" ADD CONSTRAINT "complaint_parties_complaint_id_fkey" FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_complaint_id_fkey" FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."complaint_sources" ADD CONSTRAINT "complaint_sources_complaint_id_fkey" FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."complaint_sources" ADD CONSTRAINT "complaint_sources_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES admin_users(user_id) ON DELETE SET NULL;
ALTER TABLE "public"."complaint_submission_contexts" ADD CONSTRAINT "complaint_submission_contexts_complaint_id_fkey" FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."complaint_updates" ADD CONSTRAINT "complaint_updates_complaint_id_fkey" FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_segment_id_fkey" FOREIGN KEY (segment_id) REFERENCES segments(id);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_subcategory_id_fkey" FOREIGN KEY (subcategory_id) REFERENCES subcategories(id);
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_report_id_fkey" FOREIGN KEY (report_id) REFERENCES complaints(id) ON DELETE SET NULL;
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_run_id_fkey" FOREIGN KEY (run_id) REFERENCES news_intake_runs(id) ON DELETE CASCADE;
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_segment_id_fkey" FOREIGN KEY (segment_id) REFERENCES segments(id);
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_subcategory_id_fkey" FOREIGN KEY (subcategory_id) REFERENCES subcategories(id);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_started_by_fkey" FOREIGN KEY (started_by) REFERENCES admin_users(user_id);
ALTER TABLE "public"."news_source_domains" ADD CONSTRAINT "news_source_domains_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(user_id) ON DELETE SET NULL;
ALTER TABLE "public"."public_category_popularity_snapshot" ADD CONSTRAINT "public_category_popularity_snapshot_segment_id_fkey" FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE;
ALTER TABLE "public"."public_engagement_events" ADD CONSTRAINT "public_engagement_events_report_id_fkey" FOREIGN KEY (report_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."public_response_rate_events" ADD CONSTRAINT "public_response_rate_events_report_id_fkey" FOREIGN KEY (report_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."report_duplicate_overrides" ADD CONSTRAINT "report_duplicate_overrides_report_a_id_fkey" FOREIGN KEY (report_a_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."report_duplicate_overrides" ADD CONSTRAINT "report_duplicate_overrides_report_b_id_fkey" FOREIGN KEY (report_b_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."reporting_form_schema_fields" ADD CONSTRAINT "reporting_form_schema_fields_schema_id_fkey" FOREIGN KEY (schema_id) REFERENCES reporting_form_schemas(id) ON DELETE CASCADE;
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE "public"."site_banners" ADD CONSTRAINT "site_banners_category_key_fkey" FOREIGN KEY (category_key) REFERENCES segments(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "public"."subcategories" ADD CONSTRAINT "subcategories_segment_id_fkey" FOREIGN KEY (segment_id) REFERENCES segments(id);
ALTER TABLE "public"."subject_responses" ADD CONSTRAINT "subject_responses_complaint_id_fkey" FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE;
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES admin_users(user_id) ON DELETE SET NULL;
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT;
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES admin_users(user_id) ON DELETE CASCADE;

-- Install current SQL function definitions verbatim from the read-only catalog.
CREATE OR REPLACE FUNCTION private.apply_ui_language_from_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_ui_language text := lower(nullif(btrim(current_setting('app.ui_language', true)), ''));
begin
  if v_ui_language in ('bn','en') then
    new.ui_language := v_ui_language;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.can_upload_public_complaint_evidence(p_storage_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_client_submission_id text;
  v_file_name text;
  v_prefix text;
  v_existing_count integer;
begin
  p_storage_path := trim(coalesce(p_storage_path, ''));

  if p_storage_path = '' or length(p_storage_path) > 512 then
    return false;
  end if;

  if split_part(p_storage_path, '/', 1) <> 'public-submissions' then
    return false;
  end if;

  v_client_submission_id := split_part(p_storage_path, '/', 2);
  v_file_name := split_part(p_storage_path, '/', 3);

  if v_client_submission_id = ''
     or length(v_client_submission_id) < 8
     or length(v_client_submission_id) > 128
     or v_file_name = ''
     or length(v_file_name) > 180
     or split_part(p_storage_path, '/', 4) <> '' then
    return false;
  end if;

  if v_file_name !~ '^[a-z0-9_-]+\.webp$' then
    return false;
  end if;

  if not exists (
    select 1
    from public.complaints c
    where c.client_submission_id = v_client_submission_id
      and c.status = 'submitted'
  ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'public-evidence-upload:' || v_client_submission_id,
      0
    )
  );

  v_prefix := 'public-submissions/' || v_client_submission_id || '/';

  select count(*)
  into v_existing_count
  from storage.objects o
  where o.bucket_id = 'complaint-evidence'
    and o.name like v_prefix || '%';

  return v_existing_count < 6;
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_notification_get_effective_permissions(p_user_id uuid)
 RETURNS SETOF text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_is_active BOOLEAN;
    v_is_super_admin BOOLEAN;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(au.active, false), COALESCE(au.is_super_admin, false)
    INTO v_is_active, v_is_super_admin
    FROM public.admin_users au
    WHERE au.user_id = p_user_id;

    IF v_is_active IS NOT TRUE THEN
        RETURN;
    END IF;

    IF v_is_super_admin IS TRUE THEN
        RETURN QUERY SELECT p.id FROM public.permissions p;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT DISTINCT rp.permission_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id AND r.active = true
    JOIN public.role_permissions rp ON rp.role_id = r.id
    WHERE ur.user_id = p_user_id;
END;
$function$;
CREATE OR REPLACE FUNCTION private.emit_system_health_notification(p_event_key text, p_title_en text, p_title_bn text, p_body_en text, p_body_bn text, p_incident_id uuid, p_from_status text, p_to_status text, p_snapshot_id bigint, p_dedupe_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_cat record;
  v_group uuid:=gen_random_uuid();
  v_count integer:=0;
begin
  select event_key,category,default_layer,default_severity,active
  into v_cat
  from public.admin_notification_event_catalogue
  where event_key=p_event_key;

  if v_cat.event_key is null or v_cat.active is not true then
    raise exception 'Unknown or inactive system-health notification event: %',p_event_key;
  end if;

  insert into public.admin_notifications(
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
  select
    v_group,
    p_dedupe_key,
    au.user_id,
    p_event_key,
    v_cat.category,
    v_cat.default_layer,
    v_cat.default_severity,
    'permission',
    null,
    null,
    null,
    p_incident_id::text,
    'Production system',
    p_title_en,
    p_title_bn,
    p_body_en,
    p_body_bn,
    jsonb_build_object(
      'incident_id',p_incident_id,
      'from_status',p_from_status,
      'to_status',p_to_status,
      'snapshot_id',p_snapshot_id
    ),
    array['system_health.view']::text[],
    '{}'::text[],
    '/system-health'
  from public.admin_users au
  where au.active=true
    and (
      au.is_super_admin=true
      or exists(
        select 1
        from public.admin_notification_get_effective_permissions(au.user_id) p
        where p='system_health.view'
      )
    )
  on conflict do nothing;

  get diagnostics v_count=row_count;
  return v_count;
end;
$function$;
CREATE OR REPLACE FUNCTION private.public_abuse_hmac(p_material text)
 RETURNS bytea
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'extensions'
AS $function$
declare
  v_secret bytea;
begin
  select s.secret into v_secret
  from private.security_runtime_secrets s
  where s.key = 'public_abuse_hmac';

  if v_secret is null then
    raise exception 'SECURITY_CONFIGURATION_ERROR';
  end if;

  return extensions.hmac(
    pg_catalog.convert_to(coalesce(p_material, ''), 'UTF8'),
    v_secret,
    'sha256'
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.public_request_ip_fingerprint()
 RETURNS bytea
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_headers jsonb := '{}'::jsonb;
  v_raw text;
  v_ip text;
begin
  begin
    v_raw := current_setting('request.headers', true);
    if v_raw is not null and btrim(v_raw) <> '' then
      v_headers := v_raw::jsonb;
    end if;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := nullif(
    btrim(
      split_part(
        coalesce(
          v_headers->>'x-forwarded-for',
          v_headers->>'cf-connecting-ip',
          v_headers->>'x-real-ip',
          ''
        ),
        ',',
        1
      )
    ),
    ''
  );

  return private.public_abuse_hmac('ip:' || coalesce(v_ip, 'unavailable'));
end;
$function$;
CREATE OR REPLACE FUNCTION private.public_subject_fingerprint(p_subject text)
 RETURNS bytea
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  select case
    when nullif(btrim(coalesce(p_subject, '')), '') is null then null
    else private.public_abuse_hmac('subject:' || btrim(p_subject))
  end;
$function$;
CREATE OR REPLACE FUNCTION private.enforce_public_rate_limit(p_action text, p_subject text, p_ip_limit integer, p_subject_limit integer, p_window interval)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_action text := left(btrim(coalesce(p_action, '')), 120);
  v_ip bytea;
  v_subject bytea;
  v_count integer;
  v_retry_seconds integer;
begin
  if v_action = '' or p_ip_limit is null or p_ip_limit < 1 or p_window is null or p_window <= interval '0 seconds' then
    raise exception 'SECURITY_CONFIGURATION_ERROR: invalid public rate limit configuration.';
  end if;

  v_ip := private.public_request_ip_fingerprint();
  v_subject := private.public_subject_fingerprint(p_subject);
  v_retry_seconds := greatest(1, ceil(extract(epoch from p_window))::integer);

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_action || ':ip:' || encode(v_ip, 'hex'), 0)
  );

  select count(*)::integer into v_count
  from private.public_api_rate_events e
  where e.action = v_action
    and e.ip_fingerprint = v_ip
    and e.created_at >= now() - p_window;

  if v_count >= p_ip_limit then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object(
        'code', 'RATE_LIMITED',
        'message', 'Too many requests. Please try again later.',
        'details', null,
        'hint', 'Wait before retrying this action.'
      )::text,
      detail = jsonb_build_object(
        'status', 429,
        'headers', jsonb_build_object('Retry-After', v_retry_seconds::text)
      )::text;
  end if;

  if v_subject is not null and p_subject_limit is not null and p_subject_limit > 0 then
    perform pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_action || ':subject:' || encode(v_subject, 'hex'), 0)
    );

    select count(*)::integer into v_count
    from private.public_api_rate_events e
    where e.action = v_action
      and e.subject_fingerprint = v_subject
      and e.created_at >= now() - p_window;

    if v_count >= p_subject_limit then
      raise sqlstate 'PGRST' using
        message = jsonb_build_object(
          'code', 'RATE_LIMITED',
          'message', 'Too many requests. Please try again later.',
          'details', null,
          'hint', 'Wait before retrying this action.'
        )::text,
        detail = jsonb_build_object(
          'status', 429,
          'headers', jsonb_build_object('Retry-After', v_retry_seconds::text)
        )::text;
    end if;
  end if;

  insert into private.public_api_rate_events(
    action, ip_fingerprint, subject_fingerprint, created_at
  ) values (
    v_action, v_ip, v_subject, now()
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.ensure_subcategory_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_slug text;
begin
  if new.slug is null or pg_catalog.btrim(new.slug) = '' then
    v_slug := pg_catalog.lower(pg_catalog.replace(new.id, '_', '-'));
  else
    v_slug := pg_catalog.lower(pg_catalog.btrim(new.slug));
  end if;

  v_slug := pg_catalog.regexp_replace(v_slug, '[^a-z0-9-]+', '-', 'g');
  v_slug := pg_catalog.regexp_replace(v_slug, '-+', '-', 'g');
  v_slug := pg_catalog.btrim(v_slug, '-');

  if v_slug = '' then
    raise exception 'SUBCATEGORY_SLUG_REQUIRED'
      using errcode = '23514';
  end if;

  new.slug := v_slug;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.handle_system_health_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_incident public.system_health_incidents%rowtype;
  v_previous_status text;
  v_action text;
  v_note text;
  v_notification_count integer:=0;
begin
  select overall_status
  into v_previous_status
  from public.system_health_snapshots
  where id<>new.id
  order by observed_at desc,id desc
  limit 1;

  select *
  into v_incident
  from public.system_health_incidents
  where recovered_at is null
  order by opened_at desc
  limit 1
  for update;

  if new.overall_status in('degraded','critical') then
    if v_incident.id is null then
      insert into public.system_health_incidents(
        initial_status,current_status,last_snapshot_id,details
      )
      values(
        new.overall_status,new.overall_status,new.id,
        jsonb_build_object(
          'opened_from',coalesce(v_previous_status,'healthy'),
          'opening_snapshot_at',new.observed_at
        )
      )
      returning * into v_incident;

      v_action:=case when new.overall_status='critical'
        then 'SYSTEM_HEALTH_CRITICAL'
        else 'SYSTEM_HEALTH_DEGRADED' end;
      v_note:=case when new.overall_status='critical'
        then 'Production monitoring opened a critical incident.'
        else 'Production monitoring opened a degraded incident.' end;

      v_notification_count:=private.emit_system_health_notification(
        case when new.overall_status='critical'
          then 'system.health_critical'
          else 'system.health_degraded' end,
        case when new.overall_status='critical'
          then 'System health is critical'
          else 'System health is degraded' end,
        case when new.overall_status='critical'
          then 'সিস্টেম স্বাস্থ্য গুরুতর অবস্থায়'
          else 'সিস্টেম স্বাস্থ্য সতর্ক অবস্থায়' end,
        case when new.overall_status='critical'
          then 'Production monitoring detected a critical condition. Review System Health now.'
          else 'Production monitoring detected a degraded condition. Review System Health.' end,
        case when new.overall_status='critical'
          then 'প্রোডাকশন পর্যবেক্ষণে গুরুতর অবস্থা শনাক্ত হয়েছে। এখনই সিস্টেম স্বাস্থ্য দেখুন।'
          else 'প্রোডাকশন পর্যবেক্ষণে সতর্ক অবস্থা শনাক্ত হয়েছে। সিস্টেম স্বাস্থ্য দেখুন।' end,
        v_incident.id,
        coalesce(v_previous_status,'healthy'),
        new.overall_status,
        new.id,
        'system.health.'||new.overall_status||':'||v_incident.id::text
      );

      insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
      values(
        null,v_action,'system',v_incident.id::text,
        jsonb_build_object(
          'note',v_note,
          'from_status',coalesce(v_previous_status,'healthy'),
          'to_status',new.overall_status,
          'snapshot_id',new.id,
          'notification_recipient_count',v_notification_count
        )
      );

    elsif v_incident.current_status is distinct from new.overall_status then
      update public.system_health_incidents
      set current_status=new.overall_status,
          updated_at=clock_timestamp(),
          last_snapshot_id=new.id,
          details=details||jsonb_build_object('last_transition_at',new.observed_at)
      where id=v_incident.id
      returning * into v_incident;

      if new.overall_status='critical' then
        v_notification_count:=private.emit_system_health_notification(
          'system.health_critical',
          'System health is critical',
          'সিস্টেম স্বাস্থ্য গুরুতর অবস্থায়',
          'An active production incident escalated to critical. Review System Health now.',
          'চলমান প্রোডাকশন সমস্যা গুরুতর অবস্থায় পৌঁছেছে। এখনই সিস্টেম স্বাস্থ্য দেখুন।',
          v_incident.id,
          coalesce(v_previous_status,'degraded'),
          'critical',
          new.id,
          'system.health.critical:'||v_incident.id::text
        );

        insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
        values(
          null,'SYSTEM_HEALTH_CRITICAL','system',v_incident.id::text,
          jsonb_build_object(
            'note','Production monitoring escalated an active incident to critical.',
            'from_status',v_previous_status,
            'to_status','critical',
            'snapshot_id',new.id,
            'notification_recipient_count',v_notification_count
          )
        );
      else
        insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
        values(
          null,'SYSTEM_HEALTH_DEESCALATED','system',v_incident.id::text,
          jsonb_build_object(
            'note','Production monitoring improved from critical to degraded but the incident remains open.',
            'from_status',v_previous_status,
            'to_status','degraded',
            'snapshot_id',new.id,
            'notification_recipient_count',0
          )
        );
      end if;
    else
      update public.system_health_incidents
      set updated_at=clock_timestamp(),last_snapshot_id=new.id
      where id=v_incident.id;
    end if;

  elsif new.overall_status='healthy' and v_incident.id is not null then
    update public.system_health_incidents
    set current_status='recovered',
        recovered_at=clock_timestamp(),
        updated_at=clock_timestamp(),
        last_snapshot_id=new.id,
        details=details||jsonb_build_object('recovered_snapshot_at',new.observed_at)
    where id=v_incident.id;

    v_notification_count:=private.emit_system_health_notification(
      'system.health_recovered',
      'System health recovered',
      'সিস্টেম স্বাস্থ্য স্বাভাবিক হয়েছে',
      'The active production incident has recovered and monitoring is healthy again.',
      'চলমান প্রোডাকশন সমস্যা সমাধান হয়েছে এবং পর্যবেক্ষণ আবার স্বাভাবিক।',
      v_incident.id,
      v_incident.current_status,
      'healthy',
      new.id,
      'system.health.recovered:'||v_incident.id::text
    );

    insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
    values(
      null,'SYSTEM_HEALTH_RECOVERED','system',v_incident.id::text,
      jsonb_build_object(
        'note','Production monitoring closed the incident after recovery.',
        'from_status',v_incident.current_status,
        'to_status','healthy',
        'snapshot_id',new.id,
        'notification_recipient_count',v_notification_count
      )
    );
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.is_current_auth_session_valid()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_session_text text := nullif(auth.jwt()->>'session_id', '');
  v_session_id uuid;
begin
  if v_user_id is null or v_session_text is null then
    return false;
  end if;

  begin
    v_session_id := v_session_text::uuid;
  exception when others then
    return false;
  end;

  return exists (
    select 1
    from auth.sessions s
    where s.id = v_session_id
      and s.user_id = v_user_id
      and (s.not_after is null or s.not_after > now())
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.is_published_complaint_evidence(p_storage_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.complaint_evidence e
    join public.complaints c
      on c.id = e.complaint_id
    where e.storage_path = p_storage_path
      and c.status = 'published'
  );
$function$;
CREATE OR REPLACE FUNCTION private.scrub_reporter_context_after_moderation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if old.status is distinct from new.status
     and new.status <> 'submitted'
  then
    update public.complaint_submission_contexts
       set reporter_latitude = null,
           reporter_longitude = null,
           accuracy_meters = null,
           browser_name = null,
           browser_version = null,
           os_name = null,
           device_category = null,
           platform = null,
           language = null,
           timezone = null,
           screen_width = null,
           screen_height = null,
           user_agent = null,
           ui_language = null
     where complaint_id = new.id;
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.system_health_database_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_max_connections integer:=0;
  v_total_connections integer:=0;
  v_active_connections integer:=0;
  v_lock_waits integer:=0;
  v_longest_active_seconds numeric:=0;
  v_connection_usage numeric:=0;
  v_database_size_bytes bigint:=0;
  v_cache_hit_ratio numeric:=100;
  v_deadlocks bigint:=0;
  v_xact_commit bigint:=0;
  v_xact_rollback bigint:=0;
  v_rollback_ratio numeric:=0;
  v_status text:='healthy';
begin
  v_max_connections:=current_setting('max_connections')::integer;

  select
    count(*) filter(where backend_type='client backend')::integer,
    count(*) filter(where backend_type='client backend' and state='active' and pid<>pg_backend_pid())::integer,
    count(*) filter(where backend_type='client backend' and state='active' and wait_event_type='Lock' and pid<>pg_backend_pid())::integer,
    coalesce(max(extract(epoch from(clock_timestamp()-query_start))) filter(
      where backend_type='client backend' and state='active' and query_start is not null and pid<>pg_backend_pid()
    ),0)
  into v_total_connections,v_active_connections,v_lock_waits,v_longest_active_seconds
  from pg_stat_activity
  where datname=current_database();

  if v_max_connections>0 then
    v_connection_usage:=round((v_total_connections::numeric/v_max_connections::numeric)*100,1);
  end if;

  select
    pg_database_size(current_database()),
    case when(blks_hit+blks_read)>0
      then round((blks_hit::numeric/(blks_hit+blks_read)::numeric)*100,2)
      else 100 end,
    deadlocks,xact_commit,xact_rollback
  into v_database_size_bytes,v_cache_hit_ratio,v_deadlocks,v_xact_commit,v_xact_rollback
  from pg_stat_database
  where datname=current_database();

  if(v_xact_commit+v_xact_rollback)>0 then
    v_rollback_ratio:=round((v_xact_rollback::numeric/(v_xact_commit+v_xact_rollback)::numeric)*100,2);
  end if;

  if v_connection_usage>=90 or v_lock_waits>=5 or v_longest_active_seconds>=120 then
    v_status:='critical';
  elsif v_connection_usage>=75 or v_lock_waits>0 or v_longest_active_seconds>=60 then
    v_status:='degraded';
  end if;

  return jsonb_build_object(
    'status',v_status,
    'connections',jsonb_build_object(
      'used',v_total_connections,
      'max',v_max_connections,
      'usagePercent',v_connection_usage,
      'active',v_active_connections,
      'lockWaits',v_lock_waits
    ),
    'longestActiveQuerySeconds',round(v_longest_active_seconds,2),
    'sizeBytes',v_database_size_bytes,
    'cacheHitRatio',v_cache_hit_ratio,
    'deadlocksTotal',v_deadlocks,
    'rollbackRatio',v_rollback_ratio
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
    v_is_super_admin boolean;
    v_perm_exists boolean;
    v_requires_aal2 boolean;
begin
    if not private.is_current_auth_session_valid() then
        return false;
    end if;

    v_requires_aal2 := p_permission_id = any(array[
        'admin_users.manage',
        'banners.manage',
        'categories.manage',
        'complaints.evidence_view',
        'complaints.export',
        'complaints.publish',
        'complaints.reject',
        'complaints.unpublish',
        'location_activity.view',
        'responses.publish',
        'responses.reject',
        'responses.resubmit',
        'responses.unpublish',
        'roles.manage'
    ]::text[]);

    if v_requires_aal2
       and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
        return false;
    end if;

    select coalesce(is_super_admin, false)
    into v_is_super_admin
    from public.admin_users
    where user_id = auth.uid()
      and active = true;

    if v_is_super_admin is true then
        select exists (
            select 1
            from public.permissions
            where id = p_permission_id
        )
        into v_perm_exists;

        return v_perm_exists;
    end if;

    return exists (
        select 1
        from public.admin_users au
        join public.user_roles ur
          on ur.user_id = au.user_id
        join public.roles r
          on r.id = ur.role_id
        join public.role_permissions rp
          on rp.role_id = r.id
        where au.user_id = auth.uid()
          and au.active = true
          and r.active = true
          and rp.permission_id = p_permission_id
    );
end;
$function$;
CREATE OR REPLACE FUNCTION public.is_active_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select private.is_current_auth_session_valid()
     and exists (
       select 1
       from public.admin_users
       where user_id = auth.uid()
         and active = true
     );
$function$;
CREATE OR REPLACE FUNCTION public.admin_begin_news_intake_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_id uuid;
  v_source_count integer;
  v_running public.news_intake_runs%rowtype;
begin
  if not public.is_active_admin() or not public.has_permission('complaints.publish') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  update public.news_intake_runs
  set status='failed',
      completed_at=now(),
      error_summary=coalesce(error_summary,'') || case when coalesce(error_summary,'')='' then '' else ' ' end ||
        'Marked failed automatically because the run exceeded 20 minutes.'
  where status='running' and started_at < now()-interval '20 minutes';

  select * into v_running
  from public.news_intake_runs
  where status='running'
  order by started_at desc
  limit 1;

  if v_running.id is not null then
    return jsonb_build_object(
      'runId',v_running.id,
      'status','running',
      'sourceCount',v_running.source_count,
      'startedAt',v_running.started_at,
      'triggerType',v_running.trigger_type,
      'alreadyRunning',true
    );
  end if;

  select count(*)::integer into v_source_count
  from public.news_source_domains
  where active=true and scan_enabled=true and homepage_url is not null;

  begin
    insert into public.news_intake_runs(started_by,source_count,trigger_type)
    values(auth.uid(),v_source_count,'manual')
    returning id into v_id;
  exception when unique_violation then
    select * into v_running
    from public.news_intake_runs
    where status='running'
    order by started_at desc limit 1;
    return jsonb_build_object(
      'runId',v_running.id,
      'status','running',
      'sourceCount',v_running.source_count,
      'startedAt',v_running.started_at,
      'triggerType',v_running.trigger_type,
      'alreadyRunning',true
    );
  end;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'news_intake.run_start','news_intake_run',v_id::text,
    jsonb_build_object('source_count',v_source_count,'trigger_type','manual','timestamp',clock_timestamp()));

  return jsonb_build_object(
    'runId',v_id,
    'status','running',
    'sourceCount',v_source_count,
    'startedAt',clock_timestamp(),
    'triggerType','manual',
    'alreadyRunning',false
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.source_hostname(p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select lower(substring(btrim(coalesce(p_url,'')) from '^https://([^/:?#]+)'));
$function$;
CREATE OR REPLACE FUNCTION public.admin_check_news_source_domain(p_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_host text;
  v_source public.news_source_domains%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (not public.is_active_admin() or not public.has_permission('complaints.publish')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  if p_url is null or btrim(p_url) !~ '^https://[^/]+(?:/.*)?$' then
    raise exception 'A valid HTTPS source URL is required.' using errcode='22023';
  end if;

  v_host:=public.source_hostname(p_url);
  if v_host is null then
    raise exception 'Could not determine source hostname.' using errcode='22023';
  end if;

  select * into v_source
  from public.news_source_domains
  where hostname=v_host and active=true;

  return jsonb_build_object(
    'approved',v_source.hostname is not null,
    'hostname',v_host,
    'publisherName',v_source.publisher_name
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.normalize_source_url(p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select nullif(
    regexp_replace(
      regexp_replace(btrim(coalesce(p_url, '')), '#.*$', ''),
      '/$',
      ''
    ),
    ''
  );
$function$;
CREATE OR REPLACE FUNCTION public.admin_check_source_duplicate(p_canonical_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_normalized text;
  v_result jsonb;
begin
  if not public.is_active_admin()
     or not (
       public.has_permission('complaints.view')
       or public.has_permission('complaints.publish')
     ) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  v_normalized := public.normalize_source_url(p_canonical_url);
  if v_normalized is null then
    raise exception 'A valid source URL is required.' using errcode='22023';
  end if;

  select jsonb_build_object(
    'duplicate', true,
    'normalizedUrl', v_normalized,
    'complaintId', c.id,
    'complaintStatus', c.status,
    'titleBn', c.title,
    'titleEn', c.title_en,
    'publisherName', s.publisher_name,
    'sourceTitle', s.source_title,
    'canonicalUrl', s.canonical_url
  )
  into v_result
  from public.complaint_sources s
  join public.complaints c on c.id = s.complaint_id
  where public.normalize_source_url(s.canonical_url) = v_normalized
  order by
    case when c.status = 'published' then 0 else 1 end,
    c.created_at desc
  limit 1;

  return coalesce(
    v_result,
    jsonb_build_object(
      'duplicate', false,
      'normalizedUrl', v_normalized
    )
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.normalize_duplicate_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(p_value, '')), '[[:punct:]]+', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$function$;
CREATE OR REPLACE FUNCTION public.duplicate_report_signature_values(p_segment_id text, p_subcategory_id text, p_title text, p_title_en text, p_incident_date date, p_district text, p_upazila_or_thana text, p_area text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select encode(
    extensions.digest(
      concat_ws(
        '|',
        public.normalize_duplicate_text(p_segment_id),
        public.normalize_duplicate_text(p_subcategory_id),
        public.normalize_duplicate_text(p_title),
        public.normalize_duplicate_text(p_title_en),
        coalesce(p_incident_date::text, ''),
        public.normalize_duplicate_text(p_district),
        public.normalize_duplicate_text(p_upazila_or_thana),
        public.normalize_duplicate_text(p_area)
      ),
      'sha256'
    ),
    'hex'
  );
$function$;
CREATE OR REPLACE FUNCTION public.duplicate_token_similarity(p_left text, p_right text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with
  left_tokens as (
    select distinct token
    from regexp_split_to_table(public.normalize_duplicate_text(p_left), '[[:space:]]+') as token
    where char_length(token) >= 2
  ),
  right_tokens as (
    select distinct token
    from regexp_split_to_table(public.normalize_duplicate_text(p_right), '[[:space:]]+') as token
    where char_length(token) >= 2
  ),
  counts as (
    select
      (select count(*) from left_tokens) as left_count,
      (select count(*) from right_tokens) as right_count,
      (
        select count(*)
        from left_tokens l
        join right_tokens r using (token)
      ) as shared_count
  )
  select case
    when left_count = 0 or right_count = 0 then 0::numeric
    else round((2.0 * shared_count / (left_count + right_count))::numeric, 4)
  end
  from counts;
$function$;
CREATE OR REPLACE FUNCTION public.evaluate_sourced_report_duplicate_internal(p_complaint_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_target public.complaints%rowtype;
  v_target_signature text;
  v_exact_sources jsonb := '[]'::jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_candidate_count integer := 0;
  v_match_count integer := 0;
  v_review_count integer := 0;
  v_status text := 'clear';
begin
  select *
  into v_target
  from public.complaints
  where id = p_complaint_id;

  if v_target.id is null then
    raise exception 'Complaint with ID % not found', p_complaint_id using errcode='P0002';
  end if;

  if v_target.origin_type <> 'sourced_report' then
    return jsonb_build_object(
      'applicable', false,
      'status', 'clear',
      'requiresReview', false,
      'candidateCount', 0,
      'exactSourceDuplicates', '[]'::jsonb,
      'candidates', '[]'::jsonb
    );
  end if;

  v_target_signature := public.duplicate_report_signature_values(
    v_target.segment_id,
    v_target.subcategory_id,
    v_target.title,
    v_target.title_en,
    v_target.incident_date,
    v_target.district,
    v_target.upazila_or_thana,
    v_target.area
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'complaintId', other_c.id,
        'status', other_c.status,
        'titleBn', other_c.title,
        'titleEn', other_c.title_en,
        'publisherName', other_s.publisher_name,
        'sourceTitle', other_s.source_title,
        'canonicalUrl', other_s.canonical_url
      )
      order by other_c.created_at desc, other_c.id
    ),
    '[]'::jsonb
  )
  into v_exact_sources
  from public.complaint_sources target_s
  join public.complaint_sources other_s
    on public.normalize_source_url(other_s.canonical_url) =
       public.normalize_source_url(target_s.canonical_url)
   and other_s.complaint_id <> target_s.complaint_id
  join public.complaints other_c on other_c.id = other_s.complaint_id
  where target_s.complaint_id = v_target.id
    and other_c.status <> 'rejected';

  with candidate_base as (
    select
      c.*,
      public.duplicate_report_signature_values(
        c.segment_id,
        c.subcategory_id,
        c.title,
        c.title_en,
        c.incident_date,
        c.district,
        c.upazila_or_thana,
        c.area
      ) as candidate_signature,
      greatest(
        public.duplicate_token_similarity(v_target.title, c.title),
        public.duplicate_token_similarity(v_target.title, c.title_en),
        public.duplicate_token_similarity(v_target.title_en, c.title),
        public.duplicate_token_similarity(v_target.title_en, c.title_en)
      ) as title_similarity,
      v_target.subcategory_id = c.subcategory_id as same_subcategory,
      v_target.incident_date = c.incident_date as same_date,
      abs(v_target.incident_date - c.incident_date) as date_delta,
      public.normalize_duplicate_text(v_target.district) <> ''
        and public.normalize_duplicate_text(v_target.district) =
            public.normalize_duplicate_text(c.district) as same_district,
      public.normalize_duplicate_text(v_target.upazila_or_thana) <> ''
        and public.normalize_duplicate_text(v_target.upazila_or_thana) =
            public.normalize_duplicate_text(c.upazila_or_thana) as same_upazila,
      public.normalize_duplicate_text(v_target.area) <> ''
        and public.normalize_duplicate_text(v_target.area) =
            public.normalize_duplicate_text(c.area) as same_area,
      (
        public.normalize_duplicate_text(v_target.title) <> ''
        and (
          public.normalize_duplicate_text(v_target.title) = public.normalize_duplicate_text(c.title)
          or public.normalize_duplicate_text(v_target.title) = public.normalize_duplicate_text(c.title_en)
        )
      ) or (
        public.normalize_duplicate_text(v_target.title_en) <> ''
        and (
          public.normalize_duplicate_text(v_target.title_en) = public.normalize_duplicate_text(c.title)
          or public.normalize_duplicate_text(v_target.title_en) = public.normalize_duplicate_text(c.title_en)
        )
      ) as exact_title
    from public.complaints c
    where c.id <> v_target.id
      and c.origin_type = 'sourced_report'
      and c.status in ('submitted', 'published', 'unpublished', 'edited')
      and c.segment_id = v_target.segment_id
      and (
        abs(v_target.incident_date - c.incident_date) <= 3
        or greatest(
          public.duplicate_token_similarity(v_target.title, c.title),
          public.duplicate_token_similarity(v_target.title, c.title_en),
          public.duplicate_token_similarity(v_target.title_en, c.title),
          public.duplicate_token_similarity(v_target.title_en, c.title_en)
        ) >= 0.50
      )
  ),
  without_valid_override as (
    select b.*
    from candidate_base b
    left join public.report_duplicate_overrides o
      on o.report_a_id = least(v_target.id, b.id)
     and o.report_b_id = greatest(v_target.id, b.id)
     and o.report_a_signature = case
       when v_target.id < b.id then v_target_signature else b.candidate_signature
     end
     and o.report_b_signature = case
       when v_target.id < b.id then b.candidate_signature else v_target_signature
     end
    where o.report_a_id is null
  ),
  scored as (
    select
      b.*,
      least(
        100,
          (case when same_subcategory then 25 else 0 end)
        + (case when same_date then 25 when date_delta = 1 then 15 when date_delta <= 3 then 5 else 0 end)
        + (case when same_district then 10 else 0 end)
        + (case when same_upazila then 15 else 0 end)
        + (case when same_area then 15 else 0 end)
        + (case when exact_title then 30 else round(title_similarity * 30)::integer end)
      ) as score
    from without_valid_override b
  ),
  classified as (
    select
      s.*,
      case
        when exact_title and same_subcategory and date_delta <= 1 then 'match'
        when score >= 75 and title_similarity >= 0.35 and (same_upazila or same_area) then 'match'
        when score >= 55 and (title_similarity >= 0.20 or same_area) then 'review'
        else 'clear'
      end as match_level
    from scored s
  ),
  flagged as (
    select *
    from classified
    where match_level in ('match', 'review')
  ),
  ranked as (
    select *
    from flagged
    order by
      case match_level when 'match' then 0 else 1 end,
      score desc,
      created_at desc,
      id
    limit 5
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'complaintId', r.id,
        'status', r.status,
        'titleBn', r.title,
        'titleEn', r.title_en,
        'segmentId', r.segment_id,
        'subcategoryId', r.subcategory_id,
        'incidentDate', to_char(r.incident_date, 'YYYY-MM-DD'),
        'district', r.district,
        'upazilaOrThana', r.upazila_or_thana,
        'area', r.area,
        'score', r.score,
        'titleSimilarity', r.title_similarity,
        'matchLevel', r.match_level,
        'reasons', to_jsonb(array_remove(array[
          case when r.same_subcategory then 'same_subcategory' end,
          case when r.same_date then 'same_incident_date' end,
          case when r.same_district then 'same_district' end,
          case when r.same_upazila then 'same_upazila_or_thana' end,
          case when r.same_area then 'same_area' end,
          case when r.exact_title then 'same_normalized_title' end,
          case when r.title_similarity >= 0.50 then 'strong_title_overlap'
               when r.title_similarity >= 0.20 then 'title_overlap' end
        ]::text[], null)),
        'sources', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'publisherName', cs.publisher_name,
              'sourceTitle', cs.source_title,
              'canonicalUrl', cs.canonical_url,
              'sourcePublishedDate', to_char(cs.source_published_date, 'YYYY-MM-DD')
            )
            order by cs.created_at
          ), '[]'::jsonb)
          from public.complaint_sources cs
          where cs.complaint_id = r.id
        )
      )
      order by
        case r.match_level when 'match' then 0 else 1 end,
        r.score desc,
        r.created_at desc,
        r.id
    ), '[]'::jsonb),
    count(*)::integer,
    count(*) filter (where match_level = 'match')::integer,
    count(*) filter (where match_level = 'review')::integer
  into v_candidates, v_candidate_count, v_match_count, v_review_count
  from ranked r;

  if jsonb_array_length(v_exact_sources) > 0 then
    v_status := 'exact';
  elsif v_match_count > 0 then
    v_status := 'match';
  elsif v_review_count > 0 then
    v_status := 'review';
  else
    v_status := 'clear';
  end if;

  return jsonb_build_object(
    'applicable', true,
    'status', v_status,
    'requiresReview', v_status <> 'clear',
    'candidateCount', v_candidate_count,
    'matchCount', v_match_count,
    'reviewCount', v_review_count,
    'exactSourceDuplicates', v_exact_sources,
    'candidates', v_candidates
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.news_intake_privacy_review_required(p_subcategory_id text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce(p_subcategory_id,'') = any (array[
    'child_abduction_murder',
    'ride_sharing_safety',
    'rape-sexual-violence',
    'sexual-harassment',
    'domestic-violence',
    'blackmail-coercion',
    'honeytrap'
  ]::text[]);
$function$;
CREATE OR REPLACE FUNCTION public.admin_complete_news_intake_item_review(p_item_id uuid, p_report_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_item public.news_intake_run_items%rowtype;
  v_report public.complaints%rowtype;
  v_duplicate jsonb;
  v_duplicate_status text;
  v_review_required boolean;
  v_action text;
  v_reason text;
begin
  if not public.is_active_admin() or not public.has_permission('complaints.publish') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select * into v_item
  from public.news_intake_run_items
  where id=p_item_id
  for update;

  if v_item.id is null then
    raise exception 'News Intake item not found.' using errcode='P0002';
  end if;
  if v_item.item_kind<>'article' or v_item.segment_id is null or v_item.subcategory_id is null then
    raise exception 'Only category-matched article items can complete review.' using errcode='22023';
  end if;

  select * into v_report
  from public.complaints
  where id=p_report_id
  for update;

  if v_report.id is null or v_report.origin_type<>'sourced_report' then
    raise exception 'Reviewed sourced report not found.' using errcode='P0002';
  end if;
  if v_report.segment_id is distinct from v_item.segment_id
     or v_report.subcategory_id is distinct from v_item.subcategory_id then
    raise exception 'Reviewed report category no longer matches the intake item.' using errcode='22023';
  end if;
  if not exists(
    select 1
    from public.complaint_sources s
    where s.complaint_id=v_report.id
      and public.normalize_source_url(s.canonical_url)=public.normalize_source_url(v_item.canonical_url)
  ) then
    raise exception 'Reviewed report does not contain the intake source URL.' using errcode='22023';
  end if;

  v_duplicate:=public.evaluate_sourced_report_duplicate_internal(v_report.id);
  v_duplicate_status:=coalesce(v_duplicate->>'status','unavailable');
  v_review_required:=
    lower(coalesce(v_report.custom_field_answers->>'newsIntakeReviewRequired','false'))='true'
    or (
      public.news_intake_privacy_review_required(v_report.subcategory_id)
      and lower(coalesce(v_report.custom_field_answers->>'sensitiveContentReviewed','false'))<>'true'
    );

  if v_report.status='published' then
    v_action:='created_draft';
    v_reason:='Reviewed report is already published.';
  elsif v_report.status='submitted'
        and v_duplicate_status='clear'
        and not v_review_required then
    v_action:='created_draft';
    v_reason:='Manual review completed; report is ready for publication.';
  else
    v_action:='needs_review';
    v_reason:='Manual review saved, but server readiness checks still require review.';
  end if;

  update public.news_intake_run_items
  set report_id=v_report.id,
      action=v_action,
      duplicate_status=v_duplicate_status,
      reason=v_reason,
      review_payload=null
  where id=v_item.id;

  return jsonb_build_object(
    'success',true,
    'itemId',v_item.id,
    'reportId',v_report.id,
    'action',v_action,
    'duplicateStatus',v_duplicate_status,
    'ready',v_action='created_draft' and v_report.status='submitted' and not v_review_required
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.evaluate_sourced_report_candidate_internal(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_report jsonb:=coalesce(p_payload->'report','{}'::jsonb);
  v_source jsonb:=coalesce(p_payload->'source','{}'::jsonb);
  v_segment text:=nullif(btrim(v_report->>'segmentId'),'');
  v_subcategory text:=nullif(btrim(v_report->>'subcategoryId'),'');
  v_title text:=nullif(btrim(v_report->>'titleBn'),'');
  v_title_en text:=nullif(btrim(v_report->>'titleEn'),'');
  v_incident_date date;
  v_district text:=nullif(btrim(v_report->>'district'),'');
  v_upazila text:=nullif(btrim(v_report->>'upazilaOrThana'),'');
  v_area text:=nullif(btrim(v_report->>'area'),'');
  v_url text:=nullif(btrim(v_source->>'canonicalUrl'),'');
  v_exact jsonb:='[]'::jsonb;
  v_candidates jsonb:='[]'::jsonb;
  v_candidate_count integer:=0;
  v_match_count integer:=0;
  v_review_count integer:=0;
  v_status text:='clear';
begin
  begin
    v_incident_date:=(v_report->>'incidentDate')::date;
  exception when others then
    raise exception 'A valid incident date is required.' using errcode='22023';
  end;

  if v_segment is null or v_subcategory is null or coalesce(v_title,v_title_en) is null
     or v_district is null then
    raise exception 'Category, subcategory, title, incident date, and district are required for duplicate preview.'
      using errcode='22023';
  end if;

  if v_url is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'complaintId',c.id,
      'status',c.status,
      'titleBn',c.title,
      'titleEn',c.title_en,
      'publisherName',s.publisher_name,
      'sourceTitle',s.source_title,
      'canonicalUrl',s.canonical_url
    ) order by case when c.status='published' then 0 else 1 end,c.created_at desc),'[]'::jsonb)
    into v_exact
    from public.complaint_sources s
    join public.complaints c on c.id=s.complaint_id
    where public.normalize_source_url(s.canonical_url)=public.normalize_source_url(v_url);
  end if;

  with candidate_base as (
    select
      c.*,
      greatest(
        public.duplicate_token_similarity(v_title,c.title),
        public.duplicate_token_similarity(v_title,c.title_en),
        public.duplicate_token_similarity(v_title_en,c.title),
        public.duplicate_token_similarity(v_title_en,c.title_en)
      ) title_similarity,
      v_subcategory=c.subcategory_id same_subcategory,
      v_incident_date=c.incident_date same_date,
      abs(v_incident_date-c.incident_date) date_delta,
      public.normalize_duplicate_text(v_district)<>'' and
        public.normalize_duplicate_text(v_district)=public.normalize_duplicate_text(c.district) same_district,
      public.normalize_duplicate_text(v_upazila)<>'' and
        public.normalize_duplicate_text(v_upazila)=public.normalize_duplicate_text(c.upazila_or_thana) same_upazila,
      public.normalize_duplicate_text(v_area)<>'' and
        public.normalize_duplicate_text(v_area)=public.normalize_duplicate_text(c.area) same_area,
      (
        public.normalize_duplicate_text(v_title)<>'' and (
          public.normalize_duplicate_text(v_title)=public.normalize_duplicate_text(c.title)
          or public.normalize_duplicate_text(v_title)=public.normalize_duplicate_text(c.title_en)
        )
      ) or (
        public.normalize_duplicate_text(v_title_en)<>'' and (
          public.normalize_duplicate_text(v_title_en)=public.normalize_duplicate_text(c.title)
          or public.normalize_duplicate_text(v_title_en)=public.normalize_duplicate_text(c.title_en)
        )
      ) exact_title
    from public.complaints c
    where c.origin_type='sourced_report'
      and c.status in ('submitted','published','unpublished','edited')
      and c.segment_id=v_segment
      and (
        abs(v_incident_date-c.incident_date)<=3
        or greatest(
          public.duplicate_token_similarity(v_title,c.title),
          public.duplicate_token_similarity(v_title,c.title_en),
          public.duplicate_token_similarity(v_title_en,c.title),
          public.duplicate_token_similarity(v_title_en,c.title_en)
        )>=0.50
      )
  ),
  scored as (
    select *,
      least(100,
        (case when same_subcategory then 25 else 0 end)
        +(case when same_date then 25 when date_delta=1 then 15 when date_delta<=3 then 5 else 0 end)
        +(case when same_district then 10 else 0 end)
        +(case when same_upazila then 15 else 0 end)
        +(case when same_area then 15 else 0 end)
        +(case when exact_title then 30 else round(title_similarity*30)::integer end)
      ) score
    from candidate_base
  ),
  classified as (
    select *,
      case
        when exact_title and same_subcategory and date_delta<=1 then 'match'
        when score>=75 and title_similarity>=0.35 and (same_upazila or same_area) then 'match'
        when score>=55 and (title_similarity>=0.20 or same_area) then 'review'
        else 'clear'
      end match_level
    from scored
  ),
  ranked as (
    select * from classified
    where match_level in ('match','review')
    order by case match_level when 'match' then 0 else 1 end,score desc,created_at desc,id
    limit 5
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'complaintId',r.id,
      'status',r.status,
      'titleBn',r.title,
      'titleEn',r.title_en,
      'segmentId',r.segment_id,
      'subcategoryId',r.subcategory_id,
      'incidentDate',to_char(r.incident_date,'YYYY-MM-DD'),
      'district',r.district,
      'upazilaOrThana',r.upazila_or_thana,
      'area',r.area,
      'score',r.score,
      'titleSimilarity',r.title_similarity,
      'matchLevel',r.match_level,
      'reasons',to_jsonb(array_remove(array[
        case when r.same_subcategory then 'same_subcategory' end,
        case when r.same_date then 'same_incident_date' end,
        case when r.same_district then 'same_district' end,
        case when r.same_upazila then 'same_upazila_or_thana' end,
        case when r.same_area then 'same_area' end,
        case when r.exact_title then 'same_normalized_title' end,
        case when r.title_similarity>=0.50 then 'strong_title_overlap'
             when r.title_similarity>=0.20 then 'title_overlap' end
      ]::text[],null)),
      'sources',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'publisherName',cs.publisher_name,
          'sourceTitle',cs.source_title,
          'canonicalUrl',cs.canonical_url,
          'sourcePublishedDate',to_char(cs.source_published_date,'YYYY-MM-DD')
        ) order by cs.created_at),'[]'::jsonb)
        from public.complaint_sources cs where cs.complaint_id=r.id
      )
    ) order by case r.match_level when 'match' then 0 else 1 end,r.score desc,r.created_at desc),'[]'::jsonb),
    count(*)::integer,
    count(*) filter(where match_level='match')::integer,
    count(*) filter(where match_level='review')::integer
  into v_candidates,v_candidate_count,v_match_count,v_review_count
  from ranked r;

  if jsonb_array_length(v_exact)>0 then v_status:='exact';
  elsif v_match_count>0 then v_status:='match';
  elsif v_review_count>0 then v_status:='review';
  end if;

  return jsonb_build_object(
    'applicable',true,
    'status',v_status,
    'requiresReview',v_status<>'clear',
    'candidateCount',v_candidate_count,
    'matchCount',v_match_count,
    'reviewCount',v_review_count,
    'exactSourceDuplicates',v_exact,
    'candidates',v_candidates
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.canonical_district_name(p_value text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select d.name_en
  from public.bangladesh_districts d
  where lower(btrim(coalesce(p_value,''))) in (lower(d.id),lower(d.name_en),lower(d.name_bn))
     or exists(select 1 from unnest(d.aliases) a where lower(a)=lower(btrim(coalesce(p_value,''))))
  limit 1
$function$;
CREATE OR REPLACE FUNCTION public.canonical_division_name(p_value text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select d.name_en
  from public.bangladesh_divisions d
  where lower(btrim(coalesce(p_value,''))) in (lower(d.id),lower(d.name_en),lower(d.name_bn))
     or exists(select 1 from unnest(d.aliases) a where lower(a)=lower(btrim(coalesce(p_value,''))))
  limit 1
$function$;
CREATE OR REPLACE FUNCTION public.canonical_district_id(p_value text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select d.id
  from public.bangladesh_districts d
  where lower(btrim(coalesce(p_value,''))) in (lower(d.id),lower(d.name_en),lower(d.name_bn))
     or exists(select 1 from unnest(d.aliases) a where lower(a)=lower(btrim(coalesce(p_value,''))))
  limit 1
$function$;
CREATE OR REPLACE FUNCTION public.canonical_upazila_name(p_value text, p_district text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select u.name_en
  from public.bangladesh_upazilas u
  join public.bangladesh_districts d on d.id=u.district_id
  where (
    lower(btrim(coalesce(p_value,''))) in (lower(u.id),lower(u.name_en),lower(u.name_bn))
    or exists(select 1 from unnest(u.aliases) a where lower(a)=lower(btrim(coalesce(p_value,''))))
  )
  and (
    nullif(btrim(coalesce(p_district,'')),'') is null
    or d.id=public.canonical_district_id(p_district)
  )
  order by case when d.id=public.canonical_district_id(p_district) then 0 else 1 end,u.id
  limit 1
$function$;
CREATE OR REPLACE FUNCTION public.sourced_report_missing_required_fields_internal(p_subcategory_id text, p_report jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_schema_id uuid;
  v_field record;
  v_value jsonb;
  v_missing jsonb:='[]'::jsonb;
  v_storage_key text;
  v_field_key text;
  v_division text:=nullif(btrim(p_report->>'division'),'');
  v_district text:=nullif(btrim(p_report->>'district'),'');
  v_upazila text:=nullif(btrim(p_report->>'upazilaOrThana'),'');
  v_scope text:=coalesce(nullif(btrim(p_report->'customFieldAnswers'->>'locationScope'),''),'specific');
  v_has_specific boolean:=false;
begin
  select r.id into v_schema_id
  from public.reporting_form_schemas r
  where r.scope_type='subcategory'
    and r.scope_id=p_subcategory_id
    and r.status='published'
    and r.engine_mode='schema'
  order by r.version desc
  limit 1;

  if v_schema_id is not null then
    for v_field in
      select f.field_key,f.storage_key,f.storage_mode,f.label_en,f.label_bn
      from public.reporting_form_schema_fields f
      where f.schema_id=v_schema_id and f.active=true and f.required=true
      order by f.sort_order,f.id
    loop
      v_storage_key:=coalesce(nullif(btrim(v_field.storage_key),''),v_field.field_key);
      v_field_key:=v_field.field_key;
      v_value:=null;
      if v_field_key='title' or v_storage_key='title' then
        v_value:=to_jsonb(coalesce(nullif(btrim(p_report->>'titleBn'),''),nullif(btrim(p_report->>'titleEn'),'')));
      elsif v_field_key='description' or v_storage_key='description' then
        v_value:=to_jsonb(coalesce(nullif(btrim(p_report->>'descriptionBn'),''),nullif(btrim(p_report->>'descriptionEn'),'')));
      elsif v_field_key='location' or v_storage_key='location' or (v_field.storage_mode='system_block' and v_field.field_key='location') then
        if v_division is not null and v_district is not null then v_value:='true'::jsonb; end if;
      elsif v_field_key='mob_justice_details' or v_storage_key='mobJusticeDetails' then
        if jsonb_typeof(p_report->'mobJusticeDetails')='object' and p_report->'mobJusticeDetails'<>'{}'::jsonb then
          v_value:=p_report->'mobJusticeDetails';
        end if;
      else
        v_value:=coalesce(p_report->v_storage_key,p_report->v_field_key,p_report->'customFieldAnswers'->v_storage_key,p_report->'customFieldAnswers'->v_field_key);
      end if;
      if v_value is null
         or v_value='null'::jsonb
         or (jsonb_typeof(v_value)='string' and btrim(v_value#>>'{}')='')
         or (jsonb_typeof(v_value)='array' and jsonb_array_length(v_value)=0)
         or (jsonb_typeof(v_value)='object' and v_value='{}'::jsonb) then
        v_missing:=v_missing || jsonb_build_array(jsonb_build_object(
          'fieldKey',v_field_key,'storageKey',v_storage_key,'labelEn',v_field.label_en,'labelBn',v_field.label_bn
        ));
      end if;
    end loop;
  end if;

  if v_division is null or public.canonical_division_name(v_division) is null
     or v_district is null or public.canonical_district_name(v_district) is null then
    v_missing:=v_missing || jsonb_build_array(jsonb_build_object(
      'fieldKey','canonicalLocation','storageKey','location',
      'labelEn','Valid division and district','labelBn','সঠিক বিভাগ ও জেলা'
    ));
  end if;

  if v_upazila is not null and public.canonical_upazila_name(v_upazila,v_district) is null then
    v_missing:=v_missing || jsonb_build_array(jsonb_build_object(
      'fieldKey','canonicalUpazila','storageKey','upazilaOrThana',
      'labelEn','Valid upazila / thana','labelBn','সঠিক উপজেলা / থানা'
    ));
  end if;

  v_has_specific :=
    v_upazila is not null
    or nullif(btrim(p_report->>'area'),'') is not null
    or nullif(btrim(p_report->>'road'),'') is not null
    or nullif(btrim(p_report->>'landmark'),'') is not null
    or (
      nullif(btrim(p_report->>'formattedAddress'),'') is not null
      and lower(btrim(p_report->>'formattedAddress')) <> lower(btrim(coalesce(v_district,'')))
    );

  if not v_has_specific and v_scope <> 'district_wide' then
    v_missing:=v_missing || jsonb_build_array(jsonb_build_object(
      'fieldKey','locationSpecificity','storageKey','location',
      'labelEn','Specific incident location or explicit district-wide scope',
      'labelBn','নির্দিষ্ট ঘটনার স্থান বা জেলা-ব্যাপী স্কোপ'
    ));
  end if;

  return v_missing;
end
$function$;
CREATE OR REPLACE FUNCTION public.sourced_report_schema_validation_errors_internal(p_subcategory_id text, p_report jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_schema_id uuid;
  v_field record;
  v_value jsonb;
  v_text text;
  v_storage_key text;
  v_errors jsonb:=public.sourced_report_missing_required_fields_internal(p_subcategory_id,p_report);
  v_numeric numeric;
  v_min numeric;
  v_max numeric;
  v_min_length integer;
  v_max_length integer;
begin
  select r.id into v_schema_id
  from public.reporting_form_schemas r
  where r.scope_type='subcategory'
    and r.scope_id=p_subcategory_id
    and r.status='published'
    and r.engine_mode='schema'
  order by r.version desc
  limit 1;

  if v_schema_id is null then
    return v_errors;
  end if;

  for v_field in
    select
      f.field_key,f.field_type,f.storage_mode,f.storage_key,
      f.label_en,f.label_bn,f.required,
      coalesce(f.validation,'{}'::jsonb) as validation,
      coalesce(f.options,'[]'::jsonb) as options
    from public.reporting_form_schema_fields f
    where f.schema_id=v_schema_id and f.active=true
    order by f.sort_order,f.id
  loop
    v_storage_key:=coalesce(nullif(btrim(v_field.storage_key),''),v_field.field_key);
    v_value:=null;

    if v_field.field_key='title' or v_storage_key='title' then
      v_value:=to_jsonb(coalesce(
        nullif(btrim(p_report->>'titleBn'),''),
        nullif(btrim(p_report->>'titleEn'),'')
      ));
    elsif v_field.field_key='description' or v_storage_key='description' then
      v_value:=to_jsonb(coalesce(
        nullif(btrim(p_report->>'descriptionBn'),''),
        nullif(btrim(p_report->>'descriptionEn'),'')
      ));
    elsif v_field.field_key='location' or v_storage_key='location' then
      if nullif(btrim(p_report->>'division'),'') is not null
         and nullif(btrim(p_report->>'district'),'') is not null then
        v_value:='true'::jsonb;
      end if;
    elsif v_field.field_key='mob_justice_details' or v_storage_key='mobJusticeDetails' then
      if jsonb_typeof(p_report->'mobJusticeDetails')='object'
         and p_report->'mobJusticeDetails'<>'{}'::jsonb then
        v_value:=p_report->'mobJusticeDetails';
      end if;
    else
      v_value:=coalesce(
        p_report -> v_storage_key,
        p_report -> v_field.field_key,
        p_report->'customFieldAnswers' -> v_storage_key,
        p_report->'customFieldAnswers' -> v_field.field_key
      );
    end if;

    if v_value is null
       or v_value='null'::jsonb
       or (jsonb_typeof(v_value)='string' and btrim(v_value#>>'{}')='')
       or (jsonb_typeof(v_value)='array' and jsonb_array_length(v_value)=0)
       or (jsonb_typeof(v_value)='object' and v_value='{}'::jsonb) then
      continue;
    end if;

    v_text:=case when jsonb_typeof(v_value)='string' then v_value#>>'{}' else v_value::text end;

    if v_field.field_type='checkbox' and v_field.required=true
       and lower(coalesce(v_text,''))<>'true' then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'fieldKey',v_field.field_key,'storageKey',v_storage_key,
        'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','required_true'
      ));
      continue;
    end if;

    if v_field.field_type in ('select','radio') then
      if not exists(
        select 1 from jsonb_array_elements(v_field.options) opt
        where opt->>'value'=v_text
      ) then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'fieldKey',v_field.field_key,'storageKey',v_storage_key,
          'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','invalid_option'
        ));
        continue;
      end if;
    elsif v_field.field_type='multiselect' then
      if jsonb_typeof(v_value)<>'array'
         or exists(
           select 1
           from jsonb_array_elements_text(
             case when jsonb_typeof(v_value)='array' then v_value else '[]'::jsonb end
           ) selected(value)
           where not exists(
             select 1 from jsonb_array_elements(v_field.options) opt
             where opt->>'value'=selected.value
           )
         ) then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'fieldKey',v_field.field_key,'storageKey',v_storage_key,
          'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','invalid_option'
        ));
        continue;
      end if;
    end if;

    v_min_length:=nullif(v_field.validation->>'minLength','')::integer;
    v_max_length:=nullif(v_field.validation->>'maxLength','')::integer;

    if v_min_length is not null and char_length(v_text)<v_min_length then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'fieldKey',v_field.field_key,'storageKey',v_storage_key,
        'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','min_length'
      ));
    end if;
    if v_max_length is not null and char_length(v_text)>v_max_length then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'fieldKey',v_field.field_key,'storageKey',v_storage_key,
        'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','max_length'
      ));
    end if;

    if v_field.field_type in ('number','currency') then
      begin
        v_numeric:=v_text::numeric;
        v_min:=nullif(v_field.validation->>'min','')::numeric;
        v_max:=nullif(v_field.validation->>'max','')::numeric;
        if v_min is not null and v_numeric<v_min then
          v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
            'fieldKey',v_field.field_key,'storageKey',v_storage_key,
            'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','min'
          ));
        end if;
        if v_max is not null and v_numeric>v_max then
          v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
            'fieldKey',v_field.field_key,'storageKey',v_storage_key,
            'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','max'
          ));
        end if;
      exception when others then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'fieldKey',v_field.field_key,'storageKey',v_storage_key,
          'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','invalid_number'
        ));
      end;
    elsif v_field.field_type='email'
       and v_text !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'fieldKey',v_field.field_key,'storageKey',v_storage_key,
        'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','invalid_email'
      ));
    elsif v_field.field_type='url'
       and v_text !~* '^https?://[^[:space:]]+$' then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'fieldKey',v_field.field_key,'storageKey',v_storage_key,
        'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','invalid_url'
      ));
    elsif v_field.field_type='phone'
       and char_length(regexp_replace(v_text,'[^0-9]','','g')) not between 7 and 15 then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'fieldKey',v_field.field_key,'storageKey',v_storage_key,
        'labelEn',v_field.label_en,'labelBn',v_field.label_bn,'code','invalid_phone'
      ));
    end if;
  end loop;

  return v_errors;
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_preview_sourced_report_intake(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_source_check jsonb;
  v_duplicate jsonb;
  v_report jsonb:=coalesce(p_payload->'report','{}'::jsonb);
  v_incident_date date;
  v_subcategory text:=nullif(btrim(v_report->>'subcategoryId'),'');
  v_district text:=nullif(btrim(v_report->>'district'),'');
  v_safe_candidates jsonb:='[]'::jsonb;
  v_missing_fields jsonb:='[]'::jsonb;
  v_privacy_review_required boolean:=false;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (not public.is_active_admin() or not public.has_permission('complaints.publish')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  v_source_check:=public.admin_check_news_source_domain(p_payload#>>'{source,canonicalUrl}');
  if coalesce((v_source_check->>'approved')::boolean,false) is not true then
    raise exception 'SOURCE_DOMAIN_NOT_APPROVED: Source domain is not in the approved news-source registry.'
      using errcode='22023';
  end if;

  if v_subcategory is not null then
    v_missing_fields:=public.sourced_report_schema_validation_errors_internal(
      v_subcategory,
      v_report
    );
    v_privacy_review_required:=public.news_intake_privacy_review_required(v_subcategory);
  end if;

  v_duplicate:=public.evaluate_sourced_report_candidate_internal(p_payload);

  if coalesce(v_duplicate->>'status','clear')='clear'
     and v_subcategory is not null
     and v_district is not null then
    begin
      v_incident_date:=(v_report->>'incidentDate')::date;
    exception when others then
      v_incident_date:=null;
    end;

    if v_incident_date is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
        'complaintId',q.id,
        'status',q.status,
        'titleBn',q.title,
        'titleEn',q.title_en,
        'segmentId',q.segment_id,
        'subcategoryId',q.subcategory_id,
        'incidentDate',to_char(q.incident_date,'YYYY-MM-DD'),
        'district',q.district,
        'upazilaOrThana',q.upazila_or_thana,
        'area',q.area,
        'score',60,
        'titleSimilarity',0,
        'matchLevel','review',
        'reasons',jsonb_build_array(
          'same_subcategory',
          'same_incident_date',
          'same_district',
          'cross_language_safe_review'
        ),
        'sources',(
          select coalesce(jsonb_agg(jsonb_build_object(
            'publisherName',cs.publisher_name,
            'sourceTitle',cs.source_title,
            'canonicalUrl',cs.canonical_url,
            'sourcePublishedDate',to_char(cs.source_published_date,'YYYY-MM-DD')
          ) order by cs.created_at),'[]'::jsonb)
          from public.complaint_sources cs
          where cs.complaint_id=q.id
        )
      ) order by q.created_at desc),'[]'::jsonb)
      into v_safe_candidates
      from (
        select c.*
        from public.complaints c
        where c.origin_type='sourced_report'
          and c.status in ('submitted','published','unpublished','edited')
          and c.subcategory_id=v_subcategory
          and c.incident_date=v_incident_date
          and public.normalize_duplicate_text(c.district)=public.normalize_duplicate_text(v_district)
        order by c.created_at desc
        limit 5
      ) q;

      if jsonb_array_length(v_safe_candidates)>0 then
        v_duplicate:=v_duplicate || jsonb_build_object(
          'status','review',
          'requiresReview',true,
          'candidateCount',jsonb_array_length(v_safe_candidates),
          'reviewCount',jsonb_array_length(v_safe_candidates),
          'candidates',v_safe_candidates
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'sourceDomain',v_source_check,
    'duplicate',v_duplicate,
    'privacyReviewRequired',v_privacy_review_required,
    'schemaValidation',jsonb_build_object(
      'ready',jsonb_array_length(v_missing_fields)=0,
      'missingFields',v_missing_fields
    ),
    'canCreateDraft',
      jsonb_array_length(coalesce(v_duplicate->'exactSourceDuplicates','[]'::jsonb))=0
      and jsonb_array_length(v_missing_fields)=0,
    'canPublishImmediately',
      coalesce(v_duplicate->>'status','clear')='clear'
      and jsonb_array_length(v_missing_fields)=0
      and (
        not v_privacy_review_required
        or lower(coalesce(v_report#>>'{customFieldAnswers,sensitiveContentReviewed}','false'))='true'
      )
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_create_sourced_report_from_intake(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_report jsonb:=coalesce(p_payload->'report','{}'::jsonb);
  v_source jsonb:=coalesce(p_payload->'source','{}'::jsonb);
  v_preview jsonb;
  v_segment text:=nullif(btrim(v_report->>'segmentId'),'');
  v_subcategory text:=nullif(btrim(v_report->>'subcategoryId'),'');
  v_title text:=nullif(btrim(v_report->>'titleBn'),'');
  v_title_en text:=nullif(btrim(v_report->>'titleEn'),'');
  v_description text:=nullif(btrim(v_report->>'descriptionBn'),'');
  v_description_en text:=nullif(btrim(v_report->>'descriptionEn'),'');
  v_incident_date date;
  v_incident_time time;
  v_utility_end_time time;
  v_frequency text:=coalesce(nullif(btrim(v_report->>'frequency'),''),'one-time');
  v_priority text:=coalesce(nullif(btrim(v_report->>'priority'),''),'medium');
  v_division text:=nullif(btrim(v_report->>'division'),'');
  v_district text:=nullif(btrim(v_report->>'district'),'');
  v_upazila text:=nullif(btrim(v_report->>'upazilaOrThana'),'');
  v_area text:=nullif(btrim(v_report->>'area'),'');
  v_road text:=nullif(btrim(v_report->>'road'),'');
  v_landmark text:=nullif(btrim(v_report->>'landmark'),'');
  v_address text:=nullif(btrim(v_report->>'formattedAddress'),'');
  v_schema_version integer;
  v_report_id text;
  v_year text;
  v_attempt integer:=0;
  v_source_type text:=coalesce(nullif(btrim(v_source->>'sourceType'),''),'news');
  v_publisher text:=nullif(btrim(v_source->>'publisherName'),'');
  v_source_title text:=nullif(btrim(v_source->>'sourceTitle'),'');
  v_url text:=nullif(btrim(v_source->>'canonicalUrl'),'');
  v_source_date date;
  v_duplicate jsonb;
  v_privacy_review_required boolean:=false;
  v_answers jsonb:=case when jsonb_typeof(v_report->'customFieldAnswers')='object'
    then v_report->'customFieldAnswers' else '{}'::jsonb end;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (not public.is_active_admin() or not public.has_permission('complaints.publish')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  v_preview:=public.admin_preview_sourced_report_intake(p_payload);
  v_publisher:=coalesce(
    nullif(btrim(v_preview#>>'{sourceDomain,publisherName}'),''),
    v_publisher
  );
  if jsonb_array_length(coalesce(v_preview#>'{duplicate,exactSourceDuplicates}','[]'::jsonb))>0 then
    raise exception 'SOURCE_ALREADY_EXISTS: This canonical source is already attached to an existing report.'
      using errcode='23505';
  end if;

  if coalesce((v_preview#>>'{schemaValidation,ready}')::boolean,false) is not true then
    raise exception 'SOURCE_SCHEMA_VALIDATION_FAILED: The sourced report does not satisfy the currently published reporting schema.'
      using errcode='22023';
  end if;

  if v_segment is null or v_subcategory is null or v_title is null
     or v_description is null or v_division is null or v_district is null then
    raise exception 'Category, subcategory, Bangla title, Bangla description, division, and district are required.'
      using errcode='22023';
  end if;

  if char_length(v_title)>100 then
    raise exception 'Bangla title cannot exceed 100 characters.' using errcode='22023';
  end if;
  if v_title_en is not null and char_length(v_title_en)>100 then
    raise exception 'English title cannot exceed 100 characters.' using errcode='22023';
  end if;
  if char_length(v_description)>2000
     or (v_description_en is not null and char_length(v_description_en)>2000) then
    raise exception 'Descriptions cannot exceed 2000 characters.' using errcode='22023';
  end if;

  begin
    v_incident_date:=(v_report->>'incidentDate')::date;
    if nullif(btrim(v_report->>'incidentTime'),'') is not null then
      v_incident_time:=(v_report->>'incidentTime')::time;
    end if;
    if nullif(btrim(v_report->>'utilityEndTime'),'') is not null then
      v_utility_end_time:=(v_report->>'utilityEndTime')::time;
    end if;
    if nullif(btrim(v_source->>'sourcePublishedDate'),'') is not null then
      v_source_date:=(v_source->>'sourcePublishedDate')::date;
    end if;
  exception when others then
    raise exception 'One or more supplied date/time values are invalid.' using errcode='22023';
  end;

  if not exists(
    select 1
    from public.subcategories sc
    join public.segments sg on sg.id=sc.segment_id
    where sc.id=v_subcategory and sc.segment_id=v_segment
      and sc.active=true and sg.active=true
      and sc.config_status='published' and sg.config_status='published'
  ) then
    raise exception 'Selected category/subcategory is not currently published for reporting.'
      using errcode='22023';
  end if;

  v_privacy_review_required:=public.news_intake_privacy_review_required(v_subcategory);

  select r.version into v_schema_version
  from public.reporting_form_schemas r
  where r.scope_type='subcategory' and r.scope_id=v_subcategory
    and r.status='published' and r.engine_mode='schema'
  order by r.version desc limit 1;

  if v_source_type not in ('news','official','social','article','other') then
    raise exception 'Invalid source type.' using errcode='22023';
  end if;
  if v_publisher is null or v_url is null or v_url !~ '^https://[^/]+/.+' then
    raise exception 'Publisher name and a valid HTTPS source URL are required.' using errcode='22023';
  end if;

  v_year:=to_char(now(),'YYYY');
  loop
    v_attempt:=v_attempt+1;
    v_report_id:='SJ-'||v_year||'-'||floor(100000+random()*900000)::integer::text;
    exit when not exists(select 1 from public.complaints where id=v_report_id);
    if v_attempt>=50 then raise exception 'REPORT_ID_GENERATION_FAILED'; end if;
  end loop;

  insert into public.complaints(
    id,segment_id,subcategory_id,title,title_en,description,description_en,
    incident_date,incident_time,utility_end_time,frequency,status,priority,
    privacy_choice,confirm_public_identity,
    division,district,upazila_or_thana,area,road,landmark,formatted_address,
    relationship_context,recent_bill_month,recent_bill_amount,
    previous_bill_month,previous_bill_amount,
    bribery_department,bribery_service,bribery_amount,
    affected_person_age_group,alleged_abuser_relationship,reporting_for,
    sexual_harassment_type,sexual_harassment_context,sexual_harassment_institution,
    intimate_what_happened,intimate_platform,mob_justice_details,
    form_schema_version,custom_field_answers,origin_type,created_at,updated_at
  ) values (
    v_report_id,v_segment,v_subcategory,v_title,v_title_en,v_description,v_description_en,
    v_incident_date,v_incident_time,v_utility_end_time,v_frequency,'submitted',v_priority,
    'anonymous',false,
    v_division,v_district,v_upazila,v_area,v_road,v_landmark,v_address,
    nullif(btrim(v_report->>'relationshipContext'),''),
    nullif(btrim(v_report->>'recentBillMonth'),''),
    nullif(v_report->>'recentBillAmount','')::numeric,
    nullif(btrim(v_report->>'previousBillMonth'),''),
    nullif(v_report->>'previousBillAmount','')::numeric,
    nullif(btrim(v_report->>'briberyDepartment'),''),
    nullif(btrim(v_report->>'briberyService'),''),
    nullif(v_report->>'briberyAmount','')::numeric,
    nullif(btrim(v_report->>'affectedPersonAgeGroup'),''),
    nullif(btrim(v_report->>'allegedAbuserRelationship'),''),
    nullif(btrim(v_report->>'reportingFor'),''),
    nullif(btrim(v_report->>'sexualHarassmentType'),''),
    nullif(btrim(v_report->>'sexualHarassmentContext'),''),
    nullif(btrim(v_report->>'sexualHarassmentInstitution'),''),
    case when nullif(btrim(v_report->>'intimateWhatHappened'),'') is null
      then null else to_jsonb(btrim(v_report->>'intimateWhatHappened')) end,
    case when nullif(btrim(v_report->>'intimatePlatform'),'') is null
      then null else to_jsonb(btrim(v_report->>'intimatePlatform')) end,
    case when jsonb_typeof(v_report->'mobJusticeDetails')='object'
      then v_report->'mobJusticeDetails' else null end,
    v_schema_version,
    v_answers,
    'sourced_report',now(),now()
  );

  insert into public.complaint_sources(
    complaint_id,source_type,publisher_name,source_title,canonical_url,
    source_published_date,verification_status,is_final_detail_page,
    source_version,verification_note,verified_at,verified_by
  ) values (
    v_report_id,v_source_type,v_publisher,v_source_title,v_url,
    v_source_date,'verified',true,1,
    'Verified through Admin News Intake.',now(),auth.uid()
  );

  insert into public.complaint_updates(complaint_id,update_type,note,is_public,created_at)
  values(v_report_id,'submitted','Sourced report created through Admin News Intake.',false,now());

  v_duplicate:=public.evaluate_sourced_report_duplicate_internal(v_report_id);

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'sourced_report.intake_create','complaint',v_report_id,jsonb_build_object(
    'canonical_url',v_url,
    'publisher_name',v_publisher,
    'duplicate_preview_status',v_preview#>>'{duplicate,status}',
    'candidate_ids',coalesce((
      select jsonb_agg(item->>'complaintId')
      from jsonb_array_elements(coalesce(v_preview#>'{duplicate,candidates}','[]'::jsonb)) item
    ),'[]'::jsonb),
    'timestamp',clock_timestamp()
  ));

  return jsonb_build_object(
    'success',true,
    'reportId',v_report_id,
    'status','submitted',
    'duplicate',v_duplicate,
    'canPublishImmediately',
      (v_duplicate->>'status')='clear'
      and lower(coalesce(v_answers->>'newsIntakeReviewRequired','false'))<>'true'
      and (not v_privacy_review_required or lower(coalesce(v_answers->>'sensitiveContentReviewed','false'))='true')
  );
exception
  when unique_violation then
    raise exception 'SOURCE_ALREADY_EXISTS: This canonical source is already attached to another report.'
      using errcode='23505';
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_notification_can_view_role_scope(p_recipient_user_id uuid, p_role_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_recip_active BOOLEAN;
    v_recip_is_super_admin BOOLEAN;
    v_role_exists BOOLEAN;
    v_has_roles_manage BOOLEAN;
BEGIN
    IF p_recipient_user_id IS NULL OR p_role_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT COALESCE(active, false), COALESCE(is_super_admin, false)
    INTO v_recip_active, v_recip_is_super_admin
    FROM public.admin_users
    WHERE user_id = p_recipient_user_id;

    IF v_recip_active IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    SELECT true INTO v_role_exists
    FROM public.roles
    WHERE id = p_role_id;

    IF v_role_exists IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    IF v_recip_is_super_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.admin_notification_get_effective_permissions(p_recipient_user_id) AS p_id
        WHERE p_id = 'roles.manage'
    ) INTO v_has_roles_manage;

    IF v_has_roles_manage IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    RETURN NOT EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        WHERE rp.role_id = p_role_id
          AND rp.permission_id NOT IN (
              SELECT p_id
              FROM public.admin_notification_get_effective_permissions(p_recipient_user_id) AS p_id
          )
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_notification_can_view_user_scope(p_recipient_user_id uuid, p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

    SELECT COALESCE(active, false), COALESCE(is_super_admin, false)
    INTO v_recip_active, v_recip_is_super_admin
    FROM public.admin_users
    WHERE user_id = p_recipient_user_id;

    IF v_recip_active IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    SELECT true, COALESCE(is_super_admin, false)
    INTO v_target_exists, v_target_is_super_admin
    FROM public.admin_users
    WHERE user_id = p_target_user_id;

    IF v_target_exists IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    IF v_recip_is_super_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    IF v_target_is_super_admin IS TRUE THEN
        RETURN FALSE;
    END IF;

    SELECT
        EXISTS (
            SELECT 1
            FROM public.admin_notification_get_effective_permissions(p_recipient_user_id) AS p_id
            WHERE p_id = 'admin_users.view'
        ),
        EXISTS (
            SELECT 1
            FROM public.admin_notification_get_effective_permissions(p_recipient_user_id) AS p_id
            WHERE p_id = 'admin_users.manage'
        )
    INTO v_has_user_view, v_has_user_manage;

    IF NOT (v_has_user_view OR v_has_user_manage) THEN
        RETURN FALSE;
    END IF;

    RETURN NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id AND r.active = true
        JOIN public.role_permissions rp ON rp.role_id = r.id
        WHERE ur.user_id = p_target_user_id
          AND rp.permission_id NOT IN (
              SELECT p_id
              FROM public.admin_notification_get_effective_permissions(p_recipient_user_id) AS p_id
          )
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_notification_resolve_recipients(p_audience_mode text DEFAULT 'permission'::text, p_required_all_permissions text[] DEFAULT '{}'::text[], p_required_any_permissions text[] DEFAULT '{}'::text[], p_target_type text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_personal_recipient_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid, p_exclude_actor boolean DEFAULT true, p_include_super_admin boolean DEFAULT true)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_cand RECORD;
    v_eff_perms TEXT[];
    v_target_uuid UUID;
    v_scope_ok BOOLEAN;
BEGIN
    IF p_audience_mode = 'personal' THEN
        IF p_personal_recipient_id IS NULL THEN
            RETURN;
        END IF;

        IF p_exclude_actor IS TRUE
           AND p_actor_user_id IS NOT NULL
           AND p_personal_recipient_id = p_actor_user_id
        THEN
            RETURN;
        END IF;

        RETURN QUERY
        SELECT au.user_id
        FROM public.admin_users au
        WHERE au.user_id = p_personal_recipient_id
          AND au.active = true;

        RETURN;
    END IF;

    IF p_audience_mode = 'super_admin_only' THEN
        RETURN QUERY
        SELECT au.user_id
        FROM public.admin_users au
        WHERE au.active = true
          AND au.is_super_admin = true
          AND (
              NOT p_exclude_actor
              OR p_actor_user_id IS NULL
              OR au.user_id <> p_actor_user_id
          );

        RETURN;
    END IF;

    IF p_audience_mode = 'permission' THEN
        IF p_target_type IS NOT NULL
           AND p_target_type NOT IN ('complaint', 'admin_user', 'role')
        THEN
            RETURN;
        END IF;

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
            IF p_exclude_actor IS TRUE
               AND p_actor_user_id IS NOT NULL
               AND v_cand.user_id = p_actor_user_id
            THEN
                CONTINUE;
            END IF;

            IF v_cand.is_super_admin IS TRUE THEN
                IF p_include_super_admin IS TRUE THEN
                    RETURN NEXT v_cand.user_id;
                END IF;

                CONTINUE;
            END IF;

            v_eff_perms := ARRAY(
                SELECT p_id
                FROM public.admin_notification_get_effective_permissions(v_cand.user_id) AS p_id
            );

            IF p_required_all_permissions IS NOT NULL
               AND cardinality(p_required_all_permissions) > 0
            THEN
                IF NOT (p_required_all_permissions <@ v_eff_perms) THEN
                    CONTINUE;
                END IF;
            END IF;

            IF p_required_any_permissions IS NOT NULL
               AND cardinality(p_required_any_permissions) > 0
            THEN
                IF NOT (p_required_any_permissions && v_eff_perms) THEN
                    CONTINUE;
                END IF;
            END IF;

            IF p_target_type = 'admin_user' THEN
                v_scope_ok :=
                    public.admin_notification_can_view_user_scope(
                        v_cand.user_id,
                        v_target_uuid
                    );

                IF v_scope_ok IS NOT TRUE THEN
                    CONTINUE;
                END IF;

            ELSIF p_target_type = 'role' THEN
                v_scope_ok :=
                    public.admin_notification_can_view_role_scope(
                        v_cand.user_id,
                        btrim(p_target_id)
                    );

                IF v_scope_ok IS NOT TRUE THEN
                    CONTINUE;
                END IF;

            ELSIF p_target_type = 'complaint' THEN
                NULL;

            ELSIF p_target_type IS NULL THEN
                NULL;

            ELSE
                CONTINUE;
            END IF;

            RETURN NEXT v_cand.user_id;
        END LOOP;

        RETURN;
    END IF;

    RETURN;
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_emit_notification(p_event_key text, p_title_en text, p_title_bn text, p_body_en text DEFAULT NULL::text, p_body_bn text DEFAULT NULL::text, p_actor_user_id uuid DEFAULT auth.uid(), p_actor_display_name text DEFAULT NULL::text, p_target_type text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_target_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_required_all_permissions text[] DEFAULT '{}'::text[], p_required_any_permissions text[] DEFAULT '{}'::text[], p_audience_mode text DEFAULT 'permission'::text, p_personal_recipient_id uuid DEFAULT NULL::uuid, p_route text DEFAULT NULL::text, p_dedupe_key text DEFAULT NULL::text, p_exclude_actor boolean DEFAULT true, p_include_super_admin boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_cat RECORD;
    v_actor_display_name TEXT;
    v_event_group_id UUID;
    v_inserted_count INTEGER := 0;
BEGIN
    SELECT event_key, category, default_layer, default_severity, active
    INTO v_cat
    FROM public.admin_notification_event_catalogue
    WHERE event_key = p_event_key;

    IF v_cat.event_key IS NULL OR v_cat.active IS NOT TRUE THEN
        RAISE EXCEPTION
            'Unknown or inactive notification event key: %',
            p_event_key
            USING ERRCODE = '22000';
    END IF;

    IF p_title_en IS NULL OR length(trim(p_title_en)) = 0 THEN
        RAISE EXCEPTION
            'English title (title_en) must not be empty'
            USING ERRCODE = '22000';
    END IF;

    IF p_title_bn IS NULL OR length(trim(p_title_bn)) = 0 THEN
        RAISE EXCEPTION
            'Bengali title (title_bn) must not be empty'
            USING ERRCODE = '22000';
    END IF;

    IF p_audience_mode IS NULL
       OR p_audience_mode NOT IN (
           'permission',
           'super_admin_only',
           'personal'
       )
    THEN
        RAISE EXCEPTION
            'Invalid audience mode: %. Must be permission, super_admin_only, or personal',
            p_audience_mode
            USING ERRCODE = '22000';
    END IF;

    IF p_audience_mode = 'personal'
       AND p_personal_recipient_id IS NULL
    THEN
        RAISE EXCEPTION
            'personal_recipient_id is required when audience_mode is personal'
            USING ERRCODE = '22000';
    END IF;

    IF p_target_type IS NOT NULL THEN
        IF p_target_type NOT IN ('complaint', 'admin_user', 'role') THEN
            RAISE EXCEPTION
                'Invalid target type: %. Must be complaint, admin_user, or role',
                p_target_type
                USING ERRCODE = '22000';
        END IF;

        IF p_target_type = 'admin_user' THEN
            IF p_target_id IS NULL OR length(btrim(p_target_id)) = 0 THEN
                RAISE EXCEPTION
                    'target_id is required and must be a valid UUID for admin_user target'
                    USING ERRCODE = '22000';
            END IF;

            BEGIN
                PERFORM btrim(p_target_id)::UUID;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION
                    'Invalid target_id for admin_user: must be a valid UUID'
                    USING ERRCODE = '22000';
            END;

        ELSIF p_target_type = 'role' THEN
            IF p_target_id IS NULL OR length(btrim(p_target_id)) = 0 THEN
                RAISE EXCEPTION
                    'target_id is required and must be non-empty for role target'
                    USING ERRCODE = '22000';
            END IF;
        END IF;
    END IF;

    IF p_route IS NOT NULL
       AND NOT (p_route ~ '^/[^\s]*$')
    THEN
        RAISE EXCEPTION
            'Route must be an internal path beginning with /'
            USING ERRCODE = '22000';
    END IF;

    IF p_actor_display_name IS NOT NULL
       AND length(trim(p_actor_display_name)) > 0
    THEN
        v_actor_display_name := trim(p_actor_display_name);

    ELSIF p_actor_user_id IS NOT NULL THEN
        SELECT display_name
        INTO v_actor_display_name
        FROM public.admin_users
        WHERE user_id = p_actor_user_id;
    END IF;

    v_event_group_id := gen_random_uuid();

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
$function$;
CREATE OR REPLACE FUNCTION public.get_caller_effective_permission_set()
 RETURNS SETOF text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
    v_user_id uuid;
    v_is_active_admin boolean;
    v_is_super_admin boolean;
    v_bootstrap_mode boolean;
begin
    v_user_id := auth.uid();

    if v_user_id is null
       or not private.is_current_auth_session_valid()
    then
        return;
    end if;

    select (active = true)
    into v_is_active_admin
    from public.admin_users
    where user_id = v_user_id;

    if v_is_active_admin is not true then
        return;
    end if;

    select coalesce(au.is_super_admin, false)
    into v_is_super_admin
    from public.admin_users au
    where au.user_id = v_user_id
      and au.active = true;

    if v_is_super_admin is true then
        return query select p.id from public.permissions p;
        return;
    end if;

    select not exists (select 1 from public.user_roles)
    into v_bootstrap_mode;

    if v_bootstrap_mode is true then
        return query select p.id from public.permissions p;
        return;
    end if;

    return query
    select distinct rp.permission_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.active = true
    join public.role_permissions rp on rp.role_id = r.id
    where ur.user_id = v_user_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.can_manage_role_scope(p_role_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
    v_user_id uuid;
    v_is_active_admin boolean;
    v_is_super_admin boolean;
    v_bootstrap_mode boolean;
    v_role_exists boolean;
begin
    v_user_id := auth.uid();

    if v_user_id is null
       or not private.is_current_auth_session_valid()
    then
        return false;
    end if;

    select exists (
        select 1 from public.roles where id = p_role_id
    ) into v_role_exists;

    if not v_role_exists then
        return false;
    end if;

    select (active = true)
    into v_is_active_admin
    from public.admin_users
    where user_id = v_user_id;

    if v_is_active_admin is not true then
        return false;
    end if;

    select coalesce(au.is_super_admin, false)
    into v_is_super_admin
    from public.admin_users au
    where au.user_id = v_user_id
      and au.active = true;

    if v_is_super_admin is true then
        return true;
    end if;

    select not exists (select 1 from public.user_roles)
    into v_bootstrap_mode;

    if v_bootstrap_mode is true then
        return true;
    end if;

    return not exists (
        select 1
        from public.role_permissions rp
        where rp.role_id = p_role_id
          and rp.permission_id not in (
              select public.get_caller_effective_permission_set()
          )
    );
end;
$function$;
CREATE OR REPLACE FUNCTION public.log_role_audit_event(p_action text, p_target_id text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        details,
        created_at
    )
    VALUES (
        auth.uid(),
        p_action,
        CASE
            WHEN p_action ILIKE '%USER%' THEN 'USER'
            ELSE 'ROLE'
        END,
        p_target_id,
        COALESCE(p_details, '{}'::jsonb),
        clock_timestamp()
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_finalize_user_membership(p_user_id uuid, p_display_name text DEFAULT NULL::text, p_role_id text DEFAULT NULL::text, p_active boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_clean_display_name TEXT;
    v_clean_role_id TEXT;
    v_auth_email TEXT;
    v_created_at TIMESTAMPTZ;
    v_role_exists BOOLEAN;
    v_role_active BOOLEAN;
    v_audit_id UUID;
    v_target_label TEXT;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION
          'Access denied. Active administrator session required.'
          USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission('admin_users.manage') THEN
        RAISE EXCEPTION
          'Access denied. Permission admin_users.manage required.'
          USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Target user ID cannot be null.'
            USING ERRCODE = '22000';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = p_user_id
    ) THEN
        RAISE EXCEPTION
          'User % is already a member of the admin team.',
          p_user_id
          USING ERRCODE = '23505';
    END IF;

    SELECT email
    INTO v_auth_email
    FROM auth.users
    WHERE id = p_user_id;

    IF v_auth_email IS NULL THEN
        RAISE EXCEPTION
          'Target user % does not exist in authentication store.',
          p_user_id
          USING ERRCODE = 'P0002';
    END IF;

    v_clean_display_name := nullif(trim(p_display_name), '');

    IF v_clean_display_name IS NULL THEN
        v_clean_display_name := split_part(v_auth_email, '@', 1);
    END IF;

    v_clean_role_id := nullif(trim(p_role_id), '');

    IF v_clean_role_id IS NULL THEN
        v_clean_role_id := 'moderator';
    END IF;

    SELECT
      EXISTS (
        SELECT 1 FROM public.roles WHERE id = v_clean_role_id
      ),
      COALESCE(
        (
          SELECT active
          FROM public.roles
          WHERE id = v_clean_role_id
        ),
        false
      )
    INTO v_role_exists, v_role_active;

    IF NOT v_role_exists THEN
        RAISE EXCEPTION 'Role % does not exist.', v_clean_role_id
            USING ERRCODE = '22000';
    END IF;

    IF NOT v_role_active THEN
        RAISE EXCEPTION 'Cannot assign inactive role %.', v_clean_role_id
            USING ERRCODE = '22000';
    END IF;

    IF NOT public.can_manage_role_scope(v_clean_role_id) THEN
        RAISE EXCEPTION
          'Access denied. You cannot assign a role with permissions exceeding your own authority.'
          USING ERRCODE = '42501';
    END IF;

    v_created_at := clock_timestamp();

    INSERT INTO public.admin_users (
        user_id,
        display_name,
        is_super_admin,
        active,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        v_clean_display_name,
        false,
        COALESCE(p_active, TRUE),
        v_created_at,
        v_created_at
    );

    INSERT INTO public.user_roles (
        user_id,
        role_id,
        created_at
    ) VALUES (
        p_user_id,
        v_clean_role_id,
        v_created_at
    );

    v_audit_id := public.log_role_audit_event(
        'USER_MEMBERSHIP_FINALIZED',
        v_clean_role_id,
        jsonb_build_object(
            'target_user_id', p_user_id,
            'email', v_auth_email,
            'role_id', v_clean_role_id,
            'active', COALESCE(p_active, TRUE)
        )
    );

    v_target_label :=
      COALESCE(v_clean_display_name, v_auth_email);

    PERFORM public.admin_emit_notification(
        p_event_key := 'admin.created',
        p_title_en :=
          'New administrator created: ' || v_target_label,
        p_title_bn :=
          'নতুন প্রশাসক তৈরি করা হয়েছে: ' || v_target_label,
        p_body_en :=
          'New administrator account created for ' ||
          v_target_label ||
          ' with role ' ||
          v_clean_role_id ||
          '.',
        p_body_bn :=
          'নতুন প্রশাসক অ্যাকাউন্ট তৈরি করা হয়েছে (' ||
          v_target_label ||
          ', ভূমিকা: ' ||
          v_clean_role_id ||
          ')।',
        p_actor_user_id := auth.uid(),
        p_target_type := 'admin_user',
        p_target_id := p_user_id::text,
        p_target_label := v_target_label,
        p_metadata := jsonb_build_object(
            'target_user_id', p_user_id,
            'email', v_auth_email,
            'display_name', v_clean_display_name,
            'role_id', v_clean_role_id,
            'active', COALESCE(p_active, TRUE),
            'actor_user_id', auth.uid(),
            'timestamp', now()
        ),
        p_required_all_permissions := '{}'::text[],
        p_required_any_permissions :=
          ARRAY['admin_users.view', 'admin_users.manage'],
        p_audience_mode := 'permission',
        p_route := '/users',
        p_dedupe_key :=
          'admin.created:oversight:' || v_audit_id::text,
        p_exclude_actor := true,
        p_include_super_admin := true
    );

    IF COALESCE(p_active, TRUE) IS TRUE THEN
        PERFORM public.admin_emit_notification(
            p_event_key := 'admin.created',
            p_title_en := 'Welcome to Sobaike Janao Admin',
            p_title_bn := 'সবাইকে জানাও অ্যাডমিনে স্বাগতম',
            p_body_en :=
              'Your administrator account has been set up with the ' ||
              v_clean_role_id ||
              ' role.',
            p_body_bn :=
              'আপনার প্রশাসক অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে (' ||
              v_clean_role_id ||
              ' ভূমিকা সহ)।',
            p_actor_user_id := auth.uid(),
            p_target_type := 'admin_user',
            p_target_id := p_user_id::text,
            p_target_label := v_target_label,
            p_metadata := jsonb_build_object(
                'user_id', p_user_id,
                'email', v_auth_email,
                'role_id', v_clean_role_id,
                'active', COALESCE(p_active, TRUE),
                'timestamp', now()
            ),
            p_required_all_permissions := '{}'::text[],
            p_required_any_permissions := '{}'::text[],
            p_audience_mode := 'personal',
            p_personal_recipient_id := p_user_id,
            p_route := '/',
            p_dedupe_key :=
              'admin.created:personal:' || p_user_id::text,
            p_exclude_actor := false,
            p_include_super_admin := true
        );
    END IF;

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'display_name', v_clean_display_name,
        'email', v_auth_email,
        'role_id', v_clean_role_id,
        'active', COALESCE(p_active, TRUE),
        'created_at', v_created_at
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_finish_news_intake_run(p_run_id uuid, p_status text DEFAULT 'completed'::text, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_run public.news_intake_runs%rowtype;
  v_discovered integer;
  v_classified integer;
  v_duplicates integer;
  v_created integer;
  v_merged integer;
  v_review integer;
  v_skipped integer;
  v_errors integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (not public.is_active_admin() or not public.has_permission('complaints.publish')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;
  if p_status not in ('completed','partial','failed') then
    raise exception 'Invalid run status.' using errcode='22023';
  end if;

  select * into v_run
  from public.news_intake_runs
  where id=p_run_id
  for update;

  if v_run.id is null or v_run.started_by<>auth.uid() then
    raise exception 'News intake run not found.' using errcode='P0002';
  end if;

  select
    count(*) filter(where item_kind='article')::integer,
    count(*) filter(where item_kind='article' and segment_id is not null and subcategory_id is not null)::integer,
    count(*) filter(where item_kind='article' and action in ('skip_duplicate','merged_source'))::integer,
    count(*) filter(where item_kind='article' and action='created_draft')::integer,
    count(*) filter(where item_kind='article' and action='merged_source')::integer,
    count(*) filter(where item_kind='article' and action='needs_review')::integer,
    count(*) filter(where item_kind='article' and action='skip_duplicate')::integer,
    count(*) filter(where action='error')::integer
  into v_discovered,v_classified,v_duplicates,v_created,v_merged,v_review,v_skipped,v_errors
  from public.news_intake_run_items
  where run_id=p_run_id;

  update public.news_intake_runs
  set status=p_status,
      completed_at=now(),
      discovered_count=v_discovered,
      classified_count=v_classified,
      duplicate_count=v_duplicates,
      created_count=v_created,
      merged_count=v_merged,
      review_count=v_review,
      skipped_count=v_skipped,
      error_count=v_errors,
      error_summary=nullif(left(coalesce(p_error,''),2000),'')
  where id=p_run_id
  returning * into v_run;

  update public.news_source_domains d
  set last_scanned_at=now(),updated_at=now()
  where d.hostname in (
    select distinct i.source_hostname
    from public.news_intake_run_items i
    where i.run_id=p_run_id
  );

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'news_intake.run_finish','news_intake_run',p_run_id::text,
    jsonb_build_object(
      'status',p_status,
      'discovered_count',v_discovered,
      'classified_count',v_classified,
      'duplicate_count',v_duplicates,
      'created_count',v_created,
      'merged_count',v_merged,
      'review_count',v_review,
      'skipped_count',v_skipped,
      'error_count',v_errors,
      'timestamp',clock_timestamp()
    ));

  return jsonb_build_object(
    'runId',v_run.id,
    'status',v_run.status,
    'sourceCount',v_run.source_count,
    'discoveredCount',v_run.discovered_count,
    'classifiedCount',v_run.classified_count,
    'duplicateCount',v_run.duplicate_count,
    'createdCount',v_run.created_count,
    'mergedCount',v_run.merged_count,
    'reviewCount',v_run.review_count,
    'skippedCount',v_run.skipped_count,
    'errorCount',v_run.error_count,
    'startedAt',v_run.started_at,
    'completedAt',v_run.completed_at
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_get_my_authorization_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
    v_user_id uuid;
    v_is_active_admin boolean;
    v_is_super_admin boolean;
    v_has_any_user_roles boolean;
    v_role_record record;
    v_permissions_json jsonb;
    v_role_json jsonb;
begin
    v_user_id := auth.uid();

    if v_user_id is null
       or not private.is_current_auth_session_valid()
    then
        return jsonb_build_object(
            'is_admin', false,
            'is_super_admin', false,
            'is_bootstrap', false,
            'role', null,
            'permission_ids', '[]'::jsonb
        );
    end if;

    select active, coalesce(is_super_admin, false)
    into v_is_active_admin, v_is_super_admin
    from public.admin_users
    where user_id = v_user_id;

    if v_is_active_admin is not true then
        return jsonb_build_object(
            'is_admin', false,
            'is_super_admin', false,
            'is_bootstrap', false,
            'role', null,
            'permission_ids', '[]'::jsonb
        );
    end if;

    if v_is_super_admin is true then
        select coalesce(jsonb_agg(p.id order by p.id), '[]'::jsonb)
        into v_permissions_json
        from public.permissions p;

        return jsonb_build_object(
            'is_admin', true,
            'is_super_admin', true,
            'is_bootstrap', false,
            'role', null,
            'permission_ids', coalesce(v_permissions_json, '[]'::jsonb)
        );
    end if;

    select r.id, r.name_en, r.name_bn, r.description, r.active, r.is_system
    into v_role_record
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = v_user_id;

    if found then
        v_role_json := jsonb_build_object(
            'id', v_role_record.id,
            'name_en', v_role_record.name_en,
            'name_bn', v_role_record.name_bn,
            'description', v_role_record.description,
            'active', v_role_record.active,
            'is_system', v_role_record.is_system
        );

        if v_role_record.active then
            select coalesce(
                jsonb_agg(rp.permission_id order by rp.permission_id),
                '[]'::jsonb
            )
            into v_permissions_json
            from public.role_permissions rp
            where rp.role_id = v_role_record.id;

            return jsonb_build_object(
                'is_admin', true,
                'is_super_admin', false,
                'is_bootstrap', false,
                'role', v_role_json,
                'permission_ids', coalesce(v_permissions_json, '[]'::jsonb)
            );
        end if;

        return jsonb_build_object(
            'is_admin', true,
            'is_super_admin', false,
            'is_bootstrap', false,
            'role', v_role_json,
            'permission_ids', '[]'::jsonb
        );
    end if;

    select exists (select 1 from public.user_roles)
    into v_has_any_user_roles;

    if not v_has_any_user_roles then
        return jsonb_build_object(
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
    end if;

    return jsonb_build_object(
        'is_admin', true,
        'is_super_admin', false,
        'is_bootstrap', false,
        'role', null,
        'permission_ids', '[]'::jsonb
    );
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_get_news_intake_automation_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_sources jsonb;
  v_runs jsonb;
  v_automation jsonb;
begin
  if not public.is_active_admin() or not public.has_permission('complaints.publish') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'hostname',d.hostname,
    'publisherName',d.publisher_name,
    'homepageUrl',d.homepage_url,
    'languageHint',d.language_hint,
    'priority',d.scan_priority,
    'scanEnabled',d.scan_enabled,
    'automationNote',d.automation_note,
    'lastScannedAt',d.last_scanned_at
  ) order by case when d.scan_enabled then 0 else 1 end,d.scan_priority,d.publisher_name),'[]'::jsonb)
  into v_sources
  from public.news_source_domains d
  where d.active=true and d.homepage_url is not null;

  select jsonb_build_object(
    'enabled',s.enabled,
    'intervalHours',s.interval_hours,
    'lastAutoDispatchedAt',s.last_auto_dispatched_at,
    'nextAutoDueAt',s.next_auto_due_at,
    'running',exists(select 1 from public.news_intake_runs r where r.status='running')
  )
  into v_automation
  from public.news_intake_automation_settings s
  where s.singleton=true;

  select coalesce(jsonb_agg(run_payload order by started_at desc),'[]'::jsonb)
  into v_runs
  from (
    select r.started_at,
      jsonb_build_object(
        'runId',r.id,
        'status',r.status,
        'triggerType',r.trigger_type,
        'sourceCount',r.source_count,
        'discoveredCount',r.discovered_count,
        'classifiedCount',r.classified_count,
        'duplicateCount',r.duplicate_count,
        'createdCount',r.created_count,
        'mergedCount',r.merged_count,
        'reviewCount',r.review_count,
        'skippedCount',r.skipped_count,
        'errorCount',r.error_count,
        'startedAt',r.started_at,
        'completedAt',r.completed_at,
        'errorSummary',r.error_summary,
        'items',(
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',i.id,
            'itemKind',i.item_kind,
            'publisherName',i.publisher_name,
            'sourceHostname',i.source_hostname,
            'canonicalUrl',i.canonical_url,
            'sourceTitle',i.source_title,
            'sourcePublishedDate',to_char(i.source_published_date,'YYYY-MM-DD'),
            'contentLanguage',i.content_language,
            'segmentId',i.segment_id,
            'subcategoryId',i.subcategory_id,
            'confidence',i.confidence,
            'duplicateStatus',i.duplicate_status,
            'action',i.action,
            'reportId',i.report_id,
            'reason',i.reason,
            'reviewPayload',i.review_payload
          ) order by i.created_at desc),'[]'::jsonb)
          from public.news_intake_run_items i
          where i.run_id=r.id
        )
      ) as run_payload
    from public.news_intake_runs r
    order by r.started_at desc
    limit 10
  ) q;

  return jsonb_build_object(
    'sources',v_sources,
    'runs',v_runs,
    'automation',coalesce(v_automation,jsonb_build_object(
      'enabled',false,'intervalHours',36,'lastAutoDispatchedAt',null,'nextAutoDueAt',null,'running',false
    ))
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_get_news_intake_scan_sources()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_sources jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (not public.is_active_admin() or not public.has_permission('complaints.publish')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'hostname',d.hostname,
    'publisherName',d.publisher_name,
    'homepageUrl',d.homepage_url,
    'languageHint',d.language_hint,
    'priority',d.scan_priority,
    'lastScannedAt',d.last_scanned_at
  ) order by d.scan_priority,d.publisher_name,d.hostname),'[]'::jsonb)
  into v_sources
  from public.news_source_domains d
  where d.active=true and d.scan_enabled=true and d.homepage_url is not null;

  return v_sources;
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_get_news_intake_taxonomy()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_segments jsonb;
  v_subcategories jsonb;
begin
  if not public.is_active_admin() or not public.has_permission('complaints.publish') then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'nameEn',s.name_en,
    'nameBn',s.name_bn,
    'order',s.sort_order
  ) order by s.sort_order,s.id),'[]'::jsonb)
  into v_segments
  from public.segments s
  where s.active=true and s.config_status='published';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',sc.id,
    'segmentId',sc.segment_id,
    'nameEn',sc.name_en,
    'nameBn',sc.name_bn,
    'order',sc.sort_order,
    'isSensitive',coalesce(sc.is_sensitive,false)
  ) order by sc.segment_id,sc.sort_order,sc.id),'[]'::jsonb)
  into v_subcategories
  from public.subcategories sc
  join public.segments s on s.id=sc.segment_id
  where sc.active=true and sc.config_status='published'
    and s.active=true and s.config_status='published';

  return jsonb_build_object(
    'segments',v_segments,
    'subcategories',v_subcategories
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_get_site_banners()
 RETURNS TABLE(category_key text, draft_content jsonb, published_content jsonb, draft_updated_at timestamp with time zone, draft_updated_by uuid, published_at timestamp with time zone, published_by uuid, version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if auth.uid() is null or not public.has_permission('banners.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  return query select b.category_key,b.draft_content,b.published_content,b.draft_updated_at,b.draft_updated_by,b.published_at,b.published_by,b.version from public.site_banners b order by coalesce((b.draft_content->>'sortOrder')::integer,999),b.category_key;
end; $function$;
CREATE OR REPLACE FUNCTION public.admin_get_system_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage', 'private'
AS $function$
declare
  v_database jsonb;
  v_storage_objects bigint:=0;
  v_storage_bytes bigint:=0;
  v_pending_complaints bigint:=0;
  v_latest_publication_at timestamptz;
  v_latest_news_run jsonb:=null;
  v_latest_snapshot jsonb:=null;
  v_history jsonb:='[]'::jsonb;
  v_open_incident jsonb:=null;
begin
  if not public.is_active_admin() then
    raise exception 'Access denied. Active administrator session required.'
      using errcode='42501';
  end if;

  if not public.has_permission('system_health.view') then
    raise exception 'Access denied. System Health authorization required.'
      using errcode='42501';
  end if;

  v_database:=private.system_health_database_metrics();

  select
    count(*)::bigint,
    coalesce(sum(
      case when coalesce(metadata->>'size','')~'^[0-9]+$'
        then(metadata->>'size')::bigint
        else 0
      end
    ),0)::bigint
  into v_storage_objects,v_storage_bytes
  from storage.objects
  where archived_at is null
    and coalesce(is_delete_marker,false) is false;

  select
    count(*) filter(where status='submitted')::bigint,
    max(published_at) filter(where status='published')
  into v_pending_complaints,v_latest_publication_at
  from public.complaints;

  select jsonb_build_object(
    'status',r.status,
    'triggerType',r.trigger_type,
    'startedAt',r.started_at,
    'completedAt',r.completed_at,
    'errorCount',coalesce(r.error_count,0),
    'errorSummary',r.error_summary
  )
  into v_latest_news_run
  from public.news_intake_runs r
  order by r.started_at desc
  limit 1;

  select to_jsonb(s)
  into v_latest_snapshot
  from(
    select
      observed_at as "observedAt",
      overall_status as "overallStatus",
      public_site as "publicSite",
      admin_site as "adminSite",
      prometheus,
      infrastructure,
      collector_version as "collectorVersion"
    from public.system_health_snapshots
    order by observed_at desc
    limit 1
  )s;

  select coalesce(
    jsonb_agg(to_jsonb(h) order by h."observedAt" desc),
    '[]'::jsonb
  )
  into v_history
  from(
    select
      observed_at as "observedAt",
      overall_status as "overallStatus",
      public_site as "publicSite",
      admin_site as "adminSite",
      prometheus,
      infrastructure
    from public.system_health_snapshots
    where observed_at>=now()-interval '24 hours'
    order by observed_at desc
    limit 24
  )h;

  select jsonb_build_object(
    'id',i.id,
    'openedAt',i.opened_at,
    'updatedAt',i.updated_at,
    'currentStatus',i.current_status,
    'initialStatus',i.initial_status,
    'lastSnapshotId',i.last_snapshot_id
  )
  into v_open_incident
  from public.system_health_incidents i
  where i.recovered_at is null
  order by i.opened_at desc
  limit 1;

  return jsonb_build_object(
    'generatedAt',clock_timestamp(),
    'database',v_database,
    'storage',jsonb_build_object(
      'objects',v_storage_objects,
      'bytes',v_storage_bytes
    ),
    'operations',jsonb_build_object(
      'pendingModeration',v_pending_complaints,
      'latestPublicationAt',v_latest_publication_at,
      'latestNewsIntakeRun',v_latest_news_run
    ),
    'openIncident',v_open_incident,
    'latestSnapshot',v_latest_snapshot,
    'history',v_history
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_notify_banner_published_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.published_at IS NOT NULL
     AND NEW.published_at IS DISTINCT FROM OLD.published_at
     AND NEW.published_content IS DISTINCT FROM OLD.published_content
  THEN
    BEGIN
      PERFORM public.admin_emit_notification(
        p_event_key := 'banner.published',
        p_title_en := 'Banner published: ' || NEW.category_key,
        p_title_bn := 'ব্যানার প্রকাশিত হয়েছে: ' || NEW.category_key,
        p_body_en := 'Published banner content was updated for a public category.',
        p_body_bn := 'একটি পাবলিক ক্যাটাগরির প্রকাশিত ব্যানার কনটেন্ট আপডেট করা হয়েছে।',
        p_actor_user_id := COALESCE(NEW.published_by, auth.uid()),
        p_target_type := NULL,
        p_target_id := NEW.category_key,
        p_target_label := NEW.category_key,
        p_metadata := jsonb_build_object('category_key', NEW.category_key, 'version', NEW.version),
        p_required_all_permissions := ARRAY['banners.manage'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/banners',
        p_dedupe_key := 'banner.published:' || NEW.category_key || ':' || NEW.version::text,
        p_exclude_actor := true,
        p_include_super_admin := true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Notification emission failed for banner.published (%): %', NEW.category_key, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_notify_complaint_submitted_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.status = 'submitted' THEN
    BEGIN
      PERFORM public.admin_emit_notification(
        p_event_key := 'complaint.submitted',
        p_title_en := 'New complaint submitted: ' || NEW.id,
        p_title_bn := 'নতুন অভিযোগ জমা হয়েছে: ' || NEW.id,
        p_body_en := 'A new citizen complaint is ready for administrative review.',
        p_body_bn := 'একটি নতুন নাগরিক অভিযোগ প্রশাসনিক পর্যালোচনার জন্য প্রস্তুত।',
        p_actor_user_id := NULL,
        p_target_type := 'complaint',
        p_target_id := NEW.id,
        p_target_label := NEW.id,
        p_metadata := jsonb_build_object(
          'complaint_id', NEW.id,
          'segment_id', NEW.segment_id,
          'subcategory_id', NEW.subcategory_id,
          'status', NEW.status,
          'created_at', NEW.created_at
        ),
        p_required_all_permissions := ARRAY['complaints.view'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/complaints/' || NEW.id,
        p_dedupe_key := 'complaint.submitted:' || NEW.id,
        p_exclude_actor := false,
        p_include_super_admin := true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Notification emission failed for complaint.submitted (%): %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_notify_reporting_form_published_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    BEGIN
      PERFORM public.admin_emit_notification(
        p_event_key := 'reporting_form.published',
        p_title_en := 'Reporting form published: ' || NEW.scope_id,
        p_title_bn := 'রিপোর্টিং ফর্ম প্রকাশিত হয়েছে: ' || NEW.scope_id,
        p_body_en := 'A new reporting form version is now active for public submissions.',
        p_body_bn := 'পাবলিক সাবমিশনের জন্য রিপোর্টিং ফর্মের একটি নতুন সংস্করণ এখন সক্রিয়।',
        p_actor_user_id := COALESCE(NEW.published_by, auth.uid()),
        p_target_type := NULL,
        p_target_id := NEW.scope_id,
        p_target_label := NEW.scope_id,
        p_metadata := jsonb_build_object(
          'schema_id', NEW.id,
          'scope_type', NEW.scope_type,
          'scope_id', NEW.scope_id,
          'version', NEW.version,
          'engine_mode', NEW.engine_mode
        ),
        p_required_all_permissions := ARRAY['categories.manage'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/categories',
        p_dedupe_key := 'reporting_form.published:' || NEW.id::text,
        p_exclude_actor := true,
        p_include_super_admin := true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Notification emission failed for reporting_form.published (%): %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_notify_taxonomy_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_name_en TEXT;
  v_name_bn TEXT;
BEGIN
  IF TG_TABLE_NAME = 'segments' THEN
    v_name_en := COALESCE(NULLIF(NEW.name_en, ''), NEW.id);
    v_name_bn := COALESCE(NULLIF(NEW.name_bn, ''), NEW.id);

    IF TG_OP = 'INSERT' THEN
      BEGIN
        PERFORM public.admin_emit_notification(
          p_event_key := 'taxonomy.category_created',
          p_title_en := 'Category created: ' || v_name_en,
          p_title_bn := 'ক্যাটাগরি তৈরি হয়েছে: ' || v_name_bn,
          p_body_en := 'A new reporting category was created in Admin.',
          p_body_bn := 'অ্যাডমিনে একটি নতুন রিপোর্টিং ক্যাটাগরি তৈরি করা হয়েছে।',
          p_actor_user_id := v_actor,
          p_target_type := NULL,
          p_target_id := NEW.id,
          p_target_label := v_name_en,
          p_metadata := jsonb_build_object('category_id', NEW.id, 'config_status', NEW.config_status),
          p_required_all_permissions := ARRAY['categories.manage'],
          p_required_any_permissions := '{}'::text[],
          p_audience_mode := 'permission',
          p_route := '/categories',
          p_dedupe_key := 'taxonomy.category_created:' || NEW.id,
          p_exclude_actor := true,
          p_include_super_admin := true
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Notification emission failed for taxonomy.category_created (%): %', NEW.id, SQLERRM;
      END;
    ELSIF TG_OP = 'UPDATE'
      AND NEW.config_status = 'published'
      AND (
        OLD.config_status IS DISTINCT FROM 'published'
        OR OLD.active IS DISTINCT FROM true
      )
    THEN
      BEGIN
        PERFORM public.admin_emit_notification(
          p_event_key := 'taxonomy.category_published',
          p_title_en := 'Category published: ' || v_name_en,
          p_title_bn := 'ক্যাটাগরি প্রকাশিত হয়েছে: ' || v_name_bn,
          p_body_en := 'A reporting category is now active on the public platform.',
          p_body_bn := 'একটি রিপোর্টিং ক্যাটাগরি এখন পাবলিক প্ল্যাটফর্মে সক্রিয়।',
          p_actor_user_id := v_actor,
          p_target_type := NULL,
          p_target_id := NEW.id,
          p_target_label := v_name_en,
          p_metadata := jsonb_build_object('category_id', NEW.id, 'active', NEW.active, 'config_status', NEW.config_status),
          p_required_all_permissions := ARRAY['categories.manage'],
          p_required_any_permissions := '{}'::text[],
          p_audience_mode := 'permission',
          p_route := '/categories',
          p_dedupe_key := 'taxonomy.category_published:' || NEW.id || ':' || COALESCE(NEW.updated_at::text, now()::text),
          p_exclude_actor := true,
          p_include_super_admin := true
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Notification emission failed for taxonomy.category_published (%): %', NEW.id, SQLERRM;
      END;
    END IF;

    RETURN NEW;
  END IF;

  -- subcategories
  v_name_en := COALESCE(NULLIF(NEW.name_en, ''), NEW.id);
  v_name_bn := COALESCE(NULLIF(NEW.name_bn, ''), NEW.id);

  IF TG_OP = 'INSERT' THEN
    BEGIN
      PERFORM public.admin_emit_notification(
        p_event_key := 'taxonomy.subcategory_created',
        p_title_en := 'Subcategory created: ' || v_name_en,
        p_title_bn := 'সাবক্যাটাগরি তৈরি হয়েছে: ' || v_name_bn,
        p_body_en := 'A new reporting subcategory was created in Admin.',
        p_body_bn := 'অ্যাডমিনে একটি নতুন রিপোর্টিং সাবক্যাটাগরি তৈরি করা হয়েছে।',
        p_actor_user_id := v_actor,
        p_target_type := NULL,
        p_target_id := NEW.id,
        p_target_label := v_name_en,
        p_metadata := jsonb_build_object('subcategory_id', NEW.id, 'category_id', NEW.segment_id),
        p_required_all_permissions := ARRAY['categories.manage'],
        p_required_any_permissions := '{}'::text[],
        p_audience_mode := 'permission',
        p_route := '/categories',
        p_dedupe_key := 'taxonomy.subcategory_created:' || NEW.id,
        p_exclude_actor := true,
        p_include_super_admin := true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Notification emission failed for taxonomy.subcategory_created (%): %', NEW.id, SQLERRM;
    END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.segment_id IS DISTINCT FROM OLD.segment_id THEN
      BEGIN
        PERFORM public.admin_emit_notification(
          p_event_key := 'taxonomy.subcategory_moved',
          p_title_en := 'Subcategory moved: ' || v_name_en,
          p_title_bn := 'সাবক্যাটাগরি স্থানান্তর হয়েছে: ' || v_name_bn,
          p_body_en := 'A reporting subcategory was moved to another category.',
          p_body_bn := 'একটি রিপোর্টিং সাবক্যাটাগরি অন্য ক্যাটাগরিতে স্থানান্তর করা হয়েছে।',
          p_actor_user_id := v_actor,
          p_target_type := NULL,
          p_target_id := NEW.id,
          p_target_label := v_name_en,
          p_metadata := jsonb_build_object(
            'subcategory_id', NEW.id,
            'previous_category_id', OLD.segment_id,
            'category_id', NEW.segment_id
          ),
          p_required_all_permissions := ARRAY['categories.manage'],
          p_required_any_permissions := '{}'::text[],
          p_audience_mode := 'permission',
          p_route := '/categories',
          p_dedupe_key := 'taxonomy.subcategory_moved:' || NEW.id || ':' || OLD.segment_id || ':' || NEW.segment_id || ':' || COALESCE(NEW.updated_at::text, now()::text),
          p_exclude_actor := true,
          p_include_super_admin := true
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Notification emission failed for taxonomy.subcategory_moved (%): %', NEW.id, SQLERRM;
      END;
    END IF;

    IF NEW.config_status = 'published'
      AND (
        OLD.config_status IS DISTINCT FROM 'published'
        OR OLD.active IS DISTINCT FROM true
      )
    THEN
      BEGIN
        PERFORM public.admin_emit_notification(
          p_event_key := 'taxonomy.subcategory_published',
          p_title_en := 'Subcategory published: ' || v_name_en,
          p_title_bn := 'সাবক্যাটাগরি প্রকাশিত হয়েছে: ' || v_name_bn,
          p_body_en := 'A reporting subcategory is now active on the public platform.',
          p_body_bn := 'একটি রিপোর্টিং সাবক্যাটাগরি এখন পাবলিক প্ল্যাটফর্মে সক্রিয়।',
          p_actor_user_id := v_actor,
          p_target_type := NULL,
          p_target_id := NEW.id,
          p_target_label := v_name_en,
          p_metadata := jsonb_build_object('subcategory_id', NEW.id, 'category_id', NEW.segment_id),
          p_required_all_permissions := ARRAY['categories.manage'],
          p_required_any_permissions := '{}'::text[],
          p_audience_mode := 'permission',
          p_route := '/categories',
          p_dedupe_key := 'taxonomy.subcategory_published:' || NEW.id || ':' || COALESCE(NEW.updated_at::text, now()::text),
          p_exclude_actor := true,
          p_include_super_admin := true
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Notification emission failed for taxonomy.subcategory_published (%): %', NEW.id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_publish_banner(p_category_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_version integer;
  v_content jsonb;
begin
  if auth.uid() is null or not public.has_permission('banners.manage') then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select draft_content
    into v_content
  from public.site_banners
  where category_key = p_category_key
  for update;

  if v_content is null then
    raise exception 'Unknown banner category';
  end if;

  if char_length(coalesce(v_content->>'mobileDescriptionBn', '')) <> 60
     or char_length(coalesce(v_content->>'tabletDescriptionBn', '')) <> 60
     or char_length(coalesce(v_content->>'desktopDescriptionBn', '')) <> 60 then
    raise exception 'Every Bengali banner description must be exactly 60 characters';
  end if;

  if char_length(coalesce(v_content->>'mobileDescriptionEn', '')) <> 62
     or char_length(coalesce(v_content->>'tabletDescriptionEn', '')) <> 62
     or char_length(coalesce(v_content->>'desktopDescriptionEn', '')) <> 62 then
    raise exception 'Every English banner description must be exactly 62 characters';
  end if;

  update public.site_banners
  set
    published_content = draft_content,
    published_at = now(),
    published_by = auth.uid(),
    version = version + 1
  where category_key = p_category_key
  returning version into v_version;

  return jsonb_build_object('ok', true, 'categoryKey', p_category_key, 'version', v_version);
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_publish_complaint(p_complaint_id text, p_public_title_bn text DEFAULT NULL::text, p_public_title_en text DEFAULT NULL::text, p_public_summary_bn text DEFAULT NULL::text, p_public_summary_en text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_complaint record;
  v_audit_id uuid;
  v_preferences jsonb;
  v_location text;
  v_public_title_bn text;
  v_public_title_en text;
  v_public_summary_bn text;
  v_public_summary_en text;
  v_show_description boolean;
  v_show_location boolean;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Access denied. Active administrative session required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission('complaints.publish') THEN
    RAISE EXCEPTION 'Access denied. You do not have permission to publish complaints.' USING ERRCODE = '42501';
  END IF;

  SELECT c.*, sc.name_bn AS subcategory_name_bn, sc.name_en AS subcategory_name_en
  INTO v_complaint
  FROM public.complaints c
  LEFT JOIN public.subcategories sc ON sc.id = c.subcategory_id
  WHERE c.id = p_complaint_id
  FOR UPDATE OF c;

  IF v_complaint.id IS NULL THEN
    RAISE EXCEPTION 'Complaint with ID % not found', p_complaint_id USING ERRCODE = 'P0002';
  END IF;

  IF v_complaint.origin_type = 'sourced_report' THEN
    IF public.canonical_division_name(v_complaint.division) IS NULL
       OR public.canonical_district_name(v_complaint.district) IS NULL THEN
      RAISE EXCEPTION 'SOURCE_LOCATION_REVIEW_REQUIRED: Select a valid division and district before publishing.'
        USING ERRCODE='22023';
    END IF;

    IF nullif(btrim(v_complaint.upazila_or_thana),'') IS NOT NULL
       AND public.canonical_upazila_name(v_complaint.upazila_or_thana,v_complaint.district) IS NULL THEN
      RAISE EXCEPTION 'SOURCE_LOCATION_REVIEW_REQUIRED: Select a valid upazila or thana before publishing.'
        USING ERRCODE='22023';
    END IF;

    IF coalesce(nullif(btrim(v_complaint.custom_field_answers->>'locationScope'),''),'specific') NOT IN ('specific','district_wide') THEN
      RAISE EXCEPTION 'SOURCE_LOCATION_REVIEW_REQUIRED: Choose a valid location scope before publishing.'
        USING ERRCODE='22023';
    END IF;

    IF coalesce(nullif(btrim(v_complaint.custom_field_answers->>'locationScope'),''),'specific') = 'specific'
       AND nullif(btrim(v_complaint.upazila_or_thana),'') IS NULL
       AND nullif(btrim(v_complaint.area),'') IS NULL
       AND nullif(btrim(v_complaint.road),'') IS NULL
       AND nullif(btrim(v_complaint.landmark),'') IS NULL
       AND (
         nullif(btrim(v_complaint.formatted_address),'') IS NULL
         OR lower(btrim(v_complaint.formatted_address)) = lower(btrim(coalesce(v_complaint.district,'')))
       ) THEN
      RAISE EXCEPTION 'SOURCE_LOCATION_REVIEW_REQUIRED: A specific source-backed incident location is required, or explicitly mark the report as district-wide.'
        USING ERRCODE='22023';
    END IF;
  END IF;

  IF v_complaint.status IS NULL OR v_complaint.status NOT IN ('submitted', 'unpublished') THEN
    RAISE EXCEPTION 'Cannot publish complaint with status "%". Only "submitted" or "unpublished" complaints can be published.', COALESCE(v_complaint.status, 'null') USING ERRCODE = '22023';
  END IF;

  v_preferences := COALESCE(v_complaint.publication_preferences, '{}'::jsonb);
  v_show_description := (v_preferences->'showDescription') = 'true'::jsonb;
  v_show_location := (v_preferences->'showGeneralLocation') = 'true'::jsonb;
  v_location := CASE WHEN v_show_location THEN COALESCE(NULLIF(btrim(v_complaint.area), ''), NULLIF(btrim(v_complaint.district), '')) ELSE NULL END;

  v_public_title_bn := COALESCE(
    NULLIF(btrim(p_public_title_bn), ''),
    NULLIF(btrim(v_preferences->>'publicTitleBn'), ''),
    CASE
      WHEN NULLIF(btrim(v_complaint.title), '') IS NOT NULL
       AND lower(btrim(v_complaint.title)) NOT IN (
         lower(COALESCE(v_complaint.subcategory_name_bn, '')),
         lower(COALESCE(v_complaint.subcategory_name_en, '')),
         'দোকান ও ব্যবসা',
         'shops & businesses'
       ) THEN btrim(v_complaint.title)
      ELSE NULL
    END,
    CASE v_complaint.subcategory_id
      WHEN 'bribe-demanded-service' THEN CASE WHEN v_location IS NOT NULL THEN v_location || '-এ ঘুষের অভিযোগ' ELSE 'ঘুষের অভিযোগ' END
      WHEN 'shop-business' THEN CASE WHEN v_location IS NOT NULL THEN v_location || '-এ দোকান ও ব্যবসা প্রতিষ্ঠানে চাঁদাবাজির অভিযোগ' ELSE 'দোকান ও ব্যবসা প্রতিষ্ঠানে চাঁদাবাজির অভিযোগ' END
      WHEN 'transport-movement' THEN CASE WHEN v_location IS NOT NULL THEN v_location || '-এ পরিবহন খাতে চাঁদাবাজির অভিযোগ' ELSE 'পরিবহন খাতে চাঁদাবাজির অভিযোগ' END
      WHEN 'construction-property' THEN CASE WHEN v_location IS NOT NULL THEN v_location || '-এ নির্মাণ/সম্পত্তি সংক্রান্ত চাঁদাবাজির অভিযোগ' ELSE 'নির্মাণ/সম্পত্তি সংক্রান্ত চাঁদাবাজির অভিযোগ' END
      WHEN 'threat-money-demand' THEN CASE WHEN v_location IS NOT NULL THEN v_location || '-এ হুমকি দিয়ে টাকা দাবির অভিযোগ' ELSE 'হুমকি দিয়ে টাকা দাবির অভিযোগ' END
      ELSE CASE
        WHEN v_location IS NOT NULL AND NULLIF(btrim(v_complaint.subcategory_name_bn), '') IS NOT NULL THEN v_location || '-এ ' || btrim(v_complaint.subcategory_name_bn) || ' সংক্রান্ত অভিযোগ'
        WHEN NULLIF(btrim(v_complaint.subcategory_name_bn), '') IS NOT NULL THEN btrim(v_complaint.subcategory_name_bn) || ' সংক্রান্ত অভিযোগ'
        ELSE COALESCE(NULLIF(btrim(v_complaint.title), ''), v_complaint.id)
      END
    END
  );

  v_public_title_en := COALESCE(
    NULLIF(btrim(p_public_title_en), ''),
    NULLIF(btrim(v_preferences->>'publicTitleEn'), ''),
    CASE
      WHEN NULLIF(btrim(v_complaint.title_en), '') IS NOT NULL
       AND lower(btrim(v_complaint.title_en)) NOT IN (
         lower(COALESCE(v_complaint.subcategory_name_en, '')),
         lower(COALESCE(v_complaint.subcategory_name_bn, '')),
         'shops & businesses'
       ) THEN btrim(v_complaint.title_en)
      ELSE NULL
    END,
    CASE v_complaint.subcategory_id
      WHEN 'bribe-demanded-service' THEN CASE WHEN v_location IS NOT NULL THEN 'Bribery complaint reported in ' || v_location ELSE 'Bribery complaint reported' END
      WHEN 'shop-business' THEN CASE WHEN v_location IS NOT NULL THEN 'Extortion from shops and businesses reported in ' || v_location ELSE 'Extortion from shops and businesses reported' END
      WHEN 'transport-movement' THEN CASE WHEN v_location IS NOT NULL THEN 'Transport extortion complaint reported in ' || v_location ELSE 'Transport extortion complaint reported' END
      WHEN 'construction-property' THEN CASE WHEN v_location IS NOT NULL THEN 'Construction or property extortion reported in ' || v_location ELSE 'Construction or property extortion reported' END
      WHEN 'threat-money-demand' THEN CASE WHEN v_location IS NOT NULL THEN 'Coercive money demand reported in ' || v_location ELSE 'Coercive money demand reported' END
      ELSE CASE
        WHEN v_location IS NOT NULL AND NULLIF(btrim(v_complaint.subcategory_name_en), '') IS NOT NULL THEN btrim(v_complaint.subcategory_name_en) || ' complaint reported in ' || v_location
        WHEN NULLIF(btrim(v_complaint.subcategory_name_en), '') IS NOT NULL THEN btrim(v_complaint.subcategory_name_en) || ' complaint reported'
        ELSE COALESCE(NULLIF(btrim(v_complaint.title_en), ''), NULLIF(btrim(v_complaint.title), ''), v_complaint.id)
      END
    END
  );

  v_public_summary_bn := COALESCE(
    NULLIF(btrim(p_public_summary_bn), ''),
    NULLIF(btrim(v_preferences->>'publicSummaryBn'), ''),
    CASE WHEN v_show_description AND NULLIF(btrim(v_complaint.description), '') IS NOT NULL THEN
      CASE WHEN char_length(btrim(v_complaint.description)) > 220 THEN regexp_replace(left(btrim(v_complaint.description), 220), '\s+\S*$', '') || '…' ELSE btrim(v_complaint.description) END
    ELSE NULL END
  );

  v_public_summary_en := COALESCE(
    NULLIF(btrim(p_public_summary_en), ''),
    NULLIF(btrim(v_preferences->>'publicSummaryEn'), ''),
    CASE WHEN v_show_description AND NULLIF(btrim(v_complaint.description_en), '') IS NOT NULL THEN
      CASE WHEN char_length(btrim(v_complaint.description_en)) > 220 THEN regexp_replace(left(btrim(v_complaint.description_en), 220), '\s+\S*$', '') || '…' ELSE btrim(v_complaint.description_en) END
    ELSE NULL END
  );

  v_preferences := v_preferences || jsonb_strip_nulls(jsonb_build_object(
    'publicTitleBn', v_public_title_bn,
    'publicTitleEn', v_public_title_en,
    'publicSummaryBn', v_public_summary_bn,
    'publicSummaryEn', v_public_summary_en
  ));

  UPDATE public.complaints SET status = 'published', publication_preferences = v_preferences, updated_at = now() WHERE id = v_complaint.id;

  INSERT INTO public.complaint_updates (complaint_id, update_type, note, is_public, created_at)
  VALUES (v_complaint.id, 'published', 'Complaint approved and published to public feed.', true, now());

  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(), 'complaint.publish', 'complaint', p_complaint_id,
    jsonb_build_object(
      'previous_status', v_complaint.status,
      'new_status', 'published',
      'public_title_bn', v_public_title_bn,
      'public_title_en', v_public_title_en,
      'has_public_summary_bn', v_public_summary_bn IS NOT NULL,
      'has_public_summary_en', v_public_summary_en IS NOT NULL,
      'timestamp', now()
    )
  ) RETURNING id INTO v_audit_id;

  PERFORM public.admin_emit_notification(
    p_event_key := 'complaint.published',
    p_title_en := 'Complaint published: ' || p_complaint_id,
    p_title_bn := 'অভিযোগ প্রকাশ করা হয়েছে: ' || p_complaint_id,
    p_body_en := 'Complaint ' || p_complaint_id || ' was approved and published to the public feed.',
    p_body_bn := 'অভিযোগ ' || p_complaint_id || ' অনুমোদন করে পাবলিক ফিডে প্রকাশ করা হয়েছে।',
    p_actor_user_id := auth.uid(),
    p_target_type := 'complaint',
    p_target_id := p_complaint_id,
    p_target_label := p_complaint_id,
    p_metadata := jsonb_build_object('complaint_id', p_complaint_id, 'previous_status', v_complaint.status, 'new_status', 'published', 'actor_user_id', auth.uid(), 'timestamp', now()),
    p_required_all_permissions := ARRAY['complaints.view'],
    p_required_any_permissions := '{}'::text[],
    p_audience_mode := 'permission',
    p_route := '/complaints/' || p_complaint_id,
    p_dedupe_key := 'complaint.published:oversight:' || v_audit_id::text,
    p_exclude_actor := true,
    p_include_super_admin := true
  );

  RETURN jsonb_build_object('success', true, 'complaint_id', p_complaint_id, 'status', 'published', 'previous_status', v_complaint.status, 'public_title_bn', v_public_title_bn, 'public_title_en', v_public_title_en);
END;
$function$;
CREATE OR REPLACE FUNCTION public.admin_record_news_intake_item(p_run_id uuid, p_item jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_run public.news_intake_runs%rowtype;
  v_source_date date;
  v_confidence numeric;
  v_id uuid;
  v_url text:=nullif(btrim(p_item->>'canonicalUrl'),'');
  v_action text:=nullif(btrim(p_item->>'action'),'');
  v_report_id text:=nullif(btrim(p_item->>'reportId'),'');
  v_item_kind text:=coalesce(nullif(btrim(p_item->>'itemKind'),''),'article');
  v_review_payload jsonb:=case
    when jsonb_typeof(p_item->'reviewPayload')='object' then p_item->'reviewPayload'
    else null
  end;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (not public.is_active_admin() or not public.has_permission('complaints.publish')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  select * into v_run
  from public.news_intake_runs
  where id=p_run_id
  for update;

  if v_run.id is null or v_run.started_by<>auth.uid() then
    raise exception 'News intake run not found.' using errcode='P0002';
  end if;
  if v_run.status<>'running' then
    raise exception 'News intake run is already closed.' using errcode='22023';
  end if;
  if v_item_kind not in ('source','article') then
    raise exception 'Invalid News Intake item kind.' using errcode='22023';
  end if;
  if v_url is null or v_url !~ '^https://[^/]+(?:/.*)?$' then
    raise exception 'A valid HTTPS canonical URL is required.' using errcode='22023';
  end if;
  if v_review_payload is not null and octet_length(v_review_payload::text)>65536 then
    raise exception 'News Intake review payload is too large.' using errcode='22023';
  end if;

  begin
    if nullif(btrim(p_item->>'sourcePublishedDate'),'') is not null then
      v_source_date:=(p_item->>'sourcePublishedDate')::date;
    end if;
    if nullif(btrim(p_item->>'confidence'),'') is not null then
      v_confidence:=(p_item->>'confidence')::numeric;
    end if;
  exception when others then
    raise exception 'Invalid News Intake item date or confidence.' using errcode='22023';
  end;

  insert into public.news_intake_run_items(
    run_id,item_kind,source_hostname,publisher_name,canonical_url,source_title,
    source_published_date,content_language,segment_id,subcategory_id,
    confidence,duplicate_status,action,report_id,reason,review_payload
  ) values (
    p_run_id,
    v_item_kind,
    coalesce(nullif(lower(btrim(p_item->>'sourceHostname')),''),'unknown'),
    coalesce(nullif(btrim(p_item->>'publisherName'),''),'Unknown source'),
    v_url,
    nullif(btrim(p_item->>'sourceTitle'),''),
    v_source_date,
    coalesce(nullif(btrim(p_item->>'contentLanguage'),''),'unknown'),
    nullif(btrim(p_item->>'segmentId'),''),
    nullif(btrim(p_item->>'subcategoryId'),''),
    v_confidence,
    nullif(btrim(p_item->>'duplicateStatus'),''),
    v_action,
    v_report_id,
    nullif(btrim(p_item->>'reason'),''),
    v_review_payload
  )
  on conflict (run_id,canonical_url) do update
  set item_kind=excluded.item_kind,
      source_title=excluded.source_title,
      source_published_date=excluded.source_published_date,
      content_language=excluded.content_language,
      segment_id=excluded.segment_id,
      subcategory_id=excluded.subcategory_id,
      confidence=excluded.confidence,
      duplicate_status=excluded.duplicate_status,
      action=excluded.action,
      report_id=excluded.report_id,
      reason=excluded.reason,
      review_payload=excluded.review_payload
  returning id into v_id;

  return jsonb_build_object('id',v_id,'runId',p_run_id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.location_mention_position(p_needle text, p_haystack text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_needle text:=lower(btrim(coalesce(p_needle,'')));
  v_hay text:=lower(coalesce(p_haystack,''));
  v_norm_needle text;
  v_norm_hay text;
  v_pos integer;
begin
  if v_needle='' then return 0; end if;

  if v_needle ~ '[ঀ-৿]' then
    return regexp_instr(
      v_hay,
      '(^|[^ঀ-৿])' || v_needle ||
      '(?:য়|য়|য়ে|য়ে|ে|র|এর|তে|য়ের|য়ের|েই|য়েই|য়েই)?($|[^ঀ-৿])',
      1,1,0,'i'
    );
  end if;

  v_norm_needle:=regexp_replace(v_needle,'[[:punct:][:space:]]+',' ','g');
  v_norm_hay:=' '||regexp_replace(v_hay,'[[:punct:][:space:]]+',' ','g')||' ';
  v_pos:=position(' '||v_norm_needle||' ' in v_norm_hay);
  return v_pos;
end
$function$;
CREATE OR REPLACE FUNCTION public.admin_resolve_news_intake_location(p_text text, p_language text DEFAULT 'unknown'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_raw text:=coalesce(p_text,'');
  v_dist record; v_dist_count integer:=0;
  v_up record; v_up_count integer:=0;
  v_div record;
  v_lang text:=case when lower(coalesce(p_language,''))='bn' then 'bn' else 'en' end;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (not public.is_active_admin() or not public.has_permission('complaints.publish')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  with matches as (
    select d.*,least(
      coalesce(nullif(public.location_mention_position(d.name_en,v_raw),0),2147483647),
      coalesce(nullif(public.location_mention_position(d.name_bn,v_raw),0),2147483647),
      coalesce((select min(nullif(public.location_mention_position(a,v_raw),0)) from unnest(d.aliases) a),2147483647)
    ) first_pos
    from public.bangladesh_districts d
  ), usable as (
    select m.* from matches m
    where m.first_pos<2147483647 and (
      not exists (
        select 1 from public.bangladesh_upazilas u
        where u.district_id<>m.id and (
          lower(u.name_en)=lower(m.name_en) or u.name_bn=m.name_bn
          or exists(select 1 from unnest(u.aliases) a where lower(a)=lower(m.name_en) or a=m.name_bn)
        )
      )
      or substring(v_raw from greatest(1,m.first_pos-18) for greatest(length(m.name_en),length(m.name_bn))+55)
           ~* '(district|city|জেলা|শহর|নগর|মহানগর)'
    )
  )
  select count(*) into v_dist_count from usable;

  with matches as (
    select d.*,least(
      coalesce(nullif(public.location_mention_position(d.name_en,v_raw),0),2147483647),
      coalesce(nullif(public.location_mention_position(d.name_bn,v_raw),0),2147483647),
      coalesce((select min(nullif(public.location_mention_position(a,v_raw),0)) from unnest(d.aliases) a),2147483647)
    ) first_pos
    from public.bangladesh_districts d
  ), usable as (
    select m.* from matches m
    where m.first_pos<2147483647 and (
      not exists (
        select 1 from public.bangladesh_upazilas u
        where u.district_id<>m.id and (
          lower(u.name_en)=lower(m.name_en) or u.name_bn=m.name_bn
          or exists(select 1 from unnest(u.aliases) a where lower(a)=lower(m.name_en) or a=m.name_bn)
        )
      )
      or substring(v_raw from greatest(1,m.first_pos-18) for greatest(length(m.name_en),length(m.name_bn))+55)
           ~* '(district|city|জেলা|শহর|নগর|মহানগর)'
    )
  )
  select * into v_dist from usable
  order by first_pos,greatest(length(name_en),length(name_bn)) desc,id limit 1;

  if v_dist_count>1 then
    return jsonb_build_object('division','','district','','upazilaOrThana','','area','','road','','landmark','','formattedAddress','','locationScope','multi_location','quality','multiple_locations','matchedSpecificLocations',0);
  end if;

  if v_dist.id is null and lower(v_raw) ~ 'রাজধানী' then
    select * into v_dist from public.bangladesh_districts where id='dhaka';
  end if;

  if v_dist.id is not null then
    with matched as (
      select u.*,least(
        coalesce(nullif(public.location_mention_position(u.name_en,v_raw),0),2147483647),
        coalesce(nullif(public.location_mention_position(u.name_bn,v_raw),0),2147483647),
        coalesce((select min(nullif(public.location_mention_position(a,v_raw),0)) from unnest(u.aliases) a),2147483647)
      ) first_pos
      from public.bangladesh_upazilas u where u.district_id=v_dist.id
    )
    select count(*) into v_up_count from matched where first_pos<2147483647;

    with matched as (
      select u.*,least(
        coalesce(nullif(public.location_mention_position(u.name_en,v_raw),0),2147483647),
        coalesce(nullif(public.location_mention_position(u.name_bn,v_raw),0),2147483647),
        coalesce((select min(nullif(public.location_mention_position(a,v_raw),0)) from unnest(u.aliases) a),2147483647)
      ) first_pos
      from public.bangladesh_upazilas u where u.district_id=v_dist.id
    )
    select * into v_up from matched where first_pos<2147483647
    order by first_pos,greatest(length(name_en),length(name_bn)) desc,id limit 1;

    select * into v_div from public.bangladesh_divisions where id=v_dist.division_id;

    if v_up_count=1 and v_up.id is not null then
      return jsonb_build_object(
        'division',v_div.name_en,'district',v_dist.name_en,'upazilaOrThana',v_up.name_en,
        'area','','road','','landmark','',
        'formattedAddress',case when v_lang='bn' then v_up.name_bn||', '||v_dist.name_bn else v_up.name_en||', '||v_dist.name_en end,
        'locationScope','specific','quality','specific','matchedSpecificLocations',1
      );
    elsif v_up_count>1 then
      return jsonb_build_object('division',v_div.name_en,'district',v_dist.name_en,'upazilaOrThana','','area','','road','','landmark','','formattedAddress','','locationScope','multi_location','quality','multiple_locations','matchedSpecificLocations',v_up_count);
    end if;

    return jsonb_build_object('division',v_div.name_en,'district',v_dist.name_en,'upazilaOrThana','','area','','road','','landmark','','formattedAddress','','locationScope','district_only','quality','district_only','matchedSpecificLocations',0);
  end if;

  with matched as (
    select u.*,least(
      coalesce(nullif(public.location_mention_position(u.name_en,v_raw),0),2147483647),
      coalesce(nullif(public.location_mention_position(u.name_bn,v_raw),0),2147483647),
      coalesce((select min(nullif(public.location_mention_position(a,v_raw),0)) from unnest(u.aliases) a),2147483647)
    ) first_pos
    from public.bangladesh_upazilas u
  ), usable as (
    select m.* from matched m
    where m.first_pos<2147483647
      and not exists (
        select 1 from public.bangladesh_districts d
        where lower(d.name_en)=lower(m.name_en) or d.name_bn=m.name_bn
      )
  )
  select count(*) into v_up_count from usable;

  if v_up_count=1 then
    with matched as (
      select u.*,least(
        coalesce(nullif(public.location_mention_position(u.name_en,v_raw),0),2147483647),
        coalesce(nullif(public.location_mention_position(u.name_bn,v_raw),0),2147483647),
        coalesce((select min(nullif(public.location_mention_position(a,v_raw),0)) from unnest(u.aliases) a),2147483647)
      ) first_pos
      from public.bangladesh_upazilas u
    ), usable as (
      select m.* from matched m
      where m.first_pos<2147483647
        and not exists (
          select 1 from public.bangladesh_districts d
          where lower(d.name_en)=lower(m.name_en) or d.name_bn=m.name_bn
        )
    )
    select * into v_up from usable
    order by first_pos,greatest(length(name_en),length(name_bn)) desc,id limit 1;

    select * into v_dist from public.bangladesh_districts where id=v_up.district_id;
    select * into v_div from public.bangladesh_divisions where id=v_dist.division_id;
    return jsonb_build_object(
      'division',v_div.name_en,'district',v_dist.name_en,'upazilaOrThana',v_up.name_en,
      'area','','road','','landmark','',
      'formattedAddress',case when v_lang='bn' then v_up.name_bn||', '||v_dist.name_bn else v_up.name_en||', '||v_dist.name_en end,
      'locationScope','specific','quality','specific','matchedSpecificLocations',1
    );
  end if;

  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.admin_save_banner_draft(p_category_key text, p_content jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_required text[]:=array['titleBn','titleEn','mobileDescriptionBn','mobileDescriptionEn','tabletDescriptionBn','tabletDescriptionEn','desktopDescriptionBn','desktopDescriptionEn','illustrationSrc','primaryCtaBn','primaryCtaEn']; v_key text; v_order integer;
begin
  if auth.uid() is null or not public.has_permission('banners.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if not exists(select 1 from public.site_banners where category_key=p_category_key) then raise exception 'Unknown banner category'; end if;
  if p_content is null or jsonb_typeof(p_content)<>'object' then raise exception 'Banner content must be a JSON object'; end if;
  foreach v_key in array v_required loop if nullif(btrim(p_content->>v_key),'') is null then raise exception 'Banner field % is required',v_key; end if; end loop;
  if jsonb_typeof(p_content->'showOnHome')<>'boolean' or jsonb_typeof(p_content->'isActive')<>'boolean' then raise exception 'Banner visibility fields must be boolean'; end if;
  if coalesce(p_content->>'sortOrder','') !~ '^[0-9]+$' then raise exception 'Banner sortOrder must be a positive integer'; end if;
  v_order:=(p_content->>'sortOrder')::integer; if v_order<1 or v_order>99 then raise exception 'Banner sortOrder must be between 1 and 99'; end if;
  update public.site_banners set draft_content=p_content,draft_updated_at=now(),draft_updated_by=auth.uid() where category_key=p_category_key;
  return jsonb_build_object('ok',true,'categoryKey',p_category_key);
end; $function$;
CREATE OR REPLACE FUNCTION public.can_manage_user_target(p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = p_target_user_id
    )
    INTO v_target_exists;

    IF NOT v_target_exists THEN
        RETURN FALSE;
    END IF;

    SELECT (active = true)
    INTO v_caller_is_active_admin
    FROM public.admin_users
    WHERE user_id = v_caller_id;

    IF v_caller_is_active_admin IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    IF NOT public.has_permission('admin_users.manage') THEN
        RETURN FALSE;
    END IF;

    SELECT COALESCE(is_super_admin, false)
    INTO v_target_is_super_admin
    FROM public.admin_users
    WHERE user_id = p_target_user_id;

    IF v_target_is_super_admin IS TRUE THEN
        RETURN FALSE;
    END IF;

    SELECT COALESCE(is_super_admin, false)
    INTO v_caller_is_super_admin
    FROM public.admin_users
    WHERE user_id = v_caller_id
      AND active = true;

    IF v_caller_is_super_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    SELECT NOT EXISTS (
        SELECT 1
        FROM public.user_roles
    )
    INTO v_bootstrap_mode;

    IF v_bootstrap_mode IS TRUE THEN
        RETURN TRUE;
    END IF;

    RETURN NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r
          ON r.id = ur.role_id
         AND r.active = true
        JOIN public.role_permissions rp
          ON rp.role_id = r.id
        WHERE ur.user_id = p_target_user_id
          AND rp.permission_id NOT IN (
              SELECT public.get_caller_effective_permission_set()
          )
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.capture_complaint_taxonomy_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_segment public.segments%rowtype;
  v_subcategory public.subcategories%rowtype;
begin
  select *
  into v_segment
  from public.segments
  where id = new.segment_id;

  select *
  into v_subcategory
  from public.subcategories
  where id = new.subcategory_id
    and segment_id = new.segment_id;

  if v_segment.id is not null and v_subcategory.id is not null then
    new.taxonomy_snapshot := jsonb_build_object(
      'segment', jsonb_build_object(
        'id', v_segment.id,
        'name_en', v_segment.name_en,
        'name_bn', v_segment.name_bn,
        'slug', v_segment.slug
      ),
      'subcategory', jsonb_build_object(
        'id', v_subcategory.id,
        'segment_id', v_subcategory.segment_id,
        'name_en', v_subcategory.name_en,
        'name_bn', v_subcategory.name_bn
      ),
      'captured_at', clock_timestamp()
    );
  elsif tg_op = 'INSERT' then
    new.taxonomy_snapshot := null;
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.location_text_language(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when nullif(btrim(coalesce(p_value,'')),'') is null then 'unknown'
    when p_value ~ '[ঀ-৿]' and p_value ~ '[A-Za-z]' then 'mixed'
    when p_value ~ '[ঀ-৿]' then 'bn'
    when p_value ~ '[A-Za-z]' then 'en'
    else 'unknown'
  end
$function$;
CREATE OR REPLACE FUNCTION public.compose_public_area(p_area text, p_upazila_label text, p_district_label text, p_lang text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare v_lang text:=case when lower(coalesce(p_lang,'en'))='bn' then 'bn' else 'en' end;
begin
  if nullif(btrim(coalesce(p_area,'')),'') is not null
     and public.location_text_language(p_area)=v_lang then
    return btrim(p_area);
  end if;
  return coalesce(nullif(btrim(p_upazila_label),''),nullif(btrim(p_district_label),''));
end
$function$;
CREATE OR REPLACE FUNCTION public.compose_public_location(p_formatted text, p_road text, p_area text, p_landmark text, p_upazila_label text, p_district_label text, p_lang text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_lang text:=case when lower(coalesce(p_lang,'en'))='bn' then 'bn' else 'en' end;
  v_parts text[]:='{}';
  v text;
begin
  if nullif(btrim(coalesce(p_formatted,'')),'') is not null
     and public.location_text_language(p_formatted)=v_lang then
    return btrim(p_formatted);
  end if;

  foreach v in array array[p_road,p_area,p_landmark] loop
    if nullif(btrim(coalesce(v,'')),'') is not null
       and public.location_text_language(v)=v_lang
       and not (btrim(v)=any(v_parts)) then
      v_parts:=array_append(v_parts,btrim(v));
    end if;
  end loop;

  foreach v in array array[p_upazila_label,p_district_label] loop
    if nullif(btrim(coalesce(v,'')),'') is not null
       and not (btrim(v)=any(v_parts)) then
      v_parts:=array_append(v_parts,btrim(v));
    end if;
  end loop;

  if array_length(v_parts,1) is null then return null; end if;
  return array_to_string(v_parts,', ');
end
$function$;
CREATE OR REPLACE FUNCTION public.enforce_public_complaint_submission_rate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_hour_visitor integer; v_hour_session integer; v_day_visitor integer;
begin
  if new.visitor_id is null or new.session_id is null then raise exception 'INVALID_SUBMISSION_CONTEXT'; end if;
  select count(*) into v_hour_visitor from public.complaint_submission_contexts c
    where c.visitor_id=new.visitor_id and c.created_at > now() - interval '1 hour';
  select count(*) into v_hour_session from public.complaint_submission_contexts c
    where c.session_id=new.session_id and c.created_at > now() - interval '1 hour';
  select count(*) into v_day_visitor from public.complaint_submission_contexts c
    where c.visitor_id=new.visitor_id and c.created_at > now() - interval '24 hours';
  if v_hour_visitor >= 5 or v_hour_session >= 3 or v_day_visitor >= 15 then raise exception 'RATE_LIMITED'; end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_public_visit_session_rate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_recent integer;
begin
  if exists (select 1 from public.public_visit_sessions s where s.session_id=new.session_id) then return new; end if;
  select count(*) into v_recent from public.public_visit_sessions s
    where s.visitor_id=new.visitor_id and s.created_at > now() - interval '1 hour';
  if v_recent >= 30 then raise exception 'RATE_LIMITED'; end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_published_source_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_complaint_id text;
  v_is_published_sourced boolean;
  v_other_verified integer;
begin
  v_complaint_id := case when tg_op = 'DELETE' then old.complaint_id else new.complaint_id end;

  select exists (
    select 1
    from public.complaints c
    where c.id = v_complaint_id
      and c.origin_type = 'sourced_report'
      and c.status = 'published'
  )
  into v_is_published_sourced;

  if not v_is_published_sourced then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    if new.verification_status <> 'verified'
       or new.is_final_detail_page is not true
       or new.verified_at is null
    then
      raise exception
        'SOURCE_VERIFICATION_REQUIRED: Sources attached to a published sourced report must remain verified final-detail sources.'
        using errcode='22023';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    select count(*)
    into v_other_verified
    from public.complaint_sources s
    where s.complaint_id = old.complaint_id
      and s.id <> old.id
      and s.verification_status = 'verified'
      and s.is_final_detail_page = true
      and s.verified_at is not null;

    if v_other_verified < 1 then
      raise exception
        'SOURCE_VERIFICATION_REQUIRED: A published sourced report must retain at least one verified final-detail source.'
        using errcode='22023';
    end if;

    return old;
  end if;

  return coalesce(new, old);
end;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_reporting_field_privacy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.config := coalesce(new.config,'{}'::jsonb);

  if new.storage_mode='custom_json'
     and new.field_type in ('phone','email') then
    new.config := jsonb_set(new.config,'{publicVisible}','false'::jsonb,true);
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_sourced_report_duplicate_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_eval jsonb;
  v_status text;
  v_candidate_ids text;
begin
  if new.status = 'published'
     and coalesce(old.status, '') <> 'published'
     and new.origin_type = 'sourced_report'
     and lower(coalesce(new.custom_field_answers->>'trustedSourceAuto','false'))<>'true' then

    v_eval := public.evaluate_sourced_report_duplicate_internal(new.id);
    v_status := coalesce(v_eval->>'status', 'clear');

    if v_status <> 'clear' then
      select string_agg(item->>'complaintId', ', ')
      into v_candidate_ids
      from jsonb_array_elements(coalesce(v_eval->'candidates', '[]'::jsonb)) item;

      raise exception
        'DUPLICATE_REVIEW_REQUIRED: Sourced report % has unresolved duplicate candidates (%). Review before publishing.',
        new.id,
        coalesce(nullif(v_candidate_ids, ''), v_status)
        using errcode='22023';
    end if;
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_sourced_report_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.status = 'published'
     and coalesce(old.status,'') <> 'published'
     and new.origin_type = 'sourced_report'
  then
    if not exists (
      select 1
      from public.complaint_sources s
      where s.complaint_id = new.id
        and s.verification_status = 'verified'
        and s.is_final_detail_page = true
        and s.verified_at is not null
        and s.canonical_url ~ '^https://[^/]+/.+'
    ) then
      raise exception
        'SOURCE_VERIFICATION_REQUIRED: Sourced reports require at least one verified final-detail source before publication.'
        using errcode='22023';
    end if;

    if exists (
      select 1
      from public.complaint_sources s
      where s.complaint_id = new.id
        and (
          s.verification_status <> 'verified'
          or s.is_final_detail_page = false
          or s.verified_at is null
        )
    ) then
      raise exception
        'SOURCE_VERIFICATION_REQUIRED: Every attached source must be verified and point to a final detail page before publication.'
        using errcode='22023';
    end if;
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_platform_sync_contract_version()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select '2026-09-19.3'::text
$function$;
CREATE OR REPLACE FUNCTION public.get_public_harassment_classifications()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'affectedPersonAgeGroup',c.affected_person_age_group,'allegedAbuserRelationship',c.alleged_abuser_relationship,'reportingFor',c.reporting_for) order by c.created_at desc,c.id desc),'[]'::jsonb) from public.complaints c where c.segment_id='harassment' and c.status='published' and c.affected_person_age_group is not null and c.alleged_abuser_relationship is not null and c.reporting_for is not null; $function$;
CREATE OR REPLACE FUNCTION public.get_public_home_feed(p_visitor_lat double precision DEFAULT NULL::double precision, p_visitor_lng double precision DEFAULT NULL::double precision, p_filter text DEFAULT 'all'::text, p_district text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_result jsonb;
  v_has_visitor_loc boolean := false;
  v_clean_filter text;
  v_clean_district text;
begin
  if p_visitor_lat is not null and p_visitor_lng is not null
     and p_visitor_lat >= -90.0 and p_visitor_lat <= 90.0
     and p_visitor_lng >= -180.0 and p_visitor_lng <= 180.0
     and not (p_visitor_lat = 0.0 and p_visitor_lng = 0.0) then
    v_has_visitor_loc := true;
  end if;

  v_clean_filter := lower(trim(coalesce(p_filter, 'all')));
  if v_clean_filter not in ('all', 'latest', 'popular', 'most_shared') then
    v_clean_filter := 'all';
  end if;

  v_clean_district := lower(coalesce(public.canonical_district_name(p_district), trim(coalesce(p_district, 'all'))));

  with base_complaints as (
    select
      c.id,
      c.segment_id,
      c.subcategory_id,
      c.origin_type,
      case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else coalesce(nullif(trim(c.publication_preferences->>'publicTitleBn'), ''), c.title) end as title_bn,
      case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(
        nullif(trim(c.publication_preferences->>'publicTitleEn'), ''),
        nullif(trim(c.title_en), ''),
        nullif(trim(c.publication_preferences->>'publicTitleBn'), ''),
        c.title
      ) end as title_en,
      case when (c.publication_preferences->'showDescription') = 'true'::jsonb
        then case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else coalesce(nullif(trim(c.publication_preferences->>'publicSummaryBn'), ''), c.description) end
        else null
      end as summary_bn,
      case when (c.publication_preferences->'showDescription') = 'true'::jsonb
        then case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(
          nullif(trim(c.publication_preferences->>'publicSummaryEn'), ''),
          nullif(trim(c.description_en), ''),
          nullif(trim(c.publication_preferences->>'publicSummaryBn'), ''),
          c.description
        ) end
        else null
      end as summary_en,
      case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else case when (c.publication_preferences->'showDescription') = 'true'::jsonb then c.description else null end end as description_bn,
      case when (c.publication_preferences->'showDescription') = 'true'::jsonb
        then case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(nullif(trim(c.description_en), ''), c.description) end
        else null
      end as description_en,
      case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then c.district else null end as district,
      case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then coalesce(loc_d.name_bn,case when public.location_text_language(c.district)='bn' then c.district end) else null end as district_bn,
      case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then coalesce(loc_d.name_en,case when public.location_text_language(c.district)='en' then c.district end) else null end as district_en,
      case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then c.area else null end as area,
      case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then public.compose_public_area(c.area,loc_u.name_bn,loc_d.name_bn,'bn') else null end as area_bn,
      case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then public.compose_public_area(c.area,loc_u.name_en,loc_d.name_en,'en') else null end as area_en,
      case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then coalesce(c.formatted_address,c.road,c.area,c.landmark,c.upazila_or_thana,c.district) else null end as location_display,
      case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then public.compose_public_location(c.formatted_address,c.road,c.area,c.landmark,loc_u.name_bn,loc_d.name_bn,'bn') else null end as location_bn,
      case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then public.compose_public_location(c.formatted_address,c.road,c.area,c.landmark,loc_u.name_en,loc_d.name_en,'en') else null end as location_en,
      c.incident_date,
      c.affected_person_age_group,
      c.alleged_abuser_relationship,
      c.reporting_for,
      c.incident_time,
      c.published_at as created_at,
      c.has_supporting_info,
      c.status,
      c.public_view_count,
      c.public_share_count,
      c.recent_bill_month,
      c.recent_bill_amount,
      c.previous_bill_month,
      c.previous_bill_amount,
      c.utility_end_time,
      case when (c.publication_preferences->'showSubjectName') = 'true'::jsonb then party.name else null end as party_name,
      case when (c.publication_preferences->'showOrganization') = 'true'::jsonb then party.organization else null end as party_org,
      case
        when v_has_visitor_loc
             and (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb
             and c.latitude is not null and c.longitude is not null
             and not (c.latitude = 0.0 and c.longitude = 0.0)
             and c.latitude >= -90.0 and c.latitude <= 90.0
             and c.longitude >= -180.0 and c.longitude <= 180.0
        then 6371.0 * 2.0 * atan2(
          sqrt(
            sin(radians(c.latitude - p_visitor_lat) / 2.0) * sin(radians(c.latitude - p_visitor_lat) / 2.0)
            + cos(radians(p_visitor_lat)) * cos(radians(c.latitude))
            * sin(radians(c.longitude - p_visitor_lng) / 2.0) * sin(radians(c.longitude - p_visitor_lng) / 2.0)
          ),
          sqrt(greatest(0.0, 1.0 - (
            sin(radians(c.latitude - p_visitor_lat) / 2.0) * sin(radians(c.latitude - p_visitor_lat) / 2.0)
            + cos(radians(p_visitor_lat)) * cos(radians(c.latitude))
            * sin(radians(c.longitude - p_visitor_lng) / 2.0) * sin(radians(c.longitude - p_visitor_lng) / 2.0)
          )))
        )
        else null
      end as internal_distance_km
    from public.complaints c
    left join public.bangladesh_districts loc_d
      on loc_d.name_en=c.district
    left join public.bangladesh_upazilas loc_u
      on loc_u.district_id=loc_d.id and loc_u.name_en=c.upazila_or_thana
    left join lateral (
      select
        case when count(*) = 1 then max(nullif(trim(cp.name), '')) else null end as name,
        case when count(*) = 1 then max(nullif(trim(cp.organization), '')) else null end as organization
      from public.complaint_parties cp
      where cp.complaint_id = c.id
        and (
          nullif(trim(cp.name), '') is not null
          or nullif(trim(cp.organization), '') is not null
          or nullif(trim(cp.role_or_designation), '') is not null
          or nullif(trim(cp.phone_or_contact), '') is not null
          or nullif(trim(cp.public_profile_handle), '') is not null
          or nullif(trim(cp.identifying_description), '') is not null
          or nullif(trim(cp.address), '') is not null
          or trim(coalesce(cp.party_type, '')) in ('individual', 'business', 'group', 'organization')
        )
    ) party on true
    where c.status = 'published'
      and (
        v_clean_district = 'all'
        or (
          (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb
          and lower(c.district) = v_clean_district
        )
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', bc.id,
        'segment', bc.segment_id,
        'subcategoryId', bc.subcategory_id,
        'postOrigin', case when bc.origin_type='sourced_report' then 'admin' else 'user' end,
        'subcategoryBn', coalesce((select sc.name_bn from public.subcategories sc where sc.id = bc.subcategory_id), bc.subcategory_id),
        'subcategoryEn', coalesce((select sc.name_en from public.subcategories sc where sc.id = bc.subcategory_id), bc.subcategory_id),
        'titleBn', bc.title_bn,
        'titleEn', bc.title_en,
        'summaryBn', bc.summary_bn,
        'summaryEn', bc.summary_en,
        'descriptionBn', bc.description_bn,
        'descriptionEn', bc.description_en,
        'reportedSubject', bc.party_name,
        'organization', bc.party_org,
        'district', bc.district,
        'districtBn', bc.district_bn,
        'districtEn', bc.district_en,
        'area', bc.area,
        'areaBn', bc.area_bn,
        'areaEn', bc.area_en,
        'location', coalesce(bc.location_en,bc.location_bn,bc.location_display),
        'locationBn', bc.location_bn,
        'locationEn', bc.location_en,
        'incidentDate', to_char(bc.incident_date, 'YYYY-MM-DD'),
        'affectedPersonAgeGroup', bc.affected_person_age_group,
        'allegedAbuserRelationship', bc.alleged_abuser_relationship,
        'reportingFor', bc.reporting_for,
        'incidentTime', case when bc.segment_id = 'load_shedding' and bc.subcategory_id in ('load-shedding-outage', 'gas-shortage') then bc.incident_time else null end,
        'incident_time', case when bc.segment_id = 'load_shedding' and bc.subcategory_id in ('load-shedding-outage', 'gas-shortage') then bc.incident_time else null end,
        'publishedAt', to_char(bc.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'priority', 'medium',
        'hasSupportingInfo', bc.has_supporting_info,
        'status', bc.status,
        'viewCount', bc.public_view_count,
        'shareCount', bc.public_share_count,
        'recentBillMonth', bc.recent_bill_month,
        'recentBillAmount', bc.recent_bill_amount,
        'previousBillMonth', bc.previous_bill_month,
        'previousBillAmount', bc.previous_bill_amount,
        'recent_bill_month', bc.recent_bill_month,
        'recent_bill_amount', bc.recent_bill_amount,
        'previous_bill_month', bc.previous_bill_month,
        'previous_bill_amount', bc.previous_bill_amount,
        'utilityEndTime', case when bc.segment_id = 'load_shedding' and bc.subcategory_id in ('load-shedding-outage', 'gas-shortage') then bc.utility_end_time else null end,
        'utility_end_time', case when bc.segment_id = 'load_shedding' and bc.subcategory_id in ('load-shedding-outage', 'gas-shortage') then bc.utility_end_time else null end
      )
      order by
        case when v_clean_filter = 'all' and v_has_visitor_loc then bc.internal_distance_km end asc nulls last,
        case when v_clean_filter = 'latest' then bc.created_at end desc nulls last,
        case when v_clean_filter = 'latest' and v_has_visitor_loc then bc.internal_distance_km end asc nulls last,
        case when v_clean_filter = 'popular' then bc.public_view_count end desc nulls last,
        case when v_clean_filter = 'popular' then bc.public_share_count end desc nulls last,
        case when v_clean_filter = 'popular' and v_has_visitor_loc then bc.internal_distance_km end asc nulls last,
        case when v_clean_filter = 'most_shared' then bc.public_share_count end desc nulls last,
        case when v_clean_filter = 'most_shared' then bc.public_view_count end desc nulls last,
        case when v_clean_filter = 'most_shared' and v_has_visitor_loc then bc.internal_distance_km end asc nulls last,
        bc.created_at desc,
        bc.id desc
    ),
    '[]'::jsonb
  ) into v_result
  from base_complaints bc;

  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_public_published_report(p_report_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_result jsonb; v_clean_id text;
BEGIN
  v_clean_id := upper(trim(coalesce(p_report_id, '')));
  IF v_clean_id = '' THEN RETURN NULL; END IF;
  SELECT (jsonb_build_object(
    'id', c.id,
    'reporterName', CASE WHEN c.privacy_choice = 'public_identity' AND c.confirm_public_identity = true THEN nullif(trim(c.reporter_name), '') ELSE NULL END,
    'segment', c.segment_id,
    'subcategoryId', c.subcategory_id,
    'postOrigin', case when c.origin_type='sourced_report' then 'admin' else 'user' end,
    'subcategoryBn', coalesce((SELECT sc.name_bn FROM public.subcategories sc WHERE sc.id = c.subcategory_id), c.subcategory_id),
    'subcategoryEn', coalesce((SELECT sc.name_en FROM public.subcategories sc WHERE sc.id = c.subcategory_id), c.subcategory_id),
    'titleBn', case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else coalesce(nullif(trim(c.publication_preferences->>'publicTitleBn'), ''), c.title) end,
    'titleEn', case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(nullif(trim(c.publication_preferences->>'publicTitleEn'), ''), nullif(trim(c.title_en), ''), nullif(trim(c.publication_preferences->>'publicTitleBn'), ''), c.title) end,
    'summaryBn', CASE WHEN (c.publication_preferences->'showDescription') = 'true'::jsonb THEN case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else coalesce(nullif(trim(c.publication_preferences->>'publicSummaryBn'), ''), c.description) end ELSE NULL END,
    'summaryEn', CASE WHEN (c.publication_preferences->'showDescription') = 'true'::jsonb THEN case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(nullif(trim(c.publication_preferences->>'publicSummaryEn'), ''), nullif(trim(c.description_en), ''), nullif(trim(c.publication_preferences->>'publicSummaryBn'), ''), c.description) end ELSE NULL END,
    'descriptionBn', case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else CASE WHEN (c.publication_preferences->'showDescription') = 'true'::jsonb THEN c.description ELSE NULL END end,
    'descriptionEn', CASE WHEN (c.publication_preferences->'showDescription') = 'true'::jsonb THEN case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(nullif(trim(c.description_en), ''), c.description) end ELSE NULL END,
    'reportedSubject', CASE WHEN (c.publication_preferences->'showSubjectName') = 'true'::jsonb THEN party.name ELSE NULL END,
    'organization', CASE WHEN (c.publication_preferences->'showOrganization') = 'true'::jsonb THEN party.organization ELSE NULL END,
    'district', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN c.district ELSE NULL END,
    'districtBn', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN coalesce(loc_d.name_bn,case when public.location_text_language(c.district)='bn' then c.district end) ELSE NULL END,
    'districtEn', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN coalesce(loc_d.name_en,case when public.location_text_language(c.district)='en' then c.district end) ELSE NULL END,
    'area', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN c.area ELSE NULL END,
    'areaBn', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN public.compose_public_area(c.area,loc_u.name_bn,loc_d.name_bn,'bn') ELSE NULL END,
    'areaEn', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN public.compose_public_area(c.area,loc_u.name_en,loc_d.name_en,'en') ELSE NULL END,
    'location', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN coalesce(public.compose_public_location(c.formatted_address,c.road,c.area,c.landmark,loc_u.name_en,loc_d.name_en,'en'),public.compose_public_location(c.formatted_address,c.road,c.area,c.landmark,loc_u.name_bn,loc_d.name_bn,'bn'),c.formatted_address,c.road,c.area,c.landmark,c.upazila_or_thana,c.district) ELSE NULL END,
    'locationBn', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN public.compose_public_location(c.formatted_address,c.road,c.area,c.landmark,loc_u.name_bn,loc_d.name_bn,'bn') ELSE NULL END,
    'locationEn', CASE WHEN (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb THEN public.compose_public_location(c.formatted_address,c.road,c.area,c.landmark,loc_u.name_en,loc_d.name_en,'en') ELSE NULL END,
    'incidentDate', to_char(c.incident_date, 'YYYY-MM-DD'),
    'affectedPersonAgeGroup', c.affected_person_age_group,
    'allegedAbuserRelationship', c.alleged_abuser_relationship,
    'reportingFor', c.reporting_for,
    'intimateWhatHappened', CASE WHEN c.segment_id = 'harassment' AND c.subcategory_id = 'blackmail-coercion' THEN c.intimate_what_happened #>> '{}' ELSE NULL END,
    'intimatePlatform', CASE WHEN c.segment_id = 'harassment' AND c.subcategory_id = 'blackmail-coercion' THEN c.intimate_platform #>> '{}' ELSE NULL END,
    'briberyDepartment', CASE WHEN c.segment_id = 'extortion' AND c.subcategory_id = 'bribe-demanded-service' THEN c.bribery_department ELSE NULL END,
    'briberyService', CASE WHEN c.segment_id = 'extortion' AND c.subcategory_id = 'bribe-demanded-service' THEN c.bribery_service ELSE NULL END
  ) || jsonb_build_object(
    'briberyAmount', CASE WHEN c.segment_id = 'extortion' AND c.subcategory_id = 'bribe-demanded-service' THEN c.bribery_amount ELSE NULL END,
    'bribery_department', CASE WHEN c.segment_id = 'extortion' AND c.subcategory_id = 'bribe-demanded-service' THEN c.bribery_department ELSE NULL END,
    'bribery_service', CASE WHEN c.segment_id = 'extortion' AND c.subcategory_id = 'bribe-demanded-service' THEN c.bribery_service ELSE NULL END,
    'bribery_amount', CASE WHEN c.segment_id = 'extortion' AND c.subcategory_id = 'bribe-demanded-service' THEN c.bribery_amount ELSE NULL END,
    'frequency', CASE WHEN c.segment_id = 'extortion' THEN c.frequency ELSE NULL END,
    'incidentTime', CASE WHEN (c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage')) OR c.segment_id = 'extortion' THEN c.incident_time ELSE NULL END,
    'incident_time', CASE WHEN (c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage')) OR c.segment_id = 'extortion' THEN c.incident_time ELSE NULL END,
    'publishedAt', to_char(c.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updatedAt', to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'priority', 'medium',
    'hasSupportingInfo', c.has_supporting_info,
    'status', c.status,
    'viewCount', c.public_view_count,
    'shareCount', c.public_share_count,
    'recentBillMonth', c.recent_bill_month,
    'recentBillAmount', c.recent_bill_amount,
    'previousBillMonth', c.previous_bill_month,
    'previousBillAmount', c.previous_bill_amount,
    'recent_bill_month', c.recent_bill_month,
    'recent_bill_amount', c.recent_bill_amount,
    'previous_bill_month', c.previous_bill_month,
    'previous_bill_amount', c.previous_bill_amount,
    'utilityEndTime', CASE WHEN c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN c.utility_end_time ELSE NULL END,
    'utility_end_time', CASE WHEN c.segment_id = 'load_shedding' AND c.subcategory_id IN ('load-shedding-outage', 'gas-shortage') THEN c.utility_end_time ELSE NULL END
  )) INTO v_result
  FROM public.complaints c
  LEFT JOIN public.bangladesh_districts loc_d ON loc_d.name_en=c.district
  LEFT JOIN public.bangladesh_upazilas loc_u ON loc_u.district_id=loc_d.id AND loc_u.name_en=c.upazila_or_thana
  LEFT JOIN LATERAL (
    SELECT CASE WHEN count(*) = 1 THEN max(nullif(trim(cp.name), '')) ELSE NULL END AS name,
           CASE WHEN count(*) = 1 THEN max(nullif(trim(cp.organization), '')) ELSE NULL END AS organization
    FROM public.complaint_parties cp
    WHERE cp.complaint_id = c.id AND (
      nullif(trim(cp.name), '') IS NOT NULL OR nullif(trim(cp.organization), '') IS NOT NULL OR nullif(trim(cp.role_or_designation), '') IS NOT NULL OR nullif(trim(cp.phone_or_contact), '') IS NOT NULL OR nullif(trim(cp.public_profile_handle), '') IS NOT NULL OR nullif(trim(cp.identifying_description), '') IS NOT NULL OR nullif(trim(cp.address), '') IS NOT NULL OR trim(coalesce(cp.party_type, '')) IN ('individual', 'business', 'group', 'organization')
    )
  ) party ON true
  WHERE upper(c.id) = v_clean_id AND c.status = 'published';
  RETURN v_result;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_public_published_report_evidence(p_report_ids text[])
 RETURNS TABLE(report_id text, evidence_id uuid, storage_path text, mime_type text, media_type text, caption text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN

  -- Empty request = no result
  IF p_report_ids IS NULL
     OR coalesce(array_length(p_report_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  -- Prevent unreasonable bulk requests
  IF array_length(p_report_ids, 1) > 100 THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Too many report IDs requested.';
  END IF;

  RETURN QUERY
  SELECT
    e.complaint_id,
    e.id,
    e.storage_path,
    e.mime_type,
    e.media_type,
    e.caption,
    e.created_at
  FROM public.complaint_evidence e
  INNER JOIN public.complaints c
    ON c.id = e.complaint_id
  WHERE
    c.status = 'published'
    AND e.storage_path IS NOT NULL
    AND e.complaint_id = ANY(p_report_ids)
  ORDER BY
    e.complaint_id,
    e.created_at ASC;

END;
$function$;
CREATE OR REPLACE FUNCTION public.get_public_published_reports()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_result jsonb;
begin
  select coalesce(
    jsonb_agg(
      (
        jsonb_build_object(
          'id', c.id,
          'segment', c.segment_id,
          'subcategoryId', c.subcategory_id,
          'postOrigin', case when c.origin_type='sourced_report' then 'admin' else 'user' end,
          'subcategoryBn', coalesce((select sc.name_bn from public.subcategories sc where sc.id = c.subcategory_id), c.subcategory_id),
          'subcategoryEn', coalesce((select sc.name_en from public.subcategories sc where sc.id = c.subcategory_id), c.subcategory_id),
          'titleBn', case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else coalesce(nullif(trim(c.publication_preferences->>'publicTitleBn'), ''), c.title) end,
          'titleEn', case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(nullif(trim(c.publication_preferences->>'publicTitleEn'), ''), nullif(trim(c.title_en), ''), nullif(trim(c.publication_preferences->>'publicTitleBn'), ''), c.title) end,
          'summaryBn', case when (c.publication_preferences->'showDescription') = 'true'::jsonb then case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else coalesce(nullif(trim(c.publication_preferences->>'publicSummaryBn'), ''), c.description) end else null end,
          'summaryEn', case when (c.publication_preferences->'showDescription') = 'true'::jsonb then case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(nullif(trim(c.publication_preferences->>'publicSummaryEn'), ''), nullif(trim(c.description_en), ''), nullif(trim(c.publication_preferences->>'publicSummaryBn'), ''), c.description) end else null end,
          'descriptionBn', case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='en' then null else case when (c.publication_preferences->'showDescription') = 'true'::jsonb then c.description else null end end,
          'descriptionEn', case when (c.publication_preferences->'showDescription') = 'true'::jsonb then case when c.origin_type='sourced_report' and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))='bn' then null else coalesce(nullif(trim(c.description_en), ''), c.description) end else null end,
          'reportedSubject', case when (c.publication_preferences->'showSubjectName') = 'true'::jsonb then party.name else null end,
          'organization', case when (c.publication_preferences->'showOrganization') = 'true'::jsonb then party.organization else null end,
          'district', case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then c.district else null end,
          'districtBn', case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then district_match.name_bn else null end,
          'districtEn', case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then district_match.name_en else null end,
          'upazilaId', case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then upazila_match.id else null end,
          'upazilaBn', case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then upazila_match.name_bn else null end,
          'upazilaEn', case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then upazila_match.name_en else null end,
          'area', case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then c.area else null end,
          'areaBn', case
            when (c.publication_preferences->'showGeneralLocation') <> 'true'::jsonb then null
            when nullif(btrim(coalesce(c.area,'')),'') is not null and public.location_text_language(c.area)='bn' then btrim(c.area)
            when upazila_match.name_bn is not null then upazila_match.name_bn
            else district_match.name_bn
          end,
          'areaEn', case
            when (c.publication_preferences->'showGeneralLocation') <> 'true'::jsonb then null
            when nullif(btrim(coalesce(c.area,'')),'') is not null and public.location_text_language(c.area)='en' then btrim(c.area)
            when upazila_match.name_en is not null then upazila_match.name_en
            else district_match.name_en
          end,
          'location', case
            when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb
            then coalesce(location_parts.location_en, location_parts.location_bn, c.formatted_address, c.road, c.area, c.landmark, c.upazila_or_thana, c.district)
            else null
          end,
          'locationBn', case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then location_parts.location_bn else null end,
          'locationEn', case when (c.publication_preferences->'showGeneralLocation') = 'true'::jsonb then location_parts.location_en else null end,
          'incidentDate', to_char(c.incident_date, 'YYYY-MM-DD'),
          'affectedPersonAgeGroup', c.affected_person_age_group,
          'allegedAbuserRelationship', c.alleged_abuser_relationship,
          'reportingFor', c.reporting_for,
          'briberyDepartment', case when c.segment_id = 'extortion' and c.subcategory_id = 'bribe-demanded-service' then c.bribery_department else null end,
          'briberyService', case when c.segment_id = 'extortion' and c.subcategory_id = 'bribe-demanded-service' then c.bribery_service else null end
        )
        ||
        jsonb_build_object(
          'briberyAmount', case when c.segment_id = 'extortion' and c.subcategory_id = 'bribe-demanded-service' then c.bribery_amount else null end,
          'bribery_department', case when c.segment_id = 'extortion' and c.subcategory_id = 'bribe-demanded-service' then c.bribery_department else null end,
          'bribery_service', case when c.segment_id = 'extortion' and c.subcategory_id = 'bribe-demanded-service' then c.bribery_service else null end,
          'bribery_amount', case when c.segment_id = 'extortion' and c.subcategory_id = 'bribe-demanded-service' then c.bribery_amount else null end,
          'frequency', case when c.segment_id = 'extortion' then c.frequency else null end,
          'incidentTime', case when (c.segment_id = 'load_shedding' and c.subcategory_id in ('load-shedding-outage', 'gas-shortage')) or c.segment_id = 'extortion' then c.incident_time else null end,
          'incident_time', case when (c.segment_id = 'load_shedding' and c.subcategory_id in ('load-shedding-outage', 'gas-shortage')) or c.segment_id = 'extortion' then c.incident_time else null end,
          'publishedAt', to_char(c.published_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'updatedAt', to_char(c.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'priority', 'medium',
          'hasSupportingInfo', c.has_supporting_info,
          'status', c.status,
          'viewCount', c.public_view_count,
          'shareCount', c.public_share_count,
          'recentBillMonth', c.recent_bill_month,
          'recentBillAmount', c.recent_bill_amount,
          'previousBillMonth', c.previous_bill_month,
          'previousBillAmount', c.previous_bill_amount,
          'recent_bill_month', c.recent_bill_month,
          'recent_bill_amount', c.recent_bill_amount,
          'previous_bill_month', c.previous_bill_month,
          'previous_bill_amount', c.previous_bill_amount,
          'utilityEndTime', case when c.segment_id = 'load_shedding' and c.subcategory_id in ('load-shedding-outage', 'gas-shortage') then c.utility_end_time else null end,
          'utility_end_time', case when c.segment_id = 'load_shedding' and c.subcategory_id in ('load-shedding-outage', 'gas-shortage') then c.utility_end_time else null end
        )
      )
      order by c.published_at desc, c.id desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.complaints c
  left join lateral (
    select
      case when count(*) = 1 then max(nullif(trim(cp.name), '')) else null end as name,
      case when count(*) = 1 then max(nullif(trim(cp.organization), '')) else null end as organization
    from public.complaint_parties cp
    where cp.complaint_id = c.id
      and (
        nullif(trim(cp.name), '') is not null
        or nullif(trim(cp.organization), '') is not null
        or nullif(trim(cp.role_or_designation), '') is not null
        or nullif(trim(cp.phone_or_contact), '') is not null
        or nullif(trim(cp.public_profile_handle), '') is not null
        or nullif(trim(cp.identifying_description), '') is not null
        or nullif(trim(cp.address), '') is not null
        or trim(coalesce(cp.party_type, '')) in ('individual', 'business', 'group', 'organization')
      )
  ) party on true
  left join lateral (
    select d.id, d.name_bn, d.name_en
    from public.bangladesh_districts d
    where lower(btrim(coalesce(c.district,''))) in (lower(d.id),lower(d.name_en),lower(d.name_bn))
       or exists (
         select 1
         from unnest(d.aliases) alias_value
         where lower(alias_value)=lower(btrim(coalesce(c.district,'')))
       )
    limit 1
  ) district_match on true
  left join lateral (
    select u.id, u.name_bn, u.name_en, u.district_id
    from public.bangladesh_upazilas u
    where (
      lower(btrim(coalesce(c.upazila_or_thana,''))) in (lower(u.id),lower(u.name_en),lower(u.name_bn))
      or exists (
        select 1
        from unnest(u.aliases) alias_value
        where lower(alias_value)=lower(btrim(coalesce(c.upazila_or_thana,'')))
      )
    )
    and (
      nullif(btrim(coalesce(c.district,'')),'') is null
      or (district_match.id is not null and u.district_id=district_match.id)
    )
    order by case when district_match.id is not null and u.district_id=district_match.id then 0 else 1 end, u.id
    limit 1
  ) upazila_match on true
  left join lateral (
    select
      case
        when nullif(btrim(coalesce(c.formatted_address,'')),'') is not null
         and public.location_text_language(c.formatted_address)='bn'
        then btrim(c.formatted_address)
        else (
          select string_agg(dedup.value, ', ' order by dedup.first_ord)
          from (
            select part.value, min(part.ord) as first_ord
            from unnest(array[
              case when nullif(btrim(coalesce(c.road,'')),'') is not null and public.location_text_language(c.road)='bn' then btrim(c.road) end,
              case when nullif(btrim(coalesce(c.area,'')),'') is not null and public.location_text_language(c.area)='bn' then btrim(c.area) end,
              case when nullif(btrim(coalesce(c.landmark,'')),'') is not null and public.location_text_language(c.landmark)='bn' then btrim(c.landmark) end,
              coalesce(upazila_match.name_bn, case when public.location_text_language(c.upazila_or_thana)='bn' then btrim(c.upazila_or_thana) end),
              coalesce(district_match.name_bn, case when public.location_text_language(c.district)='bn' then btrim(c.district) end)
            ]) with ordinality as part(value, ord)
            where nullif(part.value,'') is not null
            group by part.value
          ) dedup
        )
      end as location_bn,
      case
        when nullif(btrim(coalesce(c.formatted_address,'')),'') is not null
         and public.location_text_language(c.formatted_address)='en'
        then btrim(c.formatted_address)
        else (
          select string_agg(dedup.value, ', ' order by dedup.first_ord)
          from (
            select part.value, min(part.ord) as first_ord
            from unnest(array[
              case when nullif(btrim(coalesce(c.road,'')),'') is not null and public.location_text_language(c.road)='en' then btrim(c.road) end,
              case when nullif(btrim(coalesce(c.area,'')),'') is not null and public.location_text_language(c.area)='en' then btrim(c.area) end,
              case when nullif(btrim(coalesce(c.landmark,'')),'') is not null and public.location_text_language(c.landmark)='en' then btrim(c.landmark) end,
              coalesce(upazila_match.name_en, case when public.location_text_language(c.upazila_or_thana)='en' then btrim(c.upazila_or_thana) end),
              coalesce(district_match.name_en, case when public.location_text_language(c.district)='en' then btrim(c.district) end)
            ]) with ordinality as part(value, ord)
            where nullif(part.value,'') is not null
            group by part.value
          ) dedup
        )
      end as location_en
  ) location_parts on true
  where c.status = 'published';

  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_public_published_responses(p_report_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_report_id text;
  v_result jsonb;
BEGIN
  v_report_id := NULLIF(upper(btrim(p_report_id)), '');

  IF v_report_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'responseType', r.response_type,
        'content', r.content,
        'incidentDate', r.incident_date,
        'publishedAt', r.published_at,
        'responderType',
          CASE
            WHEN r.response_type = 'subject_response'
            THEN r.responder_type
            ELSE NULL
          END,
        'responderName',
          CASE
            WHEN r.response_type = 'subject_response'
            THEN r.responder_name
            ELSE NULL
          END,
        'designation',
          CASE
            WHEN r.response_type = 'subject_response'
            THEN r.designation
            ELSE NULL
          END,
        'organizationName',
          CASE
            WHEN r.response_type = 'subject_response'
            THEN r.organization_name
            ELSE NULL
          END
      )
      ORDER BY
        r.published_at ASC NULLS LAST,
        r.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.complaint_responses r
  JOIN public.complaints c
    ON c.id = r.complaint_id
  WHERE c.id = v_report_id
    AND c.status = 'published'
    AND r.status = 'published';

  RETURN v_result;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_public_site_banners()
 RETURNS TABLE(category_key text, content jsonb, version integer, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select b.category_key, b.published_content, b.version, b.published_at
  from public.site_banners b
  join public.segments s on s.id = b.category_key
  where s.active = true
    and s.config_status = 'published'
  order by coalesce((b.published_content->>'sortOrder')::integer, 999), b.category_key;
$function$;
CREATE OR REPLACE FUNCTION public.guard_automated_sourced_report_collision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.origin_type='sourced_report'
     and coalesce(new.custom_field_answers->>'automatedIntake','false')='true'
     and lower(coalesce(new.custom_field_answers->>'trustedSourceAuto','false'))<>'true'
     and exists(
       select 1
       from public.complaints c
       where c.origin_type='sourced_report'
         and c.status in ('submitted','published','unpublished','edited')
         and c.subcategory_id=new.subcategory_id
         and c.incident_date=new.incident_date
         and public.normalize_duplicate_text(c.district)=public.normalize_duplicate_text(new.district)
     ) then
    raise exception 'DUPLICATE_REVIEW_REQUIRED: Automated sourced report collides with an existing same-category, same-date, same-district report.'
      using errcode='P0001';
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.guard_sourced_report_publish_readiness()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_privacy_review_required boolean:=false;
begin
  if new.origin_type = 'sourced_report'
     and new.status = 'published'
     and old.status is distinct from 'published' then

    if coalesce(new.custom_field_answers->>'newsIntakeReviewRequired','false') = 'true' then
      raise exception 'SOURCE_GROUNDING_REVIEW_REQUIRED: This sourced report is flagged for review before publication.'
        using errcode='22023';
    end if;

    if lower(coalesce(new.custom_field_answers->>'trustedSourceAuto','false'))='true'
       and coalesce(new.custom_field_answers->>'sourceTruthMode','')='approved_publisher' then
      return new;
    end if;

    v_privacy_review_required:=public.news_intake_privacy_review_required(new.subcategory_id);

    if v_privacy_review_required
       and lower(coalesce(new.custom_field_answers->>'sensitiveContentReviewed','false')) <> 'true' then
      raise exception 'SOURCE_SENSITIVE_CONTENT_REVIEW_REQUIRED: Review the public title, summary, location, and identifying details before publishing this sensitive sourced report.'
        using errcode='22023';
    end if;
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.guard_sourced_report_schema_requirements()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_report jsonb;
  v_missing jsonb;
  v_omitted jsonb:='[]'::jsonb;
begin
  if new.origin_type<>'sourced_report' then
    return new;
  end if;


  v_report:=jsonb_build_object(
    'titleBn',new.title,
    'titleEn',new.title_en,
    'descriptionBn',new.description,
    'descriptionEn',new.description_en,
    'division',new.division,
    'district',new.district,
    'upazilaOrThana',new.upazila_or_thana,
    'area',new.area,
    'road',new.road,
    'landmark',new.landmark,
    'formattedAddress',new.formatted_address,
    'frequency',new.frequency,
    'incidentDate',case when new.incident_date is null then null else to_jsonb(new.incident_date::text) end,
    'incidentTime',case when new.incident_time is null then null else to_jsonb(new.incident_time::text) end,
    'utilityEndTime',case when new.utility_end_time is null then null else to_jsonb(new.utility_end_time::text) end,
    'recentBillMonth',new.recent_bill_month,
    'recentBillAmount',new.recent_bill_amount,
    'previousBillMonth',new.previous_bill_month,
    'previousBillAmount',new.previous_bill_amount,
    'briberyDepartment',new.bribery_department,
    'briberyService',new.bribery_service,
    'briberyAmount',new.bribery_amount,
    'affectedPersonAgeGroup',new.affected_person_age_group,
    'allegedAbuserRelationship',new.alleged_abuser_relationship,
    'reportingFor',new.reporting_for,
    'sexualHarassmentType',new.sexual_harassment_type,
    'sexualHarassmentContext',new.sexual_harassment_context,
    'sexualHarassmentInstitution',new.sexual_harassment_institution,
    'intimateWhatHappened',new.intimate_what_happened,
    'intimatePlatform',new.intimate_platform,
    'mobJusticeDetails',new.mob_justice_details,
    'customFieldAnswers',coalesce(new.custom_field_answers,'{}'::jsonb)
  );

  v_missing:=public.sourced_report_missing_required_fields_internal(
    new.subcategory_id,
    v_report
  );

  if lower(coalesce(new.custom_field_answers->>'trustedSourceAuto','false'))='true' then
    v_omitted:=coalesce(new.custom_field_answers->'sourceOmittedFields','[]'::jsonb);
    if jsonb_typeof(v_omitted)<>'array' then v_omitted:='[]'::jsonb; end if;

    select coalesce(jsonb_agg(item),'[]'::jsonb)
    into v_missing
    from jsonb_array_elements(v_missing) item
    where not exists (
      select 1
      from jsonb_array_elements_text(v_omitted) omitted(value)
      where omitted.value in (item->>'fieldKey',item->>'storageKey')
         or (
           omitted.value='location'
           and (
             item->>'storageKey'='location'
             or item->>'fieldKey' in ('canonicalLocation','locationSpecificity')
           )
         )
    );
  end if;

  if jsonb_array_length(v_missing)>0 then
    raise exception 'SCHEMA_REQUIRED_FIELDS_MISSING: %',v_missing::text
      using errcode='P0001';
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.news_intake_has_explicit_past_relative_date(p_value text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(p_value,'') ~* '(গতকাল|গত[[:space:]]+(রবিবার|রোববার|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার)|yesterday|last[[:space:]]+(sunday|monday|tuesday|wednesday|thursday|friday|saturday))'
$function$;
CREATE OR REPLACE FUNCTION public.news_intake_specific_location_text_is_safe(p_value text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
select case
  when nullif(btrim(coalesce(p_value,'')),'') is null then false
  when char_length(btrim(p_value))<5 or char_length(btrim(p_value))>120 then false
  when lower(btrim(p_value)) ~ '^(area|market|bazaar|thana|upazila|union|village|city|road|street|lane|station)$' then false
  when lower(btrim(p_value)) ~ '^(on|at|in|near)[[:space:]]+(the[[:space:]]+)?(road|street|lane|area|city|district|station)([[:space:]]+[0-9]+)?$' then false
  when lower(p_value) ~ '(various|several)[[:space:]]+areas?' then false
  when p_value ~ '(বিভিন্ন)[[:space:]]+এলাকা' then false
  when btrim(p_value) ~ '^(?:[০-৯0-9]{1,2}[[:space:]]+)?(?:জানুয়ারি|জানুয়ারি|ফেব্রুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর|সকাল|দুপুর|বিকেল|সন্ধ্যা|রাত)' then false
  when lower(btrim(p_value)) ~ '^(?:[0-9]{1,2}[[:space:]]+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|morning|afternoon|evening|night)([[:space:]]|$)' then false
  when btrim(p_value) ~ '^(গত|পূর্ববর্তী)[[:space:]]+(বছর(ের)?|মাস(ের)?|সপ্তাহ(ের)?|দিন(ের)?)([[:space:]]|$)' then false
  when lower(btrim(p_value)) ~ '^(last|previous)[[:space:]]+(year|month|week|day)([[:space:]]|$)' then false
  when p_value ~ '(জেলার).{0,90}([[:space:]]ও[[:space:]]|[[:space:]]এবং[[:space:]]|,).{0,90}(উপজেলা|থানা)' then false
  when lower(p_value) ~ 'district(''s)? .{0,90}([[:space:]]and[[:space:]]|,).{0,90}(upazila|thana)' then false
  when p_value ~ '(উপজেলা|থানা).{0,70}([[:space:]]ও[[:space:]]|[[:space:]]এবং[[:space:]]|,).{0,70}(উপজেলা|থানা)' then false
  when lower(p_value) ~ '(upazila|thana).{0,70}([[:space:]]and[[:space:]]|,).{0,70}(upazila|thana)' then false
  when lower(p_value) ~ '(collected[[:space:]]+evidence|cordoned[[:space:]]+off|investigat(e|ed|ing|ion)|police[[:space:]]+said|officials?[[:space:]]+said|victims?|the[[:space:]]+victim|was[[:space:]]+arrested|were[[:space:]]+arrested|detained|went[[:space:]]+to[[:space:]]+the[[:space:]]+area|visited[[:space:]]+the[[:space:]]+area)' then false
  when p_value ~ '(ভুক্তভোগী|পুলিশ[[:space:]]+জানায়|পুলিশ[[:space:]]+জানায়|কর্তৃপক্ষ|তদন্ত|গ্রেপ্তার|আটক|নিহত|আহত|উদ্ধার|জানান|বলেন)' then false
  when p_value ~ '(ঘটনার|ঘটনায়|ঘটনায়|হত্যার[[:space:]]+ঘটনায়|হত্যার[[:space:]]+ঘটনায়|মামলার|মামলায়|মামলায়).{0,90}(থানা|পুলিশ[[:space:]]+স্টেশন)' then false
  when lower(p_value) ~ '(incident|case).{0,90}(police[[:space:]]+station|thana)' then false
  when p_value ~ '(^|[[:space:]])(এদিকে|অন্যদিকে|এ[[:space:]]+ঘটনায়|এ[[:space:]]+ঘটনায়|এই[[:space:]]+ঘটনায়|এই[[:space:]]+ঘটনায়)($|[[:space:]])' then false
  when p_value ~ '^(র|এর)[[:space:]]+' then false
  else true
end
$function$;
CREATE OR REPLACE FUNCTION public.news_intake_location_contract_is_valid(p_division text, p_district text, p_upazila text, p_area text, p_road text, p_landmark text, p_address text, p_scope text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select
    public.canonical_division_name(p_division) is not null
    and public.canonical_district_name(p_district) is not null
    and case
      when nullif(btrim(coalesce(p_upazila,'')),'') is not null
        then public.canonical_upazila_name(p_upazila,p_district) is not null
      when lower(coalesce(p_scope,''))='district_wide'
        then true
      else
        coalesce(public.news_intake_specific_location_text_is_safe(nullif(btrim(p_area),'')),false)
        or coalesce(public.news_intake_specific_location_text_is_safe(nullif(btrim(p_road),'')),false)
        or coalesce(public.news_intake_specific_location_text_is_safe(nullif(btrim(p_landmark),'')),false)
        or coalesce(public.news_intake_specific_location_text_is_safe(nullif(btrim(p_address),'')),false)
    end
$function$;
CREATE OR REPLACE FUNCTION public.guard_trusted_news_intake_one_click_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_source_date date;
  v_transition boolean:=tg_op='INSERT' or old.status is distinct from 'published';
begin
  if new.origin_type<>'sourced_report'
     or coalesce((new.custom_field_answers->>'trustedSourceAuto')::boolean,false) is not true
     or new.status<>'published' then return new; end if;

  if new.title ~* '((ঘটনা|ঘটনার|ঘটনায়|ঘটনায়|মামলা|মামলার|মামলায়|মামলায়).{0,35}(গ্রেপ্তার|আটক)|(গ্রেপ্তার|আটক).{0,35}(ঘটনায়|ঘটনায়|মামলায়|মামলায়))'
     or lower(coalesce(new.title,'')) ~ '((arrested?|detained|held).{0,45}(over|in connection with).{0,80}(incident|case|robbery|snatching|theft|murder|kidnapping|rape))' then
    raise exception 'SOURCE_CURRENT_INCIDENT_REQUIRED: Enforcement follow-up stories cannot be published as new incidents.' using errcode='22023';
  end if;

  if char_length(coalesce(new.description,''))<400 or char_length(coalesce(new.description,''))>800 then
    raise exception 'SOURCE_QUALITY_GATE_FAILED: Trusted News Intake descriptions must contain 400 to 800 source-grounded characters.' using errcode='22023';
  end if;
  if not public.news_intake_location_contract_is_valid(
       new.division,new.district,new.upazila_or_thana,new.area,new.road,new.landmark,
       new.formatted_address,new.custom_field_answers->>'locationScope'
     ) then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Published News Intake requires a source-grounded district plus canonical upazila/thana, safe specific place, or explicit district-wide scope.' using errcode='22023';
  end if;
  if (new.area is not null and not public.news_intake_specific_location_text_is_safe(new.area))
     or (new.road is not null and not public.news_intake_specific_location_text_is_safe(new.road))
     or (new.landmark is not null and not public.news_intake_specific_location_text_is_safe(new.landmark))
     or (new.formatted_address is not null and not public.news_intake_specific_location_text_is_safe(new.formatted_address)) then
    raise exception 'SOURCE_LOCATION_QUALITY_FAILED: Published News Intake location is not valid source-grounded place text.' using errcode='22023';
  end if;
  if new.subcategory_id<>'excess-electricity-bill' and new.incident_date is null then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Incident date is required.' using errcode='22023';
  end if;
  if new.subcategory_id in ('load-shedding-outage','gas-shortage') and new.incident_time is null then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Utility start time is required.' using errcode='22023';
  end if;
  if new.subcategory_id='excess-electricity-bill'
     and (new.recent_bill_month is null or new.recent_bill_amount is null or new.recent_bill_amount<=0
          or new.previous_bill_month is null or new.previous_bill_amount is null or new.previous_bill_amount<=0) then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Excess-bill comparison fields are required.' using errcode='22023';
  end if;
  if new.segment_id='harassment'
     and (new.affected_person_age_group is null or new.alleged_abuser_relationship is null or new.reporting_for is null) then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Harassment classifications are required.' using errcode='22023';
  end if;
  if new.subcategory_id='sexual-harassment'
     and (new.sexual_harassment_type is null or new.sexual_harassment_context is null) then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Sexual-harassment type and context are required.' using errcode='22023';
  end if;
  if new.subcategory_id='child_abduction_murder'
     and nullif(btrim(new.custom_field_answers->>'childIncidentType'),'') is null then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Child-safety incident type is required.' using errcode='22023';
  end if;
  if new.subcategory_id='mob-justice'
     and (jsonb_typeof(new.mob_justice_details)<>'object'
          or nullif(btrim(new.mob_justice_details->>'trigger'),'') is null
          or nullif(btrim(new.mob_justice_details->>'outcome'),'') is null
          or nullif(btrim(new.mob_justice_details->>'ongoingStatus'),'') is null) then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Mob Justice fields are required.' using errcode='22023';
  end if;

  select s.source_published_date into v_source_date
  from public.complaint_sources s where s.complaint_id=new.id
  order by s.verified_at desc nulls last,s.created_at desc limit 1;

  if v_source_date is null then
    raise exception 'SOURCE_FRESHNESS_REQUIRED: Published News Intake requires a verified source publication date.' using errcode='22023';
  end if;
  if new.incident_date is not null
     and new.incident_date >= v_source_date
     and public.news_intake_has_explicit_past_relative_date(new.description) then
    raise exception 'SOURCE_INCIDENT_DATE_GROUNDING_FAILED: A past relative date cue conflicts with the published incident date.' using errcode='22023';
  end if;
  if v_transition and (v_source_date>(clock_timestamp() at time zone 'Asia/Dhaka')::date
      or v_source_date<(clock_timestamp() at time zone 'Asia/Dhaka')::date-7) then
    raise exception 'SOURCE_FRESHNESS_REQUIRED: Source publication date must be within the last 7 days at publication.' using errcode='22023';
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.news_intake_specific_location_has_positive_evidence(p_value text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when nullif(btrim(coalesce(p_value,'')),'') is null then false
    when char_length(btrim(p_value)) < 5 or char_length(btrim(p_value)) > 120 then false
    when p_value ~ '(^|[[:space:],;:()/–—-])(থানা|উপজেলা|ইউনিয়ন|ইউনিয়ন|বাজার|মার্কেট|এলাকা|মহল্লা|গ্রাম|সড়ক|সড়ক|মহাসড়ক|মহাসড়ক|রোড|লেন|গলি|মোড়|মোড়|রেলগেট|স্টেশন|শহর|নগরী|মহানগরী)(য়|য়|তে|ে|র|ের|এর)?($|[[:space:],.;:।()/–—-])' then true
    when lower(p_value) ~ '(^|[[:space:],;:()/–—-])(police[[:space:]]+station|thana|upazila|union|market|bazaar|area|neighbou?rhood|village|road|street|lane|avenue|highway|rail[[:space:]]*gate|station|city|metropolitan[[:space:]]+area)($|[[:space:],.;:()/–—-])' then true
    when btrim(p_value) ~ '^[A-Z][A-Za-z0-9.''’\-]*(?:[[:space:],]+[A-Z0-9][A-Za-z0-9.''’\-]*){0,6}$' then true
    else false
  end
$function$;
CREATE OR REPLACE FUNCTION public.guard_trusted_news_intake_positive_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.origin_type <> 'sourced_report'
     or coalesce((new.custom_field_answers->>'trustedSourceAuto')::boolean,false) is not true
     or new.status <> 'published' then
    return new;
  end if;

  if (new.area is not null and (
        not public.news_intake_specific_location_text_is_safe(new.area)
        or not public.news_intake_specific_location_has_positive_evidence(new.area)
      ))
     or (new.road is not null and (
        not public.news_intake_specific_location_text_is_safe(new.road)
        or not public.news_intake_specific_location_has_positive_evidence(new.road)
      ))
     or (new.landmark is not null and (
        not public.news_intake_specific_location_text_is_safe(new.landmark)
        or not public.news_intake_specific_location_has_positive_evidence(new.landmark)
      ))
     or (new.formatted_address is not null and (
        not public.news_intake_specific_location_text_is_safe(new.formatted_address)
        or not public.news_intake_specific_location_has_positive_evidence(new.formatted_address)
      )) then
    raise exception 'SOURCE_LOCATION_QUALITY_FAILED: Trusted News Intake requires positively identifiable geographic place text.'
      using errcode='22023';
  end if;

  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.normalize_sourced_report_location_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v text;
begin
  if new.origin_type='sourced_report' then
    v:=public.canonical_division_name(new.division); if v is not null then new.division:=v; end if;
    v:=public.canonical_district_name(new.district); if v is not null then new.district:=v; end if;
    v:=public.canonical_upazila_name(new.upazila_or_thana,new.district); if v is not null then new.upazila_or_thana:=v; end if;
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.normalize_sourced_report_public_language()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_lang text;
  v_prefs jsonb;
  v_title text;
  v_summary text;
begin
  if new.origin_type <> 'sourced_report' or new.status <> 'published' then
    return new;
  end if;

  v_lang := lower(coalesce(nullif(btrim(new.custom_field_answers->>'sourceLanguage'),''),'unknown'));
  v_prefs := coalesce(new.publication_preferences,'{}'::jsonb);

  if v_lang = 'bn' then
    v_title := coalesce(
      nullif(btrim(v_prefs->>'publicTitleBn'),''),
      nullif(btrim(new.title),''),
      nullif(btrim(new.title_en),''),
      new.id
    );
    v_summary := coalesce(
      nullif(btrim(v_prefs->>'publicSummaryBn'),''),
      nullif(btrim(new.description),''),
      nullif(btrim(new.description_en),'')
    );

    v_prefs := v_prefs - 'publicTitleEn' - 'publicSummaryEn';
    v_prefs := jsonb_set(v_prefs,'{publicTitleBn}',to_jsonb(v_title),true);
    if coalesce((v_prefs->>'showDescription')::boolean,true) and v_summary is not null then
      v_prefs := jsonb_set(v_prefs,'{publicSummaryBn}',to_jsonb(v_summary),true);
    else
      v_prefs := v_prefs - 'publicSummaryBn';
    end if;
  elsif v_lang = 'en' then
    v_title := coalesce(
      nullif(btrim(v_prefs->>'publicTitleEn'),''),
      nullif(btrim(v_prefs->>'publicTitleBn'),''),
      nullif(btrim(new.title_en),''),
      nullif(btrim(new.title),''),
      new.id
    );
    v_summary := coalesce(
      nullif(btrim(v_prefs->>'publicSummaryEn'),''),
      nullif(btrim(v_prefs->>'publicSummaryBn'),''),
      nullif(btrim(new.description_en),''),
      nullif(btrim(new.description),'')
    );

    v_prefs := v_prefs - 'publicTitleBn' - 'publicSummaryBn';
    v_prefs := jsonb_set(v_prefs,'{publicTitleEn}',to_jsonb(v_title),true);
    if coalesce((v_prefs->>'showDescription')::boolean,true) and v_summary is not null then
      v_prefs := jsonb_set(v_prefs,'{publicSummaryEn}',to_jsonb(v_summary),true);
    else
      v_prefs := v_prefs - 'publicSummaryEn';
    end if;
  end if;

  new.publication_preferences := v_prefs;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.process_trusted_news_intake_candidate(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_report jsonb:=coalesce(p_payload->'report','{}'::jsonb);
  v_source jsonb:=coalesce(p_payload->'source','{}'::jsonb);
  v_quality jsonb:=coalesce(p_payload->'quality','{}'::jsonb);
  v_segment text:=nullif(btrim(v_report->>'segmentId'),'');
  v_subcategory text:=nullif(btrim(v_report->>'subcategoryId'),'');
  v_title text:=nullif(btrim(v_report->>'titleBn'),'');
  v_title_en text:=nullif(btrim(v_report->>'titleEn'),'');
  v_description text:=nullif(btrim(v_report->>'descriptionBn'),'');
  v_description_en text:=nullif(btrim(v_report->>'descriptionEn'),'');
  v_source_type text:=coalesce(nullif(btrim(v_source->>'sourceType'),''),'news');
  v_publisher text:=nullif(btrim(v_source->>'publisherName'),'');
  v_source_title text:=nullif(btrim(v_source->>'sourceTitle'),'');
  v_url text:=nullif(btrim(v_source->>'canonicalUrl'),'');
  v_domain jsonb;
  v_source_date date;
  v_incident_date date;
  v_incident_time time;
  v_utility_end_time time;
  v_frequency text:=coalesce(nullif(btrim(v_report->>'frequency'),''),'one-time');
  v_priority text:=coalesce(nullif(btrim(v_report->>'priority'),''),'medium');
  v_division text:=nullif(btrim(v_report->>'division'),'');
  v_district text:=nullif(btrim(v_report->>'district'),'');
  v_upazila text:=nullif(btrim(v_report->>'upazilaOrThana'),'');
  v_area text:=nullif(btrim(v_report->>'area'),'');
  v_road text:=nullif(btrim(v_report->>'road'),'');
  v_landmark text:=nullif(btrim(v_report->>'landmark'),'');
  v_address text:=nullif(btrim(v_report->>'formattedAddress'),'');
  v_answers jsonb:=case when jsonb_typeof(v_report->'customFieldAnswers')='object'
    then v_report->'customFieldAnswers' else '{}'::jsonb end;
  v_schema_version integer;
  v_existing_id text;
  v_existing_status text;
  v_strong_count integer:=0;
  v_report_id text;
  v_year text;
  v_attempt integer:=0;
  v_source_id uuid;
  v_preferences jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (not public.is_active_admin() or not public.has_permission('complaints.publish')) then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  v_domain:=public.admin_check_news_source_domain(v_url);
  if coalesce((v_domain->>'approved')::boolean,false) is not true then
    raise exception 'SOURCE_DOMAIN_NOT_APPROVED: Source domain is not approved.'
      using errcode='22023';
  end if;
  v_publisher:=coalesce(nullif(btrim(v_domain->>'publisherName'),''),v_publisher);

  if v_segment is null or v_subcategory is null or v_title is null or v_description is null then
    raise exception 'Trusted News Intake requires category, subcategory, source title, and source context.'
      using errcode='22023';
  end if;
  if v_url is null or v_url !~ '^https://[^/]+/.+' or v_publisher is null then
    raise exception 'Trusted News Intake requires an approved HTTPS final article URL.'
      using errcode='22023';
  end if;
  if char_length(v_title)>100 or char_length(v_description)>2000 then
    raise exception 'Trusted News Intake title or description exceeds report limits.'
      using errcode='22023';
  end if;

  if lower(coalesce(v_quality->>'extractionStatus','')) <> 'complete'
     or lower(coalesce(v_quality->>'substantiveContext','false')) <> 'true'
     or lower(coalesce(v_quality->>'currentIncident','false')) <> 'true'
     or lower(coalesce(v_quality->>'followUpOnly','false')) = 'true'
     or coalesce(nullif(regexp_replace(coalesce(v_quality->>'contextLength',''),'[^0-9]','','g'),''),'0')::integer < 80 then
    raise exception 'SOURCE_QUALITY_GATE_FAILED: Trusted News Intake requires a fully extracted current-incident article with substantive context.'
      using errcode='22023';
  end if;

  if public.normalize_duplicate_text(v_title)=public.normalize_duplicate_text(v_description)
     or char_length(v_description) < 400
     or char_length(v_description) > 800 then
    raise exception 'SOURCE_QUALITY_GATE_FAILED: Trusted News Intake descriptions must contain 400 to 800 source-grounded characters.'
      using errcode='22023';
  end if;


  if v_title ~* '(জামিন|রিমান্ড|আদালত|শুনানি|চার্জশিট|চার্জ[[:space:]]*শিট|অভিযোগপত্র|রায়|রায়|দণ্ড|সাজা|আপিল|বিচার[[:space:]]+শুরু|সাক্ষ্যগ্রহণ|জবানবন্দি|স্বীকারোক্তি|দায়[[:space:]]+স্বীকার|দায়[[:space:]]+স্বীকার)'
     or lower(v_title) ~ '(bail|remand|court|hearing|charge[ -]?sheet|chargesheet|verdict|sentenced?|appeal|trial|confess(ed|es|ion)?|confession|plead(s|ed)?[[:space:]]+guilty)'
     or v_title ~* '((ঘটনা|ঘটনার|ঘটনায়|ঘটনায়|মামলা|মামলার|মামলায়|মামলায়).{0,35}(গ্রেপ্তার|আটক)|(গ্রেপ্তার|আটক).{0,35}(ঘটনায়|ঘটনায়|মামলায়|মামলায়))'
     or lower(v_title) ~ '((arrested?|detained|held).{0,45}(over|in connection with).{0,80}(incident|case|robbery|snatching|theft|murder|kidnapping|rape))' then
    raise exception 'SOURCE_CURRENT_INCIDENT_REQUIRED: Court/legal or enforcement follow-up stories cannot be published as new incidents.'
      using errcode='22023';
  end if;

  if (coalesce(v_title,'')||' '||coalesce(v_description,'')) ~* '(বলে[[:space:]]+প্রচার|দাবিটি[[:space:]]+সত্য[[:space:]]+নয়|দাবিটি[[:space:]]+সত্য[[:space:]]+নয়|ভুয়া[[:space:]]+দাবি|ভুয়া[[:space:]]+দাবি|ফ্যাক্ট[[:space:]]*চেক|তথ্য[[:space:]]+যাচাই|যাচাই[[:space:]]+করে[[:space:]]+দেখা[[:space:]]+গেছে|মিথ্যা[[:space:]]+দাবি|ভুল[[:space:]]+তথ্য)'
     or lower(coalesce(v_title,'')||' '||coalesce(v_description,'')) ~ '(fact[- ]?check|false[[:space:]]+claim|misinformation|misleading[[:space:]]+claim|debunk(ed|ing)?)' then
    raise exception 'SOURCE_CURRENT_INCIDENT_REQUIRED: Fact-check or misinformation/debunking stories cannot be published as new incidents.'
      using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.subcategories sc
    join public.segments sg on sg.id=sc.segment_id
    where sc.id=v_subcategory and sc.segment_id=v_segment
      and sc.active=true and sg.active=true
      and sc.config_status='published' and sg.config_status='published'
  ) then
    raise exception 'Selected category/subcategory is not currently published for reporting.'
      using errcode='22023';
  end if;

  begin
    if nullif(btrim(v_source->>'sourcePublishedDate'),'') is not null then
      v_source_date:=(v_source->>'sourcePublishedDate')::date;
    end if;
    if nullif(btrim(v_report->>'incidentDate'),'') is not null then
      v_incident_date:=(v_report->>'incidentDate')::date;
    end if;
    if nullif(btrim(v_report->>'incidentTime'),'') is not null then
      v_incident_time:=(v_report->>'incidentTime')::time;
    end if;
    if nullif(btrim(v_report->>'utilityEndTime'),'') is not null then
      v_utility_end_time:=(v_report->>'utilityEndTime')::time;
    end if;
  exception when others then
    raise exception 'One or more supplied source date/time values are invalid.' using errcode='22023';
  end;

  if v_source_date is null then
    raise exception 'SOURCE_FRESHNESS_REQUIRED: Trusted News Intake requires a verified source publication date.' using errcode='22023';
  end if;
  if v_source_date > (clock_timestamp() at time zone 'Asia/Dhaka')::date
     or v_source_date < (clock_timestamp() at time zone 'Asia/Dhaka')::date - 7 then
    raise exception 'SOURCE_FRESHNESS_REQUIRED: Source publication date must be within the last 7 days.' using errcode='22023';
  end if;

  if v_incident_date is not null
     and v_incident_date >= v_source_date
     and public.news_intake_has_explicit_past_relative_date(v_description) then
    raise exception 'SOURCE_INCIDENT_DATE_GROUNDING_FAILED: A past relative date cue in the source conflicts with the supplied incident date.' using errcode='22023';
  end if;

  if v_subcategory <> 'excess-electricity-bill' and v_incident_date is null then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Incident date is required for this report type.' using errcode='22023';
  end if;

  if not public.news_intake_location_contract_is_valid(
       v_division,v_district,v_upazila,v_area,v_road,v_landmark,v_address,v_answers->>'locationScope'
     ) then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: A source-grounded district plus canonical upazila/thana, safe specific place, or explicit district-wide scope is required.' using errcode='22023';
  end if;

  if (v_area is not null and not public.news_intake_specific_location_text_is_safe(v_area))
     or (v_road is not null and not public.news_intake_specific_location_text_is_safe(v_road))
     or (v_landmark is not null and not public.news_intake_specific_location_text_is_safe(v_landmark))
     or (v_address is not null and not public.news_intake_specific_location_text_is_safe(v_address)) then
    raise exception 'SOURCE_LOCATION_QUALITY_FAILED: One or more supplied location fragments are not valid source-grounded place text.' using errcode='22023';
  end if;

  if v_subcategory in ('load-shedding-outage','gas-shortage') and v_incident_time is null then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Utility start time is required for this report type.' using errcode='22023';
  end if;

  if v_subcategory='excess-electricity-bill' then
    if nullif(btrim(v_report->>'recentBillMonth'),'') is null
       or nullif(btrim(v_report->>'previousBillMonth'),'') is null
       or nullif(btrim(v_report->>'recentBillAmount'),'') is null
       or nullif(btrim(v_report->>'previousBillAmount'),'') is null then
      raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Excess-bill comparison fields are required.' using errcode='22023';
    end if;
    if (v_report->>'recentBillMonth') !~ '^[0-9]{4}-[0-9]{2}$'
       or (v_report->>'previousBillMonth') !~ '^[0-9]{4}-[0-9]{2}$' then
      raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Bill months must use YYYY-MM.' using errcode='22023';
    end if;
    if substring(v_report->>'recentBillMonth' from 6 for 2)::integer not between 1 and 12
       or substring(v_report->>'previousBillMonth' from 6 for 2)::integer not between 1 and 12 then
      raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Bill month is invalid.' using errcode='22023';
    end if;
    if (v_report->>'recentBillAmount') !~ '^[0-9]+([.][0-9]+)?$'
       or (v_report->>'previousBillAmount') !~ '^[0-9]+([.][0-9]+)?$'
       or (v_report->>'recentBillAmount')::numeric <= 0
       or (v_report->>'previousBillAmount')::numeric <= 0 then
      raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Bill amounts must be positive numbers.' using errcode='22023';
    end if;
    if (v_report->>'previousBillMonth') >= (v_report->>'recentBillMonth')
       or (v_report->>'recentBillMonth') > to_char(clock_timestamp() at time zone 'Asia/Dhaka','YYYY-MM') then
      raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Bill month ordering is invalid.' using errcode='22023';
    end if;
  end if;

  if v_segment='harassment'
     and (
       nullif(btrim(v_report->>'affectedPersonAgeGroup'),'') is null
       or nullif(btrim(v_report->>'allegedAbuserRelationship'),'') is null
       or nullif(btrim(v_report->>'reportingFor'),'') is null
     ) then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Harassment classifications are required.' using errcode='22023';
  end if;

  if v_subcategory='sexual-harassment'
     and (
       nullif(btrim(v_report->>'sexualHarassmentType'),'') is null
       or nullif(btrim(v_report->>'sexualHarassmentContext'),'') is null
     ) then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Sexual-harassment type and context are required.' using errcode='22023';
  end if;

  if v_subcategory='child_abduction_murder'
     and nullif(btrim(v_answers->>'childIncidentType'),'') is null then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Child-safety incident type is required.' using errcode='22023';
  end if;

  if v_subcategory='mob-justice'
     and (
       jsonb_typeof(v_report->'mobJusticeDetails') <> 'object'
       or nullif(btrim(v_report->'mobJusticeDetails'->>'trigger'),'') is null
       or nullif(btrim(v_report->'mobJusticeDetails'->>'outcome'),'') is null
       or nullif(btrim(v_report->'mobJusticeDetails'->>'ongoingStatus'),'') is null
     ) then
    raise exception 'SOURCE_REPORT_CONTRACT_FAILED: Mob Justice trigger, outcome, and ongoing status are required.' using errcode='22023';
  end if;

  if jsonb_array_length(public.sourced_report_schema_validation_errors_internal(v_subcategory,v_report)) > 0 then
    raise exception 'SOURCE_SCHEMA_VALIDATION_FAILED: Candidate does not satisfy the currently published reporting schema.' using errcode='22023';
  end if;

  -- Canonical source URLs are globally unique across sourced reports.
  select c.id,c.status
  into v_existing_id,v_existing_status
  from public.complaint_sources s
  join public.complaints c on c.id=s.complaint_id
  where public.normalize_source_url(s.canonical_url)=public.normalize_source_url(v_url)
  order by case when c.status='published' then 0 else 1 end,c.created_at desc
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'success',true,'action','skip_duplicate','reportId',v_existing_id,
      'status',v_existing_status,'published',v_existing_status='published',
      'duplicateStatus','exact'
    );
  end if;

  -- Strong cross-publisher same-incident clustering. Never merge on a weak
  -- candidate; if evidence is not strong enough a separate source-grounded
  -- report is safer than attaching a source to the wrong incident.
  with strong as (
    select
      c.id,
      c.status,
      greatest(
        public.duplicate_token_similarity(v_title,c.title),
        public.duplicate_token_similarity(v_title,c.title_en),
        public.duplicate_token_similarity(v_title_en,c.title),
        public.duplicate_token_similarity(v_title_en,c.title_en)
      ) as title_similarity
    from public.complaints c
    where c.origin_type='sourced_report'
      and c.status='published'
      and c.subcategory_id=v_subcategory
      and c.created_at>=now()-interval '10 days'
      and (
        (
          (
            (v_incident_date is not null and c.incident_date is not null and abs(v_incident_date-c.incident_date)<=2)
            or (v_district is not null and public.normalize_duplicate_text(v_district)=public.normalize_duplicate_text(c.district))
            or greatest(
          public.duplicate_token_similarity(v_title,c.title),
          public.duplicate_token_similarity(v_title,c.title_en),
          public.duplicate_token_similarity(v_title_en,c.title),
          public.duplicate_token_similarity(v_title_en,c.title_en)
        )>=0.90
          )
          and greatest(
          public.duplicate_token_similarity(v_title,c.title),
          public.duplicate_token_similarity(v_title,c.title_en),
          public.duplicate_token_similarity(v_title_en,c.title),
          public.duplicate_token_similarity(v_title_en,c.title_en)
        )>=0.82
        )
        or (
          lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown'))
            <> lower(coalesce(nullif(btrim(v_answers->>'sourceLanguage'),''),'unknown'))
          and lower(coalesce(nullif(btrim(c.custom_field_answers->>'sourceLanguage'),''),'unknown')) in ('bn','en')
          and lower(coalesce(nullif(btrim(v_answers->>'sourceLanguage'),''),'unknown')) in ('bn','en')
          and v_incident_date is not null
          and c.incident_date is not null
          and abs(v_incident_date-c.incident_date)<=1
          and v_district is not null
          and c.district is not null
          and public.normalize_duplicate_text(v_district)=public.normalize_duplicate_text(c.district)
          and (
            (
              v_upazila is not null and c.upazila_or_thana is not null
              and public.normalize_duplicate_text(v_upazila)=public.normalize_duplicate_text(c.upazila_or_thana)
            )
            or (
              v_area is not null and c.area is not null
              and public.duplicate_token_similarity(v_area,c.area)>=0.78
            )
            or (
              v_address is not null and c.formatted_address is not null
              and public.duplicate_token_similarity(v_address,c.formatted_address)>=0.78
            )
            or (
              v_landmark is not null and c.landmark is not null
              and public.duplicate_token_similarity(v_landmark,c.landmark)>=0.78
            )
          )
        )
      )
    order by title_similarity desc,c.created_at desc
    limit 3
  )
  select count(*)::integer,min(id),min(status)
  into v_strong_count,v_existing_id,v_existing_status
  from strong;

  if v_strong_count=1 and v_existing_id is not null then
    insert into public.complaint_sources(
      complaint_id,source_type,publisher_name,source_title,canonical_url,
      source_published_date,verification_status,is_final_detail_page,
      source_version,verification_note,verified_at,verified_by
    ) values (
      v_existing_id,v_source_type,v_publisher,v_source_title,v_url,
      v_source_date,'verified',true,1,
      'Verified approved source automatically merged by News Intake.',
      now(),auth.uid()
    ) returning id into v_source_id;

    update public.complaints set updated_at=now() where id=v_existing_id;

    insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
    values(auth.uid(),'news_intake.auto_source_merge','complaint',v_existing_id,jsonb_build_object(
      'source_id',v_source_id,
      'canonical_url',v_url,
      'publisher_name',v_publisher,
      'source_title',v_source_title,
      'timestamp',clock_timestamp()
    ));

    return jsonb_build_object(
      'success',true,'action','merged_source','reportId',v_existing_id,
      'status','published','published',true,'duplicateStatus','match'
    );
  end if;

  select r.version into v_schema_version
  from public.reporting_form_schemas r
  where r.scope_type='subcategory' and r.scope_id=v_subcategory
    and r.status='published' and r.engine_mode='schema'
  order by r.version desc limit 1;

  v_answers:=coalesce(v_answers,'{}'::jsonb) || jsonb_build_object(
    'automatedIntake',true,
    'trustedSourceAuto',true,
    'sourceTruthMode','approved_publisher',
    'newsIntakeReviewRequired',false
  );

  v_year:=to_char(now(),'YYYY');
  loop
    v_attempt:=v_attempt+1;
    v_report_id:='SJ-'||v_year||'-'||floor(100000+random()*900000)::integer::text;
    exit when not exists(select 1 from public.complaints where id=v_report_id);
    if v_attempt>=50 then raise exception 'REPORT_ID_GENERATION_FAILED'; end if;
  end loop;

  v_preferences:=jsonb_build_object(
    'showDescription',true,
    'showGeneralLocation',v_district is not null,
    'publicTitleBn',v_title,
    'publicSummaryBn',case
      when char_length(v_description)>220
      then regexp_replace(left(v_description,220),'\s+\S*$','')||'…'
      else v_description
    end
  );

  insert into public.complaints(
    id,segment_id,subcategory_id,title,title_en,description,description_en,
    incident_date,incident_time,utility_end_time,frequency,status,priority,
    privacy_choice,confirm_public_identity,
    division,district,upazila_or_thana,area,road,landmark,formatted_address,
    relationship_context,recent_bill_month,recent_bill_amount,
    previous_bill_month,previous_bill_amount,
    bribery_department,bribery_service,bribery_amount,
    affected_person_age_group,alleged_abuser_relationship,reporting_for,
    sexual_harassment_type,sexual_harassment_context,sexual_harassment_institution,
    intimate_what_happened,intimate_platform,mob_justice_details,
    form_schema_version,custom_field_answers,publication_preferences,
    origin_type,created_at,updated_at
  ) values (
    v_report_id,v_segment,v_subcategory,v_title,v_title_en,v_description,v_description_en,
    v_incident_date,v_incident_time,v_utility_end_time,v_frequency,'submitted',v_priority,
    'anonymous',false,
    v_division,v_district,v_upazila,v_area,v_road,v_landmark,v_address,
    nullif(btrim(v_report->>'relationshipContext'),''),
    nullif(btrim(v_report->>'recentBillMonth'),''),
    nullif(v_report->>'recentBillAmount','')::numeric,
    nullif(btrim(v_report->>'previousBillMonth'),''),
    nullif(v_report->>'previousBillAmount','')::numeric,
    nullif(btrim(v_report->>'briberyDepartment'),''),
    nullif(btrim(v_report->>'briberyService'),''),
    nullif(v_report->>'briberyAmount','')::numeric,
    nullif(btrim(v_report->>'affectedPersonAgeGroup'),''),
    nullif(btrim(v_report->>'allegedAbuserRelationship'),''),
    nullif(btrim(v_report->>'reportingFor'),''),
    nullif(btrim(v_report->>'sexualHarassmentType'),''),
    nullif(btrim(v_report->>'sexualHarassmentContext'),''),
    nullif(btrim(v_report->>'sexualHarassmentInstitution'),''),
    case when nullif(btrim(v_report->>'intimateWhatHappened'),'') is null
      then null else to_jsonb(btrim(v_report->>'intimateWhatHappened')) end,
    case when nullif(btrim(v_report->>'intimatePlatform'),'') is null
      then null else to_jsonb(btrim(v_report->>'intimatePlatform')) end,
    case when jsonb_typeof(v_report->'mobJusticeDetails')='object'
      then v_report->'mobJusticeDetails' else null end,
    v_schema_version,v_answers,v_preferences,
    'sourced_report',now(),now()
  );

  insert into public.complaint_sources(
    complaint_id,source_type,publisher_name,source_title,canonical_url,
    source_published_date,verification_status,is_final_detail_page,
    source_version,verification_note,verified_at,verified_by
  ) values (
    v_report_id,v_source_type,v_publisher,v_source_title,v_url,
    v_source_date,'verified',true,1,
    'Verified approved source automatically published by News Intake.',
    now(),auth.uid()
  ) returning id into v_source_id;

  insert into public.complaint_updates(complaint_id,update_type,note,is_public,created_at)
  values(v_report_id,'submitted','Approved-source report created automatically by News Intake.',false,now());

  update public.complaints
  set status='published',updated_at=now()
  where id=v_report_id;

  insert into public.complaint_updates(complaint_id,update_type,note,is_public,created_at)
  values(v_report_id,'published','Approved-source report automatically published to the public feed.',true,now());

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'news_intake.auto_publish','complaint',v_report_id,jsonb_build_object(
    'canonical_url',v_url,
    'publisher_name',v_publisher,
    'source_id',v_source_id,
    'source_truth_mode','approved_publisher',
    'incident_date_from_source',v_incident_date is not null,
    'location_from_source',v_district is not null,
    'timestamp',clock_timestamp()
  ));

  return jsonb_build_object(
    'success',true,'action','published','reportId',v_report_id,
    'status','published','published',true,'duplicateStatus','clear'
  );
exception
  when unique_violation then
    select c.id,c.status
    into v_existing_id,v_existing_status
    from public.complaint_sources s
    join public.complaints c on c.id=s.complaint_id
    where public.normalize_source_url(s.canonical_url)=public.normalize_source_url(v_url)
    order by c.created_at desc
    limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'success',true,'action','skip_duplicate','reportId',v_existing_id,
        'status',v_existing_status,'published',v_existing_status='published',
        'duplicateStatus','exact'
      );
    end if;
    raise;
end;
$function$;
CREATE OR REPLACE FUNCTION public.protect_super_admin_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_super_admin THEN
            RAISE EXCEPTION 'Operation rejected: Super Administrator account cannot be deleted.'
                USING ERRCODE = '42501';
        END IF;
        RETURN OLD;

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.is_super_admin THEN
            IF NEW.is_super_admin IS DISTINCT FROM true THEN
                RAISE EXCEPTION 'Operation rejected: Super Administrator account cannot be demoted.'
                    USING ERRCODE = '42501';
            END IF;

            IF NEW.active IS DISTINCT FROM true THEN
                RAISE EXCEPTION 'Operation rejected: Super Administrator account cannot be deactivated.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.protect_super_admin_user_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_is_super BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        SELECT is_super_admin INTO v_is_super
        FROM public.admin_users
        WHERE user_id = NEW.user_id;

        IF v_is_super IS TRUE THEN
            RAISE EXCEPTION
                'Operation rejected: Super Administrator permissions are system-level and cannot be bound to an editable role.'
                USING ERRCODE = '42501';
        END IF;

        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        SELECT is_super_admin INTO v_is_super
        FROM public.admin_users
        WHERE user_id = OLD.user_id;

        IF v_is_super IS TRUE THEN
            RAISE EXCEPTION
                'Operation rejected: Super Administrator account role mapping cannot be deleted.'
                USING ERRCODE = '42501';
        END IF;

        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.record_public_visit_session_internal(p_visitor_id text, p_session_id text, p_permission_status text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_accuracy_meters numeric DEFAULT NULL::numeric, p_browser_name text DEFAULT NULL::text, p_browser_version text DEFAULT NULL::text, p_os_name text DEFAULT NULL::text, p_device_category text DEFAULT NULL::text, p_platform text DEFAULT NULL::text, p_language text DEFAULT NULL::text, p_timezone text DEFAULT NULL::text, p_screen_width integer DEFAULT NULL::integer, p_screen_height integer DEFAULT NULL::integer, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_visitor_id text;
  v_session_id text;
  v_permission text;
  v_existing_visitor_id text;
BEGIN
  v_visitor_id := trim(coalesce(p_visitor_id, ''));
  v_session_id := trim(coalesce(p_session_id, ''));
  v_permission := lower(trim(coalesce(p_permission_status, 'prompt')));

  IF v_visitor_id = '' THEN RAISE EXCEPTION 'VALIDATION_FAILED: visitor_id is required.'; END IF;
  IF length(v_visitor_id) > 128 THEN RAISE EXCEPTION 'VALIDATION_FAILED: visitor_id is too long.'; END IF;
  IF v_session_id = '' THEN RAISE EXCEPTION 'VALIDATION_FAILED: session_id is required.'; END IF;
  IF length(v_session_id) > 128 THEN RAISE EXCEPTION 'VALIDATION_FAILED: session_id is too long.'; END IF;
  IF v_permission NOT IN ('prompt','granted','denied','unavailable') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Invalid permission status.';
  END IF;

  SELECT visitor_id INTO v_existing_visitor_id
  FROM public.public_visit_sessions
  WHERE session_id = v_session_id
  FOR UPDATE;

  IF FOUND AND v_existing_visitor_id <> v_visitor_id THEN
    RAISE EXCEPTION 'SESSION_CONFLICT: Session belongs to another visitor.';
  END IF;

  INSERT INTO public.public_visit_sessions (
    visitor_id, session_id, permission_status,
    latitude, longitude, accuracy_meters,
    browser_name, browser_version, os_name, device_category, platform,
    language, timezone, screen_width, screen_height, user_agent,
    consented_at, first_seen_at, last_seen_at, location_updated_at, created_at
  ) VALUES (
    v_visitor_id, v_session_id, v_permission,
    NULL, NULL, NULL,
    NULLIF(trim(p_browser_name), ''), NULLIF(trim(p_browser_version), ''),
    NULLIF(trim(p_os_name), ''), NULLIF(trim(p_device_category), ''), NULLIF(trim(p_platform), ''),
    NULLIF(trim(p_language), ''), NULLIF(trim(p_timezone), ''),
    p_screen_width, p_screen_height, NULLIF(left(trim(p_user_agent), 1000), ''),
    CASE WHEN v_permission = 'granted' THEN now() ELSE NULL END,
    now(), now(), NULL, now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    permission_status = EXCLUDED.permission_status,
    latitude = NULL,
    longitude = NULL,
    accuracy_meters = NULL,
    browser_name = EXCLUDED.browser_name,
    browser_version = EXCLUDED.browser_version,
    os_name = EXCLUDED.os_name,
    device_category = EXCLUDED.device_category,
    platform = EXCLUDED.platform,
    language = EXCLUDED.language,
    timezone = EXCLUDED.timezone,
    screen_width = EXCLUDED.screen_width,
    screen_height = EXCLUDED.screen_height,
    user_agent = EXCLUDED.user_agent,
    consented_at = CASE
      WHEN EXCLUDED.permission_status = 'granted'
      THEN COALESCE(public.public_visit_sessions.consented_at, now())
      ELSE public.public_visit_sessions.consented_at
    END,
    last_seen_at = now(),
    location_updated_at = NULL;

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', v_session_id,
    'permissionStatus', v_permission
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.record_public_visit_session(p_visitor_id text, p_session_id text, p_permission_status text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_accuracy_meters numeric DEFAULT NULL::numeric, p_browser_name text DEFAULT NULL::text, p_browser_version text DEFAULT NULL::text, p_os_name text DEFAULT NULL::text, p_device_category text DEFAULT NULL::text, p_platform text DEFAULT NULL::text, p_language text DEFAULT NULL::text, p_timezone text DEFAULT NULL::text, p_screen_width integer DEFAULT NULL::integer, p_screen_height integer DEFAULT NULL::integer, p_user_agent text DEFAULT NULL::text, p_ui_language text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_ui_language text := lower(nullif(btrim(p_ui_language), ''));
begin
  perform set_config(
    'app.ui_language',
    case when v_ui_language in ('bn','en') then v_ui_language else '' end,
    true
  );

  perform private.enforce_public_rate_limit(
    'public_visit_session', p_visitor_id, 240, 60, interval '1 hour'
  );

  return public.record_public_visit_session_internal(
    p_visitor_id, p_session_id, p_permission_status,
    p_latitude, p_longitude, p_accuracy_meters,
    p_browser_name, p_browser_version, p_os_name, p_device_category,
    p_platform, p_language, p_timezone, p_screen_width, p_screen_height, p_user_agent
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.register_public_complaint_evidence(p_client_submission_id text, p_storage_path text, p_file_name text, p_file_size_bytes bigint, p_caption text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'public', 'storage', 'pg_temp'
AS $function$
DECLARE
  v_client_submission_id text;
  v_storage_path text;
  v_file_name text;
  v_expected_prefix text;
  v_complaint_id text;
  v_existing_id uuid;
  v_evidence_id uuid;
  v_registered_count integer;
BEGIN
  v_client_submission_id := trim(coalesce(p_client_submission_id, ''));
  v_storage_path := trim(coalesce(p_storage_path, ''));
  v_file_name := trim(coalesce(p_file_name, ''));

  IF v_client_submission_id = ''
     OR length(v_client_submission_id) < 8
     OR length(v_client_submission_id) > 128 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: A valid client submission identifier is required.'
      USING ERRCODE = '22000';
  END IF;

  IF v_storage_path = '' OR length(v_storage_path) > 512 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: A valid storage path is required.'
      USING ERRCODE = '22000';
  END IF;

  IF v_file_name = '' OR length(v_file_name) > 180 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: A valid file name is required.'
      USING ERRCODE = '22000';
  END IF;

  IF p_file_size_bytes IS NULL
     OR p_file_size_bytes <= 0
     OR p_file_size_bytes > 262144 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Evidence file size is outside the allowed range.'
      USING ERRCODE = '22000';
  END IF;

  v_expected_prefix := 'public-submissions/' || v_client_submission_id || '/';

  IF split_part(v_storage_path, '/', 1) <> 'public-submissions'
     OR split_part(v_storage_path, '/', 2) <> v_client_submission_id
     OR split_part(v_storage_path, '/', 3) <> v_file_name
     OR split_part(v_storage_path, '/', 4) <> ''
     OR v_storage_path <> v_expected_prefix || v_file_name THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Evidence path does not belong to this submission.'
      USING ERRCODE = '22000';
  END IF;

  IF v_file_name !~ '^[a-z0-9_-]+\.webp$' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Public evidence must be a sanitized WebP image.'
      USING ERRCODE = '22000';
  END IF;

  SELECT c.id
  INTO v_complaint_id
  FROM public.complaints c
  WHERE c.client_submission_id = v_client_submission_id
    AND c.status = 'submitted'
  LIMIT 1;

  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'COMPLAINT_NOT_FOUND: No submitted complaint matches this submission identifier.'
      USING ERRCODE = '22000';
  END IF;

  -- Registration is permitted only after the exact object was accepted by the
  -- private bucket's upload policy. The bucket itself enforces WebP and 256 KB.
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'complaint-evidence'
      AND o.name = v_storage_path
  ) THEN
    RAISE EXCEPTION 'EVIDENCE_NOT_FOUND: Uploaded evidence object was not found.'
      USING ERRCODE = '22000';
  END IF;

  SELECT ce.id
  INTO v_existing_id
  FROM public.complaint_evidence ce
  WHERE ce.complaint_id = v_complaint_id
    AND ce.storage_path = v_storage_path
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'evidence_id', v_existing_id,
      'complaint_id', v_complaint_id,
      'duplicate', true
    );
  END IF;

  SELECT count(*)
  INTO v_registered_count
  FROM public.complaint_evidence ce
  WHERE ce.complaint_id = v_complaint_id;

  IF v_registered_count >= 6 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Maximum evidence count reached.'
      USING ERRCODE = '22000';
  END IF;

  INSERT INTO public.complaint_evidence (
    complaint_id,
    storage_path,
    file_name,
    mime_type,
    media_type,
    file_size_bytes,
    caption,
    created_at
  ) VALUES (
    v_complaint_id,
    v_storage_path,
    v_file_name,
    'image/webp',
    'image',
    p_file_size_bytes,
    left(nullif(trim(p_caption), ''), 500),
    now()
  )
  RETURNING id INTO v_evidence_id;

  UPDATE public.complaints
  SET has_supporting_info = true,
      updated_at = now()
  WHERE id = v_complaint_id;

  BEGIN
    PERFORM public.admin_emit_notification(
      p_event_key := 'complaint.evidence_attached',
      p_title_en := 'Evidence attached to complaint: ' || v_complaint_id,
      p_title_bn := 'অভিযোগে প্রমাণ সংযুক্ত করা হয়েছে: ' || v_complaint_id,
      p_body_en := 'New evidence attached: ' || v_file_name,
      p_body_bn := 'অভিযোগে নতুন প্রমাণ যুক্ত করা হয়েছে: ' || v_file_name,
      p_actor_user_id := NULL,
      p_target_type := 'complaint',
      p_target_id := v_complaint_id,
      p_target_label := v_file_name,
      p_metadata := jsonb_build_object(
        'complaint_id', v_complaint_id,
        'evidence_id', v_evidence_id,
        'evidence_type', 'image',
        'storage_path', v_storage_path,
        'file_name', v_file_name,
        'file_size_bytes', p_file_size_bytes,
        'created_at', now()
      ),
      p_required_all_permissions := ARRAY['complaints.view', 'complaints.evidence_view'],
      p_required_any_permissions := '{}'::text[],
      p_audience_mode := 'permission',
      p_route := '/complaints/' || v_complaint_id,
      p_dedupe_key := 'complaint.evidence_attached:' || v_evidence_id::text,
      p_exclude_actor := false,
      p_include_super_admin := true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'admin_emit_notification failed for complaint.evidence_attached (%): %',
      v_evidence_id,
      SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'evidence_id', v_evidence_id,
    'complaint_id', v_complaint_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.reporting_field_options_are_bilingual(p_options jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select
    p_options is not null
    and jsonb_typeof(p_options) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_options) as item(value)
      where jsonb_typeof(item.value) <> 'object'
         or nullif(btrim(item.value->>'value'), '') is null
         or nullif(btrim(item.value->>'labelEn'), '') is null
         or nullif(btrim(item.value->>'labelBn'), '') is null
    )
    and not exists (
      select 1
      from (
        select btrim(item.value->>'value') as option_value, count(*) as c
        from jsonb_array_elements(p_options) as item(value)
        group by btrim(item.value->>'value')
        having count(*) > 1
      ) duplicates
    );
$function$;
CREATE OR REPLACE FUNCTION public.sanitize_configured_complaint_answers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_schema_id uuid;
  v_engine_mode text;
  v_filtered jsonb := '{}'::jsonb;
  v_system jsonb := '{}'::jsonb;
  v_missing_checkbox text;
begin
  if new.form_schema_version is null then
    return new;
  end if;

  select s.id,s.engine_mode
  into v_schema_id,v_engine_mode
  from public.reporting_form_schemas s
  where s.scope_type='subcategory'
    and s.scope_id=new.subcategory_id
    and s.version=new.form_schema_version
  order by
    case s.status when 'published' then 0 when 'archived' then 1 else 2 end,
    s.updated_at desc
  limit 1;

  if v_schema_id is null or v_engine_mode <> 'schema' then
    return new;
  end if;

  -- Preserve system-owned News Intake provenance keys. These are not user
  -- form answers and are required for trusted-source policy enforcement.
  v_system := jsonb_strip_nulls(jsonb_build_object(
    'sourceLanguage',new.custom_field_answers->'sourceLanguage',
    'automatedIntake',new.custom_field_answers->'automatedIntake',
    'trustedSourceAuto',new.custom_field_answers->'trustedSourceAuto',
    'sourceTruthMode',new.custom_field_answers->'sourceTruthMode',
    'sourceOmittedFields',new.custom_field_answers->'sourceOmittedFields',
    'locationScope',new.custom_field_answers->'locationScope',
    'sensitiveContentReviewed',new.custom_field_answers->'sensitiveContentReviewed',
    'newsIntakeReviewRequired',new.custom_field_answers->'newsIntakeReviewRequired'
  ));

  select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
  into v_filtered
  from jsonb_each(coalesce(new.custom_field_answers,'{}'::jsonb)) e
  join public.reporting_form_schema_fields f
    on f.schema_id=v_schema_id
   and f.active=true
   and f.storage_mode='custom_json'
   and f.storage_key=e.key;

  new.custom_field_answers := coalesce(v_filtered,'{}'::jsonb) || v_system;

  select f.label_en
  into v_missing_checkbox
  from public.reporting_form_schema_fields f
  where f.schema_id=v_schema_id
    and f.active=true
    and f.required=true
    and f.storage_mode='custom_json'
    and f.field_type='checkbox'
    and coalesce(new.custom_field_answers->f.storage_key,'false'::jsonb) <> 'true'::jsonb
  order by f.sort_order
  limit 1;

  if v_missing_checkbox is not null then
    raise exception 'VALIDATION_FAILED: Required checkbox % must be selected.',v_missing_checkbox
      using errcode='22023';
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sanitize_ride_sharing_complaint_party()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if exists(
    select 1
    from public.complaints c
    where c.id=new.complaint_id
      and c.subcategory_id='ride_sharing_safety'
  ) then
    new.organization := null;
    new.phone_or_contact := null;
    new.public_profile_handle := null;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.service_assert_public_write_rate(p_source_fingerprint text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_fingerprint text := nullif(btrim(p_source_fingerprint),'');
  v_action text := lower(nullif(btrim(p_action),''));
  v_minute_count integer;
  v_hour_count integer;
  v_day_count integer;
begin
  if v_fingerprint is null or length(v_fingerprint) <> 64
     or v_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_RATE_FINGERPRINT' using errcode='22000';
  end if;

  if v_action not in ('complaint','evidence','response','engagement','session','ip_location') then
    raise exception 'INVALID_RATE_ACTION' using errcode='22000';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_fingerprint || ':' || v_action));

  select count(*) into v_minute_count
  from public.public_write_rate_events
  where source_fingerprint=v_fingerprint
    and action=v_action
    and created_at > now() - interval '1 minute';

  select count(*) into v_hour_count
  from public.public_write_rate_events
  where source_fingerprint=v_fingerprint
    and action=v_action
    and created_at > now() - interval '1 hour';

  select count(*) into v_day_count
  from public.public_write_rate_events
  where source_fingerprint=v_fingerprint
    and action=v_action
    and created_at > now() - interval '24 hours';

  if v_action='complaint' and (
       v_minute_count >= 6 or v_hour_count >= 30 or v_day_count >= 100
     ) then
    return jsonb_build_object('allowed',false,'retryAfterSeconds',3600);
  end if;

  if v_action='evidence' and (
       v_minute_count >= 20 or v_hour_count >= 100 or v_day_count >= 300
     ) then
    return jsonb_build_object('allowed',false,'retryAfterSeconds',3600);
  end if;

  if v_action='response' and (
       v_minute_count >= 15 or v_hour_count >= 120 or v_day_count >= 500
     ) then
    return jsonb_build_object('allowed',false,'retryAfterSeconds',3600);
  end if;

  if v_action='engagement' and (
       v_minute_count >= 120 or v_hour_count >= 1000 or v_day_count >= 5000
     ) then
    return jsonb_build_object('allowed',false,'retryAfterSeconds',60);
  end if;

  if v_action='session' and (
       v_minute_count >= 60 or v_hour_count >= 600 or v_day_count >= 2000
     ) then
    return jsonb_build_object('allowed',false,'retryAfterSeconds',60);
  end if;

  if v_action='ip_location' and (
       v_minute_count >= 60 or v_hour_count >= 600 or v_day_count >= 2000
     ) then
    return jsonb_build_object('allowed',false,'retryAfterSeconds',60);
  end if;

  insert into public.public_write_rate_events(source_fingerprint,action)
  values(v_fingerprint,v_action);

  return jsonb_build_object('allowed',true);
end;
$function$;
CREATE OR REPLACE FUNCTION public.service_begin_scheduled_news_intake_run(p_scheduled_slot timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_id uuid;
  v_source_count integer;
  v_running public.news_intake_runs%rowtype;
  v_settings public.news_intake_automation_settings%rowtype;
  v_slot timestamptz;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Access denied.' using errcode='42501';
  end if;

  if p_scheduled_slot is null then
    raise exception 'Scheduled slot is required.' using errcode='22023';
  end if;

  v_slot := date_trunc('minute',p_scheduled_slot);

  if abs(extract(epoch from (clock_timestamp()-v_slot))) > 300 then
    raise exception 'Scheduled slot is outside the allowed dispatch window.'
      using errcode='22023';
  end if;

  select * into v_settings
  from public.news_intake_automation_settings
  where singleton=true
  for update;

  if v_settings.enabled is not true then
    return jsonb_build_object(
      'accepted',false,
      'disabled',true,
      'triggerType','automatic'
    );
  end if;

  if v_settings.next_auto_due_at is null
     or v_settings.next_auto_due_at > v_slot then
    return jsonb_build_object(
      'accepted',false,
      'notDue',true,
      'nextAutoDueAt',v_settings.next_auto_due_at,
      'triggerType','automatic'
    );
  end if;

  update public.news_intake_runs
  set status='failed',
      completed_at=now(),
      error_summary=coalesce(error_summary,'') ||
        case when coalesce(error_summary,'')='' then '' else ' ' end ||
        'Marked failed automatically because the run exceeded 20 minutes.'
  where status='running'
    and started_at < now()-interval '20 minutes';

  select * into v_running
  from public.news_intake_runs
  where status='running'
  order by started_at desc
  limit 1;

  if v_running.id is not null then
    return jsonb_build_object(
      'accepted',false,
      'deferred',true,
      'runId',v_running.id,
      'status','running',
      'sourceCount',v_running.source_count,
      'startedAt',v_running.started_at,
      'triggerType',v_running.trigger_type,
      'nextAutoDueAt',v_settings.next_auto_due_at
    );
  end if;

  select count(*)::integer into v_source_count
  from public.news_source_domains
  where active=true
    and scan_enabled=true
    and homepage_url is not null;

  begin
    insert into public.news_intake_runs(
      started_by,source_count,trigger_type
    )
    values(null,v_source_count,'automatic')
    returning id into v_id;
  exception when unique_violation then
    select * into v_running
    from public.news_intake_runs
    where status='running'
    order by started_at desc
    limit 1;

    return jsonb_build_object(
      'accepted',false,
      'deferred',true,
      'runId',v_running.id,
      'status','running',
      'sourceCount',v_running.source_count,
      'startedAt',v_running.started_at,
      'triggerType',v_running.trigger_type,
      'nextAutoDueAt',v_settings.next_auto_due_at
    );
  end;

  update public.news_intake_automation_settings
  set last_auto_dispatched_at=v_slot,
      next_auto_due_at=v_slot+interval '36 hours',
      updated_at=now()
  where singleton=true;

  insert into public.admin_audit_logs(
    actor_id,action,target_type,target_id,details
  )
  values(
    null,
    'news_intake.run_start',
    'news_intake_run',
    v_id::text,
    jsonb_build_object(
      'source_count',v_source_count,
      'trigger_type','automatic',
      'scheduled_slot',v_slot,
      'next_auto_due_at',v_slot+interval '36 hours',
      'timestamp',clock_timestamp()
    )
  );

  return jsonb_build_object(
    'accepted',true,
    'runId',v_id,
    'status','running',
    'sourceCount',v_source_count,
    'startedAt',clock_timestamp(),
    'scheduledSlot',v_slot,
    'nextAutoDueAt',v_slot+interval '36 hours',
    'triggerType','automatic',
    'alreadyRunning',false
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.service_get_database_health()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select private.system_health_database_metrics();
$function$;
CREATE OR REPLACE FUNCTION public.service_record_system_health_snapshot(p_overall_status text, p_public_site jsonb, p_admin_site jsonb, p_prometheus jsonb, p_infrastructure jsonb, p_collector_version text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_id bigint;
begin
  if p_overall_status not in ('healthy','degraded','critical','unknown') then
    raise exception 'Invalid system health status.' using errcode='22023';
  end if;

  insert into public.system_health_snapshots(
    overall_status,
    public_site,
    admin_site,
    prometheus,
    infrastructure,
    collector_version
  )
  values(
    p_overall_status,
    coalesce(p_public_site,'{}'::jsonb),
    coalesce(p_admin_site,'{}'::jsonb),
    coalesce(p_prometheus,'{}'::jsonb),
    coalesce(p_infrastructure,'{}'::jsonb),
    coalesce(nullif(p_collector_version,''),'1')
  )
  returning id into v_id;

  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.service_verify_system_health_token(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'vault'
AS $function$
  select
    length(coalesce(p_token,'')) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'system_health_scheduler_secret'
        and decrypted_secret = p_token
    );
$function$;
CREATE OR REPLACE FUNCTION public.set_complaint_published_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.status='published'
     and (tg_op='INSERT' or old.status is distinct from 'published') then
    new.published_at:=clock_timestamp();
  elsif new.status<>'published' and tg_op='UPDATE' and old.status='published' then
    -- Keep the previous publication timestamp for audit/history; a future re-publish
    -- gets a fresh timestamp through the branch above.
    new.published_at:=old.published_at;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.submit_public_complaint_internal(p_payload jsonb, p_client_submission_id text, p_reporter_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_sub_id text;
  v_existing record;

  v_report_id text;
  v_year text;
  v_attempts int := 0;
  v_random_suffix int;
  v_collision_check boolean;

  v_segment text;
  v_subcategory text;
  v_title text;
  v_description text;

  v_incident_date date;
  v_incident_time time without time zone;
  v_utility_end_time time without time zone;
  v_frequency text;

  v_location jsonb;
  v_lat double precision;
  v_lng double precision;

  v_division text;
  v_district text;
  v_upazila text;
  v_area text;
  v_road text;
  v_landmark text;
  v_address text;
  v_place_id text;

  v_privacy_choice text;
  v_rel_context text;
  v_intimate_what jsonb;
  v_intimate_platform jsonb;

  v_reporter_name text;
  v_reporter_contact text;
  v_confirm_public_identity boolean;

  v_pub_prefs jsonb;

  v_parties jsonb;
  v_party jsonb;
  v_party_type text;

  v_evidence_types jsonb;
  v_evidence_desc text;
  v_has_supporting_info boolean;

  v_recent_bill_month text;
  v_recent_bill_amount numeric;
  v_previous_bill_month text;
  v_previous_bill_amount numeric;

  v_bribery_department text;
  v_bribery_service text;
  v_bribery_amount numeric;

  v_response jsonb;

  -- Private reporter submission context.
  v_rep_ctx jsonb;
  v_rep_lat double precision;
  v_rep_lng double precision;
  v_rep_accuracy double precision;
  v_rep_captured_at_raw text;
  v_rep_captured_at timestamptz;
  v_rep_visitor_id text;
  v_rep_session_id text;

BEGIN

  -- ===========================================================================
  -- 4.1 ANTI-BOT
  -- ===========================================================================

  IF (p_payload->>'website') IS NOT NULL
     AND trim(p_payload->>'website') <> ''
  THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Invalid submission parameters.';
  END IF;


  IF (p_payload->>'hp_comment') IS NOT NULL
     AND trim(p_payload->>'hp_comment') <> ''
  THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Invalid submission parameters.';
  END IF;


  -- ===========================================================================
  -- 4.2 CLIENT SUBMISSION ID
  -- ===========================================================================

  v_client_sub_id := trim(
    coalesce(
      p_client_submission_id,
      p_payload->>'client_submission_id',
      ''
    )
  );


  IF v_client_sub_id = ''
     OR length(v_client_sub_id) < 8
  THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: A valid client_submission_id is required.';
  END IF;


  -- ===========================================================================
  -- 4.3 PRIVATE REPORTER DEVICE LOCATION
  -- ===========================================================================

  v_rep_ctx := coalesce(
    p_reporter_context,
    p_payload->'reporterContext',
    p_payload->'reporter_context'
  );


  IF v_rep_ctx IS NULL
     OR jsonb_typeof(v_rep_ctx) <> 'object'
  THEN
    RAISE EXCEPTION
      'REPORTER_LOCATION_REQUIRED: Valid reporter device location is required for platform safety and spam prevention.';
  END IF;


  BEGIN
    v_rep_lat :=
      (v_rep_ctx->>'latitude')::double precision;

    v_rep_lng :=
      (v_rep_ctx->>'longitude')::double precision;

    v_rep_accuracy := coalesce(
      (v_rep_ctx->>'accuracy_meters')::double precision,
      (v_rep_ctx->>'accuracyMeters')::double precision,
      (v_rep_ctx->>'accuracy')::double precision
    );

  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION
      'INVALID_REPORTER_COORDINATES: Reporter latitude, longitude, and accuracy must be valid numbers.';
  END;


  IF v_rep_lat IS NULL
     OR v_rep_lng IS NULL
     OR v_rep_accuracy IS NULL
  THEN
    RAISE EXCEPTION
      'REPORTER_LOCATION_REQUIRED: Numeric reporter coordinates and accuracy are required.';
  END IF;


  IF v_rep_lat < -90.0
     OR v_rep_lat > 90.0
  THEN
    RAISE EXCEPTION
      'INVALID_REPORTER_COORDINATES: Reporter latitude must be between -90 and 90 degrees.';
  END IF;


  IF v_rep_lng < -180.0
     OR v_rep_lng > 180.0
  THEN
    RAISE EXCEPTION
      'INVALID_REPORTER_COORDINATES: Reporter longitude must be between -180 and 180 degrees.';
  END IF;


  IF v_rep_lat = 0.0
     AND v_rep_lng = 0.0
  THEN
    RAISE EXCEPTION
      'INVALID_REPORTER_COORDINATES: Reporter coordinates cannot be exactly 0,0.';
  END IF;


  IF v_rep_accuracy <= 0.0 THEN
    RAISE EXCEPTION
      'INVALID_REPORTER_ACCURACY: Reporter accuracy must be a positive number.';
  END IF;


  v_rep_captured_at_raw := coalesce(
    v_rep_ctx->>'captured_at',
    v_rep_ctx->>'capturedAt'
  );


  IF v_rep_captured_at_raw IS NOT NULL
     AND trim(v_rep_captured_at_raw) <> ''
  THEN
    BEGIN
      v_rep_captured_at :=
        v_rep_captured_at_raw::timestamptz;

    EXCEPTION WHEN OTHERS THEN
      v_rep_captured_at := now();
    END;

  ELSE
    v_rep_captured_at := now();
  END IF;


  v_rep_visitor_id := trim(
    coalesce(
      v_rep_ctx->>'visitor_id',
      v_rep_ctx->>'visitorId',
      ''
    )
  );


  v_rep_session_id := trim(
    coalesce(
      v_rep_ctx->>'session_id',
      v_rep_ctx->>'sessionId',
      ''
    )
  );


  IF v_rep_visitor_id = '' THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Visitor identifier is required.';
  END IF;


  IF v_rep_session_id = '' THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Session identifier is required.';
  END IF;


  -- ===========================================================================
  -- 4.4 IDEMPOTENCY
  -- ===========================================================================

  SELECT
    id,
    segment_id,
    subcategory_id,
    title,
    status,
    created_at
  INTO v_existing
  FROM public.complaints
  WHERE client_submission_id = v_client_sub_id
  LIMIT 1;


  IF v_existing.id IS NOT NULL THEN

    INSERT INTO public.complaint_submission_contexts (
      complaint_id,
      client_submission_id,
      visitor_id,
      session_id,

      reporter_latitude,
      reporter_longitude,
      accuracy_meters,
      captured_at,

      browser_name,
      browser_version,
      os_name,
      device_category,
      platform,
      language,
      timezone,

      screen_width,
      screen_height,
      user_agent,

      created_at
    )
    VALUES (
      v_existing.id,
      v_client_sub_id,
      v_rep_visitor_id,
      v_rep_session_id,

      v_rep_lat,
      v_rep_lng,
      v_rep_accuracy,
      v_rep_captured_at,

      nullif(
        trim(
          coalesce(
            v_rep_ctx->>'browser_name',
            v_rep_ctx->>'browserName',
            ''
          )
        ),
        ''
      ),

      nullif(
        trim(
          coalesce(
            v_rep_ctx->>'browser_version',
            v_rep_ctx->>'browserVersion',
            ''
          )
        ),
        ''
      ),

      nullif(
        trim(
          coalesce(
            v_rep_ctx->>'os_name',
            v_rep_ctx->>'osName',
            ''
          )
        ),
        ''
      ),

      nullif(
        trim(
          coalesce(
            v_rep_ctx->>'device_category',
            v_rep_ctx->>'deviceCategory',
            ''
          )
        ),
        ''
      ),

      nullif(
        trim(
          coalesce(
            v_rep_ctx->>'platform',
            ''
          )
        ),
        ''
      ),

      nullif(
        trim(
          coalesce(
            v_rep_ctx->>'language',
            ''
          )
        ),
        ''
      ),

      nullif(
        trim(
          coalesce(
            v_rep_ctx->>'timezone',
            ''
          )
        ),
        ''
      ),

      (v_rep_ctx->>'screen_width')::int,
      (v_rep_ctx->>'screen_height')::int,

      nullif(
        trim(
          coalesce(
            v_rep_ctx->>'user_agent',
            v_rep_ctx->>'userAgent',
            ''
          )
        ),
        ''
      ),

      now()
    )
    ON CONFLICT (client_submission_id)
    DO NOTHING;


    RETURN jsonb_build_object(
      'success', true,
      'reportId', v_existing.id,
      'message', 'Report has already been submitted.',

      'report', jsonb_build_object(
        'id', v_existing.id,
        'segment', v_existing.segment_id,
        'subcategoryId', v_existing.subcategory_id,
        'title', v_existing.title,
        'status', v_existing.status,

        'createdAt',
        to_char(
          v_existing.created_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        )
      )
    );

  END IF;


  -- ===========================================================================
  -- 4.5 CORE COMPLAINT VALIDATION
  -- ===========================================================================

  v_segment :=
    trim(coalesce(p_payload->>'segment', ''));


  v_subcategory :=
    trim(
      coalesce(
        p_payload->>'subcategoryId',
        p_payload->>'subcategory_id',
        ''
      )
    );


  v_title :=
    trim(coalesce(p_payload->>'title', ''));


  v_description :=
    trim(coalesce(p_payload->>'description', ''));


  IF v_segment NOT IN (
    'harassment',
    'rickshaw',
    'extortion',
    'load_shedding',
    'public_safety',
    'road_transport',
    'illegal_occupation'
  ) THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Invalid segment %',
      v_segment;
  END IF;


  IF v_subcategory = '' THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Subcategory is required.';
  END IF;


  IF v_title = '' THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Title is required.';
  END IF;


  IF v_description = '' THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Description is required.';
  END IF;


  IF length(v_description) > 2000 THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Description exceeds maximum allowed length of 2000 characters.';
  END IF;


  -- ===========================================================================
  -- 4.6 INCIDENT DATE
  -- ===========================================================================

  BEGIN
    v_incident_date :=
      (p_payload->>'incidentDate')::date;

  EXCEPTION WHEN OTHERS THEN
    v_incident_date := CURRENT_DATE;
  END;


  IF v_incident_date IS NULL THEN
    v_incident_date := CURRENT_DATE;
  END IF;


  -- ===========================================================================
  -- 4.7 FREQUENCY
  -- ===========================================================================

  v_frequency :=
    coalesce(
      p_payload->>'frequency',
      'one-time'
    );


  IF v_frequency NOT IN (
    'one-time',
    'repeated'
  ) THEN
    v_frequency := 'one-time';
  END IF;


  -- ===========================================================================
  -- 4.8 UTILITY / BILL TIMING
  -- ===========================================================================

  v_incident_time := NULL;
  v_utility_end_time := NULL;

  v_recent_bill_month := NULL;
  v_recent_bill_amount := NULL;
  v_previous_bill_month := NULL;
  v_previous_bill_amount := NULL;


  -- ---------------------------------------------------------------------------
  -- Load Shedding + Gas Shortage
  -- ---------------------------------------------------------------------------

  IF v_segment = 'load_shedding'
     AND v_subcategory IN (
       'load-shedding-outage',
       'gas-shortage'
     )
  THEN

    -- Start Time is mandatory.
    IF nullif(
         trim(
           coalesce(
             p_payload->>'incidentTime',
             ''
           )
         ),
         ''
       ) IS NULL
    THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Start Time is required for utility outage reports.';
    END IF;


    BEGIN
      v_incident_time :=
        (trim(p_payload->>'incidentTime'))
        ::time without time zone;

    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Invalid Start Time format.';
    END;


    -- End Time is optional.
    IF nullif(
         trim(
           coalesce(
             p_payload->>'utilityEndTime',
             p_payload->>'utility_end_time',
             ''
           )
         ),
         ''
       ) IS NOT NULL
    THEN

      BEGIN
        v_utility_end_time :=
          (
            trim(
              coalesce(
                p_payload->>'utilityEndTime',
                p_payload->>'utility_end_time'
              )
            )
          )::time without time zone;

      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION
          'VALIDATION_FAILED: Invalid Utility End Time format.';
      END;


      IF v_utility_end_time <= v_incident_time THEN
        RAISE EXCEPTION
          'VALIDATION_FAILED: Utility End Time must be after Start Time.';
      END IF;

    ELSE
      v_utility_end_time := NULL;
    END IF;


  -- ---------------------------------------------------------------------------
  -- Excess Electricity Bill
  -- ---------------------------------------------------------------------------

  ELSIF v_segment = 'load_shedding'
        AND v_subcategory = 'excess-electricity-bill'
  THEN

    -- Bills never persist outage times.
    v_incident_time := NULL;
    v_utility_end_time := NULL;


    v_recent_bill_month :=
      nullif(
        trim(
          coalesce(
            p_payload->>'recentBillMonth',
            p_payload->>'recent_bill_month',
            ''
          )
        ),
        ''
      );


    v_previous_bill_month :=
      nullif(
        trim(
          coalesce(
            p_payload->>'previousBillMonth',
            p_payload->>'previous_bill_month',
            ''
          )
        ),
        ''
      );


    IF v_recent_bill_month IS NULL THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Recent bill month is required for excess electricity bill complaints.';
    END IF;


    IF v_previous_bill_month IS NULL THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Previous bill month is required for excess electricity bill complaints.';
    END IF;


    BEGIN
      v_recent_bill_amount :=
        (p_payload->>'recentBillAmount')::numeric;

    EXCEPTION WHEN OTHERS THEN

      BEGIN
        v_recent_bill_amount :=
          (p_payload->>'recent_bill_amount')::numeric;

      EXCEPTION WHEN OTHERS THEN
        v_recent_bill_amount := NULL;
      END;

    END;


    IF v_recent_bill_amount IS NULL THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Recent bill amount is required for excess electricity bill complaints.';
    END IF;


    IF v_recent_bill_amount <= 0 THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Recent bill amount must be greater than zero.';
    END IF;


    BEGIN
      v_previous_bill_amount :=
        (p_payload->>'previousBillAmount')::numeric;

    EXCEPTION WHEN OTHERS THEN

      BEGIN
        v_previous_bill_amount :=
          (p_payload->>'previous_bill_amount')::numeric;

      EXCEPTION WHEN OTHERS THEN
        v_previous_bill_amount := NULL;
      END;

    END;


    IF v_previous_bill_amount IS NULL THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Previous bill amount is required for excess electricity bill complaints.';
    END IF;


    IF v_previous_bill_amount <= 0 THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Previous bill amount must be greater than zero.';
    END IF;


    -- Compatibility fallback for older callers that do not send incidentDate.
    IF v_incident_date IS NULL
       OR p_payload->>'incidentDate' IS NULL
    THEN

      BEGIN
        v_incident_date :=
          (v_recent_bill_month || '-01')::date;

      EXCEPTION WHEN OTHERS THEN
        v_incident_date := CURRENT_DATE;
      END;

    END IF;


  -- ---------------------------------------------------------------------------
  -- Non-Utility
  -- ---------------------------------------------------------------------------

  ELSE

    -- End Time must never leak into non-Utility submissions.
    v_utility_end_time := NULL;


    IF nullif(
         trim(
           coalesce(
             p_payload->>'incidentTime',
             ''
           )
         ),
         ''
       ) IS NOT NULL
    THEN

      BEGIN
        v_incident_time :=
          (trim(p_payload->>'incidentTime'))
          ::time without time zone;

      EXCEPTION WHEN OTHERS THEN
        v_incident_time := NULL;
      END;

    END IF;

  END IF;


  -- ===========================================================================
  -- 4.9 BRIBERY DETAILS
  -- ===========================================================================

  v_bribery_department := NULL;
  v_bribery_service := NULL;
  v_bribery_amount := NULL;

  IF v_segment = 'extortion'
     AND v_subcategory = 'bribe-demanded-service'
  THEN
    v_bribery_department := nullif(trim(coalesce(p_payload->>'briberyDepartment', p_payload->>'bribery_department', '')), '');
    v_bribery_service := nullif(trim(coalesce(p_payload->>'briberyService', p_payload->>'bribery_service', '')), '');

    IF v_bribery_department IS NOT NULL AND v_bribery_department NOT IN (
      'land_office', 'immigration_office', 'tax_office', 'customs_office',
      'traffic_police', 'brta', 'passport_office', 'city_corporation',
      'sub_registry_office', 'education_office', 'government_hospital',
      'other_government_service'
    ) THEN
      RAISE EXCEPTION 'VALIDATION_FAILED: Invalid bribery department.';
    END IF;

    IF v_bribery_service IS NOT NULL AND length(v_bribery_service) > 250 THEN
      RAISE EXCEPTION 'VALIDATION_FAILED: Bribery service/process exceeds 250 characters.';
    END IF;

    IF nullif(trim(coalesce(p_payload->>'briberyAmount', p_payload->>'bribery_amount', '')), '') IS NOT NULL THEN
      BEGIN
        v_bribery_amount := coalesce(
          nullif(trim(p_payload->>'briberyAmount'), '')::numeric,
          nullif(trim(p_payload->>'bribery_amount'), '')::numeric
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: Bribery amount must be a valid number.';
      END;

      IF v_bribery_amount <= 0 THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: Bribery amount must be greater than zero.';
      END IF;
    END IF;
  END IF;

  -- ===========================================================================
  -- 4.10 INCIDENT LOCATION
  -- Distinct from reporter-device location.
  -- ===========================================================================

  v_location :=
    p_payload->'location';


  IF v_location IS NOT NULL THEN

    BEGIN
      v_lat := coalesce(
        nullif(v_location->>'lat', '')::double precision,
        nullif(v_location->>'latitude', '')::double precision
      );

      v_lng := coalesce(
        nullif(v_location->>'lng', '')::double precision,
        nullif(v_location->>'longitude', '')::double precision
      );

    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Incident coordinates must be valid numbers.';
    END;


    v_division :=
      nullif(
        trim(
          coalesce(
            v_location->>'division',
            ''
          )
        ),
        ''
      );


    v_district :=
      nullif(
        trim(
          coalesce(
            v_location->>'district',
            ''
          )
        ),
        ''
      );


    v_upazila :=
      nullif(
        trim(
          coalesce(
            v_location->>'upazilaOrThana',
            v_location->>'upazila_or_thana',
            ''
          )
        ),
        ''
      );


    v_area :=
      nullif(
        trim(
          coalesce(
            v_location->>'area',
            ''
          )
        ),
        ''
      );


    v_road :=
      nullif(
        trim(
          coalesce(
            v_location->>'road',
            ''
          )
        ),
        ''
      );


    v_landmark :=
      nullif(
        trim(
          coalesce(
            v_location->>'landmark',
            ''
          )
        ),
        ''
      );


    v_address :=
      nullif(
        trim(
          coalesce(
            v_location->>'formattedAddress',
            v_location->>'formatted_address',
            ''
          )
        ),
        ''
      );


    v_place_id :=
      nullif(
        trim(
          coalesce(
            v_location->>'placeId',
            v_location->>'place_id',
            ''
          )
        ),
        ''
      );

  END IF;


  IF v_division IS NULL THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Incident division is required.';
  END IF;


  IF v_district IS NULL THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Incident district is required.';
  END IF;


  IF v_upazila IS NULL THEN
    RAISE EXCEPTION
      'VALIDATION_FAILED: Incident thana/upazila is required.';
  END IF;


  -- Detailed Address is optional.
  -- Division, District and Thana / Upazila remain required.


  -- Incident coordinates are optional.
  IF v_lat IS NULL
     AND v_lng IS NULL
  THEN

    NULL;


  ELSIF v_lat IS NULL
        OR v_lng IS NULL
  THEN

    RAISE EXCEPTION
      'VALIDATION_FAILED: Inconsistent incident coordinates. Both latitude and longitude must be provided, or both omitted.';


  ELSE

    IF v_lat < -90.0
       OR v_lat > 90.0
       OR v_lng < -180.0
       OR v_lng > 180.0
    THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Incident coordinates out of bounds.';
    END IF;


    IF v_lat = 0.0
       AND v_lng = 0.0
    THEN
      RAISE EXCEPTION
        'VALIDATION_FAILED: Incident coordinates cannot be 0,0.';
    END IF;

  END IF;


  -- ===========================================================================
  -- 4.10 PRIVACY / RELATIONSHIP DATA
  -- ===========================================================================

  v_privacy_choice :=
    coalesce(
      p_payload->>'privacyChoice',
      'anonymous'
    );


  IF v_privacy_choice NOT IN (
    'anonymous',
    'admin_only',
    'public_identity'
  ) THEN
    v_privacy_choice := 'anonymous';
  END IF;


  v_rel_context :=
    nullif(
      trim(
        coalesce(
          p_payload->>'relationshipContext',
          ''
        )
      ),
      ''
    );


  v_intimate_what :=
    CASE
      WHEN p_payload ? 'intimateWhatHappened'
           AND p_payload->'intimateWhatHappened' <> 'null'::jsonb
      THEN p_payload->'intimateWhatHappened'
      ELSE NULL
    END;


  v_intimate_platform :=
    CASE
      WHEN p_payload ? 'intimatePlatform'
           AND p_payload->'intimatePlatform' <> 'null'::jsonb
      THEN p_payload->'intimatePlatform'
      ELSE NULL
    END;


  -- ===========================================================================
  -- 4.11 PRIVATE REPORTER CONTACT
  -- ===========================================================================

  v_reporter_name :=
    nullif(
      trim(
        coalesce(
          p_payload->'adminContact'->>'name',
          p_payload->>'adminName',
          p_payload->>'reporterName',
          ''
        )
      ),
      ''
    );


  v_reporter_contact :=
    nullif(
      trim(
        coalesce(
          p_payload->'adminContact'->>'contact',
          p_payload->>'adminContact',
          p_payload->>'reporterContact',
          ''
        )
      ),
      ''
    );


  v_confirm_public_identity :=
    coalesce(
      (p_payload->'adminContact'->>'consentPublic')::boolean,
      (p_payload->>'confirmPublicIdentity')::boolean,
      false
    );


  v_pub_prefs :=
    coalesce(
      p_payload->'publicationPreferences',
      '{}'::jsonb
    );


  v_has_supporting_info :=
    coalesce(
      (p_payload->>'hasSupportingInfo')::boolean,
      false
    );


  v_evidence_types :=
    coalesce(
      p_payload->'evidenceTypes',
      '[]'::jsonb
    );


  v_evidence_desc :=
    nullif(
      trim(
        coalesce(
          p_payload->>'evidenceDescription',
          ''
        )
      ),
      ''
    );


  -- ===========================================================================
  -- 4.12 REPORT ID
  -- ===========================================================================

  v_year :=
    to_char(now(), 'YYYY');


  LOOP

    v_attempts :=
      v_attempts + 1;


    v_random_suffix :=
      floor(
        100000
        + random() * 900000
      )::int;


    v_report_id :=
      'SJ-'
      || v_year
      || '-'
      || v_random_suffix::text;


    SELECT EXISTS (
      SELECT 1
      FROM public.complaints
      WHERE id = v_report_id
    )
    INTO v_collision_check;


    IF NOT v_collision_check THEN
      EXIT;
    END IF;


    IF v_attempts >= 50 THEN
      RAISE EXCEPTION
        'REPORT_ID_GENERATION_FAILED: Unable to generate a unique report ID after multiple attempts. Please try again.';
    END IF;

  END LOOP;


  -- ===========================================================================
  -- 4.13 INSERT COMPLAINT
  -- ===========================================================================

  INSERT INTO public.complaints (
    id,
    client_submission_id,

    segment_id,
    subcategory_id,

    title,
    description,

    incident_date,
    incident_time,
    utility_end_time,
    frequency,

    privacy_choice,
    relationship_context,

    intimate_what_happened,
    intimate_platform,

    division,
    district,
    upazila_or_thana,
    area,
    road,
    landmark,
    formatted_address,

    latitude,
    longitude,
    place_id,

    has_supporting_info,
    evidence_types,
    evidence_description,

    publication_preferences,

    reporter_name,
    reporter_contact,
    confirm_public_identity,

    recent_bill_month,
    recent_bill_amount,
    previous_bill_month,
    previous_bill_amount,

    bribery_department,
    bribery_service,
    bribery_amount,

    status,
    created_at,
    updated_at
  )
  VALUES (
    v_report_id,
    v_client_sub_id,

    v_segment,
    v_subcategory,

    v_title,
    v_description,

    v_incident_date,
    v_incident_time,
    v_utility_end_time,
    v_frequency,

    v_privacy_choice,
    v_rel_context,

    v_intimate_what,
    v_intimate_platform,

    v_division,
    v_district,
    v_upazila,
    v_area,
    v_road,
    v_landmark,
    v_address,

    v_lat,
    v_lng,
    v_place_id,

    v_has_supporting_info,
    v_evidence_types,
    v_evidence_desc,

    v_pub_prefs,

    v_reporter_name,
    v_reporter_contact,
    v_confirm_public_identity,

    v_recent_bill_month,
    v_recent_bill_amount,
    v_previous_bill_month,
    v_previous_bill_amount,

    v_bribery_department,
    v_bribery_service,
    v_bribery_amount,

    'submitted',
    now(),
    now()
  );


  -- ===========================================================================
  -- 4.14 INSERT PRIVATE REPORTER CONTEXT
  -- ===========================================================================

  INSERT INTO public.complaint_submission_contexts (
    complaint_id,
    client_submission_id,

    visitor_id,
    session_id,

    reporter_latitude,
    reporter_longitude,
    accuracy_meters,
    captured_at,

    browser_name,
    browser_version,
    os_name,
    device_category,
    platform,
    language,
    timezone,

    screen_width,
    screen_height,
    user_agent,

    created_at
  )
  VALUES (
    v_report_id,
    v_client_sub_id,

    v_rep_visitor_id,
    v_rep_session_id,

    v_rep_lat,
    v_rep_lng,
    v_rep_accuracy,
    v_rep_captured_at,

    nullif(
      trim(
        coalesce(
          v_rep_ctx->>'browser_name',
          v_rep_ctx->>'browserName',
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          v_rep_ctx->>'browser_version',
          v_rep_ctx->>'browserVersion',
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          v_rep_ctx->>'os_name',
          v_rep_ctx->>'osName',
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          v_rep_ctx->>'device_category',
          v_rep_ctx->>'deviceCategory',
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          v_rep_ctx->>'platform',
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          v_rep_ctx->>'language',
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          v_rep_ctx->>'timezone',
          ''
        )
      ),
      ''
    ),

    (v_rep_ctx->>'screen_width')::int,
    (v_rep_ctx->>'screen_height')::int,

    nullif(
      trim(
        coalesce(
          v_rep_ctx->>'user_agent',
          v_rep_ctx->>'userAgent',
          ''
        )
      ),
      ''
    ),

    now()
  );


  -- ===========================================================================
  -- 4.15 PRIMARY REPORTED PARTY
  -- ===========================================================================

  IF (
    (
      p_payload->>'reportedSubject' IS NOT NULL
      AND trim(p_payload->>'reportedSubject') <> ''
    )
    OR
    (
      p_payload->>'roleOrDesignation' IS NOT NULL
      AND trim(p_payload->>'roleOrDesignation') <> ''
    )
    OR
    (
      p_payload->>'organization' IS NOT NULL
      AND trim(p_payload->>'organization') <> ''
    )
    OR
    (
      p_payload->>'phoneOrContact' IS NOT NULL
      AND trim(p_payload->>'phoneOrContact') <> ''
    )
    OR
    (
      p_payload->>'publicProfileHandle' IS NOT NULL
      AND trim(p_payload->>'publicProfileHandle') <> ''
    )
    OR
    (
      p_payload->>'identifyingDescription' IS NOT NULL
      AND trim(p_payload->>'identifyingDescription') <> ''
    )
    OR
    (
      p_payload->>'address' IS NOT NULL
      AND trim(p_payload->>'address') <> ''
    )
    OR
    (
      p_payload->>'subjectType' IS NOT NULL
      AND trim(p_payload->>'subjectType')
        IN (
          'individual',
          'business',
          'group',
          'organization'
        )
    )
  )
  THEN

    v_party_type :=
      trim(
        coalesce(
          p_payload->>'subjectType',
          'unknown'
        )
      );


    IF v_party_type NOT IN (
      'individual',
      'business',
      'group',
      'organization',
      'unknown'
    ) THEN
      v_party_type := 'unknown';
    END IF;


    INSERT INTO public.complaint_parties (
      complaint_id,

      name,
      party_type,
      role_or_designation,
      organization,

      phone_or_contact,
      public_profile_handle,
      address,
      identifying_description,

      created_at
    )
    VALUES (
      v_report_id,

      nullif(
        trim(
          coalesce(
            p_payload->>'reportedSubject',
            ''
          )
        ),
        ''
      ),

      v_party_type,

      nullif(
        trim(
          coalesce(
            p_payload->>'roleOrDesignation',
            ''
          )
        ),
        ''
      ),

      nullif(
        trim(
          coalesce(
            p_payload->>'organization',
            ''
          )
        ),
        ''
      ),

      coalesce(
        nullif(
          trim(
            coalesce(
              p_payload->>'phoneOrContact',
              ''
            )
          ),
          ''
        ),

        nullif(
          trim(
            coalesce(
              p_payload->>'publicProfileHandle',
              ''
            )
          ),
          ''
        )
      ),

      nullif(
        trim(
          coalesce(
            p_payload->>'publicProfileHandle',
            ''
          )
        ),
        ''
      ),

      nullif(
        trim(
          coalesce(
            p_payload->>'address',
            ''
          )
        ),
        ''
      ),

      nullif(
        trim(
          coalesce(
            p_payload->>'identifyingDescription',
            ''
          )
        ),
        ''
      ),

      now()
    );

  END IF;


  -- ===========================================================================
  -- 4.16 ADDITIONAL / MENTIONED PARTIES
  -- ===========================================================================

  v_parties :=
    p_payload->'mentionedParties';


  IF v_parties IS NOT NULL
     AND jsonb_typeof(v_parties) = 'array'
     AND jsonb_array_length(v_parties) > 0
  THEN

    FOR v_party
      IN SELECT *
      FROM jsonb_array_elements(v_parties)
    LOOP

      IF (
        (
          v_party->>'name' IS NOT NULL
          AND trim(v_party->>'name') <> ''
        )
        OR
        (
          v_party->>'roleOrDesignation' IS NOT NULL
          AND trim(v_party->>'roleOrDesignation') <> ''
        )
        OR
        (
          v_party->>'organization' IS NOT NULL
          AND trim(v_party->>'organization') <> ''
        )
        OR
        (
          v_party->>'phoneOrContact' IS NOT NULL
          AND trim(v_party->>'phoneOrContact') <> ''
        )
        OR
        (
          v_party->>'publicProfileHandle' IS NOT NULL
          AND trim(v_party->>'publicProfileHandle') <> ''
        )
        OR
        (
          v_party->>'identifyingDescription' IS NOT NULL
          AND trim(v_party->>'identifyingDescription') <> ''
        )
        OR
        (
          v_party->>'address' IS NOT NULL
          AND trim(v_party->>'address') <> ''
        )
      )
      THEN

        v_party_type :=
          trim(
            coalesce(
              v_party->>'type',
              'unknown'
            )
          );


        IF v_party_type NOT IN (
          'individual',
          'business',
          'group',
          'organization',
          'unknown'
        ) THEN
          v_party_type := 'unknown';
        END IF;


        INSERT INTO public.complaint_parties (
          complaint_id,

          name,
          party_type,
          role_or_designation,
          organization,

          phone_or_contact,
          public_profile_handle,
          address,
          identifying_description,

          created_at
        )
        VALUES (
          v_report_id,

          nullif(
            trim(
              coalesce(
                v_party->>'name',
                ''
              )
            ),
            ''
          ),

          v_party_type,

          nullif(
            trim(
              coalesce(
                v_party->>'roleOrDesignation',
                ''
              )
            ),
            ''
          ),

          nullif(
            trim(
              coalesce(
                v_party->>'organization',
                ''
              )
            ),
            ''
          ),

          coalesce(
            nullif(
              trim(
                coalesce(
                  v_party->>'phoneOrContact',
                  ''
                )
              ),
              ''
            ),

            nullif(
              trim(
                coalesce(
                  v_party->>'publicProfileHandle',
                  ''
                )
              ),
              ''
            )
          ),

          nullif(
            trim(
              coalesce(
                v_party->>'publicProfileHandle',
                ''
              )
            ),
            ''
          ),

          nullif(
            trim(
              coalesce(
                v_party->>'address',
                ''
              )
            ),
            ''
          ),

          nullif(
            trim(
              coalesce(
                v_party->>'identifyingDescription',
                ''
              )
            ),
            ''
          ),

          now()
        );

      END IF;

    END LOOP;

  END IF;


  -- ===========================================================================
  -- 4.17 INITIAL MODERATION HISTORY
  -- ===========================================================================

  INSERT INTO public.complaint_updates (
    complaint_id,
    update_type,
    note,
    is_public,
    created_at
  )
  VALUES (
    v_report_id,
    'submitted',
    'Report received and queued for moderation review.',
    false,
    now()
  );


  -- ===========================================================================
  -- 4.18 CLIENT RESPONSE
  -- ===========================================================================

  v_response :=
    jsonb_build_object(
      'success', true,
      'reportId', v_report_id,
      'message', 'Report submitted successfully.',

      'report', jsonb_build_object(
        'id', v_report_id,
        'segment', v_segment,
        'subcategoryId', v_subcategory,
        'title', v_title,
        'status', 'submitted',

        'createdAt',
        to_char(
          now() AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        ),

        'recentBillMonth',
        v_recent_bill_month,

        'recentBillAmount',
        v_recent_bill_amount,

        'previousBillMonth',
        v_previous_bill_month,

        'previousBillAmount',
        v_previous_bill_amount,

        'utilityEndTime',
        v_utility_end_time
      )
    );


  RETURN v_response;

END;
$function$;
CREATE OR REPLACE FUNCTION public.submit_public_complaint(p_payload jsonb, p_client_submission_id text, p_reporter_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_subject text;
  v_ui_language text := lower(nullif(btrim(coalesce(
    p_reporter_context->>'ui_language',
    p_reporter_context->>'uiLanguage',
    p_payload->'reporterContext'->>'ui_language',
    p_payload->'reporterContext'->>'uiLanguage',
    p_payload->'reporter_context'->>'ui_language',
    p_payload->'reporter_context'->>'uiLanguage'
  )), ''));
begin
  perform set_config(
    'app.ui_language',
    case when v_ui_language in ('bn','en') then v_ui_language else '' end,
    true
  );

  v_subject := coalesce(
    nullif(btrim(coalesce(p_reporter_context->>'visitor_id', p_reporter_context->>'visitorId')), ''),
    nullif(btrim(coalesce(p_payload->'reporterContext'->>'visitor_id', p_payload->'reporterContext'->>'visitorId')), ''),
    nullif(btrim(p_client_submission_id), '')
  );

  perform private.enforce_public_rate_limit(
    'public_report_submit', v_subject, 30, 8, interval '1 hour'
  );

  return public.submit_public_complaint_internal(
    p_payload, p_client_submission_id, p_reporter_context
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.submit_public_complaint_v2(p_payload jsonb, p_client_submission_id text, p_reporter_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_segment text;
  v_subcategory text;
  v_age_group text;
  v_relationship text;
  v_reporting_for text;
  v_mob_details jsonb;
  v_mob_trigger text;
  v_mob_spread text;
  v_mob_outcome text;
  v_mob_ongoing_status text;
  v_mob_targeted_count numeric;
  v_result jsonb;
  v_report_id text;
begin
  v_segment := trim(coalesce(p_payload->>'segment', ''));
  v_subcategory := trim(coalesce(p_payload->>'subcategoryId', p_payload->>'subcategory_id', ''));

  if v_segment = '' or not exists (
    select 1
    from public.segments s
    where s.id = v_segment
      and s.active = true
  ) then
    raise exception 'VALIDATION_FAILED: Selected reporting segment is not active.';
  end if;

  if v_subcategory = '' or not exists (
    select 1
    from public.subcategories sc
    where sc.id = v_subcategory
      and sc.segment_id = v_segment
      and sc.active = true
  ) then
    raise exception 'VALIDATION_FAILED: Selected complaint type is not active for this reporting segment.';
  end if;

  if v_segment = 'harassment' then
    v_age_group := nullif(trim(coalesce(p_payload->>'affectedPersonAgeGroup', p_payload->>'affected_person_age_group', '')), '');
    v_relationship := nullif(trim(coalesce(p_payload->>'allegedAbuserRelationship', p_payload->>'alleged_abuser_relationship', '')), '');
    v_reporting_for := nullif(trim(coalesce(p_payload->>'reportingFor', p_payload->>'reporting_for', '')), '');

    if v_age_group is null or v_age_group not in ('under_18', '18_29', '30_59', '60_plus', 'prefer_not_to_say', 'unknown_not_stated') then
      raise exception 'VALIDATION_FAILED: A valid affected person age group is required for harassment reports.';
    end if;

    if v_relationship is null or v_relationship not in ('intimate_partner', 'household_family', 'other_relative', 'friend_acquaintance', 'coworker_classmate', 'authority_caregiver_service_provider', 'stranger', 'other_or_unknown', 'neighbor', 'teacher_tutor', 'supervisor_employer', 'service_health_worker', 'transport_worker', 'law_enforcement_authority', 'multiple_people', 'other', 'unknown_not_stated') then
      raise exception 'VALIDATION_FAILED: A valid relationship with the alleged abuser is required for harassment reports.';
    end if;

    if v_reporting_for is null or v_reporting_for not in ('self', 'someone_else') then
      raise exception 'VALIDATION_FAILED: Reporting-for selection is required for harassment reports.';
    end if;
  else
    v_age_group := null;
    v_relationship := null;
    v_reporting_for := null;
  end if;

  if v_segment = 'public_safety' and v_subcategory = 'mob-justice' then
    v_mob_details := coalesce(p_payload->'mobJusticeDetails', p_payload->'mob_justice_details');

    if v_mob_details is null or jsonb_typeof(v_mob_details) <> 'object' then
      raise exception 'VALIDATION_FAILED: Mob Justice details are required.';
    end if;

    v_mob_trigger := nullif(trim(coalesce(v_mob_details->>'trigger', '')), '');
    v_mob_spread := nullif(trim(coalesce(v_mob_details->>'spread', '')), '');
    v_mob_outcome := nullif(trim(coalesce(v_mob_details->>'outcome', '')), '');
    v_mob_ongoing_status := nullif(trim(coalesce(v_mob_details->>'ongoingStatus', v_mob_details->>'ongoing_status', '')), '');

    if v_mob_trigger is null or v_mob_trigger not in (
      'suspected_theft_robbery', 'snatching_allegation', 'kidnapping_allegation',
      'sexual_offence_allegation', 'religious_sentiment_allegation',
      'personal_local_dispute', 'informal_punishment', 'other_accusation_dispute', 'unknown'
    ) then
      raise exception 'VALIDATION_FAILED: A valid Mob Justice trigger is required.';
    end if;

    if v_mob_spread is not null and v_mob_spread not in (
      'direct_accusation', 'word_of_mouth', 'social_media', 'message_group_post',
      'loudspeaker_announcement', 'local_arbitration_meeting', 'organized_gathering',
      'unknown', 'other'
    ) then
      raise exception 'VALIDATION_FAILED: Invalid Mob Justice spread channel.';
    end if;

    if v_mob_outcome is null or v_mob_outcome not in (
      'threatened_harassed', 'restrained_surrounded', 'physically_assaulted',
      'seriously_injured', 'death_reported', 'property_damaged',
      'rescued_intervention', 'ongoing', 'unknown'
    ) then
      raise exception 'VALIDATION_FAILED: A valid Mob Justice outcome is required.';
    end if;

    if v_mob_ongoing_status is null or v_mob_ongoing_status not in ('ongoing', 'ended', 'unknown') then
      raise exception 'VALIDATION_FAILED: A valid Mob Justice ongoing status is required.';
    end if;

    v_mob_targeted_count := null;
    if nullif(trim(coalesce(v_mob_details->>'targetedCount', v_mob_details->>'targeted_count', '')), '') is not null then
      begin
        v_mob_targeted_count := coalesce(
          nullif(trim(v_mob_details->>'targetedCount'), '')::numeric,
          nullif(trim(v_mob_details->>'targeted_count'), '')::numeric
        );
      exception when others then
        raise exception 'VALIDATION_FAILED: Mob Justice targeted count must be a valid whole number.';
      end;

      if v_mob_targeted_count < 1 or v_mob_targeted_count > 9999 or v_mob_targeted_count <> trunc(v_mob_targeted_count) then
        raise exception 'VALIDATION_FAILED: Mob Justice targeted count must be a whole number between 1 and 9999.';
      end if;
    end if;

    v_mob_details := jsonb_strip_nulls(jsonb_build_object(
      'trigger', v_mob_trigger,
      'spread', v_mob_spread,
      'outcome', v_mob_outcome,
      'targetedCount', v_mob_targeted_count,
      'ongoingStatus', v_mob_ongoing_status
    ));
  else
    v_mob_details := null;
  end if;

  v_result := public.submit_public_complaint(p_payload, p_client_submission_id, p_reporter_context);
  v_report_id := nullif(trim(coalesce(v_result->>'reportId', '')), '');

  if v_report_id is null then
    raise exception 'SUBMISSION_FAILED: Missing report identifier from the underlying submission.';
  end if;

  update public.complaints
  set affected_person_age_group = v_age_group,
      alleged_abuser_relationship = v_relationship,
      reporting_for = v_reporting_for,
      mob_justice_details = v_mob_details,
      updated_at = now()
  where id = v_report_id;

  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.submit_public_complaint_v3(p_payload jsonb, p_client_submission_id text, p_reporter_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_segment text := trim(coalesce(p_payload->>'segment',''));
  v_subcategory text := trim(coalesce(p_payload->>'subcategoryId',p_payload->>'subcategory_id',''));
  v_type text;
  v_context text;
  v_institution text;
  v_age text;
  v_relationship text;
  v_frequency text;
  v_legacy_age text;
  v_legacy_relationship text;
  v_legacy_frequency text;
  v_legacy_payload jsonb := p_payload;
  v_result jsonb;
  v_report_id text;
begin
  if v_segment <> 'harassment' or v_subcategory <> 'sexual-harassment' then
    return public.submit_public_complaint_v2(
      p_payload,p_client_submission_id,p_reporter_context
    );
  end if;

  v_type := nullif(trim(coalesce(
    p_payload->>'sexualHarassmentType',
    p_payload->>'sexual_harassment_type',''
  )),'');

  v_context := nullif(trim(coalesce(
    p_payload->>'sexualHarassmentContext',
    p_payload->>'sexual_harassment_context',''
  )),'');

  v_institution := nullif(trim(coalesce(
    p_payload->>'sexualHarassmentInstitution',
    p_payload->>'sexual_harassment_institution',''
  )),'');

  v_age := nullif(trim(coalesce(
    p_payload->>'affectedPersonAgeGroup',
    p_payload->>'affected_person_age_group',''
  )),'');

  v_relationship := nullif(trim(coalesce(
    p_payload->>'allegedAbuserRelationship',
    p_payload->>'alleged_abuser_relationship',''
  )),'');

  v_frequency := nullif(trim(coalesce(p_payload->>'frequency','one-time')),'');

  if v_type is null or v_type not in (
    'eve_teasing','unwanted_physical_contact',
    'sexual_comments_gestures_proposition','workplace_harassment',
    'abuse_of_power','stalking','online_digital_harassment',
    'other','unknown_not_stated'
  ) then
    raise exception 'VALIDATION_FAILED: A valid sexual harassment type is required.';
  end if;

  if v_context is null or v_context not in (
    'workplace','educational_institution','healthcare','public_transport',
    'road_public_space','home_private_space','online_social_media',
    'government_service','other','unknown_not_stated'
  ) then
    raise exception 'VALIDATION_FAILED: A valid sexual harassment incident context is required.';
  end if;

  if v_institution is not null and char_length(v_institution) > 200 then
    raise exception 'VALIDATION_FAILED: Institution or organization must be 200 characters or fewer.';
  end if;

  if v_age is null or v_age not in (
    'under_18','18_29','30_59','60_plus',
    'prefer_not_to_say','unknown_not_stated'
  ) then
    raise exception 'VALIDATION_FAILED: A valid affected person age group is required.';
  end if;

  if v_relationship is null or v_relationship not in (
    'intimate_partner','household_family','other_relative',
    'friend_acquaintance','coworker_classmate',
    'authority_caregiver_service_provider','stranger','other_or_unknown',
    'neighbor','teacher_tutor','supervisor_employer','service_health_worker',
    'transport_worker','law_enforcement_authority','multiple_people',
    'other','unknown_not_stated'
  ) then
    raise exception 'VALIDATION_FAILED: A valid relationship with the alleged abuser is required.';
  end if;

  if v_frequency not in ('one-time','repeated','ongoing','unknown_not_stated') then
    raise exception 'VALIDATION_FAILED: A valid frequency is required.';
  end if;

  v_legacy_age := case
    when v_age='unknown_not_stated' then 'prefer_not_to_say'
    else v_age
  end;

  v_legacy_relationship := case
    when v_relationship='neighbor' then 'friend_acquaintance'
    when v_relationship in (
      'teacher_tutor','supervisor_employer','service_health_worker',
      'transport_worker','law_enforcement_authority'
    ) then 'authority_caregiver_service_provider'
    when v_relationship in ('multiple_people','other','unknown_not_stated')
      then 'other_or_unknown'
    else v_relationship
  end;

  v_legacy_frequency := case
    when v_frequency='ongoing' then 'repeated'
    when v_frequency='unknown_not_stated' then 'one-time'
    else v_frequency
  end;

  v_legacy_payload :=
    jsonb_set(v_legacy_payload,'{affectedPersonAgeGroup}',to_jsonb(v_legacy_age),true);
  v_legacy_payload :=
    jsonb_set(v_legacy_payload,'{allegedAbuserRelationship}',to_jsonb(v_legacy_relationship),true);
  v_legacy_payload :=
    jsonb_set(v_legacy_payload,'{frequency}',to_jsonb(v_legacy_frequency),true);

  v_result := public.submit_public_complaint_v2(
    v_legacy_payload,p_client_submission_id,p_reporter_context
  );

  v_report_id := nullif(trim(coalesce(v_result->>'reportId','')),'');
  if v_report_id is null then
    raise exception 'SUBMISSION_FAILED: Missing report identifier.';
  end if;

  update public.complaints
  set
    affected_person_age_group = v_age,
    alleged_abuser_relationship = v_relationship,
    frequency = v_frequency,
    sexual_harassment_type = v_type,
    sexual_harassment_context = v_context,
    sexual_harassment_institution = v_institution,
    updated_at = now()
  where id = v_report_id;

  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.submit_public_configured_complaint_internal(p_payload jsonb, p_client_submission_id text, p_reporter_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_client_id text := nullif(btrim(coalesce(p_client_submission_id,p_payload->>'client_submission_id','')),'');
  v_segment text := nullif(btrim(p_payload->>'segment'),'');
  v_subcategory text := nullif(btrim(coalesce(p_payload->>'subcategoryId',p_payload->>'subcategory_id')),'');
  v_title text := nullif(btrim(p_payload->>'title'),'');
  v_description text := nullif(btrim(p_payload->>'description'),'');
  v_schema public.reporting_form_schemas%rowtype;
  v_field public.reporting_form_schema_fields%rowtype;
  v_custom jsonb := coalesce(p_payload->'customFieldAnswers','{}'::jsonb);
  v_value jsonb;
  v_text text;
  v_num numeric;
  v_option_count integer;
  v_report_id text;
  v_year text;
  v_attempt integer := 0;
  v_exists boolean;
  v_existing public.complaints%rowtype;

  v_incident_date date := current_date;
  v_incident_time time;
  v_utility_end_time time;
  v_frequency text := coalesce(nullif(btrim(p_payload->>'frequency'),''),'one-time');
  v_privacy text := coalesce(nullif(btrim(p_payload->>'privacyChoice'),''),'anonymous');

  v_location jsonb := coalesce(p_payload->'location','{}'::jsonb);
  v_division text := coalesce(nullif(btrim(v_location->>'division'),''),'');
  v_district text := coalesce(nullif(btrim(v_location->>'district'),''),'');
  v_upazila text := nullif(btrim(v_location->>'upazilaOrThana'),'');
  v_area text := nullif(btrim(v_location->>'area'),'');
  v_road text := nullif(btrim(v_location->>'road'),'');
  v_landmark text := nullif(btrim(v_location->>'landmark'),'');
  v_address text := nullif(btrim(v_location->>'formattedAddress'),'');
  v_place_id text := nullif(btrim(v_location->>'placeId'),'');
  v_lat double precision;
  v_lng double precision;

  v_reporter_name text;
  v_reporter_contact text;
  v_confirm_public boolean := false;
  v_pub_prefs jsonb := coalesce(p_payload->'publicationPreferences',
    '{"showSubjectName":false,"showOrganization":false,"showGeneralLocation":true,"showDescription":true}'::jsonb);
  v_evidence_types jsonb := coalesce(p_payload->'evidenceTypes','[]'::jsonb);
  v_evidence_desc text := nullif(btrim(p_payload->>'evidenceDescription'),'');
  v_has_support boolean := coalesce((p_payload->>'hasSupportingInfo')::boolean,false);

  v_age text := nullif(btrim(p_payload->>'affectedPersonAgeGroup'),'');
  v_relationship text := nullif(btrim(p_payload->>'allegedAbuserRelationship'),'');
  v_reporting_for text := nullif(btrim(p_payload->>'reportingFor'),'');
  v_rel_context text := nullif(btrim(p_payload->>'relationshipContext'),'');
  v_recent_month text := nullif(btrim(p_payload->>'recentBillMonth'),'');
  v_previous_month text := nullif(btrim(p_payload->>'previousBillMonth'),'');
  v_recent_amount numeric;
  v_previous_amount numeric;
  v_bribery_department text := nullif(btrim(p_payload->>'briberyDepartment'),'');
  v_bribery_service text := nullif(btrim(p_payload->>'briberyService'),'');
  v_bribery_amount numeric;
  v_mob jsonb;

  v_ctx jsonb := coalesce(p_reporter_context,p_payload->'reporterContext',p_payload->'reporter_context');
  v_rep_lat double precision;
  v_rep_lng double precision;
  v_rep_accuracy double precision;
  v_rep_visitor text;
  v_rep_session text;
  v_rep_captured timestamptz := now();

  v_parties jsonb;
  v_party jsonb;
  v_party_type text;
begin
  if coalesce(btrim(p_payload->>'website'),'') <> ''
     or coalesce(btrim(p_payload->>'hp_comment'),'') <> '' then
    raise exception 'VALIDATION_FAILED: Invalid submission parameters.';
  end if;

  if v_client_id is null or length(v_client_id) < 8 then
    raise exception 'VALIDATION_FAILED: A valid client_submission_id is required.';
  end if;

  select * into v_existing
  from public.complaints
  where client_submission_id=v_client_id
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'success',true,'reportId',v_existing.id,
      'message','Report has already been submitted.',
      'report',jsonb_build_object(
        'id',v_existing.id,'segment',v_existing.segment_id,
        'subcategoryId',v_existing.subcategory_id,'title',v_existing.title,
        'status',v_existing.status,'createdAt',v_existing.created_at
      )
    );
  end if;

  if v_segment is null or v_subcategory is null then
    raise exception 'VALIDATION_FAILED: Category and complaint type are required.';
  end if;

  if not exists(
    select 1
    from public.subcategories sc
    join public.segments s on s.id=sc.segment_id
    where sc.id=v_subcategory and sc.segment_id=v_segment
      and sc.active=true and sc.config_status='published'
      and s.active=true and s.config_status='published'
  ) then
    raise exception 'VALIDATION_FAILED: Selected category or complaint type is not active.';
  end if;

  select * into v_schema
  from public.reporting_form_schemas
  where scope_type='subcategory' and scope_id=v_subcategory
    and status='published' and engine_mode='schema'
  order by version desc
  limit 1;

  if v_schema.id is null then
    raise exception 'VALIDATION_FAILED: This complaint type is not configured for schema-driven submission.';
  end if;

  if v_custom is null or jsonb_typeof(v_custom) <> 'object' then
    raise exception 'VALIDATION_FAILED: customFieldAnswers must be an object.';
  end if;

  -- Child-safety reports use the standard composer UI with a deliberately minimal
  -- data contract. Strip hidden/stale state server-side as defense in depth so a
  -- client cannot persist fields that the current form does not expose.
  if v_subcategory='child_abduction_murder' then
    v_custom := jsonb_strip_nulls(
      jsonb_build_object('childIncidentType',v_custom->'childIncidentType')
    );
    p_payload := p_payload - array[
      'subjectType','reportedSubject','roleOrDesignation','organization',
      'publicProfileHandle','phoneOrContact','identifyingDescription','mentionedParties',
      'relationshipContext','adminContact','adminName','confirmPublicIdentity',
      'evidenceTypes','evidenceDescription','hasSupportingInfo'
    ]::text[];

    v_frequency := 'one-time';
    v_privacy := 'anonymous';
    v_reporter_name := null;
    v_reporter_contact := null;
    v_confirm_public := false;
    v_evidence_types := '[]'::jsonb;
    v_evidence_desc := null;
    v_has_support := false;
    v_rel_context := null;
    v_age := null;
    v_relationship := null;
    v_reporting_for := null;
  end if;

  -- Validate every active field against the published schema.
  for v_field in
    select * from public.reporting_form_schema_fields
    where schema_id=v_schema.id and active=true
    order by sort_order,field_key
  loop
    if v_field.storage_mode='custom_json' then
      v_value := v_custom->v_field.storage_key;
    elsif v_field.storage_mode='core_column' then
      v_value := p_payload->v_field.storage_key;
    elsif v_field.field_type='location' then
      v_value := p_payload->'location';
    elsif v_field.field_type='subject_party' then
      v_value := jsonb_build_object(
        'reportedSubject',p_payload->>'reportedSubject',
        'organization',p_payload->>'organization',
        'roleOrDesignation',p_payload->>'roleOrDesignation'
      );
    elsif v_field.field_type='evidence' then
      v_value := jsonb_build_object(
        'evidenceTypes',coalesce(p_payload->'evidenceTypes','[]'::jsonb),
        'evidenceDescription',p_payload->>'evidenceDescription'
      );
    elsif v_field.field_type='privacy' then
      v_value := to_jsonb(v_privacy);
    elsif v_field.field_type='mob_justice_details' then
      v_value := p_payload->'mobJusticeDetails';
    else
      v_value := null;
    end if;

    if v_field.required then
      if v_value is null or v_value='null'::jsonb
         or (jsonb_typeof(v_value)='string' and nullif(btrim(v_value#>>'{}'),'') is null)
         or (jsonb_typeof(v_value)='array' and jsonb_array_length(v_value)=0)
         or (v_field.field_type='location'
             and coalesce(nullif(btrim(v_location->>'district'),''),
                          nullif(btrim(v_location->>'division'),'')) is null)
      then
        raise exception 'VALIDATION_FAILED: Required field % is missing.',v_field.label_en;
      end if;
    end if;

    if v_value is null or v_value='null'::jsonb then
      continue;
    end if;

    if v_field.field_type in ('text','textarea','phone','email','url','date','time','month','select','radio') then
      v_text := nullif(btrim(v_value#>>'{}'),'');
      if v_text is not null and (v_field.validation ? 'maxLength')
         and length(v_text) > (v_field.validation->>'maxLength')::integer then
        raise exception 'VALIDATION_FAILED: Field % exceeds its maximum length.',v_field.label_en;
      end if;
    end if;

    if v_field.field_type in ('number','currency') then
      begin
        v_num := (v_value#>>'{}')::numeric;
      exception when others then
        raise exception 'VALIDATION_FAILED: Field % must be a number.',v_field.label_en;
      end;
      if (v_field.validation ? 'min') and v_num < (v_field.validation->>'min')::numeric then
        raise exception 'VALIDATION_FAILED: Field % is below the minimum.',v_field.label_en;
      end if;
      if (v_field.validation ? 'max') and v_num > (v_field.validation->>'max')::numeric then
        raise exception 'VALIDATION_FAILED: Field % exceeds the maximum.',v_field.label_en;
      end if;
    end if;

    if v_field.field_type in ('select','radio') and jsonb_array_length(v_field.options)>0 then
      select count(*) into v_option_count
      from jsonb_array_elements(v_field.options) o
      where o->>'value' = (v_value#>>'{}');
      if v_option_count=0 then
        raise exception 'VALIDATION_FAILED: Invalid option for field %.',v_field.label_en;
      end if;
    end if;

    if v_field.field_type='multiselect' then
      if jsonb_typeof(v_value)<>'array' then
        raise exception 'VALIDATION_FAILED: Field % must contain a list.',v_field.label_en;
      end if;
      if exists(
        select 1 from jsonb_array_elements_text(v_value) x(value)
        where not exists(
          select 1 from jsonb_array_elements(v_field.options) o
          where o->>'value'=x.value
        )
      ) then
        raise exception 'VALIDATION_FAILED: Invalid option for field %.',v_field.label_en;
      end if;
    end if;
  end loop;

  if v_title is null or length(v_title)>100 then
    raise exception 'VALIDATION_FAILED: A report title of 1–100 characters is required.';
  end if;
  if v_description is null or length(v_description)>2000 then
    raise exception 'VALIDATION_FAILED: A description of 1–2000 characters is required.';
  end if;

  begin
    if nullif(btrim(p_payload->>'incidentDate'),'') is not null then
      v_incident_date := (p_payload->>'incidentDate')::date;
    end if;
  exception when others then
    raise exception 'VALIDATION_FAILED: Invalid incident date.';
  end;

  begin
    if nullif(btrim(p_payload->>'incidentTime'),'') is not null then
      v_incident_time := (p_payload->>'incidentTime')::time;
    end if;
    if nullif(btrim(p_payload->>'utilityEndTime'),'') is not null then
      v_utility_end_time := (p_payload->>'utilityEndTime')::time;
    end if;
  exception when others then
    raise exception 'VALIDATION_FAILED: Invalid time value.';
  end;

  if v_frequency not in ('one-time','repeated') then v_frequency:='one-time'; end if;
  if v_privacy not in ('anonymous','admin_only','public_identity') then v_privacy:='anonymous'; end if;

  begin
    if nullif(btrim(v_location->>'lat'),'') is not null then v_lat:=(v_location->>'lat')::double precision; end if;
    if nullif(btrim(v_location->>'lng'),'') is not null then v_lng:=(v_location->>'lng')::double precision; end if;
  exception when others then
    raise exception 'VALIDATION_FAILED: Invalid incident coordinates.';
  end;
  if (v_lat is null) <> (v_lng is null) then
    raise exception 'VALIDATION_FAILED: Both incident coordinates must be provided together.';
  end if;
  if v_lat is not null and (v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 or (v_lat=0 and v_lng=0)) then
    raise exception 'VALIDATION_FAILED: Incident coordinates are invalid.';
  end if;

  begin
    if nullif(btrim(p_payload->>'recentBillAmount'),'') is not null then v_recent_amount:=(p_payload->>'recentBillAmount')::numeric; end if;
    if nullif(btrim(p_payload->>'previousBillAmount'),'') is not null then v_previous_amount:=(p_payload->>'previousBillAmount')::numeric; end if;
    if nullif(btrim(p_payload->>'briberyAmount'),'') is not null then v_bribery_amount:=(p_payload->>'briberyAmount')::numeric; end if;
  exception when others then
    raise exception 'VALIDATION_FAILED: Invalid numeric amount.';
  end;

  if v_segment='public_safety' and v_subcategory='mob-justice' then
    v_mob := p_payload->'mobJusticeDetails';
  else
    v_mob := null;
  end if;

  v_reporter_name := nullif(btrim(coalesce(p_payload->'adminContact'->>'name',p_payload->>'adminName')),'');
  v_reporter_contact := nullif(btrim(coalesce(p_payload->'adminContact'->>'contact',p_payload->>'adminContact')),'');
  begin
    v_confirm_public := coalesce((p_payload->'adminContact'->>'consentPublic')::boolean,
                                 (p_payload->>'confirmPublicIdentity')::boolean,false);
  exception when others then
    v_confirm_public := false;
  end;
  if v_subcategory='child_abduction_murder' then
    v_reporter_name := null;
    v_reporter_contact := null;
    v_confirm_public := false;
  end if;

  -- Required private reporter/device context.
  if v_ctx is null or jsonb_typeof(v_ctx)<>'object' then
    raise exception 'REPORTER_LOCATION_REQUIRED: Valid reporter device location is required.';
  end if;
  begin
    v_rep_lat := (v_ctx->>'latitude')::double precision;
    v_rep_lng := (v_ctx->>'longitude')::double precision;
    v_rep_accuracy := coalesce((v_ctx->>'accuracy_meters')::double precision,
                               (v_ctx->>'accuracyMeters')::double precision,
                               (v_ctx->>'accuracy')::double precision);
  exception when others then
    raise exception 'INVALID_REPORTER_COORDINATES: Reporter location values are invalid.';
  end;
  if v_rep_lat is null or v_rep_lng is null or v_rep_accuracy is null
     or v_rep_lat < -90 or v_rep_lat > 90 or v_rep_lng < -180 or v_rep_lng > 180
     or (v_rep_lat=0 and v_rep_lng=0) or v_rep_accuracy<=0 then
    raise exception 'INVALID_REPORTER_COORDINATES: Reporter location values are invalid.';
  end if;
  v_rep_visitor := nullif(btrim(coalesce(v_ctx->>'visitor_id',v_ctx->>'visitorId')),'');
  v_rep_session := nullif(btrim(coalesce(v_ctx->>'session_id',v_ctx->>'sessionId')),'');
  if v_rep_visitor is null or v_rep_session is null then
    raise exception 'VALIDATION_FAILED: Visitor and session identifiers are required.';
  end if;
  begin
    if nullif(btrim(coalesce(v_ctx->>'captured_at',v_ctx->>'capturedAt')),'') is not null then
      v_rep_captured := coalesce(v_ctx->>'captured_at',v_ctx->>'capturedAt')::timestamptz;
    end if;
  exception when others then v_rep_captured:=now(); end;

  v_year:=to_char(now(),'YYYY');
  loop
    v_attempt:=v_attempt+1;
    v_report_id:='SJ-'||v_year||'-'||floor(100000+random()*900000)::integer::text;
    select exists(select 1 from public.complaints where id=v_report_id) into v_exists;
    exit when not v_exists;
    if v_attempt>=50 then raise exception 'REPORT_ID_GENERATION_FAILED'; end if;
  end loop;

  insert into public.complaints(
    id,client_submission_id,segment_id,subcategory_id,title,description,
    incident_date,incident_time,utility_end_time,frequency,privacy_choice,
    reporter_name,reporter_contact,confirm_public_identity,
    division,district,upazila_or_thana,area,road,landmark,formatted_address,
    latitude,longitude,place_id,has_supporting_info,evidence_types,evidence_description,
    publication_preferences,relationship_context,recent_bill_month,recent_bill_amount,
    previous_bill_month,previous_bill_amount,bribery_department,bribery_service,bribery_amount,
    affected_person_age_group,alleged_abuser_relationship,reporting_for,mob_justice_details,
    form_schema_version,custom_field_answers,status,created_at,updated_at
  )
  values(
    v_report_id,v_client_id,v_segment,v_subcategory,v_title,v_description,
    v_incident_date,v_incident_time,v_utility_end_time,v_frequency,v_privacy,
    v_reporter_name,v_reporter_contact,v_confirm_public,
    v_division,v_district,v_upazila,v_area,v_road,v_landmark,v_address,
    v_lat,v_lng,v_place_id,v_has_support,v_evidence_types,v_evidence_desc,
    v_pub_prefs,v_rel_context,v_recent_month,v_recent_amount,
    v_previous_month,v_previous_amount,v_bribery_department,v_bribery_service,v_bribery_amount,
    v_age,v_relationship,v_reporting_for,v_mob,
    v_schema.version,v_custom,'submitted',now(),now()
  );

  insert into public.complaint_submission_contexts(
    complaint_id,client_submission_id,visitor_id,session_id,
    reporter_latitude,reporter_longitude,accuracy_meters,captured_at,
    browser_name,browser_version,os_name,device_category,platform,language,timezone,
    screen_width,screen_height,user_agent,created_at
  )
  values(
    v_report_id,v_client_id,v_rep_visitor,v_rep_session,
    v_rep_lat,v_rep_lng,v_rep_accuracy,v_rep_captured,
    nullif(btrim(coalesce(v_ctx->>'browser_name',v_ctx->>'browserName')),''),
    nullif(btrim(coalesce(v_ctx->>'browser_version',v_ctx->>'browserVersion')),''),
    nullif(btrim(coalesce(v_ctx->>'os_name',v_ctx->>'osName')),''),
    nullif(btrim(coalesce(v_ctx->>'device_category',v_ctx->>'deviceCategory')),''),
    nullif(btrim(v_ctx->>'platform'),''),
    nullif(btrim(v_ctx->>'language'),''),
    nullif(btrim(v_ctx->>'timezone'),''),
    nullif(v_ctx->>'screen_width','')::integer,
    nullif(v_ctx->>'screen_height','')::integer,
    nullif(btrim(coalesce(v_ctx->>'user_agent',v_ctx->>'userAgent')),''),
    now()
  );

  -- Optional primary party.
  if coalesce(btrim(p_payload->>'reportedSubject'),'') <> ''
     or coalesce(btrim(p_payload->>'organization'),'') <> ''
     or coalesce(btrim(p_payload->>'roleOrDesignation'),'') <> '' then
    v_party_type:=coalesce(nullif(btrim(p_payload->>'subjectType'),''),'unknown');
    if v_party_type not in ('individual','business','group','organization','unknown') then
      v_party_type:='unknown';
    end if;
    insert into public.complaint_parties(
      complaint_id,name,party_type,role_or_designation,organization,
      phone_or_contact,public_profile_handle,identifying_description,created_at
    )
    values(
      v_report_id,nullif(btrim(p_payload->>'reportedSubject'),''),
      v_party_type,nullif(btrim(p_payload->>'roleOrDesignation'),''),
      nullif(btrim(p_payload->>'organization'),''),
      nullif(btrim(coalesce(p_payload->>'phoneOrContact',p_payload->>'publicProfileHandle')),''),
      nullif(btrim(p_payload->>'publicProfileHandle'),''),
      nullif(btrim(p_payload->>'identifyingDescription'),''),now()
    );
  end if;

  v_parties:=p_payload->'mentionedParties';
  if v_parties is not null and jsonb_typeof(v_parties)='array' then
    for v_party in select * from jsonb_array_elements(v_parties)
    loop
      if coalesce(btrim(v_party->>'name'),'')=''
         and coalesce(btrim(v_party->>'organization'),'')=''
         and coalesce(btrim(v_party->>'roleOrDesignation'),'')='' then
        continue;
      end if;
      v_party_type:=coalesce(nullif(btrim(v_party->>'type'),''),'unknown');
      if v_party_type not in ('individual','business','group','organization','unknown') then v_party_type:='unknown'; end if;
      insert into public.complaint_parties(
        complaint_id,name,party_type,role_or_designation,organization,
        phone_or_contact,public_profile_handle,identifying_description,created_at
      ) values(
        v_report_id,nullif(btrim(v_party->>'name'),''),v_party_type,
        nullif(btrim(v_party->>'roleOrDesignation'),''),
        nullif(btrim(v_party->>'organization'),''),
        nullif(btrim(coalesce(v_party->>'phoneOrContact',v_party->>'publicProfileHandle')),''),
        nullif(btrim(v_party->>'publicProfileHandle'),''),
        nullif(btrim(v_party->>'identifyingDescription'),''),now()
      );
    end loop;
  end if;

  insert into public.complaint_updates(complaint_id,update_type,note,is_public,created_at)
  values(v_report_id,'submitted','Report received and queued for moderation review.',false,now());

  return jsonb_build_object(
    'success',true,'reportId',v_report_id,'message','Report submitted successfully.',
    'report',jsonb_build_object(
      'id',v_report_id,'segment',v_segment,'subcategoryId',v_subcategory,
      'title',v_title,'status','submitted','createdAt',now(),
      'formSchemaVersion',v_schema.version
    )
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.submit_public_configured_complaint(p_payload jsonb, p_client_submission_id text, p_reporter_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_subject text;
  v_ui_language text := lower(nullif(btrim(coalesce(
    p_reporter_context->>'ui_language',
    p_reporter_context->>'uiLanguage',
    p_payload->'reporterContext'->>'ui_language',
    p_payload->'reporterContext'->>'uiLanguage',
    p_payload->'reporter_context'->>'ui_language',
    p_payload->'reporter_context'->>'uiLanguage'
  )), ''));
begin
  perform set_config(
    'app.ui_language',
    case when v_ui_language in ('bn','en') then v_ui_language else '' end,
    true
  );

  v_subject := coalesce(
    nullif(btrim(coalesce(p_reporter_context->>'visitor_id', p_reporter_context->>'visitorId')), ''),
    nullif(btrim(coalesce(p_payload->'reporterContext'->>'visitor_id', p_payload->'reporterContext'->>'visitorId')), ''),
    nullif(btrim(p_client_submission_id), '')
  );

  perform private.enforce_public_rate_limit(
    'public_report_submit', v_subject, 30, 8, interval '1 hour'
  );

  return public.submit_public_configured_complaint_internal(
    p_payload, p_client_submission_id, p_reporter_context
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.submit_public_response_internal(p_report_id text, p_response_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_report_id text;
  v_complaint_status text;
  v_response_type text;
  v_year text;
  v_response_id text;
  v_attempts int := 0;
  v_collision_check boolean;

  -- Common fields
  v_content text;
  v_incident_date date;
  v_incident_date_text text;

  -- Citizen information fields
  v_contact_consent boolean := false;
  v_contact_info text;

  -- Subject response fields
  v_responder_type text;
  v_responder_name text;
  v_designation text;
  v_organization_name text;
  v_contact_email_or_phone text;
  v_official_statement text;
  v_supporting_documents_note text;
  v_request_correction_or_removal boolean := false;
  v_correction_details text;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Validate Target Report Existence & Published Status
  -- -------------------------------------------------------------------------

  v_report_id := nullif(trim(coalesce(p_report_id, '')), '');

  IF v_report_id IS NULL THEN
    RAISE EXCEPTION
      'REPORT_ID_REQUIRED: A valid report ID must be provided.';
  END IF;

  SELECT status
  INTO v_complaint_status
  FROM public.complaints
  WHERE id = v_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'REPORT_NOT_FOUND: Referenced complaint % does not exist.',
      v_report_id;
  END IF;

  IF v_complaint_status <> 'published' THEN
    RAISE EXCEPTION
      'INVALID_REPORT_STATUS: Responses can only be submitted for published complaints. (Current status: %)',
      v_complaint_status;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. Validate Response Type
  -- -------------------------------------------------------------------------

  v_response_type :=
    nullif(trim(coalesce(p_response_type, '')), '');

  IF v_response_type IS NULL
     OR v_response_type NOT IN (
       'citizen_information',
       'subject_response'
     )
  THEN
    RAISE EXCEPTION
      'INVALID_RESPONSE_TYPE: Response type must be citizen_information or subject_response.';
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. Validate Payload According to Canonical Type
  -- -------------------------------------------------------------------------

  IF v_response_type = 'citizen_information' THEN

    -- Citizen Information:
    -- content/description required, minimum 10 trimmed characters.
    v_content :=
      nullif(
        trim(
          coalesce(
            p_payload->>'content',
            p_payload->>'description',
            ''
          )
        ),
        ''
      );

    IF v_content IS NULL OR length(v_content) < 10 THEN
      RAISE EXCEPTION
        'CONTENT_TOO_SHORT: Description or content must be at least 10 characters.';
    END IF;

    -- Contact consent & private contact info
    v_contact_consent := coalesce(
      (p_payload->>'contactConsent')::boolean,
      (p_payload->>'contact_consent')::boolean,
      false
    );

    IF v_contact_consent THEN
      v_contact_info :=
        nullif(
          trim(
            coalesce(
              p_payload->>'contactInfo',
              p_payload->>'contact_info',
              ''
            )
          ),
          ''
        );
    ELSE
      v_contact_info := NULL;
    END IF;

    -- Optional incident date
    v_incident_date_text :=
      nullif(
        trim(
          coalesce(
            p_payload->>'incidentDate',
            p_payload->>'incident_date',
            p_payload->>'witnessDate',
            ''
          )
        ),
        ''
      );

    IF v_incident_date_text IS NOT NULL THEN
      BEGIN
        v_incident_date := v_incident_date_text::date;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION
            'INVALID_INCIDENT_DATE: Provided incident date "%" is not a valid date format (expected YYYY-MM-DD).',
            v_incident_date_text;
      END;

      IF v_incident_date > CURRENT_DATE THEN
        RAISE EXCEPTION
          'FUTURE_INCIDENT_DATE: Incident date cannot be in the future (provided: %, current: %).',
          v_incident_date,
          CURRENT_DATE;
      END IF;
    ELSE
      v_incident_date := NULL;
    END IF;

  ELSIF v_response_type = 'subject_response' THEN

    -- -----------------------------------------------------------------------
    -- IMPORTANT CONTRACT CHANGE:
    --
    -- responder_type is OPTIONAL.
    --
    -- Missing / blank responderType:
    --   -> NULL
    --   -> VALID
    --
    -- Existing legacy values remain valid:
    --   mentioned_person
    --   organization_rep
    --   legal_rep
    --
    -- Unknown non-null values remain invalid.
    -- -----------------------------------------------------------------------

    v_responder_type :=
      nullif(
        trim(
          coalesce(
            p_payload->>'responderType',
            p_payload->>'responder_type',
            ''
          )
        ),
        ''
      );

    IF v_responder_type IS NOT NULL
       AND v_responder_type NOT IN (
         'mentioned_person',
         'organization_rep',
         'legal_rep'
       )
    THEN
      RAISE EXCEPTION
        'INVALID_RESPONDER_TYPE: Responder type must be mentioned_person, organization_rep, or legal_rep.';
    END IF;

    -- Full name required
    v_responder_name :=
      nullif(
        trim(
          coalesce(
            p_payload->>'responderName',
            p_payload->>'responder_name',
            ''
          )
        ),
        ''
      );

    IF v_responder_name IS NULL THEN
      RAISE EXCEPTION
        'RESPONDER_NAME_REQUIRED: Responder name is required.';
    END IF;

    -- Email or phone required
    v_contact_email_or_phone :=
      nullif(
        trim(
          coalesce(
            p_payload->>'contactEmailOrPhone',
            p_payload->>'contact_email_or_phone',
            ''
          )
        ),
        ''
      );

    IF v_contact_email_or_phone IS NULL THEN
      RAISE EXCEPTION
        'CONTACT_REQUIRED: Contact email or phone is required.';
    END IF;

    -- Response / clarification required
    -- Minimum 10 trimmed characters
    v_official_statement :=
      nullif(
        trim(
          coalesce(
            p_payload->>'officialStatement',
            p_payload->>'official_statement',
            p_payload->>'content',
            ''
          )
        ),
        ''
      );

    IF v_official_statement IS NULL
       OR length(v_official_statement) < 10
    THEN
      RAISE EXCEPTION
        'STATEMENT_REQUIRED: Official statement must be at least 10 characters.';
    END IF;

    v_content := v_official_statement;

    -- Optional subject metadata
    v_designation :=
      nullif(
        trim(
          coalesce(
            p_payload->>'designation',
            ''
          )
        ),
        ''
      );

    v_organization_name :=
      nullif(
        trim(
          coalesce(
            p_payload->>'organizationName',
            p_payload->>'organization_name',
            ''
          )
        ),
        ''
      );

    v_supporting_documents_note :=
      nullif(
        trim(
          coalesce(
            p_payload->>'supportingDocumentsNote',
            p_payload->>'supporting_documents_note',
            ''
          )
        ),
        ''
      );

    -- Legacy optional correction/review request
    v_request_correction_or_removal := coalesce(
      (p_payload->>'requestCorrectionOrRemoval')::boolean,
      (p_payload->>'request_correction_or_removal')::boolean,
      false
    );

    IF v_request_correction_or_removal THEN
      v_correction_details :=
        nullif(
          trim(
            coalesce(
              p_payload->>'correctionDetails',
              p_payload->>'correction_details',
              ''
            )
          ),
          ''
        );
    ELSE
      v_correction_details := NULL;
    END IF;

    -- Optional incident date
    v_incident_date_text :=
      nullif(
        trim(
          coalesce(
            p_payload->>'incidentDate',
            p_payload->>'incident_date',
            ''
          )
        ),
        ''
      );

    IF v_incident_date_text IS NOT NULL THEN
      BEGIN
        v_incident_date := v_incident_date_text::date;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION
            'INVALID_INCIDENT_DATE: Provided incident date "%" is not a valid date format (expected YYYY-MM-DD).',
            v_incident_date_text;
      END;

      IF v_incident_date > CURRENT_DATE THEN
        RAISE EXCEPTION
          'FUTURE_INCIDENT_DATE: Incident date cannot be in the future (provided: %, current: %).',
          v_incident_date,
          CURRENT_DATE;
      END IF;
    ELSE
      v_incident_date := NULL;
    END IF;

  END IF;

  -- -------------------------------------------------------------------------
  -- 4. Generate Unique Response ID
  -- SR-{YEAR}-{6 DIGIT RANDOM NUMBER}
  -- -------------------------------------------------------------------------

  v_year := to_char(now(), 'YYYY');

  LOOP
    v_attempts := v_attempts + 1;

    v_response_id :=
      'SR-'
      || v_year
      || '-'
      || floor(100000 + random() * 900000)::int::text;

    SELECT EXISTS (
      SELECT 1
      FROM public.complaint_responses
      WHERE id = v_response_id
    )
    INTO v_collision_check;

    IF NOT v_collision_check THEN
      EXIT;
    END IF;

    IF v_attempts >= 50 THEN
      RAISE EXCEPTION
        'RESPONSE_ID_GENERATION_FAILED: Unable to generate a unique response ID after multiple attempts. Please try again.';
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 5. Insert
  -- -------------------------------------------------------------------------

  INSERT INTO public.complaint_responses (
    id,
    complaint_id,
    response_type,
    status,
    content,
    incident_date,
    created_at,
    updated_at,
    published_at,
    contact_consent,
    contact_info,
    responder_type,
    responder_name,
    designation,
    organization_name,
    contact_email_or_phone,
    official_statement,
    supporting_documents_note,
    request_correction_or_removal,
    correction_details
  )
  VALUES (
    v_response_id,
    v_report_id,
    v_response_type,
    'pending_review',
    v_content,
    v_incident_date,
    now(),
    now(),
    NULL,
    coalesce(v_contact_consent, false),
    v_contact_info,
    v_responder_type,
    v_responder_name,
    v_designation,
    v_organization_name,
    v_contact_email_or_phone,
    v_official_statement,
    v_supporting_documents_note,
    coalesce(v_request_correction_or_removal, false),
    v_correction_details
  );

  -- -------------------------------------------------------------------------
  -- 6. Safe client response
  -- Never expose private contact or internal moderation fields.
  -- -------------------------------------------------------------------------

  RETURN jsonb_build_object(
    'success', true,
    'responseId', v_response_id,
    'reportId', v_report_id,
    'status', 'pending_review',
    'message', 'Response submitted successfully.'
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.submit_public_response(p_report_id text, p_response_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_report_id text := upper(btrim(coalesce(p_report_id, '')));
  v_subject text;
begin
  v_subject := nullif(btrim(coalesce(p_payload->>'visitorId', p_payload->>'visitor_id', '')), '');

  perform private.enforce_public_rate_limit(
    'public_response', v_subject, 60, 30, interval '1 hour'
  );
  perform private.enforce_public_rate_limit(
    'public_response:' || left(v_report_id, 64), v_subject, 12, 6, interval '1 hour'
  );

  return public.submit_public_response_internal(
    p_report_id, p_response_type, p_payload
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.submit_public_response_v2(p_report_id text, p_response_type text, p_payload jsonb, p_visitor_id text, p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_visitor_id text := lower(nullif(btrim(p_visitor_id),''));
  v_session_id text := lower(nullif(btrim(p_session_id),''));
  v_type text := lower(nullif(btrim(p_response_type),''));
  v_hour_visitor integer;
  v_hour_session integer;
  v_day_visitor integer;
  v_result jsonb;
  v_lock_visitor bigint;
  v_lock_session bigint;
begin
  if v_visitor_id is null
     or v_visitor_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_session_id is null
     or v_session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'INVALID_RESPONSE_CONTEXT'; end if;

  if v_type not in ('citizen_information','subject_response') then
    raise exception 'INVALID_RESPONSE_TYPE';
  end if;

  v_lock_visitor := pg_catalog.hashtextextended('response:visitor:' || v_visitor_id, 0);
  v_lock_session := pg_catalog.hashtextextended('response:session:' || v_session_id, 0);

  if v_lock_visitor <= v_lock_session then
    perform pg_advisory_xact_lock(v_lock_visitor);
    perform pg_advisory_xact_lock(v_lock_session);
  else
    perform pg_advisory_xact_lock(v_lock_session);
    perform pg_advisory_xact_lock(v_lock_visitor);
  end if;

  select count(*) into v_hour_visitor
  from public.public_response_rate_events
  where visitor_id=v_visitor_id and created_at > now() - interval '1 hour';

  select count(*) into v_hour_session
  from public.public_response_rate_events
  where session_id=v_session_id and created_at > now() - interval '1 hour';

  select count(*) into v_day_visitor
  from public.public_response_rate_events
  where visitor_id=v_visitor_id and created_at > now() - interval '24 hours';

  if v_hour_visitor >= 10 or v_hour_session >= 6 or v_day_visitor >= 30 then
    raise exception 'RATE_LIMITED';
  end if;

  v_result := public.submit_public_response(p_report_id,v_type,p_payload);

  insert into public.public_response_rate_events(
    report_id,visitor_id,session_id,response_type
  )
  values(upper(btrim(p_report_id)),v_visitor_id,v_session_id,v_type);

  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.track_public_report_engagement(p_report_id text, p_event_type text, p_visitor_id text, p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_report_id text := upper(nullif(btrim(p_report_id),''));
  v_event_type text := lower(nullif(btrim(p_event_type),''));
  v_visitor_id text := lower(nullif(btrim(p_visitor_id),''));
  v_session_id text := lower(nullif(btrim(p_session_id),''));
  v_inserted integer := 0;
  v_view_count bigint;
  v_share_count bigint;
  v_recent_visitor integer;
  v_recent_report integer;
begin
  if v_report_id is null or not exists (
    select 1 from public.complaints c
    where upper(c.id)=v_report_id and c.status='published'
  ) then
    return null;
  end if;

  if v_event_type not in ('view','share') then
    raise exception 'INVALID_ENGAGEMENT_EVENT';
  end if;

  if v_visitor_id is null
     or v_visitor_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_session_id is null
     or v_session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception 'INVALID_ENGAGEMENT_CONTEXT';
  end if;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('engagement:visitor:' || v_visitor_id, 0)
  );

  select count(*) into v_recent_visitor
  from public.public_engagement_events e
  where e.visitor_id=v_visitor_id
    and e.created_at > now() - interval '1 minute';

  if v_recent_visitor >= 20 then
    raise exception 'RATE_LIMITED';
  end if;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'engagement:report:' || v_report_id || ':' || v_event_type,
      0
    )
  );

  select count(*) into v_recent_report
  from public.public_engagement_events e
  where e.report_id=v_report_id
    and e.event_type=v_event_type
    and e.created_at > now() - interval '1 minute';

  if v_recent_report >= 300 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.public_engagement_events(
    report_id,visitor_id,session_id,event_type
  )
  values(v_report_id,v_visitor_id,v_session_id,v_event_type)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    if v_event_type='view' then
      update public.complaints c
      set public_view_count=coalesce(c.public_view_count,0)+1
      where upper(c.id)=v_report_id and c.status='published'
      returning c.public_view_count,c.public_share_count
      into v_view_count,v_share_count;
    else
      update public.complaints c
      set public_share_count=coalesce(c.public_share_count,0)+1
      where upper(c.id)=v_report_id and c.status='published'
      returning c.public_view_count,c.public_share_count
      into v_view_count,v_share_count;
    end if;
  else
    select c.public_view_count,c.public_share_count
    into v_view_count,v_share_count
    from public.complaints c
    where upper(c.id)=v_report_id and c.status='published';
  end if;

  return jsonb_build_object(
    'viewCount',coalesce(v_view_count,0),
    'shareCount',coalesce(v_share_count,0),
    'counted',v_inserted=1
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.validate_configured_complaint_answers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_schema public.reporting_form_schemas%rowtype;
  v_field public.reporting_form_schema_fields%rowtype;
  v_value jsonb;
  v_text text;
  v_num numeric;
  v_digits text;
begin
  if new.form_schema_version is null then
    return new;
  end if;

  select *
  into v_schema
  from public.reporting_form_schemas
  where scope_type='subcategory'
    and scope_id=new.subcategory_id
    and version=new.form_schema_version
    and status in ('published','archived')
  order by case status when 'published' then 0 else 1 end
  limit 1;

  if v_schema.id is null then
    raise exception 'VALIDATION_FAILED: Reporting form schema version is not available.';
  end if;

  if new.custom_field_answers is null
     or jsonb_typeof(new.custom_field_answers) <> 'object' then
    raise exception 'VALIDATION_FAILED: customFieldAnswers must be an object.';
  end if;

  for v_field in
    select *
    from public.reporting_form_schema_fields
    where schema_id=v_schema.id
      and active=true
      and storage_mode='custom_json'
    order by sort_order,field_key
  loop
    v_value := new.custom_field_answers->v_field.storage_key;

    if v_field.required
       and not (
         lower(coalesce(new.custom_field_answers->>'trustedSourceAuto','false'))='true'
         and coalesce(new.custom_field_answers->>'sourceTruthMode','')='approved_publisher'
       ) then
      if v_value is null
         or v_value='null'::jsonb
         or (jsonb_typeof(v_value)='string' and nullif(btrim(v_value#>>'{}'),'') is null)
         or (jsonb_typeof(v_value)='array' and jsonb_array_length(v_value)=0)
         or (v_field.field_type='checkbox' and v_value='false'::jsonb)
      then
        raise exception 'VALIDATION_FAILED: Required field % is missing.', v_field.label_en;
      end if;
    end if;

    if v_value is null or v_value='null'::jsonb then
      continue;
    end if;

    if v_field.field_type='checkbox' then
      if jsonb_typeof(v_value) <> 'boolean' then
        raise exception 'VALIDATION_FAILED: Field % must be true or false.', v_field.label_en;
      end if;
      continue;
    end if;

    if v_field.field_type in ('text','textarea','phone','email','url','date','time','month','select','radio') then
      if jsonb_typeof(v_value) <> 'string' then
        raise exception 'VALIDATION_FAILED: Field % must contain text.', v_field.label_en;
      end if;

      v_text := nullif(btrim(v_value#>>'{}'),'');
      if v_text is not null
         and (v_field.validation ? 'minLength')
         and length(v_text) < (v_field.validation->>'minLength')::integer then
        raise exception 'VALIDATION_FAILED: Field % is shorter than its minimum length.', v_field.label_en;
      end if;

      if v_text is not null
         and (v_field.validation ? 'maxLength')
         and length(v_text) > (v_field.validation->>'maxLength')::integer then
        raise exception 'VALIDATION_FAILED: Field % exceeds its maximum length.', v_field.label_en;
      end if;

      if v_field.field_type='email'
         and v_text is not null
         and v_text !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
        raise exception 'VALIDATION_FAILED: Field % must be a valid email address.', v_field.label_en;
      end if;

      if v_field.field_type='url'
         and v_text is not null
         and v_text !~* '^https?://[^[:space:]]+$' then
        raise exception 'VALIDATION_FAILED: Field % must be a valid HTTP or HTTPS URL.', v_field.label_en;
      end if;

      if v_field.field_type='phone' and v_text is not null then
        if v_text !~ '^\+?[0-9 ()-]{7,25}$' then
          raise exception 'VALIDATION_FAILED: Field % must be a valid phone number.', v_field.label_en;
        end if;
        v_digits := regexp_replace(v_text,'[^0-9]','','g');
        if length(v_digits) < 7 or length(v_digits) > 15 then
          raise exception 'VALIDATION_FAILED: Field % must contain 7 to 15 digits.', v_field.label_en;
        end if;
      end if;
    end if;

    if v_field.field_type in ('number','currency') then
      begin
        v_num := (v_value#>>'{}')::numeric;
      exception when others then
        raise exception 'VALIDATION_FAILED: Field % must be a number.', v_field.label_en;
      end;

      if (v_field.validation ? 'min')
         and v_num < (v_field.validation->>'min')::numeric then
        raise exception 'VALIDATION_FAILED: Field % is below the minimum.', v_field.label_en;
      end if;

      if (v_field.validation ? 'max')
         and v_num > (v_field.validation->>'max')::numeric then
        raise exception 'VALIDATION_FAILED: Field % exceeds the maximum.', v_field.label_en;
      end if;
    end if;

    if v_field.field_type in ('select','radio')
       and jsonb_array_length(v_field.options)>0
       and not exists (
         select 1
         from jsonb_array_elements(v_field.options) option_row
         where option_row->>'value' = (v_value#>>'{}')
       ) then
      raise exception 'VALIDATION_FAILED: Invalid option for field %.', v_field.label_en;
    end if;

    if v_field.field_type='multiselect' then
      if jsonb_typeof(v_value) <> 'array' then
        raise exception 'VALIDATION_FAILED: Field % must contain a list.', v_field.label_en;
      end if;

      if exists(
        select 1
        from jsonb_array_elements_text(v_value) selected(value)
        where not exists(
          select 1
          from jsonb_array_elements(v_field.options) option_row
          where option_row->>'value'=selected.value
        )
      ) then
        raise exception 'VALIDATION_FAILED: Invalid option for field %.', v_field.label_en;
      end if;
    end if;
  end loop;

  return new;
end;
$function$;

-- Add check constraints after their captured helper functions exist.
ALTER TABLE "public"."admin_notification_event_catalogue" ADD CONSTRAINT "chk_event_catalogue_category" CHECK (category = ANY (ARRAY['complaint'::text, 'administration'::text, 'role'::text, 'security'::text, 'personal'::text, 'system'::text]));
ALTER TABLE "public"."admin_notification_event_catalogue" ADD CONSTRAINT "chk_event_catalogue_default_layer" CHECK (default_layer = ANY (ARRAY['action_required'::text, 'workflow_activity'::text, 'administrative_oversight'::text, 'security_privilege'::text, 'personal_account'::text, 'system_operational'::text]));
ALTER TABLE "public"."admin_notification_event_catalogue" ADD CONSTRAINT "chk_event_catalogue_default_severity" CHECK (default_severity = ANY (ARRAY['info'::text, 'action_required'::text, 'warning'::text, 'security'::text]));
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "chk_notifications_audience_mode" CHECK (audience_mode = ANY (ARRAY['permission'::text, 'super_admin_only'::text, 'personal'::text]));
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "chk_notifications_category" CHECK (category = ANY (ARRAY['complaint'::text, 'administration'::text, 'role'::text, 'security'::text, 'personal'::text, 'system'::text]));
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "chk_notifications_layer" CHECK (layer = ANY (ARRAY['action_required'::text, 'workflow_activity'::text, 'administrative_oversight'::text, 'security_privilege'::text, 'personal_account'::text, 'system_operational'::text]));
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "chk_notifications_metadata" CHECK (jsonb_typeof(metadata) = 'object'::text);
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "chk_notifications_route" CHECK (route IS NULL OR route ~ '^/[^\s]*$'::text);
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "chk_notifications_severity" CHECK (severity = ANY (ARRAY['info'::text, 'action_required'::text, 'warning'::text, 'security'::text]));
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "chk_notifications_target_type" CHECK (target_type IS NULL OR (target_type = ANY (ARRAY['complaint'::text, 'admin_user'::text, 'role'::text])));
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "chk_notifications_titles" CHECK (length(TRIM(BOTH FROM title_en)) > 0 AND length(TRIM(BOTH FROM title_bn)) > 0);
ALTER TABLE "public"."admin_users" ADD CONSTRAINT "admin_users_super_admin_must_be_active" CHECK (is_super_admin = false OR active = true);
ALTER TABLE "public"."complaint_parties" ADD CONSTRAINT "complaint_parties_party_type_check" CHECK (party_type = ANY (ARRAY['individual'::text, 'business'::text, 'group'::text, 'organization'::text, 'unknown'::text]));
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "chk_complaint_responses_responder_type" CHECK (responder_type IS NULL OR (responder_type = ANY (ARRAY['mentioned_person'::text, 'organization_rep'::text, 'legal_rep'::text])));
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "chk_complaint_responses_response_type" CHECK (response_type = ANY (ARRAY['citizen_information'::text, 'subject_response'::text]));
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "chk_complaint_responses_status" CHECK (status = ANY (ARRAY['pending_review'::text, 'published'::text, 'rejected'::text, 'unpublished'::text]));
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_contact_info_length_check" CHECK (contact_info IS NULL OR length(contact_info) <= 500);
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_contact_length_check" CHECK (contact_email_or_phone IS NULL OR length(contact_email_or_phone) <= 500);
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_content_length_check" CHECK (content IS NULL OR length(content) <= 10000);
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_correction_details_length_check" CHECK (correction_details IS NULL OR length(correction_details) <= 5000);
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_designation_length_check" CHECK (designation IS NULL OR length(designation) <= 300);
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_organization_name_length_check" CHECK (organization_name IS NULL OR length(organization_name) <= 500);
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_responder_name_length_check" CHECK (responder_name IS NULL OR length(responder_name) <= 300);
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_statement_length_check" CHECK (official_statement IS NULL OR length(official_statement) <= 10000);
ALTER TABLE "public"."complaint_responses" ADD CONSTRAINT "complaint_responses_supporting_note_length_check" CHECK (supporting_documents_note IS NULL OR length(supporting_documents_note) <= 5000);
ALTER TABLE "public"."complaint_sources" ADD CONSTRAINT "complaint_sources_canonical_url_check" CHECK (canonical_url ~ '^https://[^/]+/.+'::text);
ALTER TABLE "public"."complaint_sources" ADD CONSTRAINT "complaint_sources_source_type_check" CHECK (source_type = ANY (ARRAY['news'::text, 'official'::text, 'social'::text, 'article'::text, 'other'::text]));
ALTER TABLE "public"."complaint_sources" ADD CONSTRAINT "complaint_sources_source_version_check" CHECK (source_version > 0);
ALTER TABLE "public"."complaint_sources" ADD CONSTRAINT "complaint_sources_verification_status_check" CHECK (verification_status = ANY (ARRAY['unverified'::text, 'verified'::text, 'rejected'::text]));
ALTER TABLE "public"."complaint_submission_contexts" ADD CONSTRAINT "chk_reporter_accuracy_positive" CHECK (accuracy_meters > 0.0::double precision);
ALTER TABLE "public"."complaint_submission_contexts" ADD CONSTRAINT "chk_reporter_lat_range" CHECK (reporter_latitude >= '-90.0'::numeric::double precision AND reporter_latitude <= 90.0::double precision);
ALTER TABLE "public"."complaint_submission_contexts" ADD CONSTRAINT "chk_reporter_lng_range" CHECK (reporter_longitude >= '-180.0'::numeric::double precision AND reporter_longitude <= 180.0::double precision);
ALTER TABLE "public"."complaint_submission_contexts" ADD CONSTRAINT "chk_reporter_not_zero_zero" CHECK (NOT (reporter_latitude = 0.0::double precision AND reporter_longitude = 0.0::double precision));
ALTER TABLE "public"."complaint_submission_contexts" ADD CONSTRAINT "complaint_submission_contexts_ui_language_check" CHECK (ui_language IS NULL OR (ui_language = ANY (ARRAY['bn'::text, 'en'::text])));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_affected_person_age_group_check" CHECK (affected_person_age_group IS NULL OR (affected_person_age_group = ANY (ARRAY['under_18'::text, '18_29'::text, '30_59'::text, '60_plus'::text, 'prefer_not_to_say'::text, 'unknown_not_stated'::text])));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_alleged_abuser_relationship_check" CHECK (alleged_abuser_relationship IS NULL OR (alleged_abuser_relationship = ANY (ARRAY['intimate_partner'::text, 'household_family'::text, 'other_relative'::text, 'friend_acquaintance'::text, 'coworker_classmate'::text, 'authority_caregiver_service_provider'::text, 'stranger'::text, 'other_or_unknown'::text, 'neighbor'::text, 'teacher_tutor'::text, 'supervisor_employer'::text, 'service_health_worker'::text, 'transport_worker'::text, 'law_enforcement_authority'::text, 'multiple_people'::text, 'other'::text, 'unknown_not_stated'::text])));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_bribery_amount_positive" CHECK (bribery_amount IS NULL OR bribery_amount > 0::numeric);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_core_facts_required_unless_trusted_source" CHECK (incident_date IS NOT NULL AND NULLIF(btrim(division), ''::text) IS NOT NULL AND NULLIF(btrim(district), ''::text) IS NOT NULL OR origin_type = 'sourced_report'::text AND lower(COALESCE(custom_field_answers ->> 'trustedSourceAuto'::text, 'false'::text)) = 'true'::text AND COALESCE(custom_field_answers ->> 'sourceTruthMode'::text, ''::text) = 'approved_publisher'::text);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_custom_field_answers_object_check" CHECK (jsonb_typeof(custom_field_answers) = 'object'::text);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_form_schema_version_check" CHECK (form_schema_version IS NULL OR form_schema_version > 0);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_frequency_check" CHECK (frequency = ANY (ARRAY['one-time'::text, 'repeated'::text, 'ongoing'::text, 'unknown_not_stated'::text]));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_intimate_platform_check" CHECK (intimate_platform IS NULL OR segment_id = 'harassment'::text AND subcategory_id = 'blackmail-coercion'::text AND jsonb_typeof(intimate_platform) = 'string'::text AND ((intimate_platform #>> '{}'::text[]) = ANY (ARRAY['facebook'::text, 'messenger'::text, 'whatsapp'::text, 'telegram'::text, 'dating_app'::text, 'website'::text, 'in_person'::text, 'other'::text])));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_intimate_what_happened_check" CHECK (intimate_what_happened IS NULL OR segment_id = 'harassment'::text AND subcategory_id = 'blackmail-coercion'::text AND jsonb_typeof(intimate_what_happened) = 'string'::text AND ((intimate_what_happened #>> '{}'::text[]) = ANY (ARRAY['threatened'::text, 'already_shared'::text, 'recorded_secretly'::text, 'manipulated_deepfake'::text, 'other'::text])));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_mob_justice_details_check" CHECK (mob_justice_details IS NULL OR segment_id = 'public_safety'::text AND subcategory_id = 'mob-justice'::text AND jsonb_typeof(mob_justice_details) = 'object'::text AND ((mob_justice_details ->> 'trigger'::text) = ANY (ARRAY['suspected_theft_robbery'::text, 'snatching_allegation'::text, 'kidnapping_allegation'::text, 'sexual_offence_allegation'::text, 'religious_sentiment_allegation'::text, 'personal_local_dispute'::text, 'informal_punishment'::text, 'other_accusation_dispute'::text, 'unknown'::text])) AND (NULLIF(TRIM(BOTH FROM COALESCE(mob_justice_details ->> 'spread'::text, ''::text)), ''::text) IS NULL OR ((mob_justice_details ->> 'spread'::text) = ANY (ARRAY['direct_accusation'::text, 'word_of_mouth'::text, 'social_media'::text, 'message_group_post'::text, 'loudspeaker_announcement'::text, 'local_arbitration_meeting'::text, 'organized_gathering'::text, 'unknown'::text, 'other'::text]))) AND ((mob_justice_details ->> 'outcome'::text) = ANY (ARRAY['threatened_harassed'::text, 'restrained_surrounded'::text, 'physically_assaulted'::text, 'seriously_injured'::text, 'death_reported'::text, 'property_damaged'::text, 'rescued_intervention'::text, 'ongoing'::text, 'unknown'::text])) AND ((mob_justice_details ->> 'ongoingStatus'::text) = ANY (ARRAY['ongoing'::text, 'ended'::text, 'unknown'::text])) AND (NOT mob_justice_details ? 'targetedCount'::text OR (mob_justice_details -> 'targetedCount'::text) IS NULL OR (mob_justice_details -> 'targetedCount'::text) = 'null'::jsonb OR
CASE
    WHEN jsonb_typeof(mob_justice_details -> 'targetedCount'::text) = 'number'::text THEN ((mob_justice_details ->> 'targetedCount'::text)::numeric) >= 1::numeric AND ((mob_justice_details ->> 'targetedCount'::text)::numeric) <= 9999::numeric AND ((mob_justice_details ->> 'targetedCount'::text)::numeric) = trunc((mob_justice_details ->> 'targetedCount'::text)::numeric)
    ELSE false
END));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_origin_type_check" CHECK (origin_type = ANY (ARRAY['citizen'::text, 'sourced_report'::text]));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_priority_check" CHECK (priority = ANY (ARRAY['urgent'::text, 'high'::text, 'medium'::text, 'low'::text]));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_privacy_choice_check" CHECK (privacy_choice = ANY (ARRAY['anonymous'::text, 'admin_only'::text, 'public_identity'::text]));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_public_share_count_check" CHECK (public_share_count >= 0);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_public_view_count_check" CHECK (public_view_count >= 0);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_reporting_for_check" CHECK (reporting_for IS NULL OR (reporting_for = ANY (ARRAY['self'::text, 'someone_else'::text])));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_sexual_harassment_context_check" CHECK (sexual_harassment_context IS NULL OR (sexual_harassment_context = ANY (ARRAY['workplace'::text, 'educational_institution'::text, 'healthcare'::text, 'public_transport'::text, 'road_public_space'::text, 'home_private_space'::text, 'online_social_media'::text, 'government_service'::text, 'other'::text, 'unknown_not_stated'::text])));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_sexual_harassment_institution_length_check" CHECK (sexual_harassment_institution IS NULL OR char_length(sexual_harassment_institution) <= 200);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_sexual_harassment_type_check" CHECK (sexual_harassment_type IS NULL OR (sexual_harassment_type = ANY (ARRAY['eve_teasing'::text, 'unwanted_physical_contact'::text, 'sexual_comments_gestures_proposition'::text, 'workplace_harassment'::text, 'abuse_of_power'::text, 'stalking'::text, 'online_digital_harassment'::text, 'other'::text, 'unknown_not_stated'::text])));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_status_check" CHECK (status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'info_requested'::text, 'verified'::text, 'edited'::text, 'published'::text, 'unpublished'::text, 'rejected'::text]));
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_taxonomy_snapshot_object_check" CHECK (taxonomy_snapshot IS NULL OR jsonb_typeof(taxonomy_snapshot) = 'object'::text);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_title_en_length_check" CHECK (title_en IS NULL OR char_length(btrim(title_en)) >= 1 AND char_length(btrim(title_en)) <= 100);
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_title_length_check" CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 100);
ALTER TABLE "public"."news_intake_automation_settings" ADD CONSTRAINT "news_intake_automation_settings_interval_hours_check" CHECK (interval_hours = 36);
ALTER TABLE "public"."news_intake_automation_settings" ADD CONSTRAINT "news_intake_automation_settings_singleton_check" CHECK (singleton = true);
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_action_check" CHECK (action = ANY (ARRAY['discovered'::text, 'skip_duplicate'::text, 'needs_review'::text, 'created_draft'::text, 'merged_source'::text, 'error'::text]));
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_canonical_url_check" CHECK (char_length(canonical_url) <= 2000);
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_confidence_check" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_content_language_check" CHECK (content_language = ANY (ARRAY['bn'::text, 'en'::text, 'mixed'::text, 'unknown'::text]));
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_duplicate_status_check" CHECK (duplicate_status IS NULL OR (duplicate_status = ANY (ARRAY['clear'::text, 'exact'::text, 'match'::text, 'review'::text, 'unavailable'::text])));
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_item_kind_check" CHECK (item_kind = ANY (ARRAY['source'::text, 'article'::text]));
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_reason_check" CHECK (reason IS NULL OR char_length(reason) <= 1500);
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_review_payload_object_check" CHECK (review_payload IS NULL OR jsonb_typeof(review_payload) = 'object'::text);
ALTER TABLE "public"."news_intake_run_items" ADD CONSTRAINT "news_intake_run_items_source_title_check" CHECK (source_title IS NULL OR char_length(source_title) <= 500);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_classified_count_check" CHECK (classified_count >= 0);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_created_count_check" CHECK (created_count >= 0);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_discovered_count_check" CHECK (discovered_count >= 0);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_duplicate_count_check" CHECK (duplicate_count >= 0);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_error_count_check" CHECK (error_count >= 0);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_merged_count_check" CHECK (merged_count >= 0);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_review_count_check" CHECK (review_count >= 0);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_skipped_count_check" CHECK (skipped_count >= 0);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_source_count_check" CHECK (source_count >= 0);
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_status_check" CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'partial'::text, 'failed'::text]));
ALTER TABLE "public"."news_intake_runs" ADD CONSTRAINT "news_intake_runs_trigger_type_check" CHECK (trigger_type = ANY (ARRAY['manual'::text, 'automatic'::text]));
ALTER TABLE "public"."news_source_domains" ADD CONSTRAINT "news_source_domains_homepage_url_check" CHECK (homepage_url IS NULL OR homepage_url ~ '^https://[^/]+(?:/.*)?$'::text);
ALTER TABLE "public"."news_source_domains" ADD CONSTRAINT "news_source_domains_hostname_chk" CHECK (hostname = lower(hostname) AND hostname ~ '^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$'::text AND hostname !~~ '%.local'::text AND hostname <> 'localhost'::text);
ALTER TABLE "public"."news_source_domains" ADD CONSTRAINT "news_source_domains_language_hint_check" CHECK (language_hint = ANY (ARRAY['auto'::text, 'bn'::text, 'en'::text]));
ALTER TABLE "public"."news_source_domains" ADD CONSTRAINT "news_source_domains_scan_priority_check" CHECK (scan_priority >= 1 AND scan_priority <= 100);
ALTER TABLE "public"."public_engagement_events" ADD CONSTRAINT "public_engagement_events_event_type_check" CHECK (event_type = ANY (ARRAY['view'::text, 'share'::text]));
ALTER TABLE "public"."public_response_rate_events" ADD CONSTRAINT "public_response_rate_events_response_type_check" CHECK (response_type = ANY (ARRAY['citizen_information'::text, 'subject_response'::text]));
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_accuracy_meters_check" CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0::numeric);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_browser_name_length_check" CHECK (browser_name IS NULL OR length(browser_name) <= 200);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_browser_version_length_check" CHECK (browser_version IS NULL OR length(browser_version) <= 200);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_device_category_length_check" CHECK (device_category IS NULL OR length(device_category) <= 100);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_language_length_check" CHECK (language IS NULL OR length(language) <= 100);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_latitude_check" CHECK (latitude IS NULL OR latitude >= '-90'::integer::numeric AND latitude <= 90::numeric);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_longitude_check" CHECK (longitude IS NULL OR longitude >= '-180'::integer::numeric AND longitude <= 180::numeric);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_no_persisted_coordinates" CHECK (latitude IS NULL AND longitude IS NULL AND accuracy_meters IS NULL AND location_updated_at IS NULL);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_os_name_length_check" CHECK (os_name IS NULL OR length(os_name) <= 200);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_permission_status_check" CHECK (permission_status = ANY (ARRAY['prompt'::text, 'granted'::text, 'denied'::text, 'unavailable'::text]));
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_platform_length_check" CHECK (platform IS NULL OR length(platform) <= 200);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_screen_height_check" CHECK (screen_height IS NULL OR screen_height > 0);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_screen_height_upper_check" CHECK (screen_height IS NULL OR screen_height <= 100000);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_screen_width_check" CHECK (screen_width IS NULL OR screen_width > 0);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_screen_width_upper_check" CHECK (screen_width IS NULL OR screen_width <= 100000);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_session_id_length_check" CHECK (length(session_id) >= 1 AND length(session_id) <= 128);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_session_uuid_check" CHECK (session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_timezone_length_check" CHECK (timezone IS NULL OR length(timezone) <= 200);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_ui_language_check" CHECK (ui_language IS NULL OR (ui_language = ANY (ARRAY['bn'::text, 'en'::text])));
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_user_agent_length_check" CHECK (user_agent IS NULL OR length(user_agent) <= 1000);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_visitor_id_length_check" CHECK (length(visitor_id) >= 1 AND length(visitor_id) <= 128);
ALTER TABLE "public"."public_visit_sessions" ADD CONSTRAINT "public_visit_sessions_visitor_uuid_check" CHECK (visitor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text);
ALTER TABLE "public"."public_write_rate_events" ADD CONSTRAINT "public_write_rate_events_action_check" CHECK (action = ANY (ARRAY['complaint'::text, 'evidence'::text, 'response'::text, 'engagement'::text, 'session'::text, 'ip_location'::text]));
ALTER TABLE "public"."report_duplicate_overrides" ADD CONSTRAINT "report_duplicate_overrides_note_chk" CHECK (char_length(btrim(review_note)) >= 8);
ALTER TABLE "public"."report_duplicate_overrides" ADD CONSTRAINT "report_duplicate_overrides_ordered_pair_chk" CHECK (report_a_id < report_b_id);
ALTER TABLE "public"."reporting_form_schema_fields" ADD CONSTRAINT "reporting_form_schema_fields_bilingual_options_check" CHECK ((field_type <> ALL (ARRAY['select'::text, 'radio'::text, 'multiselect'::text])) OR jsonb_typeof(options) = 'array'::text AND jsonb_array_length(options) > 0 AND reporting_field_options_are_bilingual(options));
ALTER TABLE "public"."reporting_form_schema_fields" ADD CONSTRAINT "reporting_form_schema_fields_config_check" CHECK (jsonb_typeof(config) = 'object'::text);
ALTER TABLE "public"."reporting_form_schema_fields" ADD CONSTRAINT "reporting_form_schema_fields_field_type_check" CHECK (field_type = ANY (ARRAY['text'::text, 'textarea'::text, 'number'::text, 'currency'::text, 'date'::text, 'time'::text, 'month'::text, 'select'::text, 'radio'::text, 'checkbox'::text, 'multiselect'::text, 'phone'::text, 'email'::text, 'url'::text, 'location'::text, 'subject_party'::text, 'evidence'::text, 'privacy'::text, 'mob_justice_details'::text]));
ALTER TABLE "public"."reporting_form_schema_fields" ADD CONSTRAINT "reporting_form_schema_fields_options_check" CHECK (jsonb_typeof(options) = 'array'::text);
ALTER TABLE "public"."reporting_form_schema_fields" ADD CONSTRAINT "reporting_form_schema_fields_storage_mode_check" CHECK (storage_mode = ANY (ARRAY['core_column'::text, 'custom_json'::text, 'system_block'::text]));
ALTER TABLE "public"."reporting_form_schema_fields" ADD CONSTRAINT "reporting_form_schema_fields_validation_check" CHECK (jsonb_typeof(validation) = 'object'::text);
ALTER TABLE "public"."reporting_form_schemas" ADD CONSTRAINT "reporting_form_schemas_engine_mode_check" CHECK (engine_mode = ANY (ARRAY['legacy'::text, 'schema'::text]));
ALTER TABLE "public"."reporting_form_schemas" ADD CONSTRAINT "reporting_form_schemas_scope_type_check" CHECK (scope_type = ANY (ARRAY['segment'::text, 'subcategory'::text]));
ALTER TABLE "public"."reporting_form_schemas" ADD CONSTRAINT "reporting_form_schemas_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]));
ALTER TABLE "public"."reporting_form_schemas" ADD CONSTRAINT "reporting_form_schemas_version_check" CHECK (version > 0);
ALTER TABLE "public"."segments" ADD CONSTRAINT "segments_config_status_check" CHECK (config_status = ANY (ARRAY['draft'::text, 'ready'::text, 'published'::text, 'archived'::text]));
ALTER TABLE "public"."site_banners" ADD CONSTRAINT "site_banners_version_check" CHECK (version > 0);
ALTER TABLE "public"."subcategories" ADD CONSTRAINT "subcategories_category_group_check" CHECK (category_group IS NULL OR (category_group = ANY (ARRAY['violence'::text, 'relationship_scam'::text, 'digital_intimate'::text, 'general'::text])));
ALTER TABLE "public"."subcategories" ADD CONSTRAINT "subcategories_config_status_check" CHECK (config_status = ANY (ARRAY['draft'::text, 'ready'::text, 'published'::text, 'archived'::text]));
ALTER TABLE "public"."subcategories" ADD CONSTRAINT "subcategories_slug_nonempty" CHECK (slug IS NOT NULL AND btrim(slug) <> ''::text);
ALTER TABLE "public"."subject_responses" ADD CONSTRAINT "subject_responses_status_check" CHECK (status = ANY (ARRAY['submitted'::text, 'approved'::text, 'published'::text, 'rejected'::text]));
ALTER TABLE "public"."system_health_incidents" ADD CONSTRAINT "system_health_incidents_current_status_check" CHECK (current_status = ANY (ARRAY['degraded'::text, 'critical'::text, 'recovered'::text]));
ALTER TABLE "public"."system_health_incidents" ADD CONSTRAINT "system_health_incidents_initial_status_check" CHECK (initial_status = ANY (ARRAY['degraded'::text, 'critical'::text]));
ALTER TABLE "public"."system_health_snapshots" ADD CONSTRAINT "system_health_snapshots_overall_status_check" CHECK (overall_status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'critical'::text, 'unknown'::text]));

-- Add standalone indexes; constraint-backed indexes are created by their constraints.
CREATE INDEX public_api_rate_events_ip_idx ON private.public_api_rate_events USING btree (action, ip_fingerprint, created_at DESC);
CREATE INDEX public_api_rate_events_subject_idx ON private.public_api_rate_events USING btree (action, subject_fingerprint, created_at DESC) WHERE (subject_fingerprint IS NOT NULL);
CREATE INDEX public_engagement_dedupe_created_idx ON private.public_engagement_dedupe USING btree (created_at DESC);
CREATE UNIQUE INDEX admin_users_single_super_admin_idx ON public.admin_users USING btree (is_super_admin) WHERE (is_super_admin = true);
CREATE UNIQUE INDEX bangladesh_districts_adm2_pcode_unique ON public.bangladesh_districts USING btree (adm2_pcode);
CREATE INDEX bangladesh_districts_division_id_idx ON public.bangladesh_districts USING btree (division_id);
CREATE INDEX bangladesh_districts_name_bn_lower_idx ON public.bangladesh_districts USING btree (lower(name_bn));
CREATE INDEX bangladesh_districts_name_en_lower_idx ON public.bangladesh_districts USING btree (lower(name_en));
CREATE INDEX bangladesh_divisions_name_bn_lower_idx ON public.bangladesh_divisions USING btree (lower(name_bn));
CREATE INDEX bangladesh_divisions_name_en_lower_idx ON public.bangladesh_divisions USING btree (lower(name_en));
CREATE INDEX bangladesh_upazilas_district_name_bn_lower_idx ON public.bangladesh_upazilas USING btree (district_id, lower(name_bn));
CREATE INDEX bangladesh_upazilas_district_name_en_lower_idx ON public.bangladesh_upazilas USING btree (district_id, lower(name_en));
CREATE UNIQUE INDEX complaint_evidence_storage_path_uidx ON public.complaint_evidence USING btree (storage_path) WHERE (storage_path IS NOT NULL);
CREATE UNIQUE INDEX complaints_client_submission_id_idx ON public.complaints USING btree (client_submission_id) WHERE (client_submission_id IS NOT NULL);
CREATE INDEX idx_additional_info_submissions_complaint_id ON public.additional_info_submissions USING btree (complaint_id);
CREATE INDEX idx_admin_audit_logs_action ON public.admin_audit_logs USING btree (action);
CREATE INDEX idx_admin_audit_logs_actor ON public.admin_audit_logs USING btree (actor_id);
CREATE INDEX idx_admin_audit_logs_created_at ON public.admin_audit_logs USING btree (created_at DESC);
CREATE INDEX idx_admin_notifications_category ON public.admin_notifications USING btree (category);
CREATE UNIQUE INDEX idx_admin_notifications_dedupe ON public.admin_notifications USING btree (recipient_user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);
CREATE INDEX idx_admin_notifications_event_group ON public.admin_notifications USING btree (event_group_id);
CREATE UNIQUE INDEX idx_admin_notifications_event_group_recipient ON public.admin_notifications USING btree (event_group_id, recipient_user_id);
CREATE INDEX idx_admin_notifications_event_key ON public.admin_notifications USING btree (event_key);
CREATE INDEX idx_admin_notifications_recipient_audience ON public.admin_notifications USING btree (recipient_user_id, audience_mode);
CREATE INDEX idx_admin_notifications_recipient_created ON public.admin_notifications USING btree (recipient_user_id, created_at DESC, id DESC);
CREATE INDEX idx_admin_notifications_recipient_read ON public.admin_notifications USING btree (recipient_user_id, read_at);
CREATE INDEX idx_admin_notifications_unread ON public.admin_notifications USING btree (recipient_user_id, created_at DESC) WHERE (read_at IS NULL);
CREATE INDEX idx_complaint_evidence_complaint_id ON public.complaint_evidence USING btree (complaint_id);
CREATE INDEX idx_complaint_parties_complaint_id ON public.complaint_parties USING btree (complaint_id);
CREATE INDEX idx_complaint_responses_complaint_id ON public.complaint_responses USING btree (complaint_id);
CREATE INDEX idx_complaint_responses_status ON public.complaint_responses USING btree (status);
CREATE INDEX idx_complaint_responses_type_status ON public.complaint_responses USING btree (response_type, status);
CREATE INDEX idx_complaint_sources_verified_by ON public.complaint_sources USING btree (verified_by) WHERE (verified_by IS NOT NULL);
CREATE INDEX idx_complaint_updates_complaint_id ON public.complaint_updates USING btree (complaint_id);
CREATE INDEX idx_complaint_updates_published_created_at ON public.complaint_updates USING btree (created_at DESC, complaint_id) WHERE (update_type = 'published'::text);
CREATE INDEX idx_complaints_harassment_age_status ON public.complaints USING btree (affected_person_age_group, status, created_at DESC) WHERE (segment_id = 'harassment'::text);
CREATE INDEX idx_complaints_harassment_relationship_status ON public.complaints USING btree (alleged_abuser_relationship, status, created_at DESC) WHERE (segment_id = 'harassment'::text);
CREATE INDEX idx_complaints_harassment_reporting_for_status ON public.complaints USING btree (reporting_for, status, created_at DESC) WHERE (segment_id = 'harassment'::text);
CREATE INDEX idx_complaints_public_feed_district_latest ON public.complaints USING btree (lower(district), created_at DESC, id DESC) WHERE ((status = 'published'::text) AND ((publication_preferences -> 'showGeneralLocation'::text) = 'true'::jsonb));
CREATE INDEX idx_complaints_public_feed_district_popular ON public.complaints USING btree (lower(district), public_view_count DESC, public_share_count DESC, date_trunc('second'::text, (created_at AT TIME ZONE 'UTC'::text)) DESC, created_at DESC, id DESC) WHERE ((status = 'published'::text) AND ((publication_preferences -> 'showGeneralLocation'::text) = 'true'::jsonb));
CREATE INDEX idx_complaints_public_feed_district_published_latest ON public.complaints USING btree (lower(district), published_at DESC, id DESC) WHERE ((status = 'published'::text) AND ((publication_preferences -> 'showGeneralLocation'::text) = 'true'::jsonb));
CREATE INDEX idx_complaints_public_feed_district_published_popular ON public.complaints USING btree (lower(district), public_view_count DESC, public_share_count DESC, date_trunc('second'::text, (published_at AT TIME ZONE 'UTC'::text)) DESC, published_at DESC, id DESC) WHERE ((status = 'published'::text) AND ((publication_preferences -> 'showGeneralLocation'::text) = 'true'::jsonb));
CREATE INDEX idx_complaints_public_feed_district_published_shared ON public.complaints USING btree (lower(district), public_share_count DESC, public_view_count DESC, published_at DESC, id DESC) WHERE ((status = 'published'::text) AND ((publication_preferences -> 'showGeneralLocation'::text) = 'true'::jsonb));
CREATE INDEX idx_complaints_public_feed_district_shared ON public.complaints USING btree (lower(district), public_share_count DESC, public_view_count DESC, created_at DESC, id DESC) WHERE ((status = 'published'::text) AND ((publication_preferences -> 'showGeneralLocation'::text) = 'true'::jsonb));
CREATE INDEX idx_complaints_public_feed_geo ON public.complaints USING gist (((st_setsrid(st_makepoint(longitude, latitude), 4326))::geography)) WHERE ((status = 'published'::text) AND ((publication_preferences -> 'showGeneralLocation'::text) = 'true'::jsonb) AND (latitude IS NOT NULL) AND (longitude IS NOT NULL) AND (NOT ((latitude = (0.0)::double precision) AND (longitude = (0.0)::double precision))) AND ((latitude >= ('-90.0'::numeric)::double precision) AND (latitude <= (90.0)::double precision)) AND ((longitude >= ('-180.0'::numeric)::double precision) AND (longitude <= (180.0)::double precision)));
CREATE INDEX idx_complaints_public_feed_popular ON public.complaints USING btree (public_view_count DESC, public_share_count DESC, date_trunc('second'::text, (created_at AT TIME ZONE 'UTC'::text)) DESC, created_at DESC, id DESC) WHERE (status = 'published'::text);
CREATE INDEX idx_complaints_public_feed_published_latest ON public.complaints USING btree (published_at DESC, id DESC) WHERE (status = 'published'::text);
CREATE INDEX idx_complaints_public_feed_published_popular ON public.complaints USING btree (public_view_count DESC, public_share_count DESC, date_trunc('second'::text, (published_at AT TIME ZONE 'UTC'::text)) DESC, published_at DESC, id DESC) WHERE (status = 'published'::text);
CREATE INDEX idx_complaints_public_feed_published_shared ON public.complaints USING btree (public_share_count DESC, public_view_count DESC, published_at DESC, id DESC) WHERE (status = 'published'::text);
CREATE INDEX idx_complaints_public_feed_shared ON public.complaints USING btree (public_share_count DESC, public_view_count DESC, created_at DESC, id DESC) WHERE (status = 'published'::text);
CREATE INDEX idx_complaints_segment_id ON public.complaints USING btree (segment_id);
CREATE INDEX idx_complaints_sourced_duplicate_scan ON public.complaints USING btree (segment_id, incident_date, status, subcategory_id) WHERE (origin_type = 'sourced_report'::text);
CREATE INDEX idx_complaints_status_created_at_id ON public.complaints USING btree (status, created_at DESC, id DESC);
CREATE INDEX idx_complaints_subcategory_id ON public.complaints USING btree (subcategory_id);
CREATE INDEX idx_news_intake_run_items_report_id ON public.news_intake_run_items USING btree (report_id) WHERE (report_id IS NOT NULL);
CREATE INDEX idx_news_intake_run_items_run_id_created_at ON public.news_intake_run_items USING btree (run_id, created_at);
CREATE INDEX idx_news_intake_run_items_segment_id ON public.news_intake_run_items USING btree (segment_id) WHERE (segment_id IS NOT NULL);
CREATE INDEX idx_news_intake_run_items_subcategory_id ON public.news_intake_run_items USING btree (subcategory_id) WHERE (subcategory_id IS NOT NULL);
CREATE INDEX idx_news_intake_runs_started_at ON public.news_intake_runs USING btree (started_at DESC);
CREATE INDEX idx_news_intake_runs_started_by ON public.news_intake_runs USING btree (started_by);
CREATE INDEX idx_news_source_domains_auto_scan ON public.news_source_domains USING btree (scan_priority, publisher_name) WHERE ((active = true) AND (scan_enabled = true));
CREATE INDEX idx_news_source_domains_created_by ON public.news_source_domains USING btree (created_by);
CREATE INDEX idx_permissions_module ON public.permissions USING btree (module);
CREATE INDEX idx_report_duplicate_overrides_report_b_id ON public.report_duplicate_overrides USING btree (report_b_id);
CREATE INDEX idx_role_permissions_permission ON public.role_permissions USING btree (permission_id);
CREATE INDEX idx_subcategories_segment_id ON public.subcategories USING btree (segment_id);
CREATE INDEX idx_subject_responses_complaint_id ON public.subject_responses USING btree (complaint_id);
CREATE INDEX idx_submission_contexts_captured_at ON public.complaint_submission_contexts USING btree (captured_at);
CREATE INDEX idx_submission_contexts_session_id ON public.complaint_submission_contexts USING btree (session_id);
CREATE INDEX idx_submission_contexts_visitor_id ON public.complaint_submission_contexts USING btree (visitor_id);
CREATE INDEX idx_user_roles_assigned_by ON public.user_roles USING btree (assigned_by);
CREATE INDEX idx_user_roles_role ON public.user_roles USING btree (role_id);
CREATE INDEX public_engagement_events_report_created_idx ON public.public_engagement_events USING btree (report_id, event_type, created_at DESC);
CREATE INDEX public_engagement_events_visitor_created_idx ON public.public_engagement_events USING btree (visitor_id, created_at DESC);
CREATE INDEX public_response_rate_events_report_id_idx ON public.public_response_rate_events USING btree (report_id);
CREATE INDEX public_response_rate_session_created_idx ON public.public_response_rate_events USING btree (session_id, created_at DESC);
CREATE INDEX public_response_rate_visitor_created_idx ON public.public_response_rate_events USING btree (visitor_id, created_at DESC);
CREATE INDEX public_visit_sessions_last_seen_idx ON public.public_visit_sessions USING btree (last_seen_at DESC);
CREATE INDEX public_visit_sessions_visitor_id_idx ON public.public_visit_sessions USING btree (visitor_id);
CREATE INDEX public_write_rate_fingerprint_action_created_idx ON public.public_write_rate_events USING btree (source_fingerprint, action, created_at DESC);
CREATE INDEX reporting_form_schema_fields_order_lookup ON public.reporting_form_schema_fields USING btree (schema_id, active, sort_order, field_key);
CREATE UNIQUE INDEX reporting_form_schemas_one_published_per_scope ON public.reporting_form_schemas USING btree (scope_type, scope_id) WHERE (status = 'published'::text);
CREATE INDEX reporting_form_schemas_scope_lookup ON public.reporting_form_schemas USING btree (scope_type, scope_id, status, version DESC);
CREATE UNIQUE INDEX segments_slug_unique ON public.segments USING btree (slug) WHERE (slug IS NOT NULL);
CREATE UNIQUE INDEX subcategories_slug_lower_uidx ON public.subcategories USING btree (lower(slug));
CREATE UNIQUE INDEX system_health_one_open_incident_idx ON public.system_health_incidents USING btree ((true)) WHERE (recovered_at IS NULL);
CREATE INDEX system_health_snapshots_observed_at_idx ON public.system_health_snapshots USING btree (observed_at DESC);
CREATE UNIQUE INDEX ux_complaint_sources_global_canonical_url ON public.complaint_sources USING btree (normalize_source_url(canonical_url));
CREATE UNIQUE INDEX ux_news_intake_runs_one_running ON public.news_intake_runs USING btree ((1)) WHERE (status = 'running'::text);

-- Reproduce table RLS flags and exact current policy expressions.
ALTER TABLE "private"."public_api_rate_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."public_engagement_dedupe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."security_runtime_secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."additional_info_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."admin_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."admin_notification_event_catalogue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."admin_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bangladesh_districts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bangladesh_divisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bangladesh_upazilas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."complaint_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."complaint_parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."complaint_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."complaint_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."complaint_submission_contexts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."complaint_updates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."complaints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."news_intake_automation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."news_intake_run_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."news_intake_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."news_source_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_category_popularity_snapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_engagement_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_response_rate_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_visit_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_write_rate_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_duplicate_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reporting_form_schema_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reporting_form_schemas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."site_banners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subcategories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subject_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_health_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_health_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Private table: deny client access" ON "private"."public_api_rate_events" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "Private table: deny client access" ON "private"."public_engagement_dedupe" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "Private table: deny client access" ON "private"."security_runtime_secrets" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_client_access_additional_info_submissions" ON "public"."additional_info_submissions" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_client_access_admin_audit_logs" ON "public"."admin_audit_logs" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_client_access_admin_notification_event_catalogue" ON "public"."admin_notification_event_catalogue" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "admin_notifications_select_own" ON "public"."admin_notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((recipient_user_id = ( SELECT auth.uid() AS uid)) AND is_active_admin() AND admin_notification_can_currently_view(recipient_user_id, audience_mode, required_all_permissions, required_any_permissions, target_type, target_id)));
CREATE POLICY "Users can read own admin membership" ON "public"."admin_users" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "public read districts" ON "public"."bangladesh_districts" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "public read divisions" ON "public"."bangladesh_divisions" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "public read upazilas" ON "public"."bangladesh_upazilas" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "authorized admins can read complaint evidence" ON "public"."complaint_evidence" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_permission('complaints.evidence_view'::text));
CREATE POLICY "authorized admins can read complaint parties" ON "public"."complaint_parties" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_permission('complaints.view'::text));
CREATE POLICY "deny_direct_client_access_complaint_responses" ON "public"."complaint_responses" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "complaint_sources_no_direct_access" ON "public"."complaint_sources" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_client_access_complaint_submission_contexts" ON "public"."complaint_submission_contexts" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "authorized admins can read complaint updates" ON "public"."complaint_updates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_permission('complaints.view'::text));
CREATE POLICY "complaints_admin_authenticated_select" ON "public"."complaints" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_permission('complaints.view'::text));
CREATE POLICY "complaints_public_anon_select_published" ON "public"."complaints" AS PERMISSIVE FOR SELECT TO "anon" USING ((status = 'published'::text));
CREATE POLICY "news_intake_automation_settings_anon_deny" ON "public"."news_intake_automation_settings" AS PERMISSIVE FOR ALL TO "anon" USING (false) WITH CHECK (false);
CREATE POLICY "news_intake_automation_settings_authenticated_deny" ON "public"."news_intake_automation_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "news_intake_run_items_anon_deny" ON "public"."news_intake_run_items" AS PERMISSIVE FOR ALL TO "anon" USING (false) WITH CHECK (false);
CREATE POLICY "news_intake_run_items_authenticated_deny" ON "public"."news_intake_run_items" AS PERMISSIVE FOR ALL TO "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "news_intake_runs_anon_deny" ON "public"."news_intake_runs" AS PERMISSIVE FOR ALL TO "anon" USING (false) WITH CHECK (false);
CREATE POLICY "news_intake_runs_authenticated_deny" ON "public"."news_intake_runs" AS PERMISSIVE FOR ALL TO "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "news_source_domains_anon_deny" ON "public"."news_source_domains" AS PERMISSIVE FOR ALL TO "anon" USING (false) WITH CHECK (false);
CREATE POLICY "news_source_domains_authenticated_deny" ON "public"."news_source_domains" AS PERMISSIVE FOR ALL TO "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "Scope-safe permissions direct read" ON "public"."permissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id IN ( SELECT get_caller_effective_permission_set() AS get_caller_effective_permission_set)));
CREATE POLICY "explicit deny direct client access" ON "public"."public_category_popularity_snapshot" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "explicit deny direct client access" ON "public"."public_engagement_events" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "explicit deny direct client access" ON "public"."public_response_rate_events" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "authorized admins can read public visit sessions" ON "public"."public_visit_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_permission('location_activity.view'::text));
CREATE POLICY "explicit deny direct client access" ON "public"."public_write_rate_events" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "report_duplicate_overrides_anon_deny" ON "public"."report_duplicate_overrides" AS PERMISSIVE FOR ALL TO "anon" USING (false) WITH CHECK (false);
CREATE POLICY "report_duplicate_overrides_authenticated_deny" ON "public"."report_duplicate_overrides" AS PERMISSIVE FOR ALL TO "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "explicit deny direct client access" ON "public"."reporting_form_schema_fields" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "explicit deny direct client access" ON "public"."reporting_form_schemas" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "Scope-safe role_permissions direct read" ON "public"."role_permissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM admin_users au
  WHERE ((au.user_id = ( SELECT auth.uid() AS uid)) AND (au.active = true) AND ((au.is_super_admin = true) OR (NOT (EXISTS ( SELECT 1
           FROM user_roles))) OR (role_permissions.role_id IN ( SELECT ur.role_id
           FROM user_roles ur
          WHERE (ur.user_id = ( SELECT auth.uid() AS uid)))) OR can_manage_role_scope(role_permissions.role_id))))));
CREATE POLICY "Scope-safe roles direct read" ON "public"."roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM admin_users au
  WHERE ((au.user_id = ( SELECT auth.uid() AS uid)) AND (au.active = true) AND ((au.is_super_admin = true) OR (NOT (EXISTS ( SELECT 1
           FROM user_roles))) OR (roles.id IN ( SELECT ur.role_id
           FROM user_roles ur
          WHERE (ur.user_id = ( SELECT auth.uid() AS uid)))) OR can_manage_role_scope(roles.id))))));
CREATE POLICY "Public can read active segments" ON "public"."segments" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active = true));
CREATE POLICY "explicit deny direct client access" ON "public"."site_banners" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "Public can read active subcategories" ON "public"."subcategories" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active = true));
CREATE POLICY "deny_direct_client_access_subject_responses" ON "public"."subject_responses" AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "system_health_snapshots_anon_deny" ON "public"."system_health_snapshots" AS PERMISSIVE FOR ALL TO "anon" USING (false) WITH CHECK (false);
CREATE POLICY "system_health_snapshots_authenticated_deny" ON "public"."system_health_snapshots" AS PERMISSIVE FOR ALL TO "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "Users can read own role assignment" ON "public"."user_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- Reproduce captured application table grants; preserve default owner access.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT REFERENCES ON TABLE "public"."additional_info_submissions" TO "service_role";
GRANT TRIGGER ON TABLE "public"."additional_info_submissions" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."additional_info_submissions" TO "service_role";
GRANT INSERT ON TABLE "public"."admin_audit_logs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."admin_audit_logs" TO "service_role";
GRANT TRIGGER ON TABLE "public"."admin_audit_logs" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."admin_audit_logs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."admin_notification_event_catalogue" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_notification_event_catalogue" TO "service_role";
GRANT TRIGGER ON TABLE "public"."admin_notification_event_catalogue" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."admin_notification_event_catalogue" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_notifications" TO "authenticated";
GRANT DELETE ON TABLE "public"."admin_notifications" TO "service_role";
GRANT INSERT ON TABLE "public"."admin_notifications" TO "service_role";
GRANT REFERENCES ON TABLE "public"."admin_notifications" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_notifications" TO "service_role";
GRANT TRIGGER ON TABLE "public"."admin_notifications" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."admin_notifications" TO "service_role";
GRANT UPDATE ON TABLE "public"."admin_notifications" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_users" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."admin_users" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_users" TO "service_role";
GRANT TRIGGER ON TABLE "public"."admin_users" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."admin_users" TO "service_role";
GRANT SELECT ON TABLE "public"."bangladesh_districts" TO "anon";
GRANT SELECT ON TABLE "public"."bangladesh_districts" TO "authenticated";
GRANT SELECT ON TABLE "public"."bangladesh_divisions" TO "anon";
GRANT SELECT ON TABLE "public"."bangladesh_divisions" TO "authenticated";
GRANT SELECT ON TABLE "public"."bangladesh_upazilas" TO "anon";
GRANT SELECT ON TABLE "public"."bangladesh_upazilas" TO "authenticated";
GRANT SELECT ON TABLE "public"."complaint_evidence" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."complaint_evidence" TO "service_role";
GRANT TRIGGER ON TABLE "public"."complaint_evidence" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."complaint_evidence" TO "service_role";
GRANT SELECT ON TABLE "public"."complaint_parties" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."complaint_parties" TO "service_role";
GRANT TRIGGER ON TABLE "public"."complaint_parties" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."complaint_parties" TO "service_role";
GRANT DELETE ON TABLE "public"."complaint_responses" TO "service_role";
GRANT INSERT ON TABLE "public"."complaint_responses" TO "service_role";
GRANT REFERENCES ON TABLE "public"."complaint_responses" TO "service_role";
GRANT SELECT ON TABLE "public"."complaint_responses" TO "service_role";
GRANT TRIGGER ON TABLE "public"."complaint_responses" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."complaint_responses" TO "service_role";
GRANT UPDATE ON TABLE "public"."complaint_responses" TO "service_role";
GRANT REFERENCES ON TABLE "public"."complaint_sources" TO "service_role";
GRANT TRIGGER ON TABLE "public"."complaint_sources" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."complaint_sources" TO "service_role";
GRANT DELETE ON TABLE "public"."complaint_submission_contexts" TO "service_role";
GRANT INSERT ON TABLE "public"."complaint_submission_contexts" TO "service_role";
GRANT REFERENCES ON TABLE "public"."complaint_submission_contexts" TO "service_role";
GRANT SELECT ON TABLE "public"."complaint_submission_contexts" TO "service_role";
GRANT TRIGGER ON TABLE "public"."complaint_submission_contexts" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."complaint_submission_contexts" TO "service_role";
GRANT UPDATE ON TABLE "public"."complaint_submission_contexts" TO "service_role";
GRANT SELECT ON TABLE "public"."complaint_updates" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."complaint_updates" TO "service_role";
GRANT TRIGGER ON TABLE "public"."complaint_updates" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."complaint_updates" TO "service_role";
GRANT SELECT ON TABLE "public"."complaints" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."complaints" TO "service_role";
GRANT TRIGGER ON TABLE "public"."complaints" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."complaints" TO "service_role";
GRANT REFERENCES ON TABLE "public"."news_intake_automation_settings" TO "service_role";
GRANT TRIGGER ON TABLE "public"."news_intake_automation_settings" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."news_intake_automation_settings" TO "service_role";
GRANT REFERENCES ON TABLE "public"."news_intake_run_items" TO "service_role";
GRANT TRIGGER ON TABLE "public"."news_intake_run_items" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."news_intake_run_items" TO "service_role";
GRANT REFERENCES ON TABLE "public"."news_intake_runs" TO "service_role";
GRANT TRIGGER ON TABLE "public"."news_intake_runs" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."news_intake_runs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."news_source_domains" TO "service_role";
GRANT TRIGGER ON TABLE "public"."news_source_domains" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."news_source_domains" TO "service_role";
GRANT SELECT ON TABLE "public"."permissions" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."permissions" TO "service_role";
GRANT TRIGGER ON TABLE "public"."permissions" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."permissions" TO "service_role";
GRANT REFERENCES ON TABLE "public"."public_category_popularity_snapshot" TO "service_role";
GRANT TRIGGER ON TABLE "public"."public_category_popularity_snapshot" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."public_category_popularity_snapshot" TO "service_role";
GRANT REFERENCES ON TABLE "public"."public_engagement_events" TO "service_role";
GRANT TRIGGER ON TABLE "public"."public_engagement_events" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."public_engagement_events" TO "service_role";
GRANT REFERENCES ON TABLE "public"."public_response_rate_events" TO "service_role";
GRANT TRIGGER ON TABLE "public"."public_response_rate_events" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."public_response_rate_events" TO "service_role";
GRANT SELECT ON TABLE "public"."public_visit_sessions" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."public_visit_sessions" TO "service_role";
GRANT TRIGGER ON TABLE "public"."public_visit_sessions" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."public_visit_sessions" TO "service_role";
GRANT REFERENCES ON TABLE "public"."public_write_rate_events" TO "service_role";
GRANT TRIGGER ON TABLE "public"."public_write_rate_events" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."public_write_rate_events" TO "service_role";
GRANT REFERENCES ON TABLE "public"."report_duplicate_overrides" TO "service_role";
GRANT TRIGGER ON TABLE "public"."report_duplicate_overrides" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."report_duplicate_overrides" TO "service_role";
GRANT REFERENCES ON TABLE "public"."reporting_form_schema_fields" TO "service_role";
GRANT TRIGGER ON TABLE "public"."reporting_form_schema_fields" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."reporting_form_schema_fields" TO "service_role";
GRANT REFERENCES ON TABLE "public"."reporting_form_schemas" TO "service_role";
GRANT TRIGGER ON TABLE "public"."reporting_form_schemas" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."reporting_form_schemas" TO "service_role";
GRANT SELECT ON TABLE "public"."role_permissions" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."role_permissions" TO "service_role";
GRANT TRIGGER ON TABLE "public"."role_permissions" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."role_permissions" TO "service_role";
GRANT SELECT ON TABLE "public"."roles" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."roles" TO "service_role";
GRANT SELECT ON TABLE "public"."roles" TO "service_role";
GRANT TRIGGER ON TABLE "public"."roles" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."roles" TO "service_role";
GRANT SELECT ON TABLE "public"."segments" TO "anon";
GRANT SELECT ON TABLE "public"."segments" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."segments" TO "service_role";
GRANT TRIGGER ON TABLE "public"."segments" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."segments" TO "service_role";
GRANT REFERENCES ON TABLE "public"."site_banners" TO "service_role";
GRANT TRIGGER ON TABLE "public"."site_banners" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."site_banners" TO "service_role";
GRANT SELECT ON TABLE "public"."subcategories" TO "anon";
GRANT SELECT ON TABLE "public"."subcategories" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."subcategories" TO "service_role";
GRANT TRIGGER ON TABLE "public"."subcategories" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."subcategories" TO "service_role";
GRANT REFERENCES ON TABLE "public"."subject_responses" TO "service_role";
GRANT TRIGGER ON TABLE "public"."subject_responses" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."subject_responses" TO "service_role";
GRANT SELECT ON TABLE "public"."user_roles" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."user_roles" TO "service_role";
GRANT SELECT ON TABLE "public"."user_roles" TO "service_role";
GRANT TRIGGER ON TABLE "public"."user_roles" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."user_roles" TO "service_role";

-- Reproduce captured function ACLs, starting from the standard public EXECUTE default.
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."can_upload_public_complaint_evidence"(text) TO "anon";
GRANT EXECUTE ON FUNCTION "private"."can_upload_public_complaint_evidence"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."is_published_complaint_evidence"(text) TO "anon";
GRANT EXECUTE ON FUNCTION "private"."is_published_complaint_evidence"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."system_health_database_metrics"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_begin_news_intake_run"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_check_news_source_domain"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_check_news_source_domain"(text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_check_source_duplicate"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_complete_news_intake_item_review"(uuid, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_create_sourced_report_from_intake"(jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_create_sourced_report_from_intake"(jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_emit_notification"(text, text, text, text, text, uuid, text, text, text, text, jsonb, text[], text[], text, uuid, text, text, boolean, boolean) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_finalize_user_membership"(uuid, text, text, boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_finalize_user_membership"(uuid, text, text, boolean) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_finish_news_intake_run"(uuid, text, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_finish_news_intake_run"(uuid, text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_get_my_authorization_context"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_get_news_intake_automation_dashboard"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_get_news_intake_scan_sources"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_get_news_intake_scan_sources"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_get_news_intake_taxonomy"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_get_site_banners"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_get_system_health"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_notification_can_view_role_scope"(uuid, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_notification_can_view_user_scope"(uuid, uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_notification_get_effective_permissions"(uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_notification_resolve_recipients"(text, text[], text[], text, text, uuid, uuid, boolean, boolean) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_preview_sourced_report_intake"(jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_preview_sourced_report_intake"(jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_publish_banner"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_publish_complaint"(text, text, text, text, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_record_news_intake_item"(uuid, jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_record_news_intake_item"(uuid, jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_resolve_news_intake_location"(text, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_resolve_news_intake_location"(text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."admin_save_banner_draft"(text, jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_manage_role_scope"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_manage_role_scope"(text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."canonical_district_id"(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."canonical_district_name"(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."canonical_division_name"(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."canonical_upazila_name"(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."compose_public_area"(text, text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."compose_public_location"(text, text, text, text, text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."duplicate_report_signature_values"(text, text, text, text, date, text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."duplicate_token_similarity"(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."enforce_published_source_integrity"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."enforce_sourced_report_verification"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_caller_effective_permission_set"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_caller_effective_permission_set"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_platform_sync_contract_version"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_platform_sync_contract_version"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_platform_sync_contract_version"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_public_harassment_classifications"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_public_harassment_classifications"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_public_harassment_classifications"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_public_home_feed"(double precision, double precision, text, text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_public_home_feed"(double precision, double precision, text, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_public_home_feed"(double precision, double precision, text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_public_published_report"(text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_public_published_report"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_public_published_report"(text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_public_published_report_evidence"(text[]) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_public_published_report_evidence"(text[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_public_published_reports"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_public_published_reports"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_public_published_reports"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_public_published_responses"(text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_public_published_responses"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_public_site_banners"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_public_site_banners"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."has_permission"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_active_admin"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."location_mention_position"(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."location_text_language"(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."log_role_audit_event"(text, text, jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."news_intake_has_explicit_past_relative_date"(text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."news_intake_location_contract_is_valid"(text, text, text, text, text, text, text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."news_intake_privacy_review_required"(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."news_intake_specific_location_has_positive_evidence"(text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."news_intake_specific_location_text_is_safe"(text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."normalize_duplicate_text"(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."normalize_source_url"(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."normalize_sourced_report_location_row"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."process_trusted_news_intake_candidate"(jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."process_trusted_news_intake_candidate"(jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_public_visit_session"(text, text, text, numeric, numeric, numeric, text, text, text, text, text, text, text, integer, integer, text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_public_visit_session_internal"(text, text, text, numeric, numeric, numeric, text, text, text, text, text, text, text, integer, integer, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."register_public_complaint_evidence"(text, text, text, bigint, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."reporting_field_options_are_bilingual"(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."service_assert_public_write_rate"(text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."service_begin_scheduled_news_intake_run"(timestamp with time zone) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."service_get_database_health"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."service_record_system_health_snapshot"(text, jsonb, jsonb, jsonb, jsonb, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."service_verify_system_health_token"(text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."set_complaint_published_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sourced_report_schema_validation_errors_internal"(text, jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."submit_public_complaint_v2"(jsonb, text, jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."submit_public_complaint_v3"(jsonb, text, jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."submit_public_configured_complaint"(jsonb, text, jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."submit_public_response_v2"(text, text, jsonb, text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."track_public_report_engagement"(text, text, text, text) TO "service_role";

-- Recreate application trigger definitions and enable their ordinary trigger state.
CREATE TRIGGER trg_protect_super_admin BEFORE DELETE OR UPDATE ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION protect_super_admin_invariants();
CREATE TRIGGER trg_sanitize_ride_sharing_complaint_party BEFORE INSERT OR UPDATE ON "public"."complaint_parties" FOR EACH ROW EXECUTE FUNCTION sanitize_ride_sharing_complaint_party();
CREATE TRIGGER trg_enforce_published_source_integrity BEFORE INSERT OR DELETE OR UPDATE ON "public"."complaint_sources" FOR EACH ROW EXECUTE FUNCTION enforce_published_source_integrity();
CREATE TRIGGER trg_complaint_submission_contexts_ui_language BEFORE INSERT OR UPDATE ON "public"."complaint_submission_contexts" FOR EACH ROW EXECUTE FUNCTION private.apply_ui_language_from_context();
CREATE TRIGGER trg_public_complaint_submission_rate BEFORE INSERT ON "public"."complaint_submission_contexts" FOR EACH ROW EXECUTE FUNCTION enforce_public_complaint_submission_rate();
CREATE TRIGGER complaints_set_updated_at BEFORE UPDATE ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER complaints_validate_configured_answers BEFORE INSERT OR UPDATE OF custom_field_answers, form_schema_version, subcategory_id ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION validate_configured_complaint_answers();
CREATE TRIGGER normalize_sourced_report_location_before_write BEFORE INSERT OR UPDATE OF division, district, upazila_or_thana, origin_type ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION normalize_sourced_report_location_row();
CREATE TRIGGER trg_admin_notify_complaint_submitted AFTER INSERT ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION admin_notify_complaint_submitted_trigger();
CREATE TRIGGER trg_complaints_capture_taxonomy_snapshot BEFORE INSERT OR UPDATE OF segment_id, subcategory_id ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION capture_complaint_taxonomy_snapshot();
CREATE TRIGGER trg_enforce_sourced_report_duplicate_review BEFORE UPDATE OF status ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION enforce_sourced_report_duplicate_review();
CREATE TRIGGER trg_enforce_sourced_report_verification BEFORE INSERT OR UPDATE OF status ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION enforce_sourced_report_verification();
CREATE TRIGGER trg_guard_automated_sourced_report_collision BEFORE INSERT ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION guard_automated_sourced_report_collision();
CREATE TRIGGER trg_guard_sourced_report_publish_readiness BEFORE UPDATE OF status ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION guard_sourced_report_publish_readiness();
CREATE TRIGGER trg_guard_sourced_report_schema_requirements BEFORE INSERT OR UPDATE ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION guard_sourced_report_schema_requirements();
CREATE TRIGGER trg_guard_trusted_news_intake_one_click_contract BEFORE INSERT OR UPDATE ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION guard_trusted_news_intake_one_click_contract();
CREATE TRIGGER trg_guard_trusted_news_intake_positive_location BEFORE INSERT OR UPDATE ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION guard_trusted_news_intake_positive_location();
CREATE TRIGGER trg_normalize_sourced_report_public_language BEFORE INSERT OR UPDATE OF status, publication_preferences ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION normalize_sourced_report_public_language();
CREATE TRIGGER trg_sanitize_configured_complaint_answers BEFORE INSERT OR UPDATE OF custom_field_answers, form_schema_version, subcategory_id ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION sanitize_configured_complaint_answers();
CREATE TRIGGER trg_scrub_reporter_context_after_moderation AFTER UPDATE OF status ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION private.scrub_reporter_context_after_moderation();
CREATE TRIGGER trg_set_complaint_published_at BEFORE INSERT OR UPDATE OF status ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION set_complaint_published_at();
CREATE TRIGGER trg_public_visit_session_rate BEFORE INSERT ON "public"."public_visit_sessions" FOR EACH ROW EXECUTE FUNCTION enforce_public_visit_session_rate();
CREATE TRIGGER trg_public_visit_sessions_ui_language BEFORE INSERT OR UPDATE ON "public"."public_visit_sessions" FOR EACH ROW EXECUTE FUNCTION private.apply_ui_language_from_context();
CREATE TRIGGER trg_enforce_reporting_field_privacy BEFORE INSERT OR UPDATE OF field_type, storage_mode, config ON "public"."reporting_form_schema_fields" FOR EACH ROW EXECUTE FUNCTION enforce_reporting_field_privacy();
CREATE TRIGGER trg_reporting_form_schema_fields_set_updated_at BEFORE UPDATE ON "public"."reporting_form_schema_fields" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_admin_notify_reporting_form_published AFTER UPDATE ON "public"."reporting_form_schemas" FOR EACH ROW EXECUTE FUNCTION admin_notify_reporting_form_published_trigger();
CREATE TRIGGER trg_reporting_form_schemas_set_updated_at BEFORE UPDATE ON "public"."reporting_form_schemas" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_admin_notify_segments AFTER INSERT OR UPDATE ON "public"."segments" FOR EACH ROW EXECUTE FUNCTION admin_notify_taxonomy_trigger();
CREATE TRIGGER trg_segments_set_updated_at BEFORE UPDATE ON "public"."segments" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_admin_notify_banner_published AFTER UPDATE ON "public"."site_banners" FOR EACH ROW EXECUTE FUNCTION admin_notify_banner_published_trigger();
CREATE TRIGGER trg_admin_notify_subcategories AFTER INSERT OR UPDATE ON "public"."subcategories" FOR EACH ROW EXECUTE FUNCTION admin_notify_taxonomy_trigger();
CREATE TRIGGER trg_ensure_subcategory_slug BEFORE INSERT OR UPDATE OF slug, id ON "public"."subcategories" FOR EACH ROW EXECUTE FUNCTION private.ensure_subcategory_slug();
CREATE TRIGGER trg_subcategories_set_updated_at BEFORE UPDATE ON "public"."subcategories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER subject_responses_set_updated_at BEFORE UPDATE ON "public"."subject_responses" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_system_health_transition AFTER INSERT ON "public"."system_health_snapshots" FOR EACH ROW EXECUTE FUNCTION private.handle_system_health_transition();
CREATE TRIGGER trg_protect_super_admin_user_roles BEFORE INSERT OR DELETE OR UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION protect_super_admin_user_roles();

-- Recreate the two observed Storage buckets and object policies; no objects are copied.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES ('banner-media','banner-media',true,5242880,ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,public=EXCLUDED.public,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES ('complaint-evidence','complaint-evidence',false,262144,ARRAY['image/webp']::text[]) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,public=EXCLUDED.public,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY "active admin evidence delete" ON storage.objects AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'complaint-evidence'::text) AND is_active_admin()));
CREATE POLICY "active admin evidence insert" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'complaint-evidence'::text) AND is_active_admin()));
CREATE POLICY "active admin evidence read" ON storage.objects AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'complaint-evidence'::text) AND is_active_admin()));
CREATE POLICY "active admin evidence update" ON storage.objects AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'complaint-evidence'::text) AND is_active_admin())) WITH CHECK (((bucket_id = 'complaint-evidence'::text) AND is_active_admin()));
CREATE POLICY "banner media admin delete" ON storage.objects AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'banner-media'::text) AND has_permission('banners.manage'::text)));
CREATE POLICY "banner media admin insert" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'banner-media'::text) AND has_permission('banners.manage'::text)));
CREATE POLICY "banner media admin select" ON storage.objects AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'banner-media'::text) AND has_permission('banners.manage'::text)));
CREATE POLICY "banner media admin update" ON storage.objects AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'banner-media'::text) AND has_permission('banners.manage'::text))) WITH CHECK (((bucket_id = 'banner-media'::text) AND has_permission('banners.manage'::text)));
CREATE POLICY "public complaint evidence upload" ON storage.objects AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (((bucket_id = 'complaint-evidence'::text) AND (lower(storage.extension(name)) = 'webp'::text) AND private.can_upload_public_complaint_evidence(name)));
CREATE POLICY "published complaint evidence read" ON storage.objects AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (((bucket_id = 'complaint-evidence'::text) AND private.is_published_complaint_evidence(name)));

-- Match captured Storage table RLS flags and grants; keep storage policies authoritative.
ALTER TABLE "storage"."buckets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "storage"."buckets" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE "storage"."buckets" TO "anon";
GRANT INSERT ON TABLE "storage"."buckets" TO "anon";
GRANT SELECT ON TABLE "storage"."buckets" TO "anon";
GRANT UPDATE ON TABLE "storage"."buckets" TO "anon";
GRANT DELETE ON TABLE "storage"."buckets" TO "authenticated";
GRANT INSERT ON TABLE "storage"."buckets" TO "authenticated";
GRANT SELECT ON TABLE "storage"."buckets" TO "authenticated";
GRANT UPDATE ON TABLE "storage"."buckets" TO "authenticated";
GRANT DELETE ON TABLE "storage"."buckets" TO "service_role";
GRANT INSERT ON TABLE "storage"."buckets" TO "service_role";
GRANT REFERENCES ON TABLE "storage"."buckets" TO "service_role";
GRANT SELECT ON TABLE "storage"."buckets" TO "service_role";
GRANT TRIGGER ON TABLE "storage"."buckets" TO "service_role";
GRANT TRUNCATE ON TABLE "storage"."buckets" TO "service_role";
GRANT UPDATE ON TABLE "storage"."buckets" TO "service_role";
ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "storage"."objects" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE "storage"."objects" TO "anon";
GRANT INSERT ON TABLE "storage"."objects" TO "anon";
GRANT SELECT ON TABLE "storage"."objects" TO "anon";
GRANT UPDATE ON TABLE "storage"."objects" TO "anon";
GRANT DELETE ON TABLE "storage"."objects" TO "authenticated";
GRANT INSERT ON TABLE "storage"."objects" TO "authenticated";
GRANT SELECT ON TABLE "storage"."objects" TO "authenticated";
GRANT UPDATE ON TABLE "storage"."objects" TO "authenticated";
GRANT DELETE ON TABLE "storage"."objects" TO "service_role";
GRANT INSERT ON TABLE "storage"."objects" TO "service_role";
GRANT REFERENCES ON TABLE "storage"."objects" TO "service_role";
GRANT SELECT ON TABLE "storage"."objects" TO "service_role";
GRANT TRIGGER ON TABLE "storage"."objects" TO "service_role";
GRANT TRUNCATE ON TABLE "storage"."objects" TO "service_role";
GRANT UPDATE ON TABLE "storage"."objects" TO "service_role";

COMMIT;
