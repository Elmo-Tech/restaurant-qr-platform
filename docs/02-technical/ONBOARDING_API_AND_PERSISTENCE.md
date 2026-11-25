# Onboarding Cases — API and Persistence

**Status:** A1/A2 draft workflow and A3 REAL/TRIAL provisioning are implemented. A4 (DEMO and handoff) remains deferred. The Product Owner decisions are recorded in DEC-076. Product workflow: `docs/01-domain/ONBOARDING_WORKFLOW_SPEC.md`.

Code: `apps/api/src/platform/onboarding/` (`onboarding-details.ts` sanitizer + step validation,
`onboarding-transitions.ts` state machine, `onboarding-cases.service.ts`, `onboarding-cases.controller.ts`).
Console: `apps/platform/src/app/(console)/onboarding/`, client `apps/platform/src/lib/api/onboarding.ts`.

---

## 1. Endpoints

All under `/api/v1/platform/onboarding-cases`, Platform rules of API_CONVENTIONS 108P: `PlatformCsrfGuard` on the
controller (any foreign Origin refused, unsafe requests need the platform Origin / Referer → `403
CSRF_VALIDATION_FAILED`), `PlatformAuthGuard` on every route (`401 UNAUTHENTICATED`). A malformed or unknown id is
`404 ONBOARDING_CASE_NOT_FOUND`. Envelopes: `{ data }`, `{ data, meta }`, `{ error: { code, message, problems?,
details? } }`.

| Method | Path | Body / query | Success |
|---|---|---|---|
| GET | `/onboarding-cases` | `?search` (≤100; restaurant name, case-insensitive, or owner e-mail) `&status` (one status) `&page` (≥1) `&pageSize` (1–50, default 20) | `200 { data: CaseSummary[], meta: { page, pageSize, total } }`, newest update first |
| POST | `/onboarding-cases` | `{ leadId? }` | `201 { data: CaseView }` (DRAFT, revision 1) |
| GET | `/onboarding-cases/:id` | — | `200 { data: CaseView }` |
| GET | `/onboarding-cases/:id/duplicates` | — | `200 { data: Duplicates }` |
| PATCH | `/onboarding-cases/:id` | `{ revision, details?, modeConfig?, mode? }` | `200 { data: CaseView }` (revision + 1) |
| POST | `/onboarding-cases/:id/submit-for-review` | `{ revision }` | `200 { data: CaseView }` (READY_FOR_REVIEW) |
| POST | `/onboarding-cases/:id/cancel` | `{ revision }` | `200 { data: CaseView }` (CANCELLED) |

**CaseSummary:** `id, status, mode, revision, restaurantName, ownerEmail, leadId, completedSteps, updatedBy {id,
displayName, email} | null, createdAt, updatedAt`.

**CaseView:** `id, status, mode, revision, details, modeConfig, completedSteps, problems { customer[], mode[] },
lead { id, name, email, phone, kind, status, packageName, createdAt } | null, package { id, name, nameEn, status } |
null, trialSettings { enabled, defaultDays, defaultPackageId }, demoLimits { minHours, maxHours, kinds },
createdBy, updatedBy, assignedTo, createdAt, updatedAt, cancelledAt`. `completedSteps` and `problems` are
recomputed on every read (a package can be archived or trials switched off after a save).

**No password field exists in any request of this milestone** (PO decision A-D1): any password-like key
(`password`, `ownerPassword`, `pass`, `pwd`, …) inside `details` / `modeConfig` is refused by the allow-list, and a
top-level one is stripped by the global whitelist and never reaches the service.

**details:**
```
restaurant: { name, businessType (RESTAURANT|CAFE|SWEETS|OTHER), branchName, countryCode, currencyCode, timezone,
              defaultLocale, additionalLocales[], phone, whatsapp, address, facebookUrl, instagramUrl, websiteUrl }
owner:      { fullName, phone, email, facebookUrl, additionalContact }
acquisition:{ sourceType, referringRestaurantId, sourceName, sourcePlatform, sourceDetail, campaign, adReference } | null
```
PATCH merges `restaurant` and `owner` field by field; `acquisition` is replaced as a whole (`null` clears it).
**modeConfig:** `{ packageId, trialDays, demoKind, demoHours }`, merged key by key. `mode`: `REAL | TRIAL | DEMO |
null`. Choosing `TRIAL` fills a missing `trialDays` / `packageId` from the global trial settings.
_Changed 2026-11-22 (Product Owner decision, workflow spec §7.3.1):_ choosing `TRIAL` fills only a missing `trialDays`
from the global default length (DEC-056). `packageId` is **never** filled from `trialSettings.defaultPackage`: the view
exposes it as `trialSettings.defaultPackageId` (a recommendation the console marks "Recommended"), and step 2 reports
`PACKAGE_REQUIRED` until the operator sends a `modeConfig.packageId`. When a PATCH changes `mode` (to any value,
including `null`) and does not itself carry `modeConfig.packageId`, the stored `packageId` (and the `package_id`
column) is cleared; an explicit `packageId` in the same PATCH (also `null`) is kept. `trialDays` / `demoKind` /
`demoHours` are not cleared. `package_id` is only ever written from `modeConfig.packageId` (i.e. operator input).
No contract shape changed (same fields; behaviour only).

