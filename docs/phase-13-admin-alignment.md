# Phase 13 — Admin Alignment Closeout Record

This document is the verified closeout record for **Phase 13 — Admin Alignment** across the Public app (`sobaike-janao`), Admin app (`sobaike-janao-admin`), and the shared live Supabase backend.

It supersedes earlier draft audit text that was written before the production complaint Edit path existed or that described the old repository migration assumptions.

---

## 1. Final Status

**Phase 13 status: COMPLETE / VERIFIED**

The final Phase 13 blocker was the Admin complaint Edit flow. The UI existed, but configured Supabase previously had no production `admin_edit_complaint` mutation path.

That blocker is now resolved:

- `ComplaintApi.editComplaint()` routes configured-backend edits to `supabaseComplaintService.editComplaint(...)`.
- `supabaseComplaintService.editComplaint(...)` calls live `public.admin_edit_complaint(...)`.
- Live Supabase migration `20260915044537 phase13_admin_edit_complaint_live` is applied.
- Repository migration `supabase/migrations/20260907000003_admin_edit_complaint.sql` is synchronized with the live implementation.
- A transaction-safe live edit test succeeded while preserving complaint status; the test transaction was rolled back so no test mutation remained.
- Public privacy checks passed after deployment.

---

## 2. Verified Source Baseline

| Area | Verified state |
|---|---|
| Public repository | Latest inspected main: `ff70882c811628ce584ec2dbf661ef897d670109` |
| Admin repository | Complaint Edit wiring present from `f5aec73e762450ad1464c8b8f3e1e7a5f99803b6`; parallel documentation update `6198ebf122ac0d0527c3e9dcd980ad73ed350039` preserved and reconciled |
| Live Supabase project | `ahiaymyqfmyyrjkwgvhi` |
| Live edit migration | `20260915044537 phase13_admin_edit_complaint_live` |
| Live edit RPC | `admin_edit_complaint(text,text,text,text,text,text,text,text,text,text,text,text,text)` |

Public Explore work newer than the original Phase 13 audit is protected and was not modified by this closeout.

---

## 3. Production Complaint Edit Flow

```text
ComplaintActionArea
  -> complaintApi.editComplaint
  -> supabaseComplaintService.editComplaint
  -> public.admin_edit_complaint(...)
  -> public.complaints
  -> existing public read RPCs
```

The current Admin Edit modal persists only fields already present in that UI:

- English title
- Bengali title
- English description
- Bengali description
- segment/category
- subcategory
- priority/urgency
- ward/upazila-thana mapping
- district/zone mapping
- formatted textual address
- private admin edit note

No new UI fields or business rules were added during closeout.

---

## 4. Authorization Contract

There is **no `complaints.edit` permission in the live permission catalogue**.

The current Admin UI permits Edit only when an active admin holds at least one of:

- `complaints.publish`
- `complaints.unpublish`
- `complaints.reject`

The live RPC intentionally mirrors this exact existing rule. It does not invent a new role or permission.

Additional enforcement:

- authenticated caller required
- active admin required via `is_active_admin()`
- database permission checks via `has_permission(...)`
- `SECURITY DEFINER`
- fixed `search_path = pg_catalog, public`

Verified function grants:

| Role | EXECUTE |
|---|---|
| `PUBLIC` | revoked |
| `anon` | revoked |
| `authenticated` | granted; caller still must pass active-admin/RBAC checks inside the RPC |
| `service_role` | granted |

Frontend button visibility is not treated as authorization.

---

## 5. Taxonomy Validation

Live database taxonomy remains the source of truth.

Verified active segments:

- `harassment`
- `rickshaw`
- `extortion`
- `load_shedding`

Verified active subcategories: **14**.

`admin_edit_complaint` validates that:

- the selected segment exists and is active
- the selected subcategory exists
- the selected subcategory belongs to the selected segment

Invalid combinations are rejected server-side.

---

## 6. Location Mapping

The final repository migration now matches the actual Admin mapper and live complaint schema.

| Admin domain field | Live `public.complaints` column |
|---|---|
| `location.ward` | `upazila_or_thana` |
| `location.zone` | `district` |
| `addressEn` / `addressBn` | `formatted_address` |

The earlier repository draft mapped `ward` to `area`; that mismatch is corrected.

