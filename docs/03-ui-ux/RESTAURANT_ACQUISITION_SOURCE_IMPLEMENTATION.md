# Restaurant Acquisition Source — Implementation Contract (Draft)

**Branch:** `feat/restaurant-acquisition-source`
**Base:** `main` at `d352bc8ba2d7aca27c82947f090474f318c46fc3`.
**Status:** Draft implementation in progress (schema + migration SQL + source validation + atomic Platform provisioning integration + create form + Platform detail source card). **No database migration has been applied; end-to-end browser QA and local DB tests are pending.**

## Product need

When a Platform Administrator creates a Restaurant in the Platform Console, record **how that Restaurant became a customer** and **the specific person/platform/channel that referred or acquired it**. This is private ElmoTech business information: it must never appear in Staff, Guest Menu or public API responses.

The current Platform Console uses `NewRestaurantForm.tsx` -> `POST /api/v1/platform/restaurants` -> `PlatformRestaurantCreationService.create` -> `provisionRestaurant`, which must keep its account/owner/branch/QR/setup safety contract.

## First-release source taxonomy

| Code | Admin label | Required detail |
| --- | --- | --- |
| `CUSTOMER_REFERRAL` | Existing customer referral | Search and select an existing Restaurant; **also support a free-text referrer name** if the referring customer is not registered |
| `EMPLOYEE_REFERRAL` | Employee referral | Choose a known Platform Admin when applicable, or record an employee's name as text. ElmoTech personnel are **not** necessarily Platform Admins |
| `SALES` | Sales | Name of salesperson or team, plus optional campaign/notes; don't assume Sales employees have console accounts |
| `SOCIAL_MEDIA` | Social media | Required platform: Facebook, Instagram, TikTok, WhatsApp, LinkedIn, YouTube, X or Other; optional campaign/account |
| `PAID_AD` | Paid advertising | Advertising platform and optional campaign identifier/name |
| `WEBSITE` | Website / search | Specific source (e.g., company website, Google Search) |
| `DIRECT` | Direct inquiry / walk-in | Optional context (phone, office, event, etc.) |
| `OTHER` | Other | Required description |
| `UNKNOWN` | Not specified | Backward-compatible state for historic entries / CLI creation only, displayed as Unknown rather than invented source |

**UX:** One clear 'How did this customer hear about Wayta?' selector in the New Restaurant form. Only the relevant secondary controls appear, with responsive/mobile layout and AR RTL/EN LTR. Avoid asking for every possible field. A source detail should be mandatory when specificity is necessary; avoid false metadata. A searchable list of existing Restaurants can reuse Platform Admin's paged, tenant-wide Restaurant list with server-side search; never load unbounded customer data into the client.

**Referrer selection:** Preserve both a stable referenced Restaurant ID (when selected) **and a human-readable name snapshot** so older attribution remains intelligible if a restaurant is later renamed. Free text is allowed only without a selected ref ID. Prevent self-referral on creation/update and reject unknown IDs. A referral can be from a previously registered account but must never leak its private owner details to another restaurant.

## Persistence and contract proposal

Prefer a dedicated `RestaurantAcquisition` record, uniquely keyed by `restaurantId`, plus:
- `sourceType` from a validated closed set,
- `sourceDetail` or normalized `sourcePlatform` according to type,
- optional `referringRestaurantId` and immutable `referringRestaurantNameSnapshot`,
- optional `referringAdminId` when actually a Platform Admin, and `employeeNameSnapshot`,
- optional `campaign` and `notes`,
- `recordedAt` and `updatedAt`, with Platform Admin identity/audit.

Review schema names and referential actions against Prisma conventions before adding a migration. In `POST /platform/restaurants`, persist attribution with creation, never separately **after** a successfully provisioned restaurant if an invalid attribution would leave a misleading partial success. Validate requested referrals **before** provisioning and persist atomically with restaurant creation (prefer one authoritative transaction); avoid trusting names submitted alongside selected IDs.

For older restaurants show 'Unknown/Not recorded' rather than backfill guesses. The Platform Admin may later edit/correct attribution on the Restaurant detail page, with an audit trail. Normal restaurant provisioning CLI must not be broken and should keep attribution optional/Unknown unless provided.

## Reporting and display

- New Restaurant: section called **Customer acquisition** before final Create button.
- Restaurant details: a read-only Source card, with edit action available to Platform Admin.
- Restaurants list: optional source filter after UX assessment; do not add clutter now.
- Later analytics: group by source/source platform, referrals, and campaigns. Store normalized codes; don't rely on parsing the display text.
- Keep Platform Audit for creation/update, recording source labels but never secrets.

## Security and compatibility

- Only `PlatformAuthGuard` and `PlatformCsrfGuard` protected Platform endpoints may read or edit.
- Do not expose attribution in Guest Menu responses, Staff auth/context, QR, or public lead APIs.
- Existing restaurants and source-free provisioning remain valid; new Platform form requires an intentional choice, but Backend accepts missing source for legacy clients/CLI only and stores `UNKNOWN`.
- Never convert the customer's initial password or owner email into 'source' metadata.
- No Production migrations, deployments, merges, or writes to the owner's local DB without a verified backup and owner approval.

## Required tests

- Valid/invalid/missing source detail per source type; social-platform labels; dependent-field reset on source change.
- An existing Restaurant referral ID is validated server-side; its name snapshot comes from the DB, not client input.
- Free-text referrers, employee names and sales names supported; unknown Platform Admin/Restaurant ID rejected.
- Failed attribution validation creates **no restaurant**, OWNER, branch, QR or setup row.
- Create and later edit actions appear in Platform Audit; historic Unknown behavior preserved.
- AR/EN localization, mobile layout, keyboard/focus, privacy/non-exposure in public/staff endpoints.
- Running code should update `AGENTS.md`-compatible decision/amendment docs and focused API/Web tests.

## Current implementation on this branch

- `apps/api/prisma/schema.prisma` and `20261114090000_restaurant_acquisition_source/migration.sql` add a private acquisition record with optional registered Restaurant referral and readable name snapshot. Existing restaurants are not backfilled.
- `apps/api/src/platform/restaurant-acquisition.ts` validates source-type dependent fields before provisioning; `provision-restaurant.ts` verifies a selected referring Restaurant and saves the attribution in the **same** transaction as the new Restaurant, OWNER, first Branch and QR.
- `NewRestaurantForm.tsx` and `AcquisitionSourceFields.tsx` collect source information dynamically; the existing-customer picker searches the Platform-admin-only restaurant API, while free text remains available for unregistered referrers.
- Platform Restaurant details expose the source privately; the Staff and public Guest contracts remain unchanged.
- Current first release **does not yet support editing a source after creation or source analytics**. Those are follow-on slices, not a completed capability.
- Branch-only GitHub Actions check Prisma schema, API/Platform type checks, focused tests, lint and formatting without connecting to a database. A green result is code-level CI, **not** DB/browser QA.

## Implementation slices

1. Schema + server-side validation + atomic provisioning integration + focused tests.
2. New Restaurant form with conditional fields, searchable existing restaurants, i18n and mobile UX.
3. Restaurant detail display/correction and platform audit.
4. Optional reporting/filtering, after QA and owner feedback.

**No functional implementation or QA is claimed by this contract alone.**