**Duplicates:** `ownerEmailInUse` (a User has the e-mail), `ownerRestaurants [{id,name,status}]` (restaurants it
OWNS), `similarRestaurants` (case-insensitive name contains, non-demo, ≤5), `otherOpenCases` (same owner e-mail
or lead, not CANCELLED / DELIVERED, ≤5), `matchingLeads` (same e-mail case-insensitive or same phone, ≤5).
Warnings only.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | malformed body / query (global ValidationPipe), e.g. `pageSize` 51, `revision` missing |
| 400 | `ONBOARDING_INPUT_INVALID` + `problems` (paths only, never values) | `details` / `modeConfig` contains an unknown key at any depth (e.g. `password`), a wrong type, or a value over its hard cap. The whole write is refused. |
| 404 | `ONBOARDING_CASE_NOT_FOUND` | unknown or malformed id |
| 404 | `LEAD_NOT_FOUND` | `leadId` unknown or malformed |
| 409 | `ONBOARDING_LEAD_IN_PROGRESS` + `details.caseId` | the lead already has an open case |
| 409 | `ONBOARDING_REVISION_CONFLICT` + `details.currentRevision` | the `revision` sent is not the current one |
| 409 | `ONBOARDING_NOT_EDITABLE` + `details.status` | PATCH of a case that is not DRAFT / READY_FOR_REVIEW |
| 409 | `ONBOARDING_INVALID_TRANSITION` + `details.status` | submit of a non-DRAFT case; cancel of a non-editable case |
| 422 | `ONBOARDING_INCOMPLETE` + `problems` + `details { customer, mode }` | submit while step 1 or 2 has problems |

### Problem codes

Step 1: `RESTAURANT_NAME_INVALID, BUSINESS_TYPE_REQUIRED, BRANCH_NAME_INVALID, COUNTRY_INVALID, CURRENCY_INVALID,
TIMEZONE_INVALID, DEFAULT_LOCALE_INVALID, ADDITIONAL_LOCALES_INVALID, RESTAURANT_PHONE_INVALID,
RESTAURANT_WHATSAPP_INVALID, ADDRESS_TOO_LONG, RESTAURANT_FACEBOOK_URL_INVALID, RESTAURANT_INSTAGRAM_URL_INVALID,
RESTAURANT_WEBSITE_URL_INVALID, OWNER_NAME_INVALID, OWNER_PHONE_INVALID, OWNER_EMAIL_INVALID,
OWNER_FACEBOOK_URL_INVALID, OWNER_ADDITIONAL_CONTACT_TOO_LONG, ACQUISITION_REQUIRED, ACQUISITION_INVALID,
AD_REFERENCE_TOO_LONG`.
Step 2: `MODE_REQUIRED, PACKAGE_REQUIRED, PACKAGE_NOT_AVAILABLE, TRIAL_DISABLED, TRIAL_DAYS_INVALID,
DEMO_KIND_INVALID, DEMO_HOURS_INVALID`. The console maps each to `onboarding.problem.<CODE>` (ar + en).

Rules reused, not copied: `PROVISION_LIMITS`, `isValidOwnerEmail`, `isValidCurrencyCode`, `isValidTimezone`
(exported from `provision-restaurant.ts`, which now uses them itself), `normalizePlatformLocale`,
`validateOwnerContact`, `validateAcquisitionInput`, `normalizePhone` / `normalizeUrl` (https only, platform
hosts for Facebook / Instagram), `DEMO_KINDS` / `DEMO_MIN_HOURS` / `DEMO_MAX_HOURS`, trial 1–365 days as
`createTrial`.

### Audit

`onboarding.created { caseId, leadId }`, `onboarding.submitted_for_review { caseId, mode, revision }`,
`onboarding.cancelled { caseId, from, leadId }` — written after the guarded update succeeds (the audit writer is
not transaction-aware, as everywhere in the platform module). No password, no owner phone, no details JSON.
Autosave PATCHes are not audited individually.

## 2. Schema (migration `20261128090000_onboarding_cases`)

