# Sobaike Janao Admin — User, Role & Permission Architecture Specification (Phase 3A)

**Document Reference:** `docs/admin-user-role-permission-architecture.md`  
**Repository:** `shihabshajib01-cell/sobaike-janao-admin`  
**Audit Baseline:** `79b6438508780c70ef23b41bc8c83622f4f7b10a` (Post-Cleanup Waves 2A–2F)  
**Phase Status:** Architecture & Source-of-Truth Audit (Zero Runtime Code Changes)

---

## Table of Contents
1. [Purpose](#1-purpose)
2. [Current Verified Security Model](#2-current-verified-security-model)
3. [Authentication Flow Map](#3-authentication-flow-map)
4. [Admin Membership Flow](#4-admin-membership-flow)
5. [Current Admin Module Inventory](#5-current-admin-module-inventory)
6. [Current Real Action Inventory](#6-current-real-action-inventory)
7. [Backend Enforcement Inventory](#7-backend-enforcement-inventory)
8. [Active Permission Candidate Registry](#8-active-permission-candidate-registry)
9. [Planned & Reserved Permission Candidates](#9-planned--reserved-permission-candidates)
10. [User Management Requirements](#10-user-management-requirements)
11. [Secure User Provisioning Constraints](#11-secure-user-provisioning-constraints)
12. [Proposed RBAC Conceptual Data Model](#12-proposed-rbac-conceptual-data-model)
13. [Role Assignment Strategy](#13-role-assignment-strategy)
14. [Effective Permission Resolution Pipeline](#14-effective-permission-resolution-pipeline)
15. [Route Authorization Model](#15-route-authorization-model)
16. [Action Authorization UX & Visual States](#16-action-authorization-ux--visual-states)
17. [Backend Enforcement Strategy & RPC Migration](#17-backend-enforcement-strategy--rpc-migration)
18. [Auditability & Administrative Event Trail](#18-auditability--administrative-event-trail)
19. [Last-Admin & System Recovery Safeguards](#19-last-admin--system-recovery-safeguards)
20. [Privacy-Sensitive Modules & Granular Isolation](#20-privacy-sensitive-modules--granular-isolation)
21. [Security Threat Review & Mitigations](#21-security-threat-review--mitigations)
22. [Verified / Unknown / Proposed Matrix](#22-verified--unknown--proposed-matrix)
23. [Open Questions Requiring Production Database Evidence](#23-open-questions-requiring-production-database-evidence)
24. [Implementation Phases (3B – 3H)](#24-implementation-phases-3b--3h)
25. [Regression Protection & Operational Checklist](#25-regression-protection--operational-checklist)

---

## 1. Purpose

The purpose of this document is to establish the formal, implementation-ready security and authorization architecture for the **Sobaike Janao Admin Panel**.

Following the completion of Cleanup Waves 2A through 2F—which successfully removed all legacy REST permission mockups, hardcoded demo roles, simulated permission matrices, and prototype user constants—the application now rests strictly on its authentic Supabase authentication and database layer.

This document serves as the sole architectural gate before implementing real Role-Based Access Control (RBAC) and User Management. It audits the real, existing product codebase to derive permissions exclusively from verified actions, establishes strict separation between verified database realities and proposed concepts, defines secure server-side provisioning rules, and provides a multi-phase implementation roadmap.

---

## 2. Current Verified Security Model

The current operational Admin application implements a two-tier security foundation:

```
+-------------------------------------------------------------------------------+
|                             CURRENT SECURITY MODEL                            |
+-------------------------------------------------------------------------------+
|                                                                               |
|  [Tier 1: Identity Authentication]                                            |
|  Supabase Auth (GoTrue) verifies email/password credentials and issues a JWT  |
|  session token.                                                               |
|                                                                               |
|  [Tier 2: Administrative Membership Gate]                                     |
|  The frontend verifies membership against public.admin_users:                 |
|    SELECT user_id, active FROM public.admin_users                             |
|    WHERE user_id = $auth_user_id AND active = true                            |
|                                                                               |
|  [Action Security: Database RPC Enforcement]                                  |
|  State mutations (Publish, Unpublish, Reject) are executed via backend        |
|  PostgreSQL stored procedures (RPCs) requiring active session authorization.  |
|                                                                               |
+-------------------------------------------------------------------------------+
```

### Verified Facts
1. **Authentication:** Authenticated via `supabase.auth.signInWithPassword()` against Supabase Auth (`auth.users`).
2. **Membership Check:** Verified in `src/services/auth/authService.ts` (`checkAdminStatus`) by querying `public.admin_users` for matching `user_id` and `active = true`.
3. **Frontend Gate:** Managed in `src/context/AuthContext.tsx` and enforced via `ProtectedAdminRoute` in `src/routes/AppRoutes.tsx`.
4. **Moderation Backend:** Moderation operations call PostgreSQL RPCs (`admin_publish_complaint`, `admin_unpublish_complaint`, `admin_reject_complaint`).

### Explicit Non-Assumptions
- `public.admin_users` is **NOT** assumed to contain `role`, `role_id`, `department`, `name`, `permissions`, or audit columns until migration scripts or database catalogs prove their existence.
- The browser contains **ZERO** `service_role` keys or elevated administrative bypass tokens.

---

## 3. Authentication Flow Map

The real authentication lifecycle operates as follows:

```
[ User visits Admin ]
        |
        v
+------------------+
| Session Check    |
| getSession()     |
+------------------+
        |
        +---> [ No active session ] -------> Redirect to /login
        |
        +---> [ Valid session exists ]
                    |
                    v
          +----------------------+
          | checkAdminStatus()   |
          | (public.admin_users) |
          +----------------------+
                    |
                    +---> [ active = true ]  ------> Allow access to /dashboard (or requested route)
                    |
                    +---> [ active = false or not found ]
                                |
                                v
                          +------------------------+
                          | supabase.auth.signOut()|
                          | Clear local state      |
                          | Return Unauthorized    |
                          +------------------------+
```

### Detailed Lifecycle State Transitions

| State / Event | Trigger / Code Entry | Verification Action | Resulting UX State |
| :--- | :--- | :--- | :--- |
| **Initial Login Entry** | User submits email & password on `/login` (`LoginPage.tsx`) | `authService.login({ email, password })` calls `supabase.auth.signInWithPassword()` | Submitting state with spinner |
| **Login Success (Authorized)** | Supabase Auth returns valid session & `checkAdminStatus(userId)` returns `true` | `admin_users` record matched with `active = true` | `AuthContext` sets `isAdmin = true`, redirects to `/dashboard` |
| **Login Failure (Bad Creds)** | Supabase Auth returns error | None | Shows error: "Invalid email or password" |
| **Unauthorized User** | Supabase Auth succeeds but `checkAdminStatus(userId)` returns `false` | User is authenticated in Supabase but lacks active `admin_users` record | Immediate `supabase.auth.signOut()`, shows: "Unauthorized: Your account does not have active administrative privileges." |
| **Session Hydration (Mount)** | Application boots on any route | `authService.getSession()` followed by `checkAdminStatus(user.id)` | Shows `LoadingState` ("Verifying administrative session..."), then renders route or redirects |
| **Token Refresh** | `onAuthStateChange('TOKEN_REFRESHED')` | Refreshes session token; maintains verified state | Seamless continuation |
| **Administrative Revocation** | Admin status refreshed or re-evaluated via `refreshAdminStatus()` | `checkAdminStatus()` returns `false` | Immediate forced `logout()`, clears user/session, redirects to `/login` |
| **Explicit Logout** | User clicks "Sign Out" in profile dropdown (`Header.tsx`) | `authService.logout()` calls `supabase.auth.signOut()` | Clears state, redirects to `/login` |

---

## 4. Admin Membership Flow

The system strictly decouples **Authentication** from **Admin Membership**, providing a foundation for future **Granular Authorization**:

```
+-------------------------------------------------------------------------------------------------+
| Level 1: AUTHENTICATION        | Is the user who they claim to be?                              |
|                                | Handled by Supabase Auth (email/password, MFA, JWT).           |
+--------------------------------+----------------------------------------------------------------+
| Level 2: ADMIN MEMBERSHIP      | Is the user an approved, active administrator of this system?  |
| (Current Baseline)             | Handled by public.admin_users (user_id, active).               |
+--------------------------------+----------------------------------------------------------------+
| Level 3: GRANULAR RBAC         | What specific actions is this administrator allowed to perform?|
| (Proposed Phase 3B+)           | Handled by roles, permissions, and role_permissions.           |
+--------------------------------+----------------------------------------------------------------+
```

---

## 5. Current Admin Module Inventory

Every active route and module in the application was audited directly from `src/routes/AppRoutes.tsx`, `src/routes/routes.config.ts`, and individual page implementations:

| Module | Route | Navigation Label | Current Data Source | Connection Status | Read Actions | Write / Moderation Actions | Security & Sensitivity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | `/dashboard` | `Dashboard` | Supabase tables (`complaints`, `segments`, `subcategories`) | **Connected** | View aggregate KPIs, status distribution, category breakdown, recent complaints; Refresh data | None | Low (Aggregated metrics) |
| **Complaints** | `/complaints`, `/complaints/:id` | `Complaints` | Supabase tables (`complaints`, `segments`, `subcategories`, `complaint_updates`, `complaint_evidence`) + Storage (`complaint-evidence`) + RPCs | **Connected** | List complaints, search, multi-filter, paginate, view detail, view timeline, view signed private media evidence, export CSV/PDF | **Publish** (`admin_publish_complaint`), **Unpublish** (`admin_unpublish_complaint`), **Reject** (`admin_reject_complaint`) | **HIGH** (Citizen grievances, contact details, private photo/video evidence, public broadcast) |
| **Categories** | `/categories` | `Categories` | Supabase tables (`segments`, `subcategories`) | **Connected** | View taxonomy tree, search/filter segments & subcategories, view category detail drawer, refresh | None (Read-only view) | Medium (Public taxonomy classification) |
| **Responses** | `/responses` | `Responses` | Disconnected placeholder | **Disconnected** | View honest disconnected module banner | None | Low (Non-functional placeholder) |
| **Map Monitoring** | `/map` | `Map Monitoring` | Disconnected placeholder | **Disconnected** | View honest disconnected module banner | None | Medium (Future geospatial tracking) |
| **Location Activity** | `/location-activity` | `Location Activity` | Supabase table (`public_visit_sessions`) | **Connected** | View visitor telemetry, permission grant rates, device/browser distributions, session log table, session detail drawer (IP, User-Agent, coordinates) | None (Read-only analytics) | **HIGH (PRIVACY)** (Visitor geolocation coordinates, browser fingerprints, connection metadata) |

---

## 6. Current Real Action Inventory

Every user-triggered action in the codebase was identified and cataloged with its architectural classification:

| Action Code / Key | UI Entry Point | Classification | Description |
| :--- | :--- | :--- | :--- |
| **System / Local Settings** | | | |
| `system.theme_toggle` | `Header.tsx` / `ThemeToggle.tsx` | `SYSTEM / NON-PERMISSION` | Switches UI between light and dark modes (localStorage) |
| `system.language_toggle` | `Header.tsx` / `LanguageToggle.tsx` | `SYSTEM / NON-PERMISSION` | Switches UI between English and Bangla (localStorage) |
| `system.logout` | `Header.tsx` (User dropdown) | `SYSTEM / NON-PERMISSION` | Ends Supabase session and clears client authentication state |
| `system.sidebar_toggle` | `Header.tsx` / `Sidebar.tsx` | `SYSTEM / NON-PERMISSION` | Toggles mobile navigation drawer / collapses desktop sidebar |
| **Dashboard** | | | |
| `dashboard.view` | `/dashboard` (`DashboardPage.tsx`) | `READ` | Renders high-level overview, statistics cards, charts |
| `dashboard.refresh` | `DashboardPage.tsx` (Refresh button) | `READ` | Re-executes parallel aggregation queries |
| **Complaints Management** | | | |
| `complaints.view_list` | `/complaints` (`ComplaintsPage.tsx`) | `READ` | Queries and renders paginated list of complaints |
| `complaints.filter_search` | `ComplaintsPage.tsx` (`ComplaintFilters.tsx`) | `READ` | Filters complaints by status, category, subcategory, location, search |
| `complaints.view_detail` | `/complaints/:id` (`ComplaintDetailPage.tsx`) | `READ` | Renders complete complaint dossier, reporter contact info, location |
| `complaints.view_evidence` | `ComplaintMediaViewer.tsx` | `READ (PRIVACY)` | Requests signed URLs to view private citizen image/video evidence |
| `complaints.view_timeline` | `ComplaintTimeline.tsx` | `READ` | Renders administrative and lifecycle event timeline |
| `complaints.export_data` | `ComplaintsPage.tsx` (`DownloadMenu.tsx`) | `READ` | Exports currently filtered complaint data to CSV or PDF |
| `complaints.publish` | `ComplaintActionArea.tsx` | `MODERATION` | Publishes complaint to the public feed via `admin_publish_complaint` |
| `complaints.unpublish` | `ComplaintActionArea.tsx` | `MODERATION` | Retracts complaint from the public feed via `admin_unpublish_complaint` |
| `complaints.reject` | `ComplaintActionArea.tsx` | `MODERATION` | Rejects complaint with reason code and justification via `admin_reject_complaint` |
| **Categories** | | | |
| `categories.view_taxonomy` | `/categories` (`CategoriesPage.tsx`) | `READ` | Renders taxonomy hierarchy of segments and subcategories |
| `categories.filter_search` | `CategoriesPage.tsx` (`CategoryFilters.tsx`) | `READ` | Filters taxonomy nodes by keyword, segment, and status |
| `categories.view_detail` | `CategoryDetailDrawer.tsx` | `READ` | Displays segment/subcategory metadata and status |
| **Location Activity** | | | |
| `location_activity.view_analytics` | `/location-activity` (`LocationActivityPage.tsx`) | `READ (PRIVACY)` | Renders visitor session charts, permission rates, telemetry table |
| `location_activity.view_session_detail` | `LocationActivityDetailDrawer.tsx` | `READ (PRIVACY)` | Displays visitor GPS coordinates, accuracy, and User-Agent strings |
| **Disconnected Shells** | | | |
| `responses.view_shell` | `/responses` (`ResponsesPage.tsx`) | `READ` | Views the disconnected response module informational screen |
| `map.view_shell` | `/map` (`MapPage.tsx`) | `READ` | Views the disconnected map monitoring informational screen |

---

## 7. Backend Enforcement Inventory

The following table documents the exact technical pathway and backend enforcement state for every verified data operation:

| Action | Frontend Invocation | Service Layer Method | Supabase Target / Method | Current Known Backend Enforcement |
| :--- | :--- | :--- | :--- | :--- |
| **Check Admin Status** | `authService.login()`, `AuthContext` | `checkAdminStatus(userId)` | `supabase.from('admin_users').select('user_id, active').eq('user_id', userId).eq('active', true)` | RLS on `admin_users` table |
| **Get Complaints List** | `ComplaintsPage.tsx` | `supabaseComplaintService.getComplaints()` | `supabase.from('complaints').select(...)` | RLS on `complaints` table |
| **Get Complaint Detail** | `ComplaintDetailPage.tsx` | `supabaseComplaintService.getComplaintDetail()` | `supabase.from('complaints').select('*').eq('id', id)` | RLS on `complaints` table |
| **Get Evidence Records** | `ComplaintDetailPage.tsx` | `supabaseComplaintService.getComplaintDetail()` | `supabase.from('complaint_evidence').select('*').eq('complaint_id', id)` | RLS on `complaint_evidence` table |
| **Sign Evidence Media** | `ComplaintMediaViewer.tsx` | `supabaseComplaintService.getComplaintDetail()` | `supabase.storage.from('complaint-evidence').createSignedUrls(paths, 3600)` | Supabase Storage Bucket Security Policies on `complaint-evidence` |
| **Publish Complaint** | `ComplaintActionArea.tsx` | `supabaseComplaintService.publishComplaint()` | `supabase.rpc('admin_publish_complaint', { p_complaint_id })` | PostgreSQL RPC function security definition (validates caller in `admin_users`) |
| **Unpublish Complaint** | `ComplaintActionArea.tsx` | `supabaseComplaintService.unpublishComplaint()` | `supabase.rpc('admin_unpublish_complaint', { p_complaint_id })` | PostgreSQL RPC function security definition (validates caller in `admin_users`) |
| **Reject Complaint** | `ComplaintActionArea.tsx` | `supabaseComplaintService.rejectComplaint()` | `supabase.rpc('admin_reject_complaint', { p_complaint_id, p_reason_code, p_note })` | PostgreSQL RPC function security definition (validates caller in `admin_users`) |
| **Get Taxonomy** | `CategoriesPage.tsx` | `categoryApi.getTaxonomy()` | `supabase.from('segments')`, `supabase.from('subcategories')` | RLS on `segments` and `subcategories` |
| **Get Location Activity** | `LocationActivityPage.tsx` | `locationActivityService.getLocationActivity()` | `supabase.from('public_visit_sessions').select(...)` | RLS on `public_visit_sessions` table |

---

## 8. Active Permission Candidate Registry

Based **strictly on verified product features and actions**, the following canonical permission identifiers are established. Permission identifiers adhere strictly to the `module.action` format:

```
+-------------------------------------------------------------------------------+
|                       ACTIVE PERMISSION CANDIDATES                            |
+-------------------------------------------------------------------------------+
|                                                                               |
|  dashboard.view                 View dashboard analytics & metrics            |
|                                                                               |
|  complaints.view                View complaint registry & read details        |
|  complaints.evidence_view       View private citizen evidence (photos/videos) |
|  complaints.export              Export complaint registry to CSV/PDF          |
|  complaints.publish             Publish complaints to public citizen feed     |
|  complaints.unpublish           Withdraw complaints from public feed          |
|  complaints.reject              Reject complaints with reason code & notes    |
|                                                                               |
|  categories.view                View category & subcategory taxonomy tree     |
|                                                                               |
|  location_activity.view         View visitor location telemetry & analytics   |
|                                                                               |
|  responses.view                 View responses module shell                   |
|  map.view                       View map monitoring module shell              |
|                                                                               |
+-------------------------------------------------------------------------------+
```

### Granular Distinction: View vs. Action & Evidence
1. **`complaints.view` vs. `complaints.publish` / `reject`:** A junior analyst or auditor must be able to inspect submitted complaints without possessing the authority to broadcast or discard them.
2. **`complaints.view` vs. `complaints.evidence_view`:** Viewing basic complaint text is segregated from generating signed URLs to view private citizen media attachments (which may contain sensitive identity or intimacy materials).
3. **`location_activity.view`:** Isolated into an explicit permission due to GDPR/privacy implications of visitor geolocation tracking.

---

## 9. Planned & Reserved Permission Candidates

The following candidate permissions represent legitimate platform capabilities that are architecturally planned or partially visible in the codebase, but **currently disconnected from backend APIs**. They must **NOT** be activated in frontend gates until their supporting database schemas and RPCs are implemented:

| Candidate Permission ID | Planned Module / Capability | Current Status in Codebase | Backend Status |
| :--- | :--- | :--- | :--- |
| `complaints.edit` | Redaction and field updates on complaints | Method `complaintApi.editComplaint()` throws error: *"Action integration is not enabled yet."* | **NOT ACTIVE** (No RPC exists) |
| `complaints.add_update` | Adding official progress updates to timeline | Method `complaintApi.addComplaintUpdate()` throws error: *"Action integration is not enabled yet."* | **NOT ACTIVE** (No RPC exists) |
| `categories.manage` | Creating, updating, or deactivating taxonomy segments | `CategoriesPage` is currently read-only; no mutation controls exist | **NOT ACTIVE** (No mutation API) |
| `responses.moderate` | Reviewing and publishing official responses | `ResponsesPage` renders honest disconnected state | **NOT ACTIVE** (No responses API) |
| `map.geospatial_view` | Interactive GIS incident heatmaps | `MapPage` renders honest disconnected state | **NOT ACTIVE** (No GIS API) |
| `admin_users.view` | Viewing administrator registry | Planned Phase 3D User Management UI | **NOT ACTIVE** (Awaiting Phase 3B DB) |
| `admin_users.manage` | Inviting, activating, deactivating administrators | Planned Phase 3D User Management UI | **NOT ACTIVE** (Awaiting Phase 3C Edge Func) |
| `roles.manage` | Creating custom roles & assigning permissions | Planned Phase 3E Role Management UI | **NOT ACTIVE** (Awaiting Phase 3B DB) |
| `audit.view` | Viewing administrative security audit log | Planned Phase 3H Audit Trail | **NOT ACTIVE** (Awaiting Phase 3B DB) |

---

## 10. User Management Requirements

To prepare for Phase 3D (User Management), the platform's administrative requirements are categorized by technical feasibility:

```
+-------------------------------------------------------------------------------+
|                       USER MANAGEMENT REQUIREMENT TIERS                       |
+-------------------------------------------------------------------------------+

[TIER 1: REQUIRED CORE]
- View list of administrative users (email, active status, role, created date)
- Search and filter administrative users
- Invite / provision new administrator accounts securely
- Activate / Deactivate administrator access (immediate session revocation)
- Assign single role to an administrator
- Change administrator's assigned role
- View effective permissions of a selected user

[TIER 2: REQUIRED SECURITY & AUDIT]
- View administrative status history (who activated/deactivated whom and when)
- Self-deactivation protection (prevent user from disabling their own account)
- Last-admin protection (prevent deactivating or demoting the last Super Admin)

[TIER 3: OPTIONAL / LATER ENHANCEMENTS]
- Resend pending invitation emails
- User avatar and full name profile synchronization
- Last login timestamp tracking (requires secure auth metadata hook)
- Department / agency organizational tagging
```

### Technical Feasibility Analysis

| Capability | Supported by Current Backend? | Required Architecture / Technology |
| :--- | :--- | :--- |
| **List Admin Users** | Partially (can query `admin_users`, but metadata is minimal) | Enhanced `admin_users` table or database view joining `auth.users` |
| **Activate / Deactivate Admin** | Yes (can update `admin_users.active`) | Dedicated RPC function `admin_set_user_status(target_user_id, is_active)` |
| **Assign Role** | No | New `user_roles` table + secure management RPC |
| **Invite / Provision Admin** | **NO (CRITICAL SECURITY)** | **Requires Supabase Edge Function** calling Supabase Auth Admin API |
| **Audit Admin Changes** | No | New `admin_audit_logs` table populated via database triggers or RPCs |

---

## 11. Secure User Provisioning Constraints

```
+-------------------------------------------------------------------------------+
|                    CRITICAL SECURITY BOUNDARY: USER CREATION                  |
+-------------------------------------------------------------------------------+
|                                                                               |
|   BROWSER CLIENT                                SUPABASE EDGE FUNCTION        |
|  (Untrusted Context)                             (Trusted Server Context)     |
|                                                                               |
|  +-------------------+                          +---------------------------+ |
|  | Admin UI          |                          | Edge Function:            | |
|  | User clicks       |  POST /admin-invite-user | 'admin-provision-user'    | |
|  | "Invite Admin"    | -----------------------> |                           | |
|  |                   |  Authorization: Bearer   | 1. Verify Caller JWT      | |
|  | Submits:          |  (Caller's Session JWT)  | 2. Check Caller Role/Perm | |
|  | - email           |                          | 3. Invoke Auth Admin API: | |
|  | - role_id         |                          |    auth.admin.inviteUserByEmail() |
|  +-------------------+                          | 4. Insert admin_users     | |
|                                                 | 5. Insert user_roles      | |
|  NEVER contains:                                | 6. Write admin_audit_log  | |
|  - service_role key                             +---------------------------+ |
|  - Auth Admin API                                             |               |
|  - direct user creation                                       v               |
|                                                     +--------------------+    |
|                                                     | Supabase Database  |    |
|                                                     | (auth.users, RBAC) |    |
|                                                     +--------------------+    |
+-------------------------------------------------------------------------------+
```

### Non-Negotiable Security Rules:
1. **Zero Elevated Keys in Frontend:** The browser frontend **MUST NEVER** bundle, receive, or use the `SUPABASE_SERVICE_ROLE_KEY`.
2. **No Client-Side Auth Admin Calls:** The frontend must never attempt to call `supabase.auth.admin.*` functions.
3. **Server-Side Authorization Check:** The Edge Function must extract the calling user's JWT, query the database to verify that the caller holds active administrative authorization (`admin_users.manage`), and only then execute privileged operations.
4. **Audit Logging:** Every user provisioning event must automatically log the initiator's `user_id`, timestamp, target email, and assigned role.

---

## 12. Proposed RBAC Conceptual Data Model

The proposed relational model is minimal, normalized, and strictly bounded to actual requirements without unrequested complexity:

```
                      +-------------------+
                      |    auth.users     | (Managed by Supabase Auth)
                      |-------------------|
                      | id (UUID, PK)     |
                      | email (text)      |
                      +-------------------+
                                |
                                | 1:1
                                v
+--------------------+        +--------------------+
|       roles        |        |    admin_users     |
|--------------------|        |--------------------|
| id (text, PK)      |        | user_id (UUID, PK) |
| name_en (text)     |        | active (boolean)   |
| name_bn (text)     |        | created_at (timest)|
| description (text) |        | updated_at (timest)|
| is_system (boolean)|        +--------------------+
| created_at (timest)|                  |
+--------------------+                  |
        | 1                             | 1
        |                               |
        | N                             | N
        v                               v
+--------------------+        +--------------------+
|  role_permissions  |        |     user_roles     |
|--------------------|        |--------------------|
| role_id (FK)       |        | user_id (FK)       |
| permission_id (FK) |        | role_id (FK)       |
| created_at (timest)|        | assigned_by (UUID) |
+--------------------+        | created_at (timest)|
        | N                   +--------------------+
        |
        v 1
+--------------------+
|    permissions     |
|--------------------|
| id (text, PK)      | (e.g. 'complaints.publish')
| module (text)      | (e.g. 'complaints')
| action (text)      | (e.g. 'publish')
| name_en (text)     |
| name_bn (text)     |
| description (text) |
+--------------------+
```

### Entity Definitions

1. **`public.admin_users`**
   - **Purpose:** Identifies authorized administrators and controls platform-level access.
   - **Fields:** `user_id` (UUID, PK, FK to `auth.users`), `active` (boolean, default true), `created_at` (timestamptz), `updated_at` (timestamptz).

2. **`public.roles`**
   - **Purpose:** Defines named security profiles (collections of permissions).
   - **Fields:** `id` (text, PK, slug format), `name_en` (text), `name_bn` (text), `description` (text), `is_system` (boolean, indicates whether role can be deleted/renamed), `created_at` (timestamptz).

3. **`public.permissions`**
   - **Purpose:** Canonical dictionary of technical permissions derived from real actions.
   - **Fields:** `id` (text, PK, e.g., `complaints.publish`), `module` (text), `action` (text), `name_en` (text), `name_bn` (text), `description` (text).

4. **`public.role_permissions`**
   - **Purpose:** Many-to-many junction table mapping permissions to roles.
   - **Fields:** `role_id` (text, FK to `roles.id`), `permission_id` (text, FK to `permissions.id`), `created_at` (timestamptz). Composite PK: `(role_id, permission_id)`.

5. **`public.user_roles`**
   - **Purpose:** Junction table mapping administrators to their active role(s).
   - **Fields:** `user_id` (UUID, FK to `admin_users.user_id`), `role_id` (text, FK to `roles.id`), `assigned_by` (UUID, FK to `admin_users.user_id`), `created_at` (timestamptz). Composite PK: `(user_id, role_id)`.

6. **`public.admin_audit_logs`**
   - **Purpose:** Immutable append-only trail of administrative and security events.
   - **Fields:** `id` (UUID, PK), `actor_id` (UUID, FK to `admin_users.user_id`), `action` (text), `target_type` (text), `target_id` (text), `details` (jsonb), `created_at` (timestamptz).

---

## 13. Role Assignment Strategy

### Evaluation: Single Role vs. Multi-Role per User

| Evaluation Dimension | Single Role per User (1:1) | Multiple Roles per User (1:N) |
| :--- | :--- | :--- |
| **System Simplicity** | **High** — Clean mapping, deterministic evaluation, easy UI | Medium — Requires permission union across multiple roles |
| **Audit Clarity** | **High** — Actor operates under one clear role context | Lower — Ambiguity over which role authorized an action |
| **UI Complexity** | **Low** — Simple dropdown selector for role assignment | High — Multi-select chips, role conflict resolution |
| **Current Product Needs** | **Sufficient** — Fits government/municipal admin hierarchies cleanly | Over-engineered for current scope |
| **Future Extensibility** | Can be migrated to 1:N via junction table structure without schema rewrite | Built-in |

### Recommendation
**Adopt a Single Primary Role per Administrator for Phase 3.**  
The underlying data model (`user_roles`) will use a junction table structure to preserve database-level flexibility, but application logic and UI will enforce a single role assignment per user. This prevents permission conflicts, simplifies administrative reasoning, and ensures crystal-clear audit trails.

---

## 14. Effective Permission Resolution Pipeline

The runtime permission resolution algorithm operates deterministically across client and server:

```
[ Authenticated User Request ]
             |
             v
+--------------------------+
| 1. Admin Membership Check|
|    admin_users.active    |
+--------------------------+
             |
             +---> [ active = false ] --------> DENY ALL (Revoke session)
             |
             +---> [ active = true ]
                         |
                         v
             +-------------------------+
             | 2. Fetch User Roles     |
             |    user_roles.role_id   |
             +-------------------------+
                         |
                         v
             +-------------------------+
             | 3. Resolve Permissions  |
             |    role_permissions     |
             +-------------------------+
                         |
                         v
             +-------------------------+
             | 4. Effective Set (Set)  |
             |    ['complaints.view',  |
             |     'complaints.publish'|
             |      ... ]              |
             +-------------------------+
                         |
        +----------------+----------------+
        |                                 |
        v                                 v
[ Frontend UX Gating ]          [ Backend Enforcement ]
- Hide / disable buttons        - Validate permission inside RPC
- Protect routes in Router      - Enforce row-level security
- Display Access Denied         - Reject unauthorized API calls
```

---

## 15. Route Authorization Model

```
+-------------------------------------------------------------------------------+
|                          ROUTE PROTECTION WORKFLOW                            |
+-------------------------------------------------------------------------------+
|                                                                               |
|  User navigates to URL (e.g., /location-activity)                             |
|                           |                                                   |
|                           v                                                   |
|             +----------------------------+                                    |
|             | ProtectedAdminRoute Check  |                                    |
|             | (Authenticated & Active?)  |                                    |
|             +----------------------------+                                    |
|                           |                                                   |
|              +------------+------------+                                      |
|              | No                      | Yes                                  |
|              v                         v                                      |
|      Redirect to /login    +------------------------+                         |
|                            | Module Permission Check|                         |
|                            | hasPermission(reqPerm) |                         |
|                            +------------------------+                         |
|                                        |                                      |
|                         +--------------+--------------+                       |
|                         | Lacks Perm                  | Has Perm              |
|                         v                             v                       |
|               Render <AccessDeniedView>         Render Requested              |
|               - Clean explanation               Page Component                |
|               - Back to Dashboard button                                      |
|                                                                               |
+-------------------------------------------------------------------------------+
```

### Route-to-Permission Mapping Matrix

| Route Path | Required Permission | Navigation Sidebar Visibility Rule | Direct URL Failure Behavior |
| :--- | :--- | :--- | :--- |
| `/dashboard` | `dashboard.view` | Visible if user has `dashboard.view` | Renders `<AccessDeniedView>` |
| `/complaints` | `complaints.view` | Visible if user has `complaints.view` | Renders `<AccessDeniedView>` |
| `/complaints/:id` | `complaints.view` | N/A (Sub-route) | Renders `<AccessDeniedView>` |
| `/categories` | `categories.view` | Visible if user has `categories.view` | Renders `<AccessDeniedView>` |
| `/responses` | `responses.view` | Visible if user has `responses.view` | Renders `<AccessDeniedView>` |
| `/map` | `map.view` | Visible if user has `map.view` | Renders `<AccessDeniedView>` |
| `/location-activity` | `location_activity.view` | Visible if user has `location_activity.view` | Renders `<AccessDeniedView>` |
| `/users` *(Phase 3D)* | `admin_users.view` | Visible if user has `admin_users.view` | Renders `<AccessDeniedView>` |
| `/roles` *(Phase 3E)* | `roles.manage` | Visible if user has `roles.manage` | Renders `<AccessDeniedView>` |

---

## 16. Action Authorization UX & Visual States

To deliver a polished and unambiguous interface without UI clutter, restricted controls will follow strict presentation rules:

| Action Context | User Permission State | UI Presentation Rule | Justification |
| :--- | :--- | :--- | :--- |
| **Complaint Moderation Buttons** (Publish, Reject, Unpublish) | User lacks `complaints.publish` or `complaints.reject` | **Hide button completely** or render read-only status badge | Prevents cluttering the interface with inoperable buttons for review-only users. |
| **Complaint Evidence Media** | User has `complaints.view` but lacks `complaints.evidence_view` | Render **Redacted Media Placeholder**: *"Evidence viewing restricted for your role."* | Protects citizen privacy while allowing report triage. |
| **Complaint Export (CSV/PDF)** | User lacks `complaints.export` | **Hide download dropdown** in PageHeader | Clean header layout; prevents unauthorized data extraction. |
| **Taxonomy / Categories** | User has `categories.view` | Render full tree in **read-only mode** (current behavior) | Transparent organizational reference without mutation capabilities. |
| **Location Activity Details** | User lacks `location_activity.view` | Route completely hidden and blocked | Sensitive telemetry is fully isolated. |

---

## 17. Backend Enforcement Strategy & RPC Migration

```
+-------------------------------------------------------------------------------+
|                       BACKEND IS THE SECURITY BOUNDARY                        |
+-------------------------------------------------------------------------------+
|                                                                               |
|  The frontend UI is an ergonomics layer. True security resides exclusively    |
|  in PostgreSQL Database Functions (RPCs) and Row-Level Security (RLS).        |
|                                                                               |
|  CURRENT RPC IMPLEMENTATION:                                                  |
|    admin_publish_complaint(p_complaint_id)                                    |
|      -> Verifies: caller exists in admin_users WHERE active = true            |
|                                                                               |
|  FUTURE RPC ENHANCEMENT (Phase 3G):                                           |
|    admin_publish_complaint(p_complaint_id)                                    |
|      -> Verifies: caller exists in admin_users WHERE active = true            |
|      -> AND caller's role possesses 'complaints.publish' permission           |
|      -> Writes to admin_audit_logs                                            |
|                                                                               |
+-------------------------------------------------------------------------------+
```

### RPC Migration Safeguard Plan:
1. **Zero RPC Changes in Phase 3A:** Existing RPCs (`admin_publish_complaint`, `admin_unpublish_complaint`, `admin_reject_complaint`) remain untouched.
2. **Backward-Compatible Helper:** In Phase 3G, a database helper function `auth.has_permission(p_permission_id)` will be introduced.
3. **Graceful Fallback:** If the RBAC tables are empty or initializing, RPCs will safely verify active administrator status to prevent service outage.

---

## 18. Auditability & Administrative Event Trail

An immutable audit trail is required for accountability across all administrative and moderation actions:

### Event Registry Specification

| Event Type | Triggering Action | Captured Metadata (JSON Payload) | Sensitivity |
| :--- | :--- | :--- | :--- |
| `admin_user.invited` | New admin provisioned via Edge Function | `{ email, assigned_role, invited_by }` | Security Critical |
| `admin_user.status_changed` | Admin activated or deactivated | `{ target_user_id, previous_status, new_status, reason }` | Security Critical |
| `admin_user.role_changed` | Admin role assignment updated | `{ target_user_id, previous_role, new_role }` | Security Critical |
| `role.created` | New custom role defined | `{ role_id, role_name, permissions_assigned }` | Security Critical |
| `role.permissions_updated`| Permission set modified on role | `{ role_id, added_permissions, removed_permissions }` | Security Critical |
| `complaint.published` | Complaint published to public feed | `{ complaint_id, previous_status, new_status }` | Moderation |
| `complaint.unpublished` | Complaint retracted from public feed | `{ complaint_id, previous_status, new_status }` | Moderation |
| `complaint.rejected` | Complaint rejected with reason | `{ complaint_id, reason_code, justification_notes }` | Moderation |

**Actor Attribution Rule:** Every audit record **MUST** record the real, authenticated `auth.uid()` of the administrator who performed the action. Creating a generic or synthetic `"System"` actor for human actions is strictly forbidden.

---

## 19. Last-Admin & System Recovery Safeguards

To eliminate the risk of accidental platform lockout, the following safeguards must be enforced at the database level:

```
+-------------------------------------------------------------------------------+
|                       LAST-ADMIN LOCKOUT SAFEGUARDS                           |
+-------------------------------------------------------------------------------+
|                                                                               |
|  [Safeguard 1: Last Privileged Administrator Protection]                      |
|  The database will reject any operation that attempts to deactivate or        |
|  demote the last remaining active administrator possessing the                |
|  'admin_users.manage' permission.                                             |
|                                                                               |
|  [Safeguard 2: Self-Deactivation Prevention]                                  |
|  An administrator cannot deactivate their own active account in the UI.       |
|                                                                               |
|  [Safeguard 3: System Role Immutability]                                      |
|  Built-in system roles (e.g., 'super_admin') cannot be deleted or stripped of  |
|  administrative recovery permissions.                                         |
|                                                                               |
|  [Safeguard 4: Emergency CLI Recovery Procedure]                              |
|  Direct SQL seed script documented for disaster recovery via Supabase CLI.    |
|                                                                               |
+-------------------------------------------------------------------------------+
```

---

## 20. Privacy-Sensitive Modules & Granular Isolation

### 1. Location Activity Module (`/location-activity`)
- **Data Exposed:** Visitor IP session IDs, GPS coordinates, estimated address/district, browser User-Agent strings, permission grant status.
- **Privacy Policy Requirement:** Direct URL and sidebar navigation must be gated strictly by `location_activity.view`. It must not be accessible via generic Dashboard permissions.

### 2. Complaint Evidence Storage (`complaint-evidence` bucket)
- **Data Exposed:** Raw photo and video uploads from citizens reporting municipal issues (may include bystander faces, private property, or sensitive evidence).
- **Privacy Policy Requirement:** Signed URL generation is segregated under `complaints.evidence_view`. Standard review roles may triage text without accessing media files.

---

## 21. Security Threat Review & Mitigations

| Threat Vector | Risk Level | Threat Description | Architectural Mitigation |
| :--- | :--- | :--- | :--- |
| **Service Role Leakage** | Critical | Elevated secret key embedded in client bundle allows total database takeover. | **Strictly Prohibited:** Zero `service_role` in frontend. Privileged user creation delegated to Supabase Edge Function. |
| **Frontend Permission Bypass** | High | User modifies client JavaScript or local state to un-hide buttons. | **Server-Side Enforcement:** All mutations guarded by PostgreSQL RPCs and database RLS policies. |
| **Direct RPC Invocation** | High | Attacker calls `admin_publish_complaint` directly using their own session token. | RPC functions verify caller's active admin record and permissions in `public.admin_users` and `user_roles`. |
| **Inactive User Access Retention** | High | Deactivated administrator retains valid JWT token until natural expiry. | `checkAdminStatus` is verified on mount and before mutations; RPCs re-verify `active = true` on every invocation. |
| **Privilege Escalation** | High | Administrator assigns themselves elevated permissions. | Role assignment RPC verifies that the caller possesses `roles.manage` and prevents self-elevation. |
| **Lockout of Last Admin** | High | Only administrator deactivates their account or removes their role. | Database trigger blocks deactivating the final active administrator. |
| **Direct URL Access** | Medium | User enters `/location-activity` directly in browser bar. | `ProtectedAdminRoute` and route-level authorization guards render `<AccessDeniedView>`. |

---

## 22. Verified / Unknown / Proposed Matrix

This matrix establishes the definitive boundary between verified facts, unknown database items, and proposed concepts:

| Entity / Item | Classification | Source of Evidence in Codebase | Architectural Impact |
| :--- | :--- | :--- | :--- |
| `admin_users.user_id` | **VERIFIED** | `src/services/auth/authService.ts` line 32 (`.select('user_id, active')`) | Authoritative identity link to `auth.users` |
| `admin_users.active` | **VERIFIED** | `src/services/auth/authService.ts` line 32 (`.eq('active', true)`) | Primary administrative access gate |
| `complaints` table | **VERIFIED** | `supabaseComplaintService.ts` lines 178, 433, 608, 792 | Central complaint data store |
| `segments` table | **VERIFIED** | `supabaseComplaintService.ts` line 133, `categoryApi.ts` line 40 | Taxonomy parent categories |
| `subcategories` table | **VERIFIED** | `supabaseComplaintService.ts` line 137, `categoryApi.ts` line 44 | Taxonomy child categories |
| `complaint_updates` table | **VERIFIED** | `supabaseComplaintService.ts` line 635 | Complaint timeline notes |
| `complaint_evidence` table | **VERIFIED** | `supabaseComplaintService.ts` line 661 | Evidence metadata references |
| `complaint-evidence` (Bucket)| **VERIFIED** | `supabaseComplaintService.ts` line 691 (`supabase.storage.from(...)`) | Private signed storage bucket |
| `public_visit_sessions` table| **VERIFIED** | `src/services/api/locationActivityService.ts` line 31 | Visitor analytics telemetry |
| RPC `admin_publish_complaint`| **VERIFIED** | `supabaseComplaintService.ts` line 824 (`supabase.rpc(...)`) | Moderation publication RPC |
| RPC `admin_unpublish_complaint`| **VERIFIED**| `supabaseComplaintService.ts` line 860 (`supabase.rpc(...)`) | Moderation retraction RPC |
| RPC `admin_reject_complaint` | **VERIFIED** | `supabaseComplaintService.ts` line 900 (`supabase.rpc(...)`) | Moderation rejection RPC |
| `admin_users.role_id` | **UNKNOWN** | Absent from all frontend queries and services | Must be added via Phase 3B migration |
| `admin_users.name` / `email` | **UNKNOWN** | Absent from `admin_users` queries; email read from `auth.users` | Must be resolved in schema design |
| `roles` table | **PROPOSED** | None currently in database | To be created in Phase 3B |
| `permissions` table | **PROPOSED** | None currently in database | To be created in Phase 3B |
| `role_permissions` table | **PROPOSED** | None currently in database | To be created in Phase 3B |
| `user_roles` table | **PROPOSED** | None currently in database | To be created in Phase 3B |
| `admin_audit_logs` table | **PROPOSED** | None currently in database | To be created in Phase 3B |

---

## 23. Open Questions Requiring Production Database Evidence

Before executing migrations in Phase 3B, the following production database questions must be verified against live Supabase catalogs:

1. **Full Columns of `public.admin_users`:** Does the production database already have additional columns on `admin_users` (e.g. `role`, `created_at`, `email`) created during initial project bootstrap?
2. **Current RLS Policies on `admin_users`:** What are the exact Row-Level Security policies currently active on `public.admin_users`? (e.g., Can authenticated users read other users' records, or only their own?)
3. **RPC Security Context:** Are existing RPCs defined with `SECURITY DEFINER` or `SECURITY INVOKER`?

*Protocol: These questions will be validated during Phase 3B through non-destructive inspection queries before writing any schema modifications.*

---

## 24. Implementation Phases (3B – 3H)

The complete User + Role + Permission Management capability will be delivered through seven discrete, testable, and rollback-safe phases:

```
+-------------------------------------------------------------------------------+
|                       PHASE 3 IMPLEMENTATION ROADMAP                          |
+-------------------------------------------------------------------------------+
|                                                                               |
|  [Phase 3A: Architecture & Action Audit] <--- (THIS PHASE: COMPLETE)          |
|  Produce comprehensive, verified architectural specification. Zero code changes|
|                                                                               |
|  [Phase 3B: Database & RBAC Schema Foundation]                                |
|  Create roles, permissions, role_permissions, user_roles, audit_logs tables.   |
|  Seed canonical active permissions and default roles. Safe & additive.        |
|                                                                               |
|  [Phase 3C: Secure Admin User Provisioning Backend]                           |
|  Deploy Supabase Edge Function 'admin-provision-user' using Auth Admin API.   |
|  Implement server-side authorization check for caller. Zero service_role in UI.|
|                                                                               |
|  [Phase 3D: User Management Interface]                                        |
|  Build /users view: Admin user table, status toggles, role assignment drawer, |
|  invite modal calling Edge Function. Multi-language (EN/BN), responsive.      |
|                                                                               |
|  [Phase 3E: Role & Permission Management Interface]                           |
|  Build /roles view: Role listing, permission matrix viewer, role creation and |
|  permission customization. System role protection. Responsive layout.         |
|                                                                               |
|  [Phase 3F: Frontend Authorization Integration]                               |
|  Implement usePermission() hook, integrate route guards in AppRoutes, gate    |
|  action buttons dynamically based on effective user permissions.              |
|                                                                               |
|  [Phase 3G: Backend & RPC Permission Enforcement]                             |
|  Update moderation RPCs to verify granular permissions in PostgreSQL.         |
|  Add database-level last-admin lockout trigger.                               |
|                                                                               |
|  [Phase 3H: Audit Trail & Security Regression Testing]                        |
|  Deploy admin_audit_logs viewer, execute penetration test matrix, verify      |
|  lockout safeguards, validate zero regression across all core modules.        |
|                                                                               |
+-------------------------------------------------------------------------------+
```

---

## 25. Regression Protection & Operational Checklist

Throughout all subsequent phases, the following operational integrity checklist must be maintained:

- [ ] **Supabase Auth Baseline:** Email/password authentication remains standard; session handling is never disrupted.
- [ ] **Active Admin Gate:** `checkAdminStatus` remains the primary barrier for administrative access.
- [ ] **Complaint Moderation RPCs:** `admin_publish_complaint`, `admin_unpublish_complaint`, and `admin_reject_complaint` remain functional without downtime.
- [ ] **Core Modules Untouched:** Dashboard, Complaints, Categories, Responses, Map, and Location Activity maintain expected behavior.
- [ ] **Zero Elevated Credentials:** No `SUPABASE_SERVICE_ROLE_KEY` or admin bypass tokens committed to frontend repository.
- [ ] **Bilingual Consistency:** All future User/Role interfaces provide complete English and Bangla translations.
- [ ] **Public Repository Isolation:** The public citizen repository (`shihabshajib01-cell/sobaike-janao`) remains completely unaffected.
- [ ] **Build & Quality:** Every phase must pass `npm run lint`, `npm run build`, and GitHub Actions deployment.

---
*End of Architecture Specification — Sobaike Janao Admin Phase 3A*
