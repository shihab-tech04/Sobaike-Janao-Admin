# Phase 14/16 — Final Hardening & Regression Record

## Scope

Final cross-system hardening pass for:

- Public repository: `shihabshajib01-cell/sobaike-janao`
- Admin repository: `shihabshajib01-cell/sobaike-janao-admin`
- Live Supabase project: `ahiaymyqfmyyrjkwgvhi`

The phase follows the existing-product rule: preserve solved UI/UX, routes, feed semantics, location privacy, moderation workflows, permissions, and parallel Explore work; change only verified regressions or hardening defects.

## Baseline inspected

- Public HEAD at phase start: `ff70882c811628ce584ec2dbf661ef897d670109`
- Admin HEAD at phase start: `a65c6e4e6240d9075c44518f917da80917da4768`
- Phase 13 live complaint-edit migration remained active and was not reopened.

Parallel Public Explore changes at `3304577` and `ff70882` were treated as current product work and protected.

## Live defects found and fixed

### 1. Complaint SELECT RBAC regression — FIXED

Two permissive authenticated SELECT policies existed on `public.complaints`:

- `active admins can read complaints` → any active admin could read complaint rows
- `complaints_admin_authenticated_select` → required `has_permission('complaints.view')`

Because permissive policies are OR-combined, the first policy weakened the intended permission boundary. It was removed. The remaining authenticated direct-read path now requires `complaints.view`.

The anonymous published-only policy remains unchanged.

### 2. Mutable function search path — FIXED

`public.set_updated_at()` had no fixed `search_path`.

It now uses:

`search_path = pg_catalog, public`

The Supabase `function_search_path_mutable` advisor warning cleared after the migration.

### 3. Internal trigger functions exposed as RPCs — FIXED

Direct EXECUTE was revoked from `PUBLIC`, `anon`, and `authenticated` for:

- `protect_super_admin_invariants()`
- `protect_super_admin_user_roles()`
- `rls_auto_enable()`

These are trigger/event-trigger implementation functions, not user-facing RPC endpoints. Their trigger behavior remains intact.

The anonymous SECURITY DEFINER advisor count dropped from 16 to 13 after this correction.

### 4. Redundant RLS policy — FIXED

`public.admin_users` had two permissive own-membership SELECT policies. The narrower redundant policy was removed while preserving the existing effective behavior of the remaining own-membership policy.

### 5. RLS auth initialization overhead — FIXED

RLS policies were rewritten to use `(SELECT auth.uid())` where appropriate on:

- `admin_users`
- `user_roles`
- `roles`
- `role_permissions`
- `admin_notifications`

The Supabase `auth_rls_initplan` advisor warnings cleared.

### 6. Deferred database indexing debt — FIXED

The following indexes were added:

- `idx_complaints_status_created_at_id`
- `idx_additional_info_submissions_complaint_id`
- `idx_complaint_evidence_complaint_id`
- `idx_complaint_parties_complaint_id`
- `idx_complaint_updates_complaint_id`
- `idx_complaints_segment_id`
- `idx_complaints_subcategory_id`
- `idx_subcategories_segment_id`
- `idx_subject_responses_complaint_id`
- `idx_user_roles_assigned_by`

This closes the previously deferred Phase 12/15 missing-index findings. The Supabase `unindexed_foreign_keys` advisor warning cleared.

`idx_complaints_status_created_at_id` directly supports the live published-feed status filter and chronological ordering.

## Advisor verification after migration

Live migration:

- Version: `20260915050135`
- Name: `phase14_16_final_hardening`

After migration:

- `function_search_path_mutable`: cleared
- `unindexed_foreign_keys`: cleared
- `auth_rls_initplan`: cleared
- `multiple_permissive_policies`: cleared
- internal trigger/event-trigger anon/authenticated EXECUTE exposure: cleared for the three targeted internal functions

Remaining advisor notices are not treated as automatic defects:

1. RLS-enabled tables with no policies are currently deny-by-default RPC-backed/internal tables; adding broad policies would reduce security.
2. Remaining anon SECURITY DEFINER functions are public read/submission/evidence-policy entry points required by the public product or storage-policy architecture and require function-by-function change control before any revocation.
3. Remaining authenticated SECURITY DEFINER functions include Admin RPCs that intentionally accept the `authenticated` role and enforce authorization inside the database function.
4. Unused-index notices include newly created indexes whose usage counters have not yet accumulated traffic; they are not deletion candidates immediately after creation.
5. Supabase Auth leaked-password protection is disabled. This is an account/Auth configuration item rather than a schema migration and was not changed through SQL.

## Privacy regression verification

Live payload checks after the hardening migration passed for:

- `get_public_home_feed`
- `get_public_published_reports`

No public payload keys were found for:

- latitude
- longitude
- lat
- lng
- coordinates
- distance
- visitorLat
- visitorLng
- reporter device location

Phase 8 shadow-location privacy remains intact.

## Location/feed regression protection

No changes were made to:

- server-side shadow distance ranking
- `showGeneralLocation` ranking eligibility
- Home filter semantics
- category-feed behavior
- Search location neutrality
- visitor location consent/recovery
- LocationReminderBar UI
- progressive reveal behavior
- reporter/device GPS capture rules

## Admin regression protection

No changes were made to:

- publish/unpublish/reject complaint RPC semantics
- `admin_edit_complaint` contract
- response moderation
- evidence review
- user/role UI
- notifications UI
- Phase 13 complaint editing wiring

Only the direct complaint SELECT RLS boundary was tightened to match `complaints.view`.

## Public Explore protection

The current Explore refactor at Public HEAD `ff70882c811628ce584ec2dbf661ef897d670109` was preserved. Phase 14/16 did not restore removed report cards, change the default reports view, or redesign Explore.

## Build / CI evidence

A fresh local clone/build could not be executed in this ChatGPT runtime because the container had no DNS/network access to GitHub.

Do not interpret this as a build failure.

GitHub commit status/workflow evidence must be reported separately from actual local build evidence. No build success is claimed here unless a real run is present.

## Remaining release-level item

Supabase security advisor reports **Leaked Password Protection Disabled** for Auth. This is not a database SQL defect. Enable Supabase Auth leaked-password protection before production release if password authentication is used.

Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Phase status

**Phase 14/16 code/database hardening: COMPLETE.**

**Final release readiness: READY WITH ONE EXTERNAL AUTH CONFIGURATION ITEM** — leaked-password protection should be enabled if password login is in production scope. Fresh build/CI evidence should also be captured by the deployment environment because this runtime could not execute a networked clone.