Additive only: enums `onboarding_case_status` (DRAFT, READY_FOR_REVIEW, PROVISIONING, MENU_SETUP, READY,
DELIVERED, FAILED, CANCELLED) and `onboarding_mode` (REAL, TRIAL, DEMO); table `onboarding_cases`:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| status | onboarding_case_status | default DRAFT |
| mode | onboarding_mode NULL | |
| revision | int | default 1, CHECK ≥ 1 |
| details, mode_config | jsonb | default `{}`, CHECK object; sanitized on write |
| completed_steps | text[] | server snapshot at the last write |
| restaurant_name | varchar(100) NULL | searchable copy |
| owner_email | varchar(254) NULL | searchable copy, CHECK `= lower(owner_email)` |
| lead_id | uuid NULL | FK signup_leads ON DELETE SET NULL |
| package_id | uuid NULL | FK packages SET NULL (only an existing package is copied here) |
| restaurant_id, demo_id | uuid NULL | FK restaurants SET NULL; reserved for A3 (a demo is a `restaurants` row with `is_demo`) |
| provisioning_key | uuid NULL UNIQUE | reserved for A3 |
| last_error_code | varchar(80) NULL | reserved for A3 |
| created_by_admin_id, updated_by_admin_id, assigned_admin_id | uuid NULL | FK platform_admins SET NULL |
| created_at, updated_at, cancelled_at | timestamptz | CHECK CANCELLED ⇒ cancelled_at set |

Indexes: `(status, updated_at)`, `(owner_email)`, `(lead_id)`, unique `(provisioning_key)`, and the partial unique
`onboarding_cases_open_lead_key ON (lead_id) WHERE lead_id IS NOT NULL AND status NOT IN ('CANCELLED',
'DELIVERED')`. RLS enabled + `REVOKE ALL` from PUBLIC / anon / authenticated, like the other global platform tables.

Every foreign key is SET NULL. The demo purge (`demo-purge.ts`) ignores SET NULL edges, so it never deletes a
case; the demo e2e suite still passes with the table present.

**Rollback:** the table is referenced by nothing; `DROP TABLE "onboarding_cases"; DROP TYPE "onboarding_mode";
DROP TYPE "onboarding_case_status";` then remove the migration row. The application code must be rolled back
first (the PlatformModule registers the controller).

## 3. Concurrency

Optimistic, like `Contract.revision`: every write (`PATCH`, submit, cancel) is
`updateMany({ where: { id, revision, status ∈ allowed }, data: { …, revision: { increment: 1 } } })`. A count other
than 1 is re-read to answer `ONBOARDING_REVISION_CONFLICT` (with the current revision), `404` or
`ONBOARDING_INVALID_TRANSITION`. The console autosaves ~1.5 s after the last edit and on step change, sends one
PATCH at a time (later edits are queued, never sent in parallel), shows "Saving… / Saved hh:mm / Not saved — retry",
and on a conflict stops autosaving and offers "Reload the latest version".

**Submit-for-review and the package (2026-11-22):** the evaluation reads the package; the guarded write then adds a
relation filter `package: { is: { id, status: 'ACTIVE' } }` when a package is chosen, so the package status is
re-checked in the same `UPDATE` statement. If only that filter refused the write (same revision, still DRAFT), the case
is re-evaluated and the answer is `422 ONBOARDING_INCOMPLETE` with the current problems (e.g.
`PACKAGE_NOT_AVAILABLE`), never a false revision conflict. An archive committed after that statement is equivalent to
archiving after submit: the view reports `PACKAGE_NOT_AVAILABLE` again and A3 re-validates before provisioning.

Two operators starting from the same lead: the service first looks for an open case; the partial unique index
closes the race (a `P2002` on create is answered with the existing case id). The e2e suite fires both POSTs in
parallel and expects exactly one `201` and one `409`.

## 4. A3 implementation and A4 handoff

A3 provisions REAL and TRIAL; A4 also provisions a template-based DEMO through `DemoService.create`. Steps 1 and 2 still gate review. Final REAL/TRIAL provisioning requires a complete menu and, for an imported draft, explicit human review. The Platform routes use the same session and Origin protections as the draft routes.

| Method | Case action | Body | Success |
|---|---|---|---|
| PATCH | `/:id` | existing fields plus optional `menuDraft` | Case view; menu edits invalidate import approval |
| POST | `/:id/menu-import` | multipart `revision` and repeated `file` | Staged normalized menu; no tenant writes |
| POST | `/:id/menu-import/review` | `{ revision }` | Marks a valid staged menu reviewed |
| DELETE | `/:id/menu-import` | `{ revision }` | Discards the staged menu and leaves the case in DRAFT |
| POST | `/:id/provision` | `{ revision, provisioningKey, ownerPassword? }` | READY or the current checkpoint, including FAILED with `lastErrorCode` |
| POST | `/:id/retry` | same key and current `revision`; password only for unprovisioned REAL / TRIAL | Resumes from the recorded checkpoint |
| POST | `/:id/deliver` | `{ revision }`, the operator’s explicit confirmation | DELIVERED; replay returns the current case without reapplying the transition |

