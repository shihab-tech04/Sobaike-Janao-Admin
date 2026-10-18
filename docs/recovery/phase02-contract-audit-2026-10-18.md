# Sobaike Janao — Phase 02 contract audit (in progress)

Date: 2026-10-18 UTC. Scope: SQL/Supabase and Public ↔ Admin contracts (GAP-15–21, X01–X07). This is a **read-only catalog audit plus disposable-runner test ledger**, not a production migration or an approval to ship.

## Authoritative project and comparison

- Hosted Supabase project ID: `ahiaymyqfmyyrjkwgvhi`. Production catalog queries used only `SELECT` on PostgreSQL metadata and Supabase's migration-list API; no application rows or secrets were exported.
- The linked production migration ledger contains **208** versions. The Admin repository contains **50** migration SQL files; the Public repository contains **3**. Across both, there are **53 distinct version IDs**: **19** also occur in the hosted migration ledger, **189** hosted versions lack matching repository migration files, and **34** repository version IDs do not occur in the hosted ledger. This supersedes the earlier estimate of 183 missing migrations. The complete version-by-version record is in [`phase02-migration-ledger-2026-10-18.json`](./phase02-migration-ledger-2026-10-18.json). A version-name match is not proof that the bodies are identical.
- The production catalog currently reports **190 `public` and 21 `private` functions = 211**. `test-only/current_contract_baseline.sql` defines **119** functions (106 `public`, 13 `private`), leaving **92 named functions** absent from the disposable snapshot (84 `public`, 8 `private`). Do not present that snapshot as a deployable production schema, or interpret successful tests against it as a full backend replay.
- Both repositories' migration files are a partial, non-linear historical subset. Do **not** run pending/"missing" repository migrations against production or stamp historical entries into its ledger. Any fix must be an independently reviewed, additive migration applied first on an isolated environment.

## Caller → backend contract ledger

The following are source-level/static caller groupings; the exact RPC names and argument signatures need to be maintained in a machine-readable manifest for the final gate.

| Surface | Client/Edge call path | Current observed backend gate | Isolated evidence |
| --- | --- | --- | --- |
| Public taxonomy/forms | `taxonomyService`: `segments`, `subcategories`; dynamic/reporting configuration RPCs | Active-only public SELECT RLS for both taxonomy tables; form-schema data not directly readable | Taxonomy seed + synthetic submission in disposable runner |
| Public report submission | Edge `public-write-gateway` → `submit_public_complaint_v2(jsonb,text,jsonb)` | `anon` and `authenticated` EXECUTE false, `service_role` EXECUTE true; Edge validates origin/action/rate limit | Real Edge HTTP → local SQL submitted/idempotent, direct anon denied |
| Public evidence | Edge `public-evidence-upload`/`register_public_complaint_evidence`; public evidence read RPC | Direct context table SELECT denied; storage upload and published-read policies | Invalid WebP denied; full valid evidence journey deferred to Phase 06 |
| Public feed/report | `get_public_home_feed`, `get_public_published_reports`, `get_public_published_report` | Public EXECUTE granted; published-only filtering in recovered SQL | Genuine local Admin TOTP publication yielded exactly one newly visible report (PASS) |
| Public response | Edge `submit_public_response_v2`; `get_public_published_responses` | Submission restricted to Edge service path; unpublished report response rejected | Real Edge HTTP denied response to pending report |
| Admin moderation | `complaints` SELECT; `admin_publish_complaint`, `admin_reject_complaint`, `admin_unpublish_complaint` | Authenticated SELECT RLS uses `complaints.view`; sensitive actions use genuine active Auth session and `aal2` | Non-admin and AAL1 denial; real local Auth TOTP AAL2 publication; audit row; reporter-context scrub (PASS) |
| Admin response/moderation | `admin_get_responses`, `admin_get_response_detail`, response workflow RPCs | Function names exist in live catalog, but are **absent from limited local snapshot** | Not yet executable against reproducible full local backend |
| Admin taxonomy/form builder | `admin_get_taxonomy`, `admin_update_taxonomy_item`, form builder RPCs | Function names live; multiple missing from snapshot | Pending isolated contract replay, Phase 11 UI acceptance |
| News Intake | `recoveryApi`, `news-intake-scan`/`news-intake-fetch`, News RPCs | Service-role Edge and authenticated Admin RPC split; dedicated protection | Existing isolated frontend workflow tests; full scan in Phases 12–13 |
| Banners | `admin_save_banner_draft`, `admin_publish_banner`, `get_public_site_banners` | Admin requires `banners.manage` at `aal2`; anon public read RPC only | RPC definitions present; full CMS publish in Phase 14 |
| Popularity, maps, health | Public feed/popularity RPCs; Admin map, system health RPCs | Privileged datasets not direct anon tables; several Admin functions absent from snapshot | Follow-up gate-specific tests pending |

