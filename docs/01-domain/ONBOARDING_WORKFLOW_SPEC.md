# Owner Onboarding Workflow (Platform Console)

**Status:** PROPOSED, with Product Owner decisions of **2026-11-21** applied (initial Owner password, lead ↔ demo
association, package selection — section 7). Milestones **A1 + A2 implemented** on branch `feat/onboarding-wizard`;
A3 / A4 are planned only. Technical contract: `docs/02-technical/ONBOARDING_API_AND_PERSISTENCE.md`.
The Product Owner decision table (all A-D1…A-D7 decided as of 2026-11-21) is in `docs/02-technical/ONBOARDING_IMPLEMENTATION_PLAN.md`.
**Update 2026-11-21 (second review):** A-D4 … A-D7 (lead status, Platform menu writer, staged menu import, QR
preview) approved as design policies — section 7.4–7.7 and DEC-076. A3 / A4 are **not started**.
**Update 2026-11-22 (Product Owner decision):** the trial default package is a recommendation only and must be
chosen explicitly by the operator — section 7.3.1 (refines A-D3; DEC-056 trial settings otherwise unchanged).
**Update 2026-11-23 (Product Owner request):** the onboarding type is chosen first, a DEMO takes a short path without
customer data, the Menu step offers the AI prompt helper, and cases can be removed from the outer list (cancel +
archive, never a delete) — section 9, which supersedes the step order of section 2.

---

## 1. Purpose

The Platform team onboards a new customer (a restaurant owner) in several sittings: collect the customer,
restaurant and attribution details, choose how the customer starts (paying customer, free trial or a temporary
demo), prepare the menu, review, and hand the account over. Today this is spread across the New Restaurant form
(DEC-047), the billing section (DEC-049 / DEC-056), the demos page (DEC-060 / DEC-061) and the leads inbox
(DEC-053), with nothing that remembers a half-finished onboarding.

An **onboarding case** is a resumable, Platform-only draft of that work. Several operators can open it; it is
autosaved; it never stores a password.

## 2. Steps

> _Superseded order (2026-11-23, section 9):_ step 1 is now the onboarding type (mode); REAL / TRIAL continue with
> customer, menu, review and handoff; DEMO goes mode → review → handoff. The table below is kept as the A1/A2 record.

| # | Step | This build (A1 + A2) |
|---|---|---|
| 1 | Customer & restaurant | **Implemented.** Restaurant, owner contact, acquisition source; server-side validation reusing the provisioning, owner-contact, acquisition and contact validators; duplicate warnings. |
| 2 | Onboarding mode | **Implemented (choice only).** REAL / TRIAL / DEMO with package, trial length or demo kind + hours. Nothing is created. |
| 3 | Menu | Planned (A3/A4). Shown as "Not available yet in this build". |
| 4 | Review | **Partly.** "Submit for review" marks the case `READY_FOR_REVIEW`; it creates nothing. |
| 5 | Handoff | Planned (A3/A4). Shown as "Not available yet in this build". |

A step is *complete* only when the server finds no problem in it (`completedSteps`, recomputed by the server on
every write and read; never trusted from the client). Steps 3–5 are never complete in this build.

## 3. Modes (step 2)

- **REAL** — the customer's own restaurant on a paid package. Requires an explicit **ACTIVE** package (the
  "no package = every feature" shortcut of DEC-046 is deliberately not offered here).
- **TRIAL** — the customer's own restaurant on a free trial (DEC-056): an ACTIVE package and 1–365 days. The
  length and package start from the global trial settings. If trials are disabled globally, step 2 reports
  `TRIAL_DISABLED`.
  _Changed 2026-11-22 (PO, section 7.3.1):_ only the **length** starts from the global trial settings. The global
  default package is shown as **Recommended**; it is not the case's package until the operator selects it (or
  another ACTIVE package). Until then step 2 reports `PACKAGE_REQUIRED`.
- **DEMO** — a temporary demo restaurant built from a template (DEC-060 / DEC-061): kind `restaurant | cafe |
  sweets`, hours within the demo limits (`DEMO_MIN_HOURS`..`DEMO_MAX_HOURS` = 1..336), optional ACTIVE package.

