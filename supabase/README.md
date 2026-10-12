# Sobaike Janao Admin — Supabase Migrations & Backend Architecture

**Notification Project Delivery Status:**
- **Phase 1 (Notification Foundation):** CODE PASS + LIVE PASS
- **Phase 2 (Notification Producer Wiring & Live Sync):** CODE PASS + LIVE PASS

## Overview

This directory contains the database migrations, audit scripts, and security definitions for the **Sobaike Janao Admin Panel**.

---

## Migration Sequence

1. **`20260902000000_phase3b_rbac_foundation.sql`**
   - **Phase:** 3B Base Schema Foundation
   - **Contents:** Creates relational RBAC tables (`roles`, `permissions`, `role_permissions`, `user_roles`, `admin_audit_logs`), seeds 15 canonical permissions, and establishes restrictive Row-Level Security (RLS) policies.

2. **`20260902000001_phase3b_rbac_correction.sql`**
   - **Phase:** 3B Forward Correction
   - **Contents:** Adds `public.roles.active` (BOOLEAN NOT NULL DEFAULT true) and `public.admin_users.display_name` (TEXT NULL), tightens self-read RLS policies on `admin_users` and `user_roles`, revokes direct client table SELECT on `admin_audit_logs`, and ensures `ON CONFLICT (id) DO NOTHING` for permission seeding.

3. **`20260902000002_phase3b_privilege_hardening.sql`**
   - **Phase:** 3B Defense-in-Depth Hardening
   - **Contents:** Explicitly revokes `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` privileges on all RBAC & admin security tables from `authenticated` and `anon`.

4. **`20260902000003_phase3c_role_management_backend.sql`**
   - **Phase:** Role Management Phase 1 (Secure RPC Backend)
   - **Contents:** 
     - Reusable permission check: `public.has_permission(p_permission_id)`
     - Bootstrap authorization resolver: `public.can_manage_roles()`
       - *Bootstrap Mode (`COUNT(user_roles) = 0`):* Any active administrator can create/update roles.
       - *Normal Mode (`COUNT(user_roles) > 0`):* Requires active administrator status AND effective `roles.manage` permission.
     - Role slug generator: `public.generate_role_slug(p_name)`
     - Read RPCs: `public.admin_list_roles()`, `public.admin_get_role_detail()`, `public.admin_get_permission_catalogue()`
     - Write RPCs (Atomic, Audited, Strict Validation):
       - `public.admin_create_role(p_name, p_active, p_permission_ids, p_description)`
       - `public.admin_update_role(p_role_id, p_name, p_active, p_permission_ids, p_description)`
       - `public.admin_replace_role_permissions(p_role_id, p_permission_ids)`

5. **`20260902000007_phase2a_role_backend_safety.sql`**
   - **Phase:** Phase 2A Role Management Backend Safety
   - **Contents:** Introduces `count_effective_role_managers()`, advisory transaction locks, system-role protection, and last-manager protection.

6. **`20260902000008_phase2a_role_update_correction.sql`**
   - **Phase:** Phase 2A Role Update Correction
   - **Contents:** Preserves existing Bengali role names (`name_bn`) during English renames, preserves omitted descriptions, and supports explicit description updates.

7. **`20260903000004_phase2e_dashboard_complaint_read_authorization.sql`**
   - **Phase:** Phase 2E Dashboard & Complaint Read Authorization
   - **Contents:** Enforces Row-Level Security (RLS) on `public.complaints` requiring `complaints.view` for administrative table queries; preserves anonymous public feed (`anon` can read `status = 'published'`); and introduces controlled `SECURITY DEFINER` aggregate RPC `public.admin_get_dashboard_aggregates()` requiring `dashboard.view`.

8. **`20260903000005_phase2e_map_authorization_correction.sql`**
   - **Phase:** Phase 2E Map Authorization Correction
   - **Contents:** Provides controlled `SECURITY DEFINER` RPC `public.admin_get_map_dataset()` requiring active admin session and `map.view` permission; returns sanitized geospatial fields and taxonomy filters; avoids broad complaint table exposure; and idempotently reaffirms explicit RLS policies on `public.complaints`.

