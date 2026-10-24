# Sobaike Janao — Phase 17 release acceptance and original gap reconciliation

**Release verdict: HOLD — 0/34 complete hosted/full E2E journeys certified.** This is a deliberately accurate evidence register, not a claim that the 34 journeys have completed. Both websites are **already live**, but Phase 17 cannot be marked complete from isolated tests alone.

**Latest independently recorded canonical release evidence (2026-10-24):** Public `main` `ffc8a86e2c6b744626f28f826b23b8469da8717c` (prior Public smoke); Admin `main` `17f02974c26a7504294c337eeefdc2d2e7cc1b37` (canonical Admin SHA verified by [production smoke 40071093261](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40071093261)). The new head differs from the former `7b53ba1d` checkpoint. Live URLs: https://shobaikejanao.com and https://admin.shobaikejanao.com. Replacement production Supabase `eztqgqgpluoqwmprgeas`; original `ahiaymyqfmyyrjkwgvhi` must not be modified.

**Read-only hosted database observation (2026-10-24):** 195 complaints, 169 published, 7 linked responses, 7 active categories, 27 active subcategories, 28 published form schemas (one references inactive `bribe-paid`; do not silently alter), 7 published banners, 8 divisions / 64 districts / 601 upazilas, one active Supreme Super Admin and one verified TOTP factor.

**Evidence semantics:** `ISOLATED PASS` means real UI/Auth/SQL against disposable localhost fixtures. `HOSTED PARTIAL` means real deployed read-only, unsigned or scoped navigation. `FULL E2E PASS` requires each journey's authorized entry→action→effect→recovery with results, rollback, correct live identity and evidence; **no row has that certification**. No recorded CI pass or deployment can override this.

## Original 34 journeys: one row per acceptance requirement