**A demo is NOT a trial.** A demo is a sample restaurant from our template, opened by a secret link and removed
completely when it ends; it is never the customer's restaurant and never becomes one (DEC-060: "converting a demo
into a trial" is out of scope). A trial is the customer's real restaurant on a package for a limited time. The UI
says this next to the choice.

## 4. Statuses and transitions

```
DRAFT ──submit──▶ READY_FOR_REVIEW ──(A3) provision──▶ PROVISIONING ──▶ MENU_SETUP ──▶ READY ──▶ DELIVERED
  ▲                    │                                     │               │
  └──── any edit ──────┘                                     └──── FAILED ◀──┘ (retry resumes)
DRAFT / READY_FOR_REVIEW ──cancel──▶ CANCELLED
```

| From | To | Trigger | Status in this build |
|---|---|---|---|
| (new) | DRAFT | `POST /onboarding-cases` | **Implemented** |
| DRAFT | READY_FOR_REVIEW | submit for review (steps 1 + 2 complete) | **Implemented** |
| READY_FOR_REVIEW | DRAFT | any successful edit | **Implemented** |
| DRAFT, READY_FOR_REVIEW | CANCELLED | cancel | **Implemented** |
| READY_FOR_REVIEW | PROVISIONING | final submit (provisioning key) | Planned (A3) |
| PROVISIONING | MENU_SETUP / FAILED | provisioning done / failed | Planned (A3) |
| MENU_SETUP | READY / FAILED | menu published + trial/demo created + guest menu readiness **verified** (checked separately from the Generic QR existing; an incomplete menu never yields READY — A-D6 / A-D7) | Planned (A3/A4) |
| READY | DELIVERED | handoff confirmed; REAL / TRIAL may then set the lead to DONE (section 7.4) | Planned (A4) |
| FAILED | PROVISIONING / MENU_SETUP / CANCELLED | retry from the recorded step, or give up | Planned (A3) |

Terminal: `CANCELLED`, `DELIVERED`. `FAILED` is recoverable and therefore counts as open.
Only DRAFT and READY_FOR_REVIEW are editable.

## 5. Leads

A case may start from a landing-page request (`SignupLead`, DEC-053). The case prefills the owner name, e-mail
and phone, the restaurant name and the default locale from the request. The acquisition source is **not**
invented from the lead; the operator chooses it. At most one open case exists per lead: when two operators start
the same lead, the second gets `409 ONBOARDING_LEAD_IN_PROGRESS` with the existing case id and the console opens
that case.

Lead status (PO decision A-D4, 2026-11-21, section 7.4): a REAL / TRIAL case may set its lead to DONE only after
`DELIVERED`; a DEMO normally leaves it at CONTACTED; DONE / DISMISSED are never downgraded; manual changes by
another operator win; transitions are idempotent, audited and compare-and-set. **Not implemented yet (A4):** the
A1 + A2 wizard never writes the lead's status.

## 6. Implementation decisions D1–D7 (PROPOSED)

These are the A1 + A2 implementation choices (D1–D7, distinct from the Product Owner decisions A-D1…A-D7). The
Product Owner decided A-D1–A-D3 earlier on 2026-11-21 and A-D4–A-D7 in the second review the same day (section 7,
DEC-076). The D-items below stay PROPOSED until review.

- **D1 — Where:** Platform console routes `/onboarding` (list) and `/onboarding/[caseId]` (wizard), inside the
  existing session-gated console layout. API `/api/v1/platform/onboarding-cases` with `PlatformCsrfGuard` (class)
  + `PlatformAuthGuard` (per route). Platform administrators only.
- **D2 — Persistence:** one new table `onboarding_cases` (additive migration), with an optimistic-concurrency
  `revision`, JSON `details` / `modeConfig` written only through a strict allow-list sanitizer, searchable copies
  of the restaurant name and lower-cased owner e-mail, and a partial unique index for one open case per lead.
- **D3 — Audit:** `onboarding.created`, `onboarding.submitted_for_review`, `onboarding.cancelled`. Autosave edits
  are not audited one by one (the row keeps `updatedByAdminId` / `updatedAt`). Audit details never contain a
  password or the owner's phone.