9. **`20260903000006_phase2e_map_status_and_navigation_correction.sql`**
   - **Phase:** Phase 2E Map Status Filter & Navigation Correction
   - **Contents:** Updates `public.admin_get_map_dataset()` to filter complaints server-side to supported lifecycle statuses only, and returns server-computed `unsupportedStatusCount` numeric aggregate without returning unsupported row content.

10. **`20260904000001_phase4a_delegation_ceiling_and_scoping.sql`**
    - **Phase:** Phase 4A Authorization Delegation Ceiling & Scoping
    - **Contents:** Enforces server-authoritative delegation ceiling where callers can only grant permissions they effectively possess; enforces target user and role manageability scoping; implements `can_manage_role_scope`, `can_manage_user_target`, and safe role assignment ceilings.

11. **`20260904000002_phase4a_delegation_ceiling_correction.sql`**
    - **Phase:** Phase 4A Delegation Ceiling Parameter Correction
    - **Contents:** Aligns `public.admin_finalize_user_membership` signature defaults (`p_display_name TEXT DEFAULT NULL, p_role_id TEXT DEFAULT NULL, p_active BOOLEAN DEFAULT TRUE`) with production runtime.

12. **`20260904000003_phase2e_edge_function_service_privileges.sql`**
    - **Phase:** Phase 2E Edge Function Service Privileges
    - **Contents:** Grants narrow `USAGE` on schema `public` and `SELECT` on `public.admin_users` and `public.roles` to `service_role` for server-side user provisioning verification.

13. **`20260904000004_notification_foundation.sql`**
    - **Phase:** Notification Project Phase 1 — Notification Backend Foundation & Recipient Engine (Targeted Correction Pass)
    - **Contents:** Establishes canonical notification event catalogue (12 approved keys), per-recipient notifications table with persisted `audience_mode` ('permission', 'super_admin_only', 'personal'), partial unread index, idempotency deduplication, fail-closed server-side recipient resolution (`admin_notification_resolve_recipients`), dedicated read-time authority evaluator (`admin_notification_can_currently_view`) ensuring revoked permissions dynamically hide stale notifications, canonical internal emitter (`admin_emit_notification`) with strict contract validation (SQLSTATE `22000`), and user-facing protected RPCs (`admin_list_notifications`, `admin_get_unread_notification_count`, `admin_mark_notification_read`, `admin_mark_all_notifications_read`) with defense-in-depth RLS.

14. **`20260904000005_notification_producer_wiring.sql`**
    - **Phase:** Notification Project Phase 2 — Producer Wiring & Lifecycle Event Emission
    - **Contents:**
      - Upgrades `public.log_role_audit_event` to return the generated UUID for deterministic oversight notification deduplication keys.
      - Wires public complaint submission (`submit_public_complaint`) to emit `complaint.submitted` with fail-safe error isolation and submission idempotency deduplication.
      - Wires canonical public evidence registration (`register_public_complaint_evidence`) to emit `complaint.evidence_attached` with fail-safe error isolation.
      - Wires complaint moderation operations (`admin_publish_complaint`, `admin_unpublish_complaint`, `admin_reject_complaint`) with strict granular permissions (`complaints.publish`, `complaints.unpublish`, `complaints.reject`), supporting transitions from `submitted` and `unpublished` for publish, preserving timeline update types, return payloads, and audit behavior.
      - Wires administrator onboarding (`admin_finalize_user_membership`) to emit dual-stream `admin.created` notifications (Stream A oversight requiring `admin_users.view` or `admin_users.manage`, and Stream B personal welcome).
      - Wires administrator lifecycle management (`admin_update_user`) to emit `admin.activated`, `admin.deactivated` (oversight only), and `admin.role_changed` (oversight and personal, gated by active status). Preserves `ADMIN_USER_UPDATED` audit action.
      - Wires role lifecycle management (`admin_create_role`, `admin_update_role`, `admin_replace_role_permissions`) to emit `role.created`, `role.updated`, and `role.permissions_changed` directed strictly to `ARRAY['roles.manage']`. Preserves `public.generate_role_slug()`.

