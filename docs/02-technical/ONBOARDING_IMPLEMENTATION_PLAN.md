# Owner Onboarding Wizard — Implementation Plan (Track A)

Status: **PROPOSED implementation plan — all Product Owner decisions A-D1 … A-D7 are APPROVED (2026-11-21, recorded in DEC-076, `docs/00-product/PROJECT_DECISIONS.md`).** Nothing here is merged or deployed; review, QA, merge and deployment remain separate gates.
_History:_ the first version of this line (2026-11-21) read "Product Owner decisions of 2026-11-21 applied to A-D1, A-D2, A-D3; A-D4 … A-D7 awaiting approval". That was superseded the same day:
**Update 2026-11-21 (second review):** A-D4 … A-D7 **approved** as design policies (DEC-076). A3 is now unblocked but **not started**; A4 not started.
**Update 2026-11-22 (Product Owner decision — explicit trial package confirmation):** the global trial default package is a recommendation only and never becomes the case's package by itself; a mode change clears the package unless the same PATCH supplies it; submit-for-review re-checks the package status in its guarded write. Details in the workflow spec §7.3.1 and the API doc §1. A3 must re-validate the package (see A3 below).
Branch: `feat/onboarding-wizard` (base `origin/main` `b61c549`).
**Re-based for review 2026-11-22:** reconstructed unchanged on `origin/main` `d0d608a` (PR #74, public order
idempotency request identity) in the review worktree `review/onboarding-after-pr74`; PR #74 touches no onboarding
code, and only `schema.prisma` needed a (conflict-free) three-way merge.
Related: `docs/01-domain/ONBOARDING_WORKFLOW_SPEC.md`, `docs/02-technical/ONBOARDING_API_AND_PERSISTENCE.md`.

## Product Owner decisions (all APPROVED 2026-11-21; DEC-076)

Every row below is **APPROVED**. A-D1 … A-D3 were approved in the first 2026-11-21 review and are implemented in A1 + A2;
A-D4 … A-D7 were approved in the second 2026-11-21 review as design policies for A3 / A4 (not started). The dated
approval history is kept in DEC-076 (`docs/00-product/PROJECT_DECISIONS.md`); the struck-through "Awaiting approval"
text in the A-D4 … A-D7 rows is the historical wording before that approval.