- **D4 — Step-1 validation:** server-side, reusing `validateProvisionInput`'s rules (exported as
  `PROVISION_LIMITS`, `isValidOwnerEmail`, `isValidCurrencyCode`, `isValidTimezone`), `validateOwnerContact`,
  `validateAcquisitionInput`, `normalizePhone` / `normalizeUrl`. Drafts may be incomplete; problems are returned
  as stable codes.
- **D5 — Duplicates:** warnings only (existing owner account + the restaurants it owns, similar restaurant names,
  other open cases with the same owner e-mail or lead, landing requests with the same e-mail or phone). Nothing is
  attached; provisioning still refuses an existing e-mail (DEC-047).
- **D6 — Mode rules:** as in section 3; the choice is stored only. Package rule decided by the PO (section 7.3).
- **D7 — Lead integration:** as in section 5, including the "Start onboarding" action on the leads page.

### Acquisition fields

| Field | Where it will be persisted at provisioning (A3) |
|---|---|
| `sourceType`, `referringRestaurantId`, `sourceName` (also the salesperson for `SALES`), `sourcePlatform`, `sourceDetail`, `campaign` (the campaign name) | `RestaurantAcquisition`, inside the provisioning transaction, as today |
| `adReference` | **Only on the case** (`details.acquisition.adReference`); the acquisition model has no column for it |

No separate `campaignName` / `salesperson` fields were added: `campaign` and `sourceName` already hold them.

## 7. Product Owner decisions (2026-11-21)

### 7.1 Initial Owner password — DEC-047 kept (A-D1, decided)

- The Platform operator TYPES the owner's initial password, and only during **final provisioning** (A3). It is
  never entered in, or saved with, a draft.
- The password is never persisted in a draft (`details` / `modeConfig`), the audit log, server logs, URLs,
  analytics, saved responses or review packages. It is validated and hashed only by the existing password service
  (`PasswordHasherService`, Argon2id, 8–128 characters) inside `provisionRestaurant`.
- No invitation e-mail, no reset-token delivery and no auto-generated credential in this milestone. The handoff
  of the password to the owner stays manual.
- Retry: if provisioning itself has to run again (it never completed), the operator must re-enter the password
  securely. A retry after the restaurant was already provisioned (FAILED / partial state with `restaurant_id` set)
  needs no password, because provisioning is never run twice.
- **Future enhancement only (not decided for build):** server-generated one-time password or invitation /
  activation link.
- This build: the draft sanitizer is an allow-list, so every password-like key (`password`, `ownerPassword`,
  `pass`, `pwd`, `passwd`, `initialPassword`, `secret`, …) at any depth of `details` or `modeConfig` refuses the
  whole write (`400 ONBOARDING_INPUT_INVALID`); unit and e2e tests check that nothing password-like is stored.

### 7.2 Lead ↔ demo association — narrow extension of DEC-060 (A-D2, decided)

- An onboarding case may reference an existing marketing lead (`SignupLead`) **and** the temporary demo created
  for that lead (`onboarding_cases.demo_id`). The association lives only in the Platform onboarding domain.
- The demo itself is unchanged: no lead details in the public demo; `DemoService` expiry, access tokens,
  restrictions and purge are untouched; there is no automatic demo → trial / customer conversion.
- Purge: `demo_id` is `ON DELETE SET NULL`, so purging the demo drops the link (the purge never follows SET NULL
  edges and never deletes a case). **A4 plan:** before / when the demo goes away, the case keeps a non-secret
  sales-history snapshot — demo kind, label, created-at, expires-at, removed-at / purged flag, package name — and
  **never** the access token or link. Not implemented in this build (no demo is created by the wizard yet).
- Recorded as a dated note under DEC-060 in `PROJECT_DECISIONS.md`.

### 7.3 Package selection (A-D3, decided)

- REAL and TRIAL require an explicit **ACTIVE** package before final provisioning; no null-package shortcut in the
  wizard. Step 2 is incomplete without it (`PACKAGE_REQUIRED`), and a package archived after it was chosen makes
  step 2 incomplete again (`PACKAGE_NOT_AVAILABLE`, recomputed on every read; submit-for-review is refused).