15. **`20260904000006_phase2_live_sync_corrections.sql`**
    - **Phase:** Notification Project Phase 2 Live Sync Corrections (Phase 2 CODE PASS + LIVE PASS)
    - **Contents:**
      - Synchronizes final live Supabase corrections back to the repository.
      - `admin_publish_complaint(text)`: Removes non-existent `published_at` column reference; preserves `submitted` and `unpublished` -> `published` transitions; preserves `complaints.publish` permission, timeline updates, audit logging, and `complaint.published` event notification.
      - `admin_update_user(uuid, text, text, boolean)`: Removes non-existent `has_role_permission()`; preserves delegation ceiling / target-scope checks and atomic `count_effective_role_managers()` resulting-state protection; preserves `ADMIN_USER_UPDATED` audit action and notifications (`admin.activated`, `admin.deactivated`, `admin.role_changed`), with personal `admin.role_changed` emitted only when resulting user is active and personal `admin.deactivated` omitted.
      - `admin_update_role`: Drops accidental conflicting 8-param overload `(text, text, text, text, boolean, text[], text, text)` and retains authoritative frontend-compatible bilingual signature `(text, text, text, boolean, text[], text, boolean, boolean)`; preserves bilingual naming, description update flags, immutable technical role ID, system-role protections, delegation ceiling, last-manager protection, `ROLE_UPDATED` audit, and notifications (`role.updated`, `role.permissions_changed`) with no-op notification suppression.

---

## Role Management Backend API Specification

| RPC Function | Type | Parameters | Access Requirement | Description |
| :--- | :--- | :--- | :--- | :--- |
| `public.admin_get_permission_catalogue()` | STABLE | *(none)* | `can_manage_roles()` | Returns 15 canonical permissions sorted by module & action. |
| `public.admin_list_roles()` | STABLE | *(none)* | `can_manage_roles()` | Returns role summaries with permission counts and assigned user counts. |
| `public.admin_get_role_detail(p_role_id)` | STABLE | `p_role_id: text` | `can_manage_roles()` | Returns full role detail, assigned permission IDs array, and user count. |
| `public.admin_create_role(...)` | VOLATILE | `p_name: text, p_active: boolean, p_permission_ids: text[], p_description: text` | `can_manage_roles()` | Atomically creates role, inserts mappings, records audit log, and returns created role JSON. Enforces case-insensitive uniqueness on visible name. |
| `public.admin_update_role(...)` | VOLATILE | `p_role_id: text, p_name: text, p_active: boolean, p_permission_ids: text[], p_description: text` | `can_manage_roles()` | Updates role name, active state, description, and atomically replaces permission mappings if provided. Technical ID remains immutable. Rejects duplicate visible names. |
| `public.admin_replace_role_permissions(...)` | VOLATILE | `p_role_id: text, p_permission_ids: text[]` | `can_manage_roles()` | Dedicated atomic RPC to replace a role's permission set with audit logging. |

---

## Security Boundaries

1. **Direct Table Mutations:** Direct browser `INSERT`, `UPDATE`, `DELETE` operations on `roles`, `role_permissions`, `permissions`, `user_roles`, `admin_users`, and `admin_audit_logs` remain strictly revoked. All writes are mediated via `SECURITY DEFINER` RPCs.
2. **Anonymous Access:** Revoked across all RBAC tables and RPC functions.
3. **Role ID Stability:** Role technical IDs (e.g. `admin-2`, `moderator`) are generated upon creation and remain immutable on subsequent role renames.
4. **Permission Set Validation:** RPCs reject unknown permission identifiers with clear transaction rollbacks (`22000`).
5. **Audit Logging:** Every role creation and update writes an immutable event into `public.admin_audit_logs` with the authenticated `actor_id` (`auth.uid()`).
6. **No Service Role or Edge Functions in Client:** Zero secret keys in client bundles.

---

## Notification Backend Foundation API Specification (Phase 1)

