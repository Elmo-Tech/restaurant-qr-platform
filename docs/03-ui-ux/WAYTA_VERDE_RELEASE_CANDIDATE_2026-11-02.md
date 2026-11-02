# Wayta + VERDE — Combined Release Candidate / Manual Acceptance Gate

**Date:** 2026-11-02 (Africa/Cairo)
**Status:** DRAFT / CODE REVIEW. **Not approved for merge to main or deployment.**
**Working branch:** `integration/wayta-verde-release-candidate-2026-11-02`
**Baseline:** `main` at `d352bc8ba2d7aca27c82947f090474f318c46fc3`.

## Exact Git provenance

- `feat/temporary-demo-restaurants` originally started at `04d80eefa1a2b53d1da4e7aac993fde5d4335c3f` but **was later pushed to `7b07fa74cb90b0f26e9781e791cd80df7107576e`**, with 5 additional commits implementing DEC-060 Temporary Demo Restaurants. These commits are included via merge PR #22, merged to this release-candidate branch as `3b4e4c7436ab1531873e691bc8a44683673ba97d`.
- `feat/verde-exclusive-napoli-menu` at `625aa7e2dbb8db1629338eefc6e8f9daf0260804` is a fast-forward extension of that exact commit (18 additional commits).
- The initial candidate was created at the VERDE head. After the demo feature was pushed, GitHub confirmed PR #22 was mergeable without conflicts; it was merged **into this candidate only**, preserving both branch histories. `main`, both source feature branches and PR #19 were not changed by the integration.
- Candidate-specific additions include this release-gate document, combined CI, and dedicated VERDE tenant/QR regression tests. Demo feature implementation remains in the original five commits, not a rewritten source branch.
- Any local/unpushed modifications on the owner's Windows machine or any changes pushed after these recorded SHAs are **not** represented. Verify them before calling this the final bundle.

## Features currently included (from pre-release integration history)

1. Restaurant acquisition-source tracking (Platform-only).
2. Private restaurant owner-contact directory (Platform-only).
3. Exclusive reservation/stock-template bridge for a Restaurant.
4. Start Fresh (safe archival of active menus; not hard delete).
5. Menu import inactive-language text retention and prompt completeness.
6. Compiled VERDE Napoletana bespoke renderer `VERDE_NAPOLI_V1`, two color themes, tenant-scoped activation, shared Guest ordering flows.
7. **Temporary Demo Restaurants (DEC-060):** short-lived private demo restaurants, bilingual sample content and licensed photos, package selection, Platform Demos console, one-time-displayed secret links, Backend demo restrictions and scheduled expiry/purge.

**Verified:** The remote demo branch's five commits are now ancestors of this candidate. This confirms remote source integration, **not** that any further unpushed Windows local work exists or is included.

## What the combined branch is NOT

- Not a completed production release; no DB migration has been run or verified by this candidate.
- Not proof the genuine VERDE client has been assigned/activated.
- Not owner-approved guest-browser, QR, platform, mobile/RTL, transaction, subscription or import QA.
- Not proof the existing Restaurant Setup Checklist Draft PR #12 or FOLIO PR #8 were independently merged/accepted; do not infer them from the branch name.
- Does not automatically include unpushed local work.

## Code CI

`.github/workflows/wayta-verde-release-candidate.yml` runs on this branch:
- `npm ci`, Prisma schema validation without DB changes;
- API / Web / Platform typechecks;
- focused Backend Jest: tenant-specific exclusive design and public menu, menu archive/restore boundary, provisioning, acquisition/contact and import;
- demo-specific Jest unit suites covering purge restrictions, security restrictions and curated template integrity;
- **full HTTP/DB E2E for Demo is NOT run by this workflow**; it needs a disposable, explicitly approved database;
- focused Backend semantic lint; commit whitespace check.

**A successful code workflow is necessary but not sufficient for production.**

## Required safe local tests

1. Read-only Git preflight: verify target ref/commit, `git status --short`, `git log --oneline`, upstream and any unpushed commits. Do not switch or pull over uncommitted work.
2. Read-only connectivity: `npm run dev:doctor`; identify API / Web endpoints and **exact database target**, migration history, backups and compatibility.
3. On a separate disposable PostgreSQL database **in the existing Docker/Postgres installation if desired** (not a second repo), explicitly approve and then test in migration order:
   - `20261114090000_restaurant_acquisition_source`;
   - `20261115090000_exclusive_menu_design_reservations`;
   - `20261116090000_verde_exclusive_renderer`;
   - `20261116100000_restaurant_owner_contacts`;
   - `20261117090000_demo_restaurants` (adds demo-only fields and secret entry link table).
   Inspect all other pending migrations in the actual local history. Do not blindly deploy migrations or reset real/shared data. Git switching does not revert database schema.
4. Verify Platform Admin creation, owner contact, acquisition source, correct tenant-exclusive VERDE activation, another Restaurant unaffected; role/permission isolation; disable/fallback.
5. Verify real Guest Menu data (not sample HTML): TABLE and GENERIC QR, AR/EN, photos/no photos, categories, product variants/modifiers, discounts, sold out, search, cart, pickup/delivery/WhatsApp, tracking, announcements, custom logo & cover.
6. Review Light + Signature Dark on 320/360/390/430/768/desktop: category text contrast, keyboard/focus, overflow, all dialogs, reduced motion.
7. Run menu import inactive-language and extras extraction, Start Fresh with stale carts and order history retained, acquisition/contact updates. Check old migrations and DB security/RLS.
8. Demo QA: Platform create with/without active Package, secret-link entry/expiration/rotation, session and role restrictions, excluded Platform totals, asset credits, extension and lock, **purge of disposable demo data only**, and untouched normal tenants. Verify scheduled sweep boundaries and migrations against disposable DB before enabling.
9. Review the full combined diff vs `main` (Wayta pre-release features + VERDE + all five demo commits), and release sequencing explicitly.
10. Before main merge: owner acceptance and a migration/deployment plan must be recorded. Production deployment is a separate authorized action.

## Merge strategy

There is only one candidate branch for review. Open a **Draft PR to main**; do not merge or mark Ready without acceptance. Preserve PR #19 and the source feature branches as independent historical references until the owner decides whether to close/supersede them. No force-push or rebase shared branches.

## Safe Windows commands (read-only first)

```powershell
Set-Location 'D:\elmo apps\restaurant-qr-platform'
git status --short
git fetch origin
git log -1 --oneline origin/feat/temporary-demo-restaurants
git log -1 --oneline origin/feat/verde-exclusive-napoli-menu
git log --oneline origin/feat/temporary-demo-restaurants..feat/temporary-demo-restaurants
git diff --stat origin/feat/temporary-demo-restaurants...feat/temporary-demo-restaurants
```

If the local `feat/temporary-demo-restaurants` ref does not exist, omit the last two commands. If they report anything, the local-only changes need a separate review before the combined branch can be declared complete.