| # | Decision | Conflict | Recommendation / PO decision |
| --- | --- | --- | --- |
| A-D1 | Owner credential: server-generated one-time temporary password shown once at handoff (never stored) vs keep typed password | DEC-047 (admin types password) | **DECIDED 2026-11-21: keep DEC-047.** The operator types the initial password at FINAL provisioning only (A3); transient in that request, never persisted (drafts, audit, logs, URLs, analytics, responses, review packages); hashed by the existing password service; no invitation / reset token / generated credential now; retry without a completed provisioning needs secure re-entry, retry after provisioning needs none; manual handoff. Server-generated password / activation link = future enhancement only. |
| A-D2 | Case links a lead to a temporary demo (demo itself unchanged) | DEC-060 "linking a demo to a lead" out of scope | **DECIDED 2026-11-21: approved as a narrow extension of DEC-060** (dated note under DEC-060). Association only in the Platform onboarding domain; demo unchanged (no lead details, expiry / tokens / restrictions / purge untouched); no auto conversion; A4 keeps a non-secret history snapshot when the demo is purged (never the token / link). |
| A-D3 | REAL mode requires an explicit package | DEC-046 allows null package (= all default features) | **DECIDED 2026-11-21:** REAL and TRIAL require an explicit ACTIVE package before final provisioning; no null-package shortcut; legacy console form + CLI + DemoService optional package unchanged; trial settings and subscription validation respected; choosing a mode starts nothing. Implemented in step-2 validation (archived package → `PACKAGE_NOT_AVAILABLE`, submit refused). **Refined 2026-11-22 (PO):** the trial default package is a recommendation only (no auto-fill); mode change clears the package unless supplied; submit re-checks ACTIVE in the guarded write; A3 re-validates. |
| A-D4 | Lead status on delivery (auto DONE/CONTACTED?) | DEC-053 statuses | ~~Mark CONTACTED on case creation? — PO to decide; currently unchanged **Awaiting approval.**~~ **APPROVED 2026-11-21:** REAL / TRIAL → lead DONE only after `DELIVERED` (not on restaurant creation); DEMO normally leaves CONTACTED; never downgrade DONE / DISMISSED; respect manual changes; idempotent, audited, compare-and-set; statuses stay distinct; manual reopen via DEC-053 leads workflow. Implement in A4. |
| A-D5 | Menu written by a narrow, audited Platform menu writer (not Staff APIs, no impersonation) | AUTH_TENANCY_SPEC §73 | ~~Approve; … **Awaiting approval.**~~ **APPROVED for A3 2026-11-21:** dedicated, narrowly scoped, audited; Platform CSRF + auth guards; explicit restaurant / resource ownership checks; reuse Menu / Category / Product / Variant / Modifier + translation rules (default locale required, others optional); no impersonation, no bypass of validation or entitlements, no arbitrary DB writes from client JSON; idempotent, resumable, no duplicates on retry; audit without secrets; real-PostgreSQL integration tests. |
| A-D6 | File import before provisioning: wizard-owned draft from `inspectMenuFiles` / `readMenuTemplate` / extractor / `normalizeExtraction` vs post-provision Staff import | MENU_IMPORT spec + DEC-057 (opt-in `MENU_IMPORT`) | ~~… **Awaiting approval.**~~ **APPROVED AS STAGING ONLY 2026-11-21:** protected bounded draft + temporary upload (types, size limits, quotas, authorization, retention / cleanup); reuse pure extraction / normalization; human review; nothing published before an authorized restaurant exists; attach via the menu writer at final provisioning after rechecking entitlements and eligibility; never call tenant `MenuImportService` with a fabricated restaurant; incomplete menu never READY; no second import engine. |
| A-D7 | QR preview in Platform console | Platform app has no QR library; DEC-070 QR lives in apps/web | ~~… **Awaiting approval.**~~ **APPROVED 2026-11-21:** reuse the Backend Generic QR + menu URL; real preview / copy / export only after provisioning; no fake or placeholder QR; demo tokens to authorized operators only; menu readiness verified separately from QR. Rendering dependency for `apps/platform` (`qrcode`) vs link to web export = **A4 decision point** (nothing added). |

## Milestones

### A1 — Persistence, protected workflow shell — **DONE (awaiting review)**
- [x] `onboarding_cases` additive migration `20261128090000_onboarding_cases` (status/mode enums, revision, one open case per lead partial unique index, CHECKs, RLS/REVOKE).
- [x] Platform API `/api/v1/platform/onboarding-cases` (list/search, create, get, patch with revision, duplicates, submit-for-review, cancel), Platform CSRF + auth guards, audit actions.
- [x] `/onboarding` list and `/onboarding/[caseId]` wizard shell (stepper, autosave, conflict banner, unsaved-change guard), nav entry, ar/en.

### A2 — Customer details, lead integration, mode selection, draft validation — **DONE (awaiting review)**
- [x] Step 1 with server-side validation reusing acquisition / owner-contact / provisioning validators; strict allow-list for draft JSON (password keys refused).
- [x] Duplicate warnings (owner email in use, similar restaurants, other open cases, matching leads); never auto-attach users.
- [x] Step 2 REAL / TRIAL / DEMO choice with package, trial-settings and demo-limit rules; "demo ≠ trial" explanation.
- [x] Leads page "Start onboarding" (opens the existing case on 409).
- [x] 2026-11-21 recheck: password-like key spellings refused (unit), race / concurrency e2e (concurrent PATCH, concurrent lead POST, concurrent submit, stale revisions), archived-package gating, no restaurant / user created by any wizard endpoint; fresh-DB migration + rollback test.
- [x] 2026-11-22 PO correction — explicit trial package confirmation: the server no longer copies the trial default package into `modeConfig.packageId` / `package_id` (only the DEC-056 default length is prefilled); the console marks the default as "Recommended" with a one-click "Use recommended package" (ar + en); a mode change clears the package unless the same PATCH supplies it; submit-for-review re-checks the package status inside the guarded `updateMany` (relation filter) and answers `422 ONBOARDING_INCOMPLETE` if it was archived in between. Tests: unit (`onboarding-details.spec.ts`), real-PostgreSQL e2e (`onboarding-cases-http.e2e-spec.ts`), UI contract (`tests/contract/onboarding-package-choice.spec.ts`). No migration change. The track is unmerged, so no saved draft anywhere holds an auto-filled package; drafts saved during development before this change keep their stored package (it was visible and editable) and the `revision` checks are unchanged.