The menu is a bounded nested graph of fresh content, with no client-controlled tenant or resource IDs. The first menu is primary. Prices are decimal strings. The view reports `menuDraft`, `problems.menu`, `importReviewed`, `importExpiresAt`, `importAttempts`, `provisioningKey`, `lastErrorCode`, and `ownerPasswordRequired`, plus `restaurantId` once present. Drafts may be incomplete; final submit refuses missing names, prices, or review. A package change or archive is revalidated before provisioning and again at the stages that consume it.

Imports retain no source files. The per-case quota is three extraction attempts; normalized imported content expires in seven days and is cleared on cancellation or by the expiry sweep. Delivery clears the case’s staged menu and import expiry/review/lease fields in the transition transaction; published tenant content and attempt counts are retained. If an imported draft expires before its menu was ever committed, it cannot be published on retry. Cancelling FAILED abandons the case but does not delete an already-created tenant.

Release check (no infrastructure change in A3): the checked-in Gateway template limits request bodies to 16 MiB and waits 120 seconds for Platform API responses. Large batches and extraction runs that outlast the Gateway timeout need a separately approved Gateway configuration or upload transport before the full API limits can be offered through that Gateway.

The additive migration `20261128100000_onboarding_a3` records when the tenant was created, when the menu was published, and the identity of the committed trial. Each checkpoint commits in the same transaction as its respective writes and audit. A removed tenant cannot be replaced by retry even if its foreign key is cleared. A retry after a sync interruption reuses the committed trial. READY requires the real Guest Menu reader to resolve the restaurant's current slug and show an available product. Historical design sequence and A4 boundaries follow.

The existing routines each own their transaction (`provisionRestaurant`, menu services, `createTrial` with
post-commit audit + subscription sync), so one all-or-nothing transaction is not possible without rewriting them.
A3 is therefore a **resumable saga whose progress lives on the case**:

1. **Final submit** `POST /onboarding-cases/:id/provision` with `{ revision, provisioningKey, ownerPassword }`.
   `provisioningKey` is a UUID the client creates once per attempt. A guarded update sets `status = PROVISIONING`
   and stores the key (unique). A retry with the same key re-enters the saga; a different key while
   PROVISIONING / MENU_SETUP is `409`.
   **`ownerPassword` is transient** (PO decision A-D1, DEC-047 kept): it exists only in that request, is passed to
   `provisionRestaurant` → `PasswordHasherService` (Argon2id, 8–128) and is never written to the case, the audit
   log, a log line, a URL, analytics, an error body or a saved response. The request DTO must exclude it from any
   logging; validation failures name the rule, never the value.
2. **Provision** via `provisionRestaurant` (+ acquisition + owner contact in its transaction). Immediately record
   `restaurant_id` and move to `MENU_SETUP` in a guarded update. **When `restaurant_id` is set, provisioning is
   never run again.** REAL / TRIAL re-check that the chosen package is still ACTIVE before step 2 runs (A-D3).
   _Mandatory, PO decision 2026-11-22:_ the package consumed is only the operator's explicit `modeConfig.packageId`
   (never the trial default package), and its existence + ACTIVE status are re-validated in the same guarded write /
   transaction that moves the case to PROVISIONING, before `provisionRestaurant` / `createTrial` run; otherwise the
   final submit is refused with `PACKAGE_NOT_AVAILABLE`.
3. **Menu** published through a narrow, audited platform menu writer in its own transaction (no Staff routes,
   AUTH_TENANCY §73); prices are never invented (DEC-040 blockers). ~~(A-D5 / A-D6 still awaiting approval.)~~
   **Approved 2026-11-21 (A-D5 / A-D6, workflow spec §7.5–7.6):** the writer re-checks every resource against the
   case's `restaurant_id`, reuses the menu domain rules, publishes idempotently (no duplicates after a retry) and is
   audited without secrets. An imported menu exists before this point only as a reviewed, bounded draft on the
   case (files in memory only, never `MenuImportService` before a restaurant exists); package entitlements and
   import eligibility (`MENU_IMPORT`, DEC-057) are rechecked before it is attached. Not started.
4. **Trial / package**: TRIAL → `createTrial` (trial settings + overlap rules); REAL → package assignment (and
   billing per DEC-049); DEMO → the existing `DemoService.create` (template only; `demo_id` recorded, A-D2).
5. **Verify** guest-menu readiness (active generic QR + active restaurant + active primary menu with a live
   product), then `READY`. (2026-11-21, A-D6 / A-D7: menu readiness is verified on its own — the Generic QR existing
   is not enough — and an incomplete menu never yields `READY`.)