- Unchanged: the legacy Platform "New restaurant" form and the CLI (null package still allowed there),
  `DemoService`'s optional package, trial settings (`TRIAL_DISABLED`, default length / package) and the
  subscription validation of `createTrial` / `create` at provisioning time. _(2026-11-22: the default package is
  now a recommendation only, not prefilled — 7.3.1.)_
- Selecting a mode in a draft starts nothing (no restaurant, subscription, trial or demo).

#### 7.3.1 Explicit trial package confirmation (Product Owner decision, 2026-11-22)

Refines 7.3. Before this decision the A2 build copied the global trial default package (`PlatformTrialSettings`,
DEC-056) into the case when TRIAL was chosen, so it counted as the operator's selection. Now:

- The global trial default package is a **recommendation** only. The case view still exposes it
  (`trialSettings.defaultPackageId`); the console marks it "Recommended" / "موصى بها" in the package list and offers
  a one-click "Use recommended package" / "استخدم الباقة الموصى بها". Selecting it (or any other ACTIVE package) is the
  explicit act; there is no extra confirmation dialog. An archived default is never recommended.
- `modeConfig.packageId` and the `package_id` column only ever hold a package the operator sent. Until then step 2
  reports `PACKAGE_REQUIRED` and submit-for-review is refused (`422 ONBOARDING_INCOMPLETE`).
- REAL needs an explicitly selected ACTIVE package as before (it never had a default).
- **Mode change:** any change of mode (REAL / TRIAL / DEMO / none) clears the package selection unless the same PATCH
  supplies `modeConfig.packageId`. A package chosen for one mode is therefore never silently carried into another.
  For DEMO the cleared value means "no package (every feature)", the documented optional-package default of a demo
  (DEC-060, A-D3 unchanged). `trialDays`, `demoKind` and `demoHours` are kept across mode changes: each is read only
  by its own mode and stays visible and editable.
- DEC-056 is otherwise unchanged: choosing TRIAL still prefills a missing trial length from the global default
  length, `TRIAL_DISABLED` still applies, and a global default affects new choices only.
- Submit-for-review re-reads the package and, in the same guarded write, requires it to still be ACTIVE (a package
  archived between the evaluation and the write refuses the submit with `PACKAGE_NOT_AVAILABLE`).
- **A3 requirement:** final provisioning must again re-validate that the explicitly selected package exists and is
  ACTIVE before anything is created, and must never fall back to the trial default package.
- Saved drafts and the optimistic `revision` checks are unchanged. The track is unmerged, so no production draft
  holds an auto-filled package.

### 7.4 Lead status after onboarding (A-D4, decided 2026-11-21 — not implemented yet, A4)

- REAL / TRIAL: the case may set its lead to `DONE` only after successful account delivery / handoff
  (`DELIVERED`). Creating the restaurant (PROVISIONING / MENU_SETUP / READY) does not complete the lead.
- DEMO: the lead normally stays (or is set) `CONTACTED` — the prospect is not converted.
- Never downgrade a lead that is already `DONE` or `DISMISSED`; respect an intentional manual change by another
  Platform operator (the automated write is skipped when the lead is no longer in the state the case expects).
- Automated transitions are idempotent, audited and concurrency-safe: compare-and-set on the expected current
  status (`updateMany … where status = expected`), audited as a Platform action. Note: today
  `PlatformLeadsService.update` is a plain `update` and writes no audit entry; A4 needs a guarded variant.
- Onboarding status and lead status remain distinct concepts. An authorized operator can reopen / update the lead
  manually through the existing leads workflow (DEC-053).
- A1 + A2: the wizard reads the lead (prefill, duplicates) but never writes `signup_leads`.
- **Clarified 2026-11-21 (Product Owner, final clarifications) — DEMO:** when the temporary demo link has actually
  been **handed over** to the prospect, an associated `NEW` lead may move to `CONTACTED`. Creating the demo alone
  changes nothing. An existing `CONTACTED` is kept; `DONE` / `DISMISSED` are never overwritten automatically.
  REAL / TRIAL: `DONE` only after successful handoff (unchanged). Every automated transition is audited, idempotent
  and concurrency-safe. The bullet "DEMO: the lead normally stays (or is set) `CONTACTED`" above is read with this
  clarification (the only automated DEMO write is `NEW → CONTACTED` at demo handoff).