Exact reporter/device coordinates are not changed by this RPC.

---

## 7. Protected Fields and Moderation State

The Edit RPC does **not** change:

- complaint ID
- moderation status
- publish/unpublish/reject state
- reporter name/contact metadata
- latitude/longitude
- reporter/device location context
- evidence records
- publication preferences
- client submission metadata
- creation timestamp

Publish, unpublish, and reject remain separate dedicated workflows.

The live transaction-safe test verified that Edit succeeds without changing the existing complaint status.

---

## 8. Audit and Timeline Behavior

A successful edit writes:

- a private `public.complaint_updates` row with `update_type = 'edited'`
- a `public.admin_audit_logs` row with action `complaint.edit`

Audit details include the affected complaint and edited classification/location metadata. Reporter/device GPS is not copied into the audit payload.

---

## 9. Final Complaint Edit Verification Matrix

| Check | Result |
|---|---|
| Configured-backend Admin wiring | **VERIFIED** |
| Live `admin_edit_complaint` exists | **VERIFIED** |
| Exact 13-text-parameter signature | **VERIFIED** |
| SECURITY DEFINER | **VERIFIED** |
| Fixed `pg_catalog, public` search path | **VERIFIED** |
| Anonymous EXECUTE blocked | **VERIFIED** |
| Active-admin enforcement | **VERIFIED** |
| Existing moderation-permission rule enforced | **VERIFIED** |
| Segment validation | **VERIFIED** |
| Subcategory-parent validation | **VERIFIED** |
| Priority validation (`low/medium/high/urgent`) | **VERIFIED** |
| EN/BN title assignments | **VERIFIED BY LIVE CONTRACT** |
| EN/BN description assignments | **VERIFIED BY LIVE CONTRACT** |
| Ward -> `upazila_or_thana` mapping | **VERIFIED** |
| Zone -> `district` mapping | **VERIFIED** |
| Address -> `formatted_address` mapping | **VERIFIED** |
| Status preservation | **VERIFIED LIVE** |
| Private complaint update event | **VERIFIED BY LIVE CONTRACT** |
| Admin audit event | **VERIFIED BY LIVE CONTRACT** |
| Rollback-safe live edit test | **VERIFIED** |

---

## 10. Public Privacy Regression

After deploying the production Edit RPC, the public feed payloads were rechecked.

Verified public payloads still expose no raw:

- latitude
- longitude
- `lat`
- `lng`
- coordinates object
- distance value
- visitor GPS
- reporter/device GPS

Live checks included:

- `get_public_home_feed`
- `get_public_published_reports`

Phase 8 shadow-location privacy remains protected. Location-aware ranking remains server-side; this closeout does not classify ranking as client-side distance processing.

---

## 11. Preserved Existing Work

This closeout did not redesign or replace:

- `admin_publish_complaint`
- `admin_unpublish_complaint`
- `admin_reject_complaint`
- response moderation
- evidence access
- reporter-location access
- role management
- notification workflows
- public feed ranking
- Search location neutrality
- current Explore work
- LocationReminderBar behavior
- Phase 12/15 performance work

The change was limited to the final live complaint Edit blocker plus repository/documentation synchronization.

---

## 12. Scope Clarifications

Older Phase 13 notes implied that subject/organization and utility-specific detail values were editable through the same Admin complaint Edit modal. The currently inspected Edit modal does **not** send those fields through `admin_edit_complaint`.

Accordingly:

- utility detail fields remain preserved/readable; this closeout does not claim new edit capability for them
- subject/organization edit capability is not claimed by this RPC
- no unsupported database columns or new edit controls were invented

If product requirements later require those fields to become editable, that is a separate scoped feature rather than part of this blocker fix.

---

## 13. Final Verdict

**Phase 13 is COMPLETE.**

The final production blocker is resolved: the existing Admin complaint Edit workflow now persists through a secure live Supabase RPC, uses the real current permission model, validates taxonomy, preserves moderation state and private location data, records audit/update events, and remains compatible with existing public read paths.

The repository migration is synchronized with the live implementation, preventing future deployments from reintroducing the earlier permission and location-mapping assumptions.

**Next roadmap phase: Phase 14/16 — Final Hardening & Regression.**