6. Any failure records `last_error_code` and moves to `FAILED`. Retry rules:
   - `restaurant_id` **set** (provisioned, later step failed): resume from the recorded step; **no password is
     asked** because provisioning will not run again.
   - `restaurant_id` **not set** (provisioning itself failed or never committed): the operator must **re-enter the
     password** in the retry request; nothing from the first attempt is reused.
7. Handoff (A4) → `DELIVERED`. After provisioning only: real Generic QR preview, copy link and export (A-D7; no
   fake / placeholder QR; whether `apps/platform` gets a QR rendering dependency is an A4 decision). Then, for REAL /
   TRIAL only, a compare-and-set, audited, idempotent lead → `DONE` unless the lead is already DONE / DISMISSED or was
   changed manually; DEMO leaves the lead at CONTACTED (A-D4). The password is handed over manually; no invitation, reset token or generated
   credential (server-generated one-time password / activation link = documented future enhancement only).
   _Clarified 2026-11-21 (PO, final clarifications):_ the QR preview and a PNG download are rendered in
   `apps/platform` with the `qrcode` library from the authoritative Backend-generated Guest Menu URL (no Staff session
   coupling; no placeholder before provisioning; Staff QR export unchanged). For DEMO, an associated `NEW` lead may move
   to `CONTACTED` only when the demo link has actually been handed over (never on demo creation); CONTACTED is kept;
   DONE / DISMISSED are never overwritten automatically.

### 4.1 A4 handoff, DEMO history and lead transition

- REAL / TRIAL: the `handoff` object contains `guestMenuUrl` and `staffLoginUrl` for READY / DELIVERED only while the menu is shareable. The API uses the live Generic QR and current slug with the existing `restaurantMenuUrl` builder, configured Web origin and optional restaurant base domain. The Staff link points to Web `/login`. The case UI renders the PNG from that exact Guest Menu URL and never includes the original owner password in either handoff message. No QR is shown for the private DEMO access link.
- DEMO: creation, the hashed link and non-secret case checkpoint commit together. The plain `data.demoLink` is returned only to the request that committed the create (including an authorized retry that creates it for the first time). Provision/retry responses are `private, no-store`. Normal case reads, successful replays, lead records and audit never contain the link. A lost response does not recreate the demo or reveal the link again. If necessary, use the existing Demos console to extend or generate a replacement; possession or copying a link does not confirm delivery.
- `demo_history` stores the original kind, label, package name, creation time and expiry only. `demoExpiresAt` and `demoState` report current availability separately while the demo exists. Removal records `demo_removed_at` in the existing purge transaction; the `demo_id` foreign key becomes null. The case survives with `demoHistory.purged` and its non-secret snapshot. No lead details are copied into the demo.
- The guarded case transition sets `deliveredAt`. Expired, locked or purged demos and unavailable REAL / TRIAL menus cannot be newly delivered. An already-delivered case can be replayed, even after removal. An undelivered, permanently purged READY case remains historical and cannot be marked delivered or restarted through its case; see the [release notes](ONBOARDING_A4_VALIDATION.md).
- The case snapshots the lead’s status version at creation. Manual writes increment it, even if the visible status returns to the same value. Before automation changes a lead, both the expected status and version must match. The case, staged-content cleanup, lead compare-and-set and applicable audits commit together. REAL / TRIAL can move NEW or CONTACTED to DONE; DEMO can move only NEW to CONTACTED after the operator confirms actual sharing. A concurrent manual edit wins; DONE and DISMISSED never change automatically. Pre-A4 cases have no captured version: the migration backfills only still-NEW, never-handled leads and otherwise skips automation.

## 5. Verification

- Unit: `apps/api/src/platform/onboarding/*.spec.ts` (sanitizer incl. 11 password-like spellings at every depth and
  in `modeConfig`, step rules, mode rules incl. archived package, completed steps, transitions).
- Race / recheck e2e (2026-11-21): concurrent PATCH with one revision, concurrent POST for one lead, stale revision
  after submit / cancel, cancel frees the lead, e-mail case-insensitivity and documented duplicate fields only,
  concurrent submit, archived package after selection, no restaurant / user rows created by any wizard endpoint.
- Integration: `apps/api/test/onboarding-cases-http.e2e-spec.ts` against the disposable sandbox database
  (`TABLE_SESSION_IT_DATABASE_URL`, see `test/support/sandbox-guard.ts`).
- 2026-11-22 (explicit trial package confirmation): unit `modeConfigForPatch` / `suppliesPackageId`; e2e block
  "explicit trial package confirmation" (recommendation without selection, accepting the recommendation, another
  ACTIVE package, archived before / after selection and between evaluation and the guarded submit write, mode
  switching, concurrent selections and stale revisions); UI contract `tests/contract/onboarding-package-choice.spec.ts`
  (run by `npm run test:contract-ui`; `apps/platform` has no test runner of its own).

