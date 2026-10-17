# Menu Import Specification

> **Status: Accepted (2026-10-17); in implementation.** The owner's decisions on the open questions are recorded in
> section 27. It becomes authoritative when DEC-040 is accepted, and the import
> is built after Product Variants (DEC-041).

## Document Purpose

This document defines how a Restaurant creates its menu from an existing file:
a photo, a PDF or an Excel sheet. It covers the Domain behavior, the Draft data
model, the Staff API, the contract with n8n, security, limits and the review UX.

It implements `MENU_SPEC.md` #78 and follows `I18N_SPEC.md` #63 and DEC-039:
**AI output is always a Draft that a Staff member reviews and approves.**

---

# 1. Purpose

Typing 200 products by hand is the largest onboarding cost. Menu Import turns a
file the Restaurant already has into a reviewable Draft, so setup takes minutes.

It is an onboarding accelerator. It is not required to run the Platform and
ordering must work without it.

---

# 2. What It Is Not

V1 Menu Import does not:

- fetch a menu from a URL, a website or a map listing
- extract product photos
- detect Modifiers, Variants, allergens, nutrition or dietary tags
- translate text into languages that are not written on the menu
- publish anything without a Staff review
- keep re-syncing with a source file
- update or delete existing Products

Each can be a later proposal. None is implied.

---

# 3. Sources

| Source | Accepted files | Notes |
|---|---|---|
| Image | `.jpg` `.jpeg` `.png` `.webp` | one image per import |
| PDF | `.pdf` | digital or scanned; multi-page |
| Spreadsheet | `.xlsx` `.xls` | rows are read as a table |

Maximum file size is **10 MB**. Maximum result is **80 categories** and
**800 products**; anything beyond is dropped and reported as a warning.

---

# 4. Actors and Permission