| RPC / Internal Function | Type | Security | Executable By | Description |
| :--- | :--- | :--- | :--- | :--- |
| `public.admin_emit_notification(...)` | VOLATILE | `SECURITY DEFINER` | `service_role` only | Canonical entry point for creating notifications. Validates event key against active catalogue, enforces `audience_mode` ('permission', 'super_admin_only', 'personal'), validates target scoping & UUID formats (SQLSTATE `22000`), resolves recipients server-side, and inserts deduplicated per-recipient records. |
| `public.admin_notification_resolve_recipients(...)` | STABLE | `SECURITY DEFINER` | `service_role` only | Server-side recipient resolver. Filters active administrators based on audience mode, required all/any permissions, target scoping (`admin_user`, `role`, `complaint`), actor exclusion, and super admin inclusion. Fails closed on unknown target types. |
| `public.admin_notification_can_currently_view(...)` | STABLE | `SECURITY DEFINER` | `authenticated`, `service_role` | Dedicated read-time authority evaluator hard-bound to `auth.uid()`. Dynamically checks current active status, effective permissions, and target scoping so revoked access immediately hides stale notifications from both RLS and read RPCs. |
| `public.admin_list_notifications(...)` | STABLE | `SECURITY DEFINER` | `authenticated` | Returns paginated list of authorized notifications for the caller (`auth.uid()`). Supports filtering by unread status, category, and keyset cursor (`p_before_created_at`, `p_before_id`). Enforces read-time visibility on every row. |
| `public.admin_get_unread_notification_count()` | STABLE | `SECURITY DEFINER` | `authenticated` | Returns accurate unread count of currently visible notifications for the active admin caller (`auth.uid()`). Stale unread items are excluded dynamically. |
| `public.admin_mark_notification_read(p_notification_id)` | VOLATILE | `SECURITY DEFINER` | `authenticated` | Marks a single notification as read (`read_at = now()`) if addressed to caller, currently visible, and caller is an active administrator. |
| `public.admin_mark_all_notifications_read()` | VOLATILE | `SECURITY DEFINER` | `authenticated` | Marks all currently unread and visible notifications for caller as read. Returns count of modified rows. |

### Notification Security Boundaries

1. **Strict Client Revocations:** Direct table mutations (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`) on `admin_notifications` and `admin_notification_event_catalogue` are completely revoked for `authenticated`, `anon`, and `PUBLIC`. All emission is mediated via `admin_emit_notification` by `service_role`.
2. **Caller Identity Binding:** Read-time visibility evaluation is strictly bound to `auth.uid()`. Callers cannot supply an arbitrary caller ID to inspect notifications for other users.
3. **No Unsolicited Permissions:** Notification viewing is a baseline capability for active administrators; no synthetic `notifications.view` permission exists in `public.permissions`.
4. **Canonical Event Catalogue:** Exactly 12 approved Phase 1 event keys across complaint, admin lifecycle, and role domains. Unlisted keys are rejected at emit time.
5. **Fail-Closed Target Scoping:** Unknown target types, malformed UUIDs, and unknown audience modes fail closed (returning 0 recipients in resolver or raising SQLSTATE `22000` in emitter).

---

## Verification & Audit Scripts

- `supabase/audit/phase_3b_database_inspection.sql` — Schema and table constraint inspection (safe pre- and post-migration).
- `supabase/audit/phase_3c_role_backend_verification.sql` — Verifies Role Management RPCs, function security definer modes, and execution grants.
- `supabase/audit/notification_foundation_verification.sql` — Verifies Notification event catalogue keys (exact 12-key set assertion), tables, audience_mode and target_type constraints, caller-bound visibility evaluator signatures, privilege lockdowns, and transactional runtime deduplication & dynamic revocation safety.
- `supabase/audit/notification_producer_wiring_verification.sql` — Verifies all 12 catalogue events, producer security definer modes, privilege lockdowns, canonical 15 permissions, and dynamic transactional simulations inside a rollback block using safe fixtures with zero synthetic `auth.users`.