## 6. Mode first, DEMO short path, AI-prepared menu and list removal (PO request 2026-11-23)

Product rules: `docs/01-domain/ONBOARDING_WORKFLOW_SPEC.md` §9.

### 6.1 Step evaluation

- `ONBOARDING_STEPS` is now `mode, customer, menu, review, handoff`. `stepsForMode(DEMO)` is `mode, review, handoff`;
  REAL, TRIAL and a case without a mode keep the full path. `stepsRequiredForReview`: `mode` for DEMO, `mode` +
  `customer` otherwise. The console mirrors both in `apps/platform/src/lib/onboarding-steps.ts` (contract-tested).
- One evaluation, `evaluateSteps(mode, modeConfig, context, details)` (`onboarding-details.ts`), is used by PATCH,
  reads, submit-for-review and the provisioning claim. For DEMO: `problems.customer` is always `[]`, the customer step
  is never reported in `completedSteps`, and the mode step adds `DEMO_LABEL_INVALID` (the internal label, stored as
  `details.restaurant.name`, must be 1–80 characters after collapsing whitespace, the `DemoService.create` rule). The
  demo is created with that normalized label. REAL / TRIAL validation is unchanged.
- `decideSubmit(status, completedSteps, mode)` requires the mode's steps. No request or view field was added or
  removed for this; customer details typed before a switch to DEMO stay stored (the sanitizer is unchanged) and count
  again after switching back. The existing mode-change rule still clears the package unless the same PATCH supplies it.

### 6.2 Removal from the active list

| Method | Path | Body / query | Success |
|---|---|---|---|
| GET | `/onboarding-cases` | new `&archived=true` lists only removed cases (default: the active list, `archived_at IS NULL`) | as before |
| POST | `/onboarding-cases/:id/remove` | `{ revision, acknowledgedImpacts: Impact[], confirmNotDelivered? }` | `200 { data: { id, status, revision, archivedAt } }` |
| POST | `/onboarding-cases/:id/restore` | `{ revision }` | `200 { data: CaseView }` (status unchanged, `archivedAt: null`) |

`CaseSummary` adds `archivedAt` and `removal` (`{ allowed: true, action: CANCEL_AND_ARCHIVE | ARCHIVE, impacts[],
confirmNotDelivered }` or `{ allowed: false, refusal }`); `CaseView` adds `archivedAt`. The decision is the pure
`decideRemoval` in `onboarding-transitions.ts`:

| Case | Action | Impacts the operator must acknowledge |
|---|---|---|
| DRAFT / READY_FOR_REVIEW | cancel (existing rule) + archive | `LINKED_LEAD`, `SUBMITTED` (review), `MENU_DRAFT` (discarded by cancel); none for a routine draft |
| FAILED | cancel (existing rule) + archive | `SETUP_FAILED`, `RESTAURANT_KEPT`, `DEMO_KEPT`, `MENU_DRAFT`, `LINKED_LEAD` |
| READY DEMO, purge committed, never delivered | the existing READY cancel + archive; also `confirmNotDelivered: true` | `DEMO_PURGED`, `LINKED_LEAD` |
| DELIVERED | archive only | `DELIVERED`, `RESTAURANT_KEPT` / `DEMO_KEPT` |
| CANCELLED | archive only | `RESTAURANT_KEPT` / `DEMO_KEPT` when one exists |
| PROVISIONING, MENU_SETUP | refused `PROVISIONING_ACTIVE` | — |
| any other READY (handoff pending, live demo) | refused `HANDOFF_PENDING` | — |

Server enforcement: one transaction takes the case row lock (`FOR UPDATE`, the same lock as delivery, provisioning,
staged import and the demo purge), re-reads the row, checks the revision, recomputes the decision and requires every
current impact to be in `acknowledgedImpacts` (a demo purge or lead removal does not bump the revision, so the
acknowledgement, not only the revision, guards against a stale dialog). The write is a guarded `updateMany` with the
same status predicates as `cancel`. A repeated request for an already-archived case answers `200` without writing
(lost-response retry). Nothing is ever deleted: no case, restaurant, account, subscription, demo, lead, order or audit
row; the lead is not changed (cancelling only frees its one-open-case slot).

Errors: `409 ONBOARDING_REVISION_CONFLICT`; `409 ONBOARDING_REMOVE_CONFIRMATION_REQUIRED + details.impacts`;
`409 ONBOARDING_REMOVE_REFUSED + details.reason` (`PROVISIONING_ACTIVE | HANDOFF_PENDING | ALREADY_ARCHIVED`);
`409 ONBOARDING_INVALID_TRANSITION` (restore of a case that is not archived, or a guarded write that lost a race);
`400 VALIDATION_ERROR` for an unknown impact. Audit: `onboarding.cancelled { caseId, from, leadId, reason:
REMOVED_FROM_LIST | DEMO_PURGED_UNDELIVERED, confirmedNoHandoff? }` (cancelling removals),
`onboarding.archived { caseId, from, removal, impacts, leadId }`, `onboarding.restored { caseId, status }`, written
in the same transaction.

