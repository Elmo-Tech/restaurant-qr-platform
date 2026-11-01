# Restaurant Setup Checklist — Implementation & Release Gate

**Status:** Implemented on Draft PR #12 for code review and isolated-DB QA.
**Date:** 2026-10-31
**Stacked base:** `feat/staff-settings-form-feedback` (PR #11), then Menu Cards Hub (PR #10).
**Deployment:** **NOT authorized**. No migration has been executed in any environment.

## What exists in code

### Where the guest-facing user finds it

- On an **enrolled, active** restaurant's Dashboard, OWNER or full-branch-scope MANAGER with restaurant.view sees a compact `جهّز مطعمك` card **after urgent AttentionPanel** and before Quick Actions. Existing restaurants without enrollment are unaffected.
- Restaurant Settings Hub has a quiet "Start/Open setup guide" entry (not a new sidebar item).
- Full live guide: `/staff/restaurants/{restaurantId}/setup`, with expandable grouped steps, contextual Back, focus states, Arabic/English translation, owner completion and rule-based optional Wayta helper.
- The old `/setup-preview` is **still a clearly marked fake-data visual demo**, not production status.
- Per-user hide uses Backend state, not localStorage/cookie. A hidden guide can be restored from Settings; completing the whole restaurant does not occur by hiding.
- During active enrollment, low-importance `qr-none` / `no-tables` setup AttentionPanel reminders are suppressed to avoid duplicate onboarding prompts. Urgent warnings such as `qr-inactive`, pending or late orders remain visible.

### Data and permissions

- Prisma models: `RestaurantSetup` (one per restaurant; reviews, optional branding skip, owner final confirmation) and `RestaurantSetupVisibility` (one per Restaurant+User).
- **Existing Restaurants are not backfilled**. Only a new Restaurant created _after deployment_ by `provisionRestaurant()` gets a setup record in its original atomic provisioning transaction. Existing Restaurant OWNER may explicitly enroll via the guide.
- API: `GET /restaurants/:restaurantId/setup`; `POST .../enroll`, `POST .../visibility`, `POST .../review`, `POST .../complete`. All use AuthGuard, RestaurantAccessGuard, permission checks, and full Branch scope. Mutations include CsrfGuard.
- OWNER can enroll/complete. OWNER or authorized full-scope MANAGER can review permitted steps and hide their **own** guide. CASHIER/WAITER/KITCHEN/CUSTOM/branch-scoped roles cannot access this guide.
- Readiness is recomputed from canonical data: active menu, active product in active category/menu, active Branch, an active delivery zone only when effective Delivery is enabled, current entitlements, contact, logo/cover, active locales and current channel switches. Defaults are never considered deliberate reviews.
- `OPERATIONS` completes automatically when its applicable canonical requirements exist. Missing Tables never blocks this internal guide; when effective Table Ordering is enabled without an active Table, the guide shows a nonblocking warning that table orders will not work yet.
- Languages and ordering need explicit review signatures of current canonical values. PREVIEW requires an active visible product plus an explicit confirmation after the user opens the actual public Guest Menu (`/q/:publicCode`) through the existing guest-menu-link mechanism. Opening a tab does not confirm the step. If relevant settings/data change before final confirmation, the step can become pending again.
- The server verifies the entire checklist in a serializable transaction before OWNER completion. Completing the guide does not turn on any order channel, change menu visibility, pay/settle bills or guarantee the service is currently online.
- No paid API or AI model, no new secrets, no new browser storage or third-party telemetry. Small inline "Wayta helper" provides only static step-specific guidance.

### Postgres / Supabase safety

- Migration file in code: `apps/api/prisma/migrations/20261113090000_restaurant_setup_checklist/migration.sql` (after the latest existing migration in Git history).
- Pure additive tables; **no INSERT/UPDATE of existing Restaurant or Menu data**.
- Both tables have RLS enabled and all direct rights revoked for `PUBLIC`, `anon`, `authenticated`. Only the authorized NestJS backend using the existing database role is meant to access them.
- **Do not run** `prisma migrate deploy`, `prisma db push`, or any Supabase SQL command against the current shared local/staging/prod DB while PR #12 remains Draft.
- When owner authorizes database test: create an isolated Postgres database, verify the exact migration history/reference branch, apply existing migrations in order, then the new migration. Run tenancy/role integration tests and test re-provisioning/new and historical Restaurant records.
- Before any production launch, verify current app/Prisma migration status and a backup, ensure migration and app deployment are sequenced safely, and agree rollback/roll-forward policy. Do not drop setup tables if production data has been written without an explicit retention plan.

## Manual acceptance matrix (NOT YET PERFORMED)

1. New provisioned Restaurant: setup appears in Dashboard with 0/8-like truthful progress; branch/QR pre-created do not automatically count ordering/language as reviewed.
2. Existing Restaurant: Dashboard unchanged; OWNER sees optional Settings entry and can opt in. Same user dismiss/reopen across devices; other user remains visible.
3. Owner/Manager/Cashier/WAITER/KITCHEN/Custom/branch-limited: only correct roles can see/read/review; finalize OWNER only; all actions reject forged tenant IDs and unauthorized roles.
4. Arabic RTL and English LTR on 320/360/390/430/768px and desktop: progress, buttons, long names, expanded list and helper don't overflow; 44px targets; no fixed chatbot covering POS operation.
5. Whatsapp-only vs table-only vs menu-only entitlement: unrelated steps are skipped as **not applicable**, not silently counted as complete.
6. Menu Import pending vs approved ACTIVE product, default-true ordering switches, locale changes and Delivery Zone changes: completed steps revalidate. An active Branch + required active Delivery Zone completes OPERATIONS even with zero Tables; a clear nonblocking Table Ordering hint remains.
7. PREVIEW opens the real `/q/:publicCode` Guest Menu, keeps confirmation separate and visible in compact mode, persists only after the explicit confirmation, and never requires checkout/order/QR scanning.
8. Open existing Menu/Settings from a step, save, return to `/setup`, then refresh; the progress updates from Backend.
9. Owner final confirmation requires current real readiness even if the client has a stale 100% UI; completed guide disappears from Dashboard, remains reviewable.
10. Dashboard existing pending-order/QR warning still prominent; redundant low-urgency setup notices do not duplicate the card.
11. Existing Dashboard, Settings, QR, Guest Menu, table sessions, ordering, pricing and mobile navigation regression tests pass.

## CI and verification

- `.github/workflows/restaurant-setup-checklist-preview.yml` runs Web and API typechecks, Prisma schema validation, isolated Jest setup+provisioning tests, source contracts and targeted lint. This workflow does **not** connect to Postgres or apply migrations.
- A green workflow is a **code-level gate only**. The feature is not production-ready until owner visual QA and isolated database integration/security QA are completed.

## Company task

**Title:** Implement Real Restaurant Onboarding with Verified Setup Progress

**Description:** Connect the approved optional checklist UX to tenant-scoped canonical restaurant readiness; expose it on Dashboard and Settings, add guarded owner/manager review and finalization, per-user dismissal, contextual non-AI helper, and draft additive schema with security and isolated migration acceptance tests.

**Status:** In Progress — code on Draft PR #12; CI, real DB and owner QA gates.