### 7.5 Platform Menu Writer (A-D5, approved for A3 2026-11-21 — not started)

- A dedicated, narrowly scoped, audited Platform writer behind `PlatformCsrfGuard` + `PlatformAuthGuard`; explicit
  restaurant and resource ownership validation (every Menu / Category / Product id re-checked against the case's
  `restaurant_id`); no Staff routes, no Owner impersonation (AUTH_TENANCY §73).
- Reuses the existing Menu / Category / Product / Variant / Modifier and translation rules (DEC-040 blockers,
  DEC-041 full size prices, default-locale name required); no bypass of business validation or package
  entitlements; never writes arbitrary DB rows from client JSON.
- Idempotent publishing: resumable after a partial failure, no duplication after a network retry (progress keyed
  on the case, e.g. the existing `provisioning_key` + recorded step); full audit events without secrets.
- Integration tests on real PostgreSQL.

### 7.6 Menu import before restaurant creation — staging only (A-D6, approved 2026-11-21 — not started)

- The upload and extraction result live only in a protected, bounded onboarding draft. Today the Staff import keeps
  files **in memory only** (Multer, never written to disk; DEC-040 "source file not stored") with 1–10 images or
  one PDF / spreadsheet, 10 MB each, 40 MB total (`menu-import-file.ts`), ≤ 80 categories / 800 products
  (`menu-import-extraction.ts`) and zip-bomb / row limits for `.xlsx` (`menu-import-sheet.ts`). The staged design
  keeps those limits, adds a per-case quota, and stores only the **normalized, reviewed draft** (not the file) on
  the case, with retention / cleanup (draft cleared when the case is cancelled / delivered or after an expiry).
- Restaurant-free building blocks safe to reuse: `inspectMenuFiles` (magic bytes, sizes), `readMenuTemplate` /
  `rowsToExtraction`, `normalizeExtraction`, `cleanPrice`, and the `MenuImportExtractor` port (its input is only
  `{ files, languageHint }`; the router reads platform AI settings, DEC-059 — the module exports nothing today, so
  A3 must export it explicitly).
- **Never** call the tenant-scoped `MenuImportService` (`MenuImportJob` requires a restaurant, a target Menu and a
  creator `User`) under a fabricated restaurant identity.
- Human review of extracted names, categories, variants and prices before approval; missing price / default-locale
  name stay blockers. Nothing is published before an authorized restaurant exists; at final provisioning the
  approved draft is attached through the Platform menu writer (7.5) after rechecking package entitlements
  (`MENU_IMPORT` is opt-in, DEC-057) and file / import eligibility. An incomplete menu never yields READY.
- Simplest staged approach; no second general-purpose import engine.

### 7.7 QR preview (A-D7, approved 2026-11-21 — not started)

- Reuse the Backend-generated Generic QR (`provisionRestaurant` creates one ACTIVE `GENERIC` `QrCode`) and the
  backend-built menu URL (`restaurantMenuUrl`). Only after tenant provisioning: real QR preview, copy link and
  export options. Never a fake QR or a pre-provisioning placeholder presented as ready to share.
- Private demo-access links / tokens are shown to authorized Platform operators only (once, as today).
- Menu readiness is confirmed separately from QR existence: a QR existing does not mean the menu is ready.
- **A4 decision point:** QR images are rendered client-side today only in `apps/web` (`qrcode` package,
  `apps/web/src/lib/qr/render.ts`); `apps/platform` has no QR library. Options: add `qrcode` to `apps/platform`
  (dependency policy review), or link to the existing web QR export. Not decided; no dependency added.