Schema (forward migration `20261129090000_onboarding_case_archive`, additive and nullable, no backfill):
`archived_at TIMESTAMPTZ`, `archived_by_admin_id UUID` (FK `platform_admins`, `ON DELETE SET NULL`), CHECK
`onboarding_cases_archived_terminal_check` (`archived_at IS NULL OR status IN ('CANCELLED','DELIVERED')`), index
`(archived_at, updated_at)`. Rollback: the application ignores the columns if reverted; dropping them loses only the
archive marker (the cases stay CANCELLED / DELIVERED and reappear in the list).

### 6.3 AI-prepared menu import

The Menu step's optional helper shows `MENU_AI_PROMPT` and offers `/templates/menu-import-template.xlsx`. Both are
mirrors of the Staff importer's canonical files (`apps/web/src/lib/menu-import/ai-prompt.ts`,
`apps/web/public/templates/menu-import-template.xlsx`), because each Next.js image is built from its own app folder;
`tests/contract/onboarding-ai-prompt.spec.ts` fails on any difference. The helper is client-only: no request, no
import attempt and no case write until the operator uploads a file through the unchanged `menu-import` route
(same file validation, quota, review, expiry and replacement confirmation). `onboarding-menu-import.spec.ts` proves an
openpyxl-written `.xlsx` with the prompt's header is read as the template (no model) and staged as a valid draft.

### 6.4 Verification

- API unit: `onboarding-details.spec.ts`, `onboarding-transitions.spec.ts`, `onboarding-menu-import.spec.ts`.
- Contract: `tests/contract/onboarding-mode-first.spec.ts`, `onboarding-removal.spec.ts`, `onboarding-ai-prompt.spec.ts`.
- Real PostgreSQL: block "mode first: DEMO short path, mode switching and list removal" in
  `apps/api/test/onboarding-cases-http.e2e-spec.ts` (DEMO submitted and provisioned without customer data, missing
  label refused at edit / submit / provisioning, lead association, mode switching, routine removal + restore, impact
  acknowledgement, stale revisions, concurrent removals and removal vs edit, refusals, delivered archive, purged-demo
  rule, DB CHECK, pagination). CI: `wayta-feature-regression.yml` (units, contracts, lint, `onboarding-postgres` job).
- Browser smoke (local, not in CI): `tests/release/onboarding-ux-browser-smoke.mjs` against a loopback API +
  Platform stack on a disposable migrated database with a disposable operator (`npm run provision:platform-admin
  --workspace=apps/api -- --email operator@example.test --name "UX operator" --password-env UX_ADMIN_PASSWORD`).
  Set `UX_API_ORIGIN` / `UX_PLATFORM_ORIGIN` (127.0.0.1 only), `UX_ADMIN_PASSWORD`, `UX_PLAYWRIGHT_MODULE` (absolute path
  of an isolated Playwright install) and optionally `UX_BROWSER_CHANNEL=chrome`. It covers the mode-first DEMO path
  through provisioning, mode switching, prompt copy (and the manual fallback), template download, AI-prepared upload,
  list removal / restore / refusal / stale revision, and Arabic RTL at 390 px.

## 7. Approved A2 import grants and rollout

The approved policy is in `docs/01-domain/ONBOARDING_WORKFLOW_SPEC.md` §10. This A2 is distinct from the earlier wizard A2. Treat that policy as the target, not evidence of implementation or deployment: the existing package checks in staged import, provisioning and publication must be replaced or reconciled for onboarding, without changing Staff entitlements. The existing three-attempt case quota, ten-minute lease and seven-day draft retention continue; new operator/global UTC-day and concurrency ceilings require atomic cross-instance enforcement. Attempt caps are not a spending budget.

**Provider audit of the pre-grant code:** `OnboardingMenuImportService.stage` claims an attempt before image validation or template parsing. A recognized `.xlsx` template is parsed locally without a model; other supported input goes through `MenuImportExtractorRouter`, which uses the configured DIRECT engine or n8n (and falls back to n8n if settings cannot be read). DIRECT defaults to the Gemini OpenAI-compatible endpoint, but its endpoint and model are configurable. It can create multiple requests per extraction, with retries and a fallback model. The n8n webhook delegates its downstream provider and retry behavior to the configured workflow; the repository cannot prove the live configuration or billing. Failed, timed-out or abandoned calls may still incur provider charges. No provider account, actual usage or spending was inspected.