Only Restaurant Staff with `menu.manage` and **Restaurant-wide Branch scope**
(`AllBranchesRequiredGuard`) can import, because the result changes the
Restaurant-wide Menu (`API_CONVENTIONS.md` #108A). A Branch-scoped Membership
receives the same generic `403 PERMISSION_DENIED` as any caller without the
Permission.

Guests, the AI Assistant and n8n never start or approve an import.

---

# 5. Core Flow

```text
Upload file
→ Import Job (PROCESSING)
→ Extraction (Backend calls n8n, n8n calls the model)
→ Draft (READY_FOR_REVIEW)
→ Staff review and edit
→ Approve
→ Categories and Products created (one transaction)
```

The Draft is the only place AI output lives. Approval is the only step that
creates real Menu content.

---

# 6. Import Job Statuses

| Status | Meaning |
|---|---|
| `PROCESSING` | file accepted, extraction in progress |
| `READY_FOR_REVIEW` | Draft stored, waiting for Staff |
| `APPROVED` | Draft turned into Menu content |
| `DISCARDED` | Staff abandoned the Draft |
| `FAILED` | extraction did not produce a usable Draft |

Allowed transitions:

```text
PROCESSING       → READY_FOR_REVIEW | FAILED
READY_FOR_REVIEW → APPROVED | DISCARDED
```

`APPROVED`, `DISCARDED` and `FAILED` are terminal. A new attempt is a new Job.

---

# 7. One Active Job

A Restaurant can have **one `PROCESSING` Job at a time**. A second upload while
one is running returns `409 IMPORT_ALREADY_RUNNING`.

This bounds cost and keeps behavior simple. It is enforced by a partial unique
index (committed SQL migration, `CLAUDE.md` #45), not only by a check in code.

---

# 8. Stuck Jobs

V1 has no scheduler. A `PROCESSING` Job older than **10 minutes** is reported as
`FAILED` with `errorCode = EXTRACTION_TIMEOUT` when it is read, and the status is
persisted at that moment. This is the same read-time evaluation used for
Product Discount expiry (DEC-036).

An API restart during extraction therefore ends as a clean failure and the Staff
member uploads again.

---

# 9. The Source File Is Not Stored

The uploaded file is held in memory for the duration of the extraction and is
**not persisted**: not on disk, not in the database, not in the Draft.

Reasons: no new storage surface for PDF / Excel, less retained data, and the
Storage module is image-only (`SECURITY_SPEC.md` #91-#102).

Consequence: a failed Job cannot be retried from the stored file. Staff upload
again. The Job keeps only the display file name (sanitized), MIME type and size.

---

# 10. Extraction Execution

1. The Backend validates the file (section 21) and creates the Job
   (`PROCESSING`), then answers `202 Accepted`.
2. A background task in the API process sends the file to the n8n webhook
   (section 17) and waits up to **5 minutes**.
3. The Backend validates the response itself (section 18). It does not trust
   n8n's cleaning.
4. The Draft rows and the final Job status are written in **one short
   transaction**. No transaction is open while the n8n call runs
   (`CLAUDE.md` #47-#48).

No queue, broker or worker process is introduced (`AGENTS.md` #5). The cost is
that an API restart loses an in-flight Job (section 8), which is acceptable at
Pilot scale.

---

# 11. Languages

The model detects which languages are written on the file. Nothing is chosen by
the Staff member and nothing is translated by the import.

For every category and product the Draft carries one translation per language
that is **actually written** for that item. An Arabic and English menu gives
both; an Arabic-only menu gives Arabic only.

When a name is written in two languages for the same item, the two texts are
**two translations of one name**, never "name + description".

The optional language hint (`ar`, `en` or `auto`) only helps the model on
ambiguous files. `auto` is the default.

---

# 12. Mapping Detected Languages to the Restaurant

Detected languages are compared with the Restaurant's **active** Locales
(`restaurant_locales`):

| Case | Behavior |
|---|---|
| Detected and active | imported |
| Detected, not active | shown in review as "found but not enabled"; its text is **ignored** at approval; Staff may enable the language in Settings first |
| Active, not detected | left empty; later filled by AI translation (DEC-039) or by hand |

The import never enables or disables a Restaurant language.

---

# 13. Default Locale Is Required

Every customer-facing entity needs a name in `restaurants.defaultLocale`
(`I18N_SPEC.md` #35, `MENU_SPEC.md` #81, DEC-037).

An item without a name in the default Locale is a **blocker**: it cannot be
approved. The review offers two explicit ways out:

- type the missing name, or "copy the text found in `<language>`" (a visible,
  editable copy, never silent);
- change the Restaurant's default language (DEC-037) when the menu is really in
  another language.

---

# 14. Prices

- Prices are read as printed and stored as `Decimal(14,2)`; API values are
  strings (`CLAUDE.md` #27).
- Arabic-Indic digits, decimal commas and thousands separators are normalized.
  A value that cannot be parsed safely is `null`, never guessed.
- A missing price is a **blocker**. Staff enter a price or exclude the item.
  The Platform never invents `0.00` for a missing price.

---

# 15. Sizes and Price Options

When one product shows several prices (for example Small / Large), the model
returns the smallest as the price and the sizes as `priceOptions`.

Product Variants (DEC-041) are built **before** the import, so approval maps
sizes to real Variants:

- each size becomes a Variant with its printed price, unchanged (Small 60,
  Medium 80, Large 100); the Product price follows automatically as the
  cheapest active size;
- the smallest size is the default Variant;
- Variant names are translated like Products (one translation per detected
  language), and a Variant needs a name in the default Locale.

A size whose label is missing or whose price cannot be parsed stays out of the
Variants and is shown in review as a warning. The Draft keeps `priceOptions`
as the source for this mapping.

---

# 16. Existing Menu Content

Approval never changes or removes existing content.

Matching is done on the **default-Locale name**, case-insensitive after trimming
and removing diacritics / kashida:

- a Draft category that matches an existing category of the target Menu is
  proposed as **"add to existing"** (Staff can switch to "create new");
- a Draft product that matches an existing product in the target category is
  flagged `ALREADY_EXISTS` and is **excluded by default**.

This makes importing the same file twice harmless.

---

# 17. Contract With n8n

n8n is the model runner only (DEC-016, DEC-039). It does not store state, does
not know the Restaurant and does not call the Backend.

**Trigger:** a private Webhook, in addition to the existing Form Trigger used for
manual testing. It is authenticated with a shared secret header and, when
available, an HMAC signature with timestamp (`N8N_ORCHESTRATION.md` #30-#32).
The secret lives in n8n credentials and Backend configuration, never in Git.

**Request (schemaVersion 1):**

```json
{
  "schemaVersion": 1,
  "requestId": "opaque id for logs",
  "sourceType": "IMAGE | PDF | SPREADSHEET",
  "fileName": "menu.pdf",
  "mimeType": "application/pdf",
  "fileBase64": "...",
  "languageHint": "auto | ar | en"
}
```

**Response:** the cleaned result of the workflow:

```json
{
  "schemaVersion": 1,
  "status": "EXTRACTED | FAILED",
  "errorCode": null,
  "languages": ["ar", "en"],
  "stats": { "categories": 18, "products": 224, "missingPrice": 0 },
  "warnings": [],
  "categories": [
    {
      "translations": { "ar": { "name": "..." }, "en": { "name": "..." } },
      "products": [
        {
          "translations": {
            "ar": { "name": "...", "description": null },
            "en": { "name": "...", "description": null }
          },
          "price": "46.00",
          "priceOptions": [],
          "confidence": "high",
          "flags": []
        }
      ]
    }
  ]
}
```

The reference workflow is `infra/n8n/workflows/menu-extract-simple.json`. The
model, endpoint and credentials are configured inside n8n and are not part of
the contract.

---

# 18. The Backend Re-Validates Everything

n8n output is **untrusted input**, like any model output (`CLAUDE.md` #72):

- strict shape and `schemaVersion` check; otherwise `INVALID_EXTRACTION_RESULT`;
- language codes must be two-letter codes; at most 5 per file;
- lengths capped (name 120, description 500, label 60);
- prices parsed again with Decimal-safe code; anything unsafe becomes `null`;
- counts capped (80 categories, 800 products);
- text is stored as plain text and always rendered as text, never as HTML.

---

# 19. Draft Data Model

Draft tables are additive and Tenant-scoped (every row carries `restaurantId`).
Translations use child tables, never language columns (`CLAUDE.md` #29).

| Table | Purpose |
|---|---|
| `menu_import_jobs` | one row per upload |
| `menu_import_categories` | Draft categories of a Job |
| `menu_import_category_translations` | `locale`, `name` |
| `menu_import_products` | Draft products |
| `menu_import_product_translations` | `locale`, `name`, `description` |

`menu_import_jobs` (main columns):

| Column | Notes |
|---|---|
| `id`, `publicId` | opaque `publicId` is used in URLs |
| `restaurantId` | Tenant boundary |
| `targetMenuId` | Menu that receives the result |
| `createdByUserId` | Staff member |
| `status` | section 6 |
| `sourceType`, `sourceFileName`, `sourceMimeType`, `sourceSizeBytes` | no file content |
| `languageHint`, `detectedLocales` | |
| `modelName` | for cost and quality tracking |
| `errorCode` | stable code only, never raw provider text |
| `startedAt`, `finishedAt`, `approvedAt` | |

`menu_import_products` (main columns): `jobId`, `draftCategoryId`,
`displayOrder`, `price` (`Decimal(14,2)`, nullable), `priceOptions` (JSON, read
only reference), `confidence`, `flags`, `included` (boolean),
`matchedProductId` (existing product when `ALREADY_EXISTS`),
`createdProductId` (set at approval).

`menu_import_categories`: `jobId`, `displayOrder`, `included`,
`matchedCategoryId`, `createdCategoryId`.

Flags are a closed set:
`MISSING_PRICE`, `HAS_PRICE_OPTIONS`, `LOW_CONFIDENCE`, `MISSING_TRANSLATION`,
`MISSING_DEFAULT_NAME`, `ALREADY_EXISTS`.

The partial unique index for one `PROCESSING` Job per Restaurant is committed
SQL (section 7). A schema change follows the project migration policy: backup,
scratch restore, verification, sandbox, then development.

---

# 20. API

Base: `/api/v1/restaurants/{restaurantId}/menu-imports`. Every route uses
`AuthGuard → RestaurantAccessGuard → PermissionGuard(menu.manage)`; mutations add
`CsrfGuard` and `AllBranchesRequiredGuard`. Every query is scoped by
`restaurantId` taken from the authenticated context, never from the body.

| Method and path | Purpose |
|---|---|
| `POST /` (multipart: `file`, `targetMenuId`, `languageHint?`) | upload, `202` with `{ publicId, status }` |
| `GET /` | recent Jobs of the Restaurant |
| `GET /{importId}` | Job status, counts, warnings, error code |
| `GET /{importId}/draft` | categories and products with translations and flags |
| `PATCH /{importId}/categories/{draftCategoryId}` | edit names, include / exclude, match decision |
| `PATCH /{importId}/products/{draftProductId}` | edit names, descriptions, price, include / exclude |
| `POST /{importId}/approve` | create Menu content from the Draft |
| `POST /{importId}/discard` | abandon the Draft |

Approve body:

```json
{ "productStatus": "ACTIVE | INACTIVE" }
```

Stable errors (the frontend never parses messages, `CLAUDE.md` #92):

| Code | HTTP | When |
|---|---|---|
| `IMPORT_FILE_INVALID` | 422 | unsupported or corrupt file |
| `IMPORT_FILE_TOO_LARGE` | 413 | over 10 MB |
| `IMPORT_ALREADY_RUNNING` | 409 | a Job is already `PROCESSING` |
| `IMPORT_NOT_FOUND` | 404 | unknown or foreign Job |
| `IMPORT_NOT_READY` | 409 | action needs `READY_FOR_REVIEW` |
| `IMPORT_DRAFT_INCOMPLETE` | 422 | blockers remain; response lists them |
| `IMPORT_ALREADY_APPROVED` | 409 | Job already approved |
| `AI_UNAVAILABLE` | 503 | extraction service not reachable |

AI failure never affects the Menu or ordering APIs (`CLAUDE.md` #43).

---

# 21. Upload Validation

- Validate by **file content** (magic bytes), not by extension or declared MIME
  type (`SECURITY_SPEC.md` #92).
- Enforce the 10 MB limit before reading the whole body into memory.
- Generate no storage path from the file name; the sanitized display name is
  informational only.
- PDF and Excel files are containers. The Backend does not open or execute
  them; they are passed to n8n as bytes and size-limited.
- The route has its own rate limit (`API_CONVENTIONS.md` #128).

---

# 22. Approval

Approval runs in **one transaction** and is all-or-nothing:

1. Re-check the Job (`READY_FOR_REVIEW`, same Restaurant) and recompute the
   blockers from the stored Draft. The client's view is never trusted.
2. Create (or reuse) categories, then products, with translations for active
   Locales only.
3. Product `basePrice` comes from the Draft price; `availability = AVAILABLE`;
   `status` from the request; display order follows the Draft order, appended
   after existing content.
4. Record `createdCategoryId` / `createdProductId` and set the Job `APPROVED`.

The Product creation rules reuse the existing Menu services so validation,
`publicId` generation and ordering stay identical to the normal editor. Approval
is idempotent: a second call answers `409 IMPORT_ALREADY_APPROVED` and creates
nothing.

Staff are shown how many items were created, skipped and why.

---

# 23. Blockers vs Warnings

**Blockers** stop approval of the affected item (the item can be excluded
instead):

- missing price
- missing name in the default Locale

**Warnings** never block:

- low confidence
- missing translation in another active Locale
- has price options
- already exists (excluded by default)

---

# 24. Limits and Cost

Menu Import is a mostly one-time onboarding action, so its cost is absorbed by
the Platform for now. **No per-Restaurant allowance is built in this phase.**

- Abuse protection stays: one active Job per Restaurant (section 7) and a rate
  limit on the upload route.
- `menu_import_jobs` (`modelName`, `status`, `createdAt`) is the usage record,
  so a limit can be added later without a migration of history.
- Cost estimation, provider plan and per-Restaurant limits are decided during
  pricing, after the application is complete (DEC-039 follow-up).

DEC-039 asks for a shared AI foundation before AI features. This feature starts
with the Jobs table as its usage record and extracts a shared foundation when
AI translation arrives.

---

# 25. Security and Privacy

- Staff only; Tenant scoped; Branch scope requirement as in section 4.
- n8n receives only the file and the hint. It never receives the Restaurant,
  the user, or any credential.
- The shared secret and the provider key are configuration, validated at
  startup (`CLAUDE.md` #73). Never in the repository, never in `NEXT_PUBLIC_*`.
- Logs never contain file bytes, base64, or the full model output. They contain
  the Job `publicId`, status, counts, duration and error code.
- The menu text is sent to a third-party model provider. A menu is content the
  Restaurant already publishes to its Guests and contains no Guest personal
  data, so provider data terms are not a blocker. The provider and plan are
  decided at pricing time (DEC-039).
- Prompt injection: menu text is declared data in the prompt, and the output is
  re-validated and rendered as text only (sections 17-18).

---

# 26. Review UX (Staff)

Entry: a **Import menu** action on the Menu management page (visible with
`menu.manage`).

1. **Upload:** file drop area, target Menu, optional language hint. Explains
   that it can take a few minutes and that the user may leave the page.
2. **Processing:** a clear state with the Job in the recent list; the page
   polls the Job status.
3. **Review:** categories as groups, products as rows. Each row has an include
   checkbox, a name per active Locale, a price and flag chips. A summary shows
   totals, blockers and warnings; "needs attention" filter first.
4. **Approve:** disabled while blockers remain; asks for the product status
   (publish now or create hidden); shows the result counts.

Rules: RTL and LTR from the first screen, Arabic and English strings through
the Staff i18n catalog, keyboard operable, visible focus, no layout shift while
polling. Visual design follows `DESIGN_SYSTEM.md` and `STAFF_DASHBOARD_UX_SPEC.md`
and is reviewed on a mockup before implementation.

---

# 27. Decisions (2026-10-16)

1. **Status of approved products:** Staff choose at approval; default is
   **publish now (`ACTIVE`)**.
2. **Sizes:** become real Product Variants (DEC-041), so Variants are built
   before the import (section 15).
3. **Cost and limits:** the import is free for Restaurants and is mostly a
   one-time action. No allowance, cost estimate or provider-plan work now; they
   are decided during pricing, after the application is complete (section 24).
4. **Duplicates:** matching products are excluded by default and matching
   categories are reused (section 16).
5. **Source file:** not stored in this phase (section 9). The owner accepts
   storing it, so this can be added later if re-running from the file is needed.
6. **Provider and plan:** development and the first Restaurants use the
   configured n8n endpoint (currently Gemini); the model can change without code
   changes. Plan and data terms are not a blocker (section 25).

---

# 28. Implementation Slices

Each slice is reviewed before the next.

0. **Product Variants (DEC-041)** are implemented first; they are a separate
   feature and the import depends on them only at approval.
1. **Documentation:** this specification and DEC-040.
2. **Backend:** migration, Job + Draft storage, upload validation, n8n client
   with response validation, Draft read / edit, approve (including Variants),
   discard. Tests use a fake n8n.
3. **n8n:** private webhook entry with authentication and a `Respond` node for
   the existing extraction nodes; deployment configuration.
4. **Web:** import dialog and review screen.
5. **Hardening:** evaluation fixtures, runbook note.

---

# 29. Test Plan

**Backend**

- Tenant isolation: Job and Draft of another Restaurant are `404`.
- Permission: `menu.manage` and Restaurant-wide scope required; other roles
  `403`.
- File validation: wrong type, corrupt, oversize, extension / MIME mismatch.
- One active Job; stuck Job becomes `FAILED` on read.
- n8n failure, timeout, malformed and hostile responses create no Menu content.
- Approval is atomic, idempotent, honors blockers and default Locale, never
  changes existing content, never creates duplicates on a second import.
- Decimal handling for prices.
- A failed import never affects Menu or ordering endpoints.

**End to end**

```text
Upload fixture (fake n8n)
→ review and fix a blocker
→ approve
→ products visible in the Guest menu in both languages
```

**Extraction quality fixtures** (run against the n8n workflow, not in CI):
Arabic only, English only, Arabic + English (real bilingual PDF), Excel,
scanned photo, menu with sizes, menu with no prices.

---

# 30. Planned Amendments After Acceptance

When DEC-040 is accepted, these documents get short cross-reference notes:

- `MENU_SPEC.md` #78 (Menu Import)
- `API_CONVENTIONS.md` (new section for `menu-imports`, error codes)
- `DATABASE_SPEC.md` (Draft tables, partial unique index)
- `N8N_ORCHESTRATION.md` (menu extraction webhook)
- `PROJECT_DECISIONS.md` (DEC-039 cross-reference)