### A3 — Real account / trial provisioning and menu preparation — PENDING (blocked on A-D5, A-D6; A-D1 decided)

**2026-11-21:** unblocked (A-D5, A-D6 approved) — **NOT started.**
- [ ] Menu step: manual editor (menus, categories, products, sizes, modifiers, translations) stored on the case; import draft review.
- [ ] Final submit saga with `provisioningKey` and a transient `ownerPassword` (never stored; re-entry only when provisioning itself is retried): `provisionRestaurant` → record `restaurantId` (MENU_SETUP) → Platform menu writer (own tx) → `createTrial` when TRIAL → Guest Menu readiness check → READY; resumable retries never re-provision.
- [ ] Failure handling: FAILED with `lastErrorCode`, retry endpoint.
- [ ] Platform menu writer (A-D5): Platform-guarded, ownership-checked, audited; reuses menu domain rules; idempotent publish keyed on the case; real-PostgreSQL integration tests.
- [ ] Staged import (A-D6): upload to a bounded case draft using `inspectMenuFiles` / `readMenuTemplate` / `MenuImportExtractor` / `normalizeExtraction` (files in memory only, as today; existing 10 MB / 40 MB / 10-file limits + per-case quota); store only the reviewed normalized draft; retention / cleanup on cancel / deliver / expiry; never `MenuImportService` before a restaurant exists.
- [ ] Entitlement recheck at final provisioning: package still ACTIVE (A-D3) and `MENU_IMPORT` / import eligibility for the target restaurant (DEC-057) before attaching an imported draft.
- [ ] **Mandatory (PO decision 2026-11-22):** final provisioning consumes only the operator's explicit `modeConfig.packageId` (never `PlatformTrialSettings.defaultPackage`) and re-validates that it still exists and is ACTIVE immediately before `provisionRestaurant` / `createTrial` / package assignment, in the same guarded write or transaction that moves the case to PROVISIONING (no read-then-write gap). A non-ACTIVE package refuses the final submit with the step-2 problem `PACKAGE_NOT_AVAILABLE`. No A1 / A2 code path provisions anything today (`provision-restaurant.ts` only exports its validators for the wizard).
- [ ] Guest-menu readiness check separate from QR existence; incomplete menu → no READY.

### A4 — Temporary demo, handoff, full QA — implemented (Draft PR; release gated)
- [x] DEMO provisioning through `DemoService.create`; one-time private link, existing expiry and purge, non-secret case history (A-D2).
- [x] English and Arabic handoff with backend Guest Menu and Staff login URLs, manual password handoff, and explicit `DELIVERED` confirmation and staged-content cleanup.
- [x] Audited, idempotent lead compare-and-set (A-D4): REAL / TRIAL → DONE on delivery, DEMO NEW → CONTACTED only on confirmed handoff; preserve terminal statuses and manual edits.
- [x] `qrcode` in `apps/platform` renders the real Generic QR preview and downloadable PNG from the backend Guest Menu URL (A-D7). Staff QR export is unchanged.
- [x] Local [validation and release gates](ONBOARDING_A4_VALIDATION.md). Full-size imports remain blocked through the checked-in Gateway.