The checked-in extraction path has time, output-token, attempt and concurrency-style controls, but no verified monetary accounting or hard spend enforcement. An output-token maximum is not a cost ceiling; an attempt is not necessarily one provider call. Before enabling, independently configure and verify applicable provider-side quotas, billing alerts and, where the provider actually supports them, hard spending caps for every active key/project and n8n provider. Treat alerts as monitoring, not guaranteed stops; verify provider behavior and pricing externally rather than assuming a free tier or zero cost. Use limited test data and monitor provider billing and rate usage during a phased rollout.

**Release sequence and precautions:** This branch is stacked on A1 PR #91 (base commit `7663ae1`); merge and include that dependency first. PR #90 is independent and is not an ancestor; it addresses the related Prisma PostgreSQL session-timezone issue and must be reviewed and integrated or otherwise resolved before relying on non-UTC database operation. Ship the grant schema as a new forward migration after the dependency; never rewrite an applied migration. Review migration ordering and compatibility, take and verify a backup, and test the upgrade on a disposable production-like database, including old/ambiguous imported drafts and rollback/application compatibility. Apply production migrations only through the separately approved deployment process; no production deployment or database change is authorized by this document.

**Mandatory cutover:** Quiesce onboarding writes and drain all A1 application writers and in-flight onboarding work before applying the A2 migration. Keep A1 writers stopped throughout the migration and rollout, and reopen writes only after every active writer runs the compatible A2 version. Mixed-version writes can create or change imported drafts without the A2 provenance and grant protections, bypassing the migration's conservative backfill. Do not roll back to A1 writers against the migrated database without a separately reviewed compatibility and recovery plan.

**Audit privacy:** Grant and revocation reasons are required free text and are recorded in the platform audit log; content-free audit is therefore not guaranteed. Operators must use short, non-sensitive operational reasons and never enter menu content, personal data, credentials or secrets. This instruction reduces exposure but does not technically prevent sensitive text from being stored; restrict audit access and apply the approved retention and incident procedures.

Before rollout, validate cross-instance quota races, grant expiry/revocation and regrant during extraction, provenance after manual edits, fail-closed legacy drafts, discard after expiry/revocation, package-independent REAL/TRIAL grants, unaffected Staff entitlement, review/provision/publish and handoff races, and preservation of published menus. All application instances must use identical limits and synchronized clocks if enforcement relies on them. Verify Platform authentication, CSRF, authorization and audit protections, including the free-text reason risk above; do not expose source files or secrets in logs. Start with a controlled operator cohort and a stop/disable and recovery plan. The existing gateway body-size and timeout constraints in `ONBOARDING_A4_VALIDATION.md` still apply: check case state before retrying after a timeout, because a provider call or staging operation may still be running. Monitor both application controls and provider billing; investigate discrepancies before expanding.

Concurrency usage slots deliberately remain occupied after a worker crash or an ambiguous provider failure or timeout and fail closed. There is no authorized recovery path under the current admin model; recovery is blocked pending a separately authorized follow-up. Do not reset a slot or perform an unrestricted manual recovery, including when the ten-minute case lease has expired. A case lease is not evidence that the worker or associated external provider and n8n operations have stopped. Completed usage rows are retained for seven days; in-flight slots do not automatically expire.

The startup-validated positive-integer settings are `ONBOARDING_IMPORT_OPERATOR_DAILY_LIMIT` (default 10), `ONBOARDING_IMPORT_GLOBAL_DAILY_LIMIT` (30), `ONBOARDING_IMPORT_OPERATOR_CONCURRENCY` (1), and `ONBOARDING_IMPORT_GLOBAL_CONCURRENCY` (3). Configure them identically across API instances. All non-null drafts at migration time are conservatively marked `LEGACY`, including preexisting manual drafts. A `LEGACY` draft with an intact, unexpired import expiry can be granted and reviewed; where the expiry marker is missing, discard the draft and import afresh rather than treating it as manual.

The `onboarding-import-grants-postgres.yml` pull-request / manual workflow runs the onboarding HTTP and import-grant regressions with Node 24 against a newly provisioned PostgreSQL 18 service set to UTC. A non-UTC PostgreSQL 17 run exposed a timestamp offset issue. A2 non-UTC database sessions are unsupported pending review and integration of PR #90's complete session-UTC fix, or an equivalent reviewed fix, followed by regression testing in both UTC and non-UTC settings; UTC CI does not validate non-UTC operation. It marks the disposable database for the sandbox guard and deploys the migration chain there; it does not target existing databases or use provider credentials. A configured workflow is not evidence of a successful run: check the actual CI result before release. These regressions cannot establish provider pricing, billing behavior or a monetary spending guarantee.
