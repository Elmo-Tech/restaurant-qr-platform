# Wayta Pre-Release Integration — Local Acceptance Gate (2026-11-02)

**Branch:** `integration/wayta-pre-release-2026-11-02`  
**Base:** `main` @ `d352bc8ba2d7aca27c82947f090474f318c46fc3`.  
**Status:** Code integrated for QA; not approved for merge, database migration or Production deployment.

## Included in this integration branch

1. **Restaurant Acquisition Source** — from PR #14 / `feat/restaurant-acquisition-source`. Captures referral from registered or free-text customer, employee, sales, social/advertising platform, website, direct inquiry, other. Private Platform-only attribution. Stored atomically with provisioning. No historic backfill.
2. **Private Restaurant Owner Contact Directory** — from `feat/platform-restaurant-owner-contacts`, includes PR #14. New Restaurant contact fields: owner full name, phone, optional Facebook profile/page. Internal contact is separate from Owner login credentials and Guest-facing Restaurant contact. Owner directory searchable by name/phone, call and Facebook actions, edit contact on Restaurant details. Additive migration.
3. **Exclusive Custom Menu Design — temporary base** — from PR #13 / `feat/exclusive-restaurant-menu-design`. Platform Admin reserves or activates a stock renderer for one Restaurant only. The **assignment** is exclusive, not the globally shared stock template. Final truly bespoke custom renderer is **NOT implemented**.
4. **Start Fresh with a Blank Menu** — from PR #15 / `feat/menu-start-fresh`. Staff can archive every ACTIVE Menu and start a new empty PRIMARY Menu, keeping old Menus/products/media/OrderItems and QR. This is **NOT irreversible hard deletion**.

Integration PRs #17/#18 brought the menu features; PR #16 brought acquisition + owner contacts. Shared Prisma, Platform API, Console UI and i18n conflicts were reconciled to retain **both** feature sets.
5. **Menu Import language retention + complete AI extraction prompt** — exact owner branch `fix/menu-import-keep-inactive-language-text-and-complete-prompt` at `277d2b069a269aaf3cbad8a444005786955df7b5`, integrated via PR #20. Retains text when only an inactive language is printed and directs manual Excel AI extraction to include all menu extras/add-on categories.

## Explicitly NOT included yet

- The finished bespoke restaurant-specific renderer, versioned publish/rollback for it, and customer Demo experience.
- No local Database execution, manual browser acceptance, OWNER sign-off, main merge or production deploy is inferred from passing CI.

## Code-level CI

`.github/workflows/wayta-pre-release-integration.yml` runs against this Integration branch only:
- locked dependency installation and Prisma schema validation (no DB changes),
- API/Staff Web/Platform Console Typechecks,
- focused Backend tests for setup-related provisioning, owner contact, acquisition, exclusive assignment/public menu, menus start-fresh and menu controllers,
- focused semantic lint of new Platform modules.

CI status must be verified for the **final integration commit**, including the now-integrated Menu Import fix. A green result establishes only code-level confidence, NOT real DB or browser QA.

## Database safety (critical)

`start-dev.ps1`, `npm run dev:all`, `npm run dev:rebuild` and `npm run dev:restart` automatically run `prisma migrate deploy`. Do not use those on the owner's possibly shared PostgreSQL data. Switching the Git branch does **not** switch or revert the database.

Before running migrations:
1. Verify exact DB hostname/container/database and whether it contains shared or client data.
2. Inspect applied migration history, pending migrations, enum/table compatibility and any branches still using that DB.
3. Verify a usable backup, or use a disposable test **database within the existing PostgreSQL/Docker installation** (no full repo clone required).
4. Obtain owner approval for the exact migration target and command.
5. Avoid `prisma migrate reset`, `prisma db push` or implicit migration-bearing launch on real/shared data.

For code-only safe startup, `npm run dev:doctor` is read-only; `npm run dev:web` starts Web only and does not imply the API/DB has been upgraded.

## Browser/local acceptance before main

- **Platform Admin:** create a Restaurant with Owner contact, Acquisition Source and optional Package; invalid contact/referrer fails without partial OWNER/Branch/QR; owner login works; generic QR, setup enrollment and subscriptions unaffected.
- **Contact directory:** search by owner name and phone, paginate, open tap-to-call/Facebook, update an old Restaurant's contact; audit records update without PII; Staff and Guest endpoints never return private owner contact or acquisition source.
- **Exclusive design:** Reserve/Activate/Disable stock base from Platform Admin; only assigned Restaurant sees private status and activated renderer; another Restaurant on `allTemplates`, no package or limited package cannot see/select the private assignment. Guest QR and table QR show correct renderer; no effect on prices/modifiers/checkout.
- **Blank menu:** on a disposable Restaurant, run Start Fresh, verify all ACTIVE Menus archived and one new blank primary; stale carts cannot submit archived products; historical order and media records remain; restore archived Menu manually; pending Menu Import and stale/non-owner attempts refuse safely.
- **Menu import fix** (now included): inactive-language content remains intact; Arabic/English prompt completion is accurate; no duplicate translations, unintended overwrite or category loss.
- **UI:** Platform and Staff AR RTL/EN LTR, mobile 320/360/390/430px, accessible dialogs, focus and navigation, correct package/role controls.
- **Production deployment issue:** independently verify Coolify rollout of prior `main` before considering a new Production release.

Do not mark DB/browser/local acceptance successful without actual observed evidence. Only after integrated QA and explicit owner authorization can the work be reviewed for a merge to `main` and a separate controlled Production release.