| Journey | User-visible workflow | Evidence and remaining gate | Full E2E |
|---|---|---|---|
| P01 | First visit, responsibility notice and location choice | Hosted anonymous browser substeps; complete first-session recovery unproven | NOT CERTIFIED |
| P02 | Home, seven categories, topics and published feeds | Hosted Public browser/banners partial; full navigation progression unproven | NOT CERTIFIED |
| P03 | Search people, locations, organizations and reports | Hosted search browser and P03 synthetic checks; end-to-end search intent/recovery unproven | NOT CERTIFIED |
| P04 | Explore, map and hierarchical geographic filters | Isolated map + hosted route; 8/64/601 SQL exists, full interactive journey unproven | NOT CERTIFIED |
| P05 | Published report detail, source and next action | Hosted published detail P05; all source/privacy/next-action states unproven | NOT CERTIFIED |
| P06 | Standard anonymous complaint submission | Isolated Public Edge→SQL→Admin checks; actual hosted composer-to-moderation unproven | NOT CERTIFIED |
| P07 | Sensitive harassment/rape reporting | Isolated form and consent guards; complete sensitive user journey unproven | NOT CERTIFIED |
| P08 | Private evidence upload and registration | Private Storage/Edge tests; interactive upload/error/retry journey unproven | NOT CERTIFIED |
| P09 | Citizen information response for published report | Isolated response submission + A07 moderation; complete Public composer unproven | NOT CERTIFIED |
| P10 | Subject or organization response/correction | Isolated response backend; whole correction/removal path unproven | NOT CERTIFIED |
| P11 | Language, theme, text size and Bangla phonetic inputs | Hosted settings fragments; durable cross-route preference journey unproven | NOT CERTIFIED |
| A01 | Email login, MFA/AAL2 and permission routing | Isolated genuine AAL2 Chromium 40063364897; hosted signed-out routes 40063726175; hosted signed-in action not captured | NOT CERTIFIED |
| A02 | Dashboard triage and drilldown | Real isolated SQL-authoritative Chromium 40060795483; hosted authenticated action missing | NOT CERTIFIED |
| A03 | Queue filtering, detail and GPS privacy | Real isolated desktop/mobile Chromium 40059975104; hosted signed-in missing | NOT CERTIFIED |
| A04 | Complaint approval/publish/unpublish/reject | Real isolated protected SQL→Public Chromium 40058602909; hosted signed-in write path missing | NOT CERTIFIED |
| A05 | Evidence and privacy-sensitive inspection | Isolated permissions and reporter GPS deny; hosted private-evidence inspection missing | NOT CERTIFIED |
| A06 | News Intake manual scan, partial failures and review | Real browser synthetic response handling 40061928667; real hosted provider publication missing | NOT CERTIFIED |
| A07 | Response approve/reject/withdraw/resubmit | Real isolated SQL→Public Chromium 40063364897; hosted signed-in write path missing | NOT CERTIFIED |
| A08 | Category/subcategory lifecycle | [PR #20](https://github.com/shihab-tech04/Sobaike-Janao-Admin/pull/20) merged: genuine disposable SQL + delegated AAL2 React browser [40070703082](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40070703082) PASS for invalid ID denial, inactive draft create, bilingual edit/reorder, protected draft privacy, server-side incomplete-publication denial, 390px mobile search. **Required publish/deactivate → Public composer and hosted signed-in E2E remain unverified** | NOT CERTIFIED |
| A09 | Dynamic form/schema lifecycle | Genuine isolated disposable Admin email+TOTP/AAL2 React→SQL [PR #22](https://github.com/shihab-tech04/Sobaike-Janao-Admin/pull/22) [40072296347](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40072296347) PASS: protected fields, EN/BN validation, two-choice custom field, draft/save/cancel, publish, mobile, anonymous Public invisibility while taxonomy inactive. **Hosted signed-in final publish→active Public composer still missing** | NOT CERTIFIED |
| A10 | Banner draft/edit/publish/withdraw | Seven-banner isolated UI fixtures; hosted authenticated CMS transaction missing | NOT CERTIFIED |
| A11 | Admin map monitoring | Route implementation present; authenticated map workflow unverified | NOT CERTIFIED |
| A12 | Location management/activity | 8/64/601 hosted SQL registry; admin signed-in controls unverified | NOT CERTIFIED |
| A13 | Notification center | Isolated UI and catalog assertions; read/action/recovery journey unverified | NOT CERTIFIED |
| A14 | Admin user lifecycle | Isolated Auth/roles tests; hosted invite/create/revoke workflow unverified | NOT CERTIFIED |
| A15 | Role and permission lifecycle | Isolated delegated revocation PASS; hosted Super Admin signed-in controls unverified | NOT CERTIFIED |
| A16 | Audit activity review | Isolated SQL audit transitions PASS; signed-in audit view/query/recovery unverified | NOT CERTIFIED |
| X01 | Taxonomy and form propagation Public↔SQL↔Admin | Isolated Phase11 parity; complete Admin publish to Public composer unverified | NOT CERTIFIED |
| X02 | Anonymous intake to Admin queue | Isolated Public Edge→SQL; full Public compose→Admin moderation unverified | NOT CERTIFIED |
| X03 | Admin moderation to Public list/search/map/detail | Isolated A04 SQL↔Public; hosted read-only partial; full DOM propagation unverified | NOT CERTIFIED |
| X04 | External trusted news to Public sourced report | Controlled synthetic source→review and dedupe; actual hosted publication unverified | NOT CERTIFIED |
| X05 | Public response/correction to approved Public response | Isolated A07 SQL↔Public; complete interactive Public/hosted Admin path unverified | NOT CERTIFIED |
| X06 | 72-hour popularity order and category fallback | Read-only hosted rank parity and scheduled job evidence; full cross-client journey unverified | NOT CERTIFIED |
| X07 | Bilingual banner Admin publish→Public rendering | Seven live banner read parity; hosted Admin write/withdraw journey unverified | NOT CERTIFIED |

## Historical 24-gap register, reconciled to current evidence

**Source of original 24 gaps:** `Sobaike_Janao_Historical_Recovery_Master_2026-10-12.md`, section 20. That historical source reflects an October 12 recovered tree, **not** today's production; classifications below are refreshed cautiously against October 24 repo/SQL evidence and remain subject to real workflow closure.

| Historical gap | Original accepted concern | October 24 classification | Evidence/remaining action |
|---|---|---|---|
| GAP-01 | Seven category taxonomy | PARTIAL | 7 active hosted; A08 isolated draft/edit/private visibility and fail-closed publish gate passed ([PR #20](https://github.com/shihab-tech04/Sobaike-Janao-Admin/pull/20)); completed publish→Public form, accepted order and dynamic fallback still require hosted journey |
| GAP-02 | News Intake complete workflow | PARTIAL | A06/Phase12 synthetic scan, duplicate and failure checks; hosted source-review-publish open |
| GAP-03 | Seven-banner Admin CMS | PARTIAL | 7 hosted published banners; protected draft/publish/withdraw still open |
| GAP-04 | Admin System Health | PARTIAL | Current Admin route exists; permission/view/recovery signed-in unverified |
| GAP-05 | Post origin and author distinctions | PARTIAL | Public postOrigin isolated checks; safe source context and Admin provenance UI unverified |
| GAP-06 | Admin visual system light/dark | PARTIAL | Shared components exist; final cross-route device/token acceptance unverified |
| GAP-07 | Admin unified table/filters/sorting | PARTIAL | A03 responsive queue passed; other modules column sort/filter parity unverified |
| GAP-08 | Sensitive taxonomy label change | PARTIAL | Read-only hosted SQL confirmed active, published `rape-sexual-violence` with EN `Rape / Attempt to Rape` and BN `ধর্ষণ / ধর্ষণের চেষ্টা`; both labels and identifier present in anon-granted `get_public_reporting_configuration()` output; **actual Public DOM EN/BN rendering not yet verified** |
| GAP-09 | Source link safety | PARTIAL | P05 source browser substep; actual source links and citizen URL text behavior unverified |
| GAP-10 | Bangla phonetic input | OPEN | Composer implementation exists; full EN/BN controlled typing path unverified |
| GAP-11 | Canonical PNG favicon SEO | PARTIAL | PNG files present; canonical live head/meta/manifest/search results unverified |
| GAP-12 | Independence/notice wording | PARTIAL | First-visit partial; full bilingual liability/disclaimer modal checks unverified |
| GAP-13 | 72-hour popularity ordering | PARTIAL | Hosted 7-rank parity; 72h snapshot reset/stable fallback behavior unverified |
| GAP-14 | 8/64/601 Bangladesh map hierarchy | PARTIAL | Hosted SQL 8/64/601, map isolated; desktop/mobile actual map framing unverified |
| GAP-15 | Reporter GPS lifecycle minimization | PARTIAL | A03/A05 private-location deny; post-moderation/7d scrub and prune runtime unverified |
| GAP-16 | Server-side private evidence sanitizer | PARTIAL | Public WebP sanitizer and evidence Edge exist; full malicious metadata/file proof unverified |
| GAP-17 | MFA and Super Admin restrictions | PARTIAL | Isolated genuine AAL2 and hosted signed-out; live signed-in privileged action unverified |
| GAP-18 | Intentional draft persistence conflict | CONFLICT | Historical instruction conflicts with persisted draft repository; preserve behavior until agreed contract |
| GAP-19 | Approximate IP vs precise GPS | CONFLICT | Optional browsing location cannot weaken strict report consent; exact server/runtime contract unverified |
| GAP-20 | Historical linked-data preservation | PARTIAL | Hosted 195 reports, 169 published, 7 responses; backup/linked history consistency not fully certified |
| GAP-21 | Security/privacy Sep25 patches | PARTIAL | Current private evidence functions exist; full policy, secret-history and privacy audit open |
| GAP-22 | October mobile hero/footer behavior | PARTIAL | Responsive smoke partial; exact visual framing, 5–7s banners and CTA continuity unverified |
| GAP-23 | October Admin News/UX/performance | PARTIAL | News module exists, A06 local passed; comprehensive performance/UX acceptance unverified |
| GAP-24 | Search Console Soft 404 | OPEN | Actual Search Console investigation and live route indexing correction not verified |

**Gap count:** 20 PARTIAL, 2 CONFLICT, 2 OPEN, **0 certified FIXED**. Do not report the historical 24 as solved.

## Release-critical gates still required

1. **Hosted authenticated Admin acceptance:** Authorized controllable browser with actual email login and TOTP/AAL2, safe isolated Super Admin actions, role-negative tests and audit evidence. This chat's Browser connector permits read-only tab listing/context where authorized, not tab control; the ChatGPT tab context was security-blocked. Never circumvent host policy, request OTPs in the repository or reveal secrets.
2. **Public action chains:** P06–P10 must exercise real anonymous report, sensitive path, evidence, linked citizen/subject responses and Admin→Public end states using disposable QA identities and reversible fixtures, never existing 195 reports or private files.
3. **Admin CMS full action chains:** A08–A16 protected taxonomy, form, banner, locations, notifications, user/role and logs with negative tests, rollback and Public parity. A06 external article publication is distinct from the existing synthetic-review tests.
4. **Every historic gap decision:** Resolve the two conflicting requirements (draft persistence and browsing IP vs submission GPS) without assuming permissions. GAP-24 requires actual Search Console access/evidence; never invent an indexing verdict.
5. **Phase 18 release gate:** Independent restorable off-GitHub dual-repository backup at the eventual release head, exact-head CI/local/hosted QA, 34 individual acceptance records, 24 reconciled gap records, guarded deployment and canonical live SHA verification.

## Latest evidence links

- [Admin A07 release issue checkpoint](https://github.com/shihab-tech04/Sobaike-Janao-Admin/issues/6#issuecomment-6380040285) including A01–A07 real isolated browser and Public parity results.
- [Admin A07 isolated full regression 40063364897](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40063364897)
- [Admin live deployment 40063652749](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40063652749), [canonical smoke 40063715411](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40063715411), [22 protected route browser 40063726175](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40063726175)
- [Off-GitHub backup at previous candidate](https://drive.google.com/file/d/15XGrKDgC7SStiPNyemWZWkO1zvKJXewz/view); this must be refreshed for every later candidate.
- [Public original 34 journey register](https://github.com/shihab-tech04/Sobaike-janao-public/blob/main/docs/phase17-original-34-journey-acceptance.md), [historical September 22 stakeholder handoff](https://docs.google.com/document/d/1uwYEkH9LEQ-RDBSHc4AtZtmF1IafHW4aWpa8vlOxU-g/edit).

**Change scope:** Documentation and non-mutating ledger consistency tests only. No app implementations, migrations, Auth, production records, UI design, Nadia or unrelated projects changed.

## 2026-10-24 — A08 post-merge readback (non-mutating)

- Admin protected main is `17f02974c26a7504294c337eeefdc2d2e7cc1b37`, merged [PR #20](https://github.com/shihab-tech04/Sobaike-Janao-Admin/pull/20); Public main remains `ffc8a86e2c6b744626f28f826b23b8469da8717c`. A08 genuine isolated browser+SQL backend candidate [40070703082](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40070703082) succeeded. This **advances isolated A08 evidence only**; all 34 original hosted/full E2E rows remain NOT CERTIFIED.
- Admin post-merge deploy [40071029412](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40071029412), canonical domain smoke [40071093261](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40071093261), and 22-route mobile/desktop signed-out protections [40071105065](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40071105065) all have successful GitHub Actions job conclusions; canonical smoke verifies Admin manifest `17f02974c26a7504294c337eeefdc2d2e7cc1b37`. Signed-out browser checks do not constitute Super Admin AAL2 browser testing.
- Verified existing off-GitHub [Drive PR20 candidate archive](https://drive.google.com/file/d/1rz_pPN_XSzylMigA-Y9d9S59aqNckyUs/view) metadata: 3,637,380-byte ZIP, with successful [restore/checksum run 40070718670](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40070718670). **This is a pre-merge archive for PR head `131b4b0...`, not a newly verified archive containing the post-merge `17f02974...` commit**. Recreate and independently restore the exact current release heads before the next production modification.
- Hosted replacement Supabase `eztqgqgpluoqwmprgeas` observed ACTIVE_HEALTHY and unchanged aggregate table counts: 195 complaints / 169 published, 7 responses, 7 segments, 7 banners, 8 divisions / 64 districts / 601 upazilas, 441 audit events. Read-only `pg_proc` grant inspection found no anonymous EXECUTE on the inspected `admin_*` functions; this is not an authenticated role-negative test or exhaustive RLS certification.
- Current regular-chat Browser connection allows only tab list/read; no controllable hosted Admin signed-in session or real email/TOTP action. Web-host fetch was disabled. Prior canonical smoke is cited as recorded CI evidence, not asserted to be independently reproduced here.
- Historical gaps remain **20 PARTIAL / 2 CONFLICT / 2 OPEN / 0 certified FIXED**; GAP-08 was advanced from OPEN to PARTIAL based on published data and anonymous RPC configuration, not a browser pass. GAP-18 draft persistence and GAP-19 IP/GPS consent are preserved unresolved. Current citizen reports, private evidence and original Supabase `ahiaymyqfmyyrjkwgvhi` were not touched. Do not merge this documentation update or mark Phase 17 complete from isolated evidence.

### Reproducible read-only GAP-08 public-config contract evidence

```sql
select
  has_function_privilege('anon','public.get_public_reporting_configuration()','execute') as anon_can_get_config,
  position('Rape / Attempt to Rape' in public.get_public_reporting_configuration()::text) > 0 as en_label_published,
  position('ধর্ষণ / ধর্ষণের চেষ্টা' in public.get_public_reporting_configuration()::text) > 0 as bn_label_published,
  position('rape-sexual-violence' in public.get_public_reporting_configuration()::text) > 0 as identifier_in_public_config;
```

Observed October 24: all four booleans TRUE. The active published subcategory retains its existing stable identifier; no taxonomy rekey or migration was needed or attempted. GAP-08 cannot advance from PARTIAL until the real Public UI is observed using this configuration in both languages.

## 2026-10-24 — A09 isolated acceptance and restored current-main off-GitHub backup

- Latest **verified Admin main** `2e407f219d1db231268c78e6438336924145fae8` ([merged PR #22](https://github.com/shihab-tech04/Sobaike-Janao-Admin/pull/22)); Public main remains `ffc8a86e2c6b744626f28f826b23b8469da8717c`. A09 Form Builder genuine disposable React+email/TOTP AAL2/SQL integrated candidate [40072296347](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40072296347) PASS; candidate CI, replacement build, pre-release built-browser and hosted signed-out workflow runs all PASS. This is **isolated A09 evidence only**, not full hosted end-to-end certification.
- Admin main exact-head [deploy 40072576548](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40072576548) and [canonical smoke 40072648146](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40072648146) succeeded. The Public exact-head [production smoke 40055775545](https://github.com/shihab-tech04/Sobaike-janao-public/actions/runs/40055775545) and [functional smoke 40055775558](https://github.com/shihab-tech04/Sobaike-janao-public/actions/runs/40055775558) remain successful.
- **Independent off-GitHub backup gate PASS for these exact heads**: [private Drive dual-repository full Git history archive](https://drive.google.com/file/d/16vhDvyM1NjVT0JqnqWXUasMjfNWi0nU4/view), 3,657,470 bytes; [new runner clone/bundle/restore/fsck/checksum job 40072645298 SUCCESS](https://github.com/shihab-tech04/Sobaike-Janao-Admin/actions/runs/40072645298). The artifact was downloaded independently into a separate local runtime, ZIP CRC and inner bundle SHA256SUMS checked, both bundles cloned with `git clone --mirror`, both restored Git histories passed `git fsck --full --strict`, and the recovered `main` refs matched Admin `2e407f219d1db231268c78e6438336924145fae8` / Public `ffc8a86e2c6b744626f28f826b23b8469da8717c`. Drive upload succeeded and full Drive download readback matched the source artifact byte-for-byte, SHA256 `b64be7bfcf110be2360e909c5e01fe5cfea1daf1c976d7b898cd1fca0879e670`. Drive file is privately owned, not published publicly.
- A09 adds no production application implementation/SQL/Auth changes and does not establish hosted Super Admin interactive access; **0/34 full hosted E2E remains NOT CERTIFIED**. Historical gaps remain 20 PARTIAL / 2 CONFLICT / 2 OPEN / 0 FIXED. Continue with protected authenticated browser, reversible hosted synthetic acceptance and all remaining rows; no edits to real 195 reports or original Supabase.