An initial line-oriented scan found 47 Admin and 11 Public/Edge RPC names (all 58 present in the live catalog); it missed several multiline calls. A full TypeScript AST scan across both repositories then found **81 static-string RPC call sites using 72 unique function names**. The live `pg_proc` catalog had exactly one overload for each **72/72** names. Comparing supplied object keys with `pg_get_function_identity_arguments` and `pronargdefaults` yielded **0 signature-key/required-parameter mismatches among 78 directly comparable call sites**. The other three pass previously constructed argument objects: `admin_create_role`, `admin_update_role`, and `record_public_visit_session`; manual source inspection confirmed they supply the required names. The Edge submission dispatcher additionally permits three fixed RPC names (`submit_public_complaint_v2`, `submit_public_complaint_v3`, `submit_public_configured_complaint`) with identical `(jsonb,text,jsonb)` argument contracts and service-only execution. This audit establishes call-shape compatibility, **not** full behavior or authorization for all modules.

The limited local function snapshot omits 92 names, including **31 of the original 47 line-oriented Admin RPC names**, even though those functions are present in production. This is a test-fidelity and restoration-provenance gap, not evidence that the live Admin database lacks its RPCs.

## Permission and privacy evidence

- Live `complaints` has RLS enabled, authenticated `SELECT` privilege, `complaints.view` RLS policy, **no anonymous table SELECT privilege**; public reports instead go through dedicated published-only RPCs.
- Live `complaint_submission_contexts`, `complaint_responses`, `subject_responses`, `site_banners`, and `news_intake_runs` have RLS enabled and **no direct anonymous/authenticated SELECT**. `segments` and `subcategories` are public readable only via active-item policies.
- Live `admin_publish_complaint` is `SECURITY DEFINER`, executable by authenticated role only. Recovered body requires a valid `auth.sessions` row through `is_active_admin()` and requires `complaints.publish` at JWT `aal2` via `has_permission()`. Do not spoof `aal2` or weaken these gates for testing.
- Recovered reporter-context trigger scrubs coordinates and device metadata when a report exits `submitted` status. Test must verify this after genuine local publication.
- The Admin app currently has no complete MFA enrollment/challenge UI. That is an explicit Phase 09 recovery requirement, not a reason to weaken Phase 02 SQL gates.

## Gate and next action

**Phase 02 is OPEN; do not advance to Phase 03.** The real GoTrue password + TOTP AAL2 + Admin RPC → Public feed test **passed** on [GitHub Actions run 39151395806](https://github.com/shihab-tech04/Sobaike-janao-public/actions/runs/39151395806) (test-only commit `26a7a841731ac66b194331f40732a923cc835474`). Restore/verify the missing SQL function definitions and migration provenance from authorized historical sources or a verified, additive replacement plan. Exercise remaining permissions, signatures, Storage, Edge and cron contracts without writing to the hosted DB. Preserve Phase 18 production launch as a distinct final gate.