- **Decided 2026-11-21 (Product Owner, final clarifications)** — resolves the decision point above: the Platform
  handoff step renders the QR preview and offers a **PNG download** with the established `qrcode` library (added to
  `apps/platform` in A4; same package already used by `apps/web`). The encoded URL is the authoritative
  Backend-generated Guest Menu URL. QR rendering conventions from `apps/web` (`src/lib/qr/render.ts`) are reused
  where practical, without coupling Platform authentication to Staff sessions (the Platform console calls only
  Platform-guarded API routes). No placeholder QR is generated before provisioning. The existing Staff QR export
  features stay unchanged. Implementation: A4 handoff step (needs a provisioned restaurant from A3) — not started.

## 8. Not in this build

Provisioning, menu preparation (import or manual), trial / demo creation, guest-menu verification, handoff
(credentials, links, QR), lead status changes, case assignment UI, and editing a case after it leaves
READY_FOR_REVIEW. The UI shows steps 3 and 5 as "Not available yet in this build" with no fake success.
(2026-11-21: the policies for these are approved — 7.4–7.7 — but A3 / A4 have not started.)

## 9. Mode first, DEMO short path, AI-prepared menu and list removal (Product Owner request, 2026-11-23)

Technical contract: `docs/02-technical/ONBOARDING_API_AND_PERSISTENCE.md` §6.

### 9.1 Choose the onboarding type first

- Step 1 is the onboarding type: REAL, TRIAL or DEMO. A new case opens on it; a resumed case opens on the first
  incomplete step of its own path.
- REAL / TRIAL: type (with package / trial length) → customer & restaurant → menu → review → handoff, with every
  existing validation unchanged (customer, package, trial, menu, import review, provisioning).
- DEMO: type → review → handoff. The type step asks only for an internal demo name (1–80 characters, stored as the
  case's restaurant name and passed to the demo service as the demo label), the demo kind, the duration and an
  optional package. No owner contact, acquisition source, branch, locale or menu is asked for or validated, and the
  server accepts submit-for-review and provisioning of a DEMO without them (no placeholder data). Demo expiry, purge,
  private link, handoff, idempotency and concurrency rules are unchanged.
- A case started from a lead keeps the lead association for a DEMO too (the demo name is prefilled from the lead's
  restaurant name); demo handoff still moves a `NEW` lead to `CONTACTED` only (section 7.4).
- Switching type keeps compatible draft data (customer details, menu draft, trial length, demo kind / hours / name);
  the package is cleared as in 7.3.1 and the console says so instead of clearing it silently. Progress, step numbers,
  back / next, completion and the review summary follow the current type's path.

### 9.2 AI prompt helper in the onboarding Menu step

- An optional, collapsed "Prepare your menu with ChatGPT or another AI" section explains: attach the menu photos /
  PDF to any AI chat, paste the copied instructions, download the Excel file it makes, then upload it here. It shows
  the canonical Menu Import instructions (MENU_IMPORT_SPEC #3A) with a copy button (success and manual-copy fallback
  messages) and the same Excel template as the Staff Import page.
- It never calls Wayta or any AI service, never changes the case and never uses an import attempt; only uploading a
  file does, through the unchanged staged import (file checks, quota, review, expiry, replacement confirmation).

### 9.3 Removing a case from the outer list

- Desktop rows and mobile cards have a "Remove" action. Nothing is hard-deleted through it: no case, restaurant,
  account, subscription, order history, demo, lead or audit record.
- An open case (draft, under review, failed) is **cancelled with the existing cancellation rules and archived**; an
  already finished case (cancelled, delivered) is only archived. Archived cases leave the active list, stay in the
  "Archive" filter with their full history, and can be restored (their status does not change).
- A routine draft (no lead, not submitted, no menu, nothing created) needs one short confirmation. Anything else lists
  in plain words what changes — linked request kept and freed for a new onboarding, review dropped, prepared menu
  discarded, restaurant account or demo kept, delivered account unchanged — and requires an explicit "I understand".
- Refused: a case whose provisioning is running, and a READY case awaiting handoff (including a live demo). The
  READY purged-and-never-delivered DEMO keeps its existing rule: the operator must also confirm the link was never
  handed over.
- The server decides and enforces all of this under the case lock with Platform authorization, CSRF, the revision and
  the acknowledged impacts, and audits it (`onboarding.cancelled` / `onboarding.archived` / `onboarding.restored`).
