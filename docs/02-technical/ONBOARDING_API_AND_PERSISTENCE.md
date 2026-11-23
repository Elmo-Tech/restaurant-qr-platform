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
