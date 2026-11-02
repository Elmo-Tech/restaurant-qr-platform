# Wayta + VERDE — Combined Release Candidate / Manual Acceptance Gate

**Date:** 2026-11-02 (Africa/Cairo)  
**Status:** DRAFT / CODE REVIEW. **Not approved for merge to main or deployment.**  
**Working branch:** `integration/wayta-verde-release-candidate-2026-11-02`  
**Baseline:** `main` at `d352bc8ba2d7aca27c82947f090474f318c46fc3`.

## Exact Git provenance

- `feat/temporary-demo-restaurants` remotely points to `04d80eefa1a2b53d1da4e7aac993fde5d4335c3f`, **exactly the same commit** as `integration/wayta-pre-release-2026-11-02` (no extra remote commits or changed files).
- `feat/verde-exclusive-napoli-menu` at `625aa7e2dbb8db1629338eefc6e8f9daf0260804` is a fast-forward extension of that exact commit (18 additional commits).
- This candidate was created at the VERDE head, already containing the entire remote history of both requested branches. **No content merge/cherry-pick or conflict resolution was needed or performed.** Original feature/integration refs were not changed.
- This document and an extra combined QA workflow are the only candidate-specific additions.
- Any local/unpushed modifications on the owner's Windows machine or any changes pushed after these recorded SHAs are **not** represented. Verify them before calling this the final bundle.

## Features currently included (from pre-release integration history)

1. Restaurant acquisition-source tracking (Platform-only).
2. Private restaurant owner-contact directory (Platform-only).
3. Exclusive reservation/stock-template bridge for a Restaurant.
4. Start Fresh (safe archival of active menus; not hard delete).
5. Menu import inactive-language text retention and prompt completeness.
6. Compiled VERDE Napoletana bespoke renderer `VERDE_NAPOLI_V1`, two color themes, tenant-scoped activation, shared Guest ordering flows.

**Important:** A branch name `temporary-demo-restaurants` is **not evidence** of an independently committed temporary-demo feature. Its remote tree is identical to the pre-release integration tree. Check local commits or uncommitted work before claiming that feature was included.

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
- focused Backend semantic lint; commit whitespace check.

**A successful code workflow is necessary but not sufficient for production.**

## Required safe local tests

1. Read-only Git preflight: verify target ref/commit, `git status --short`, `git log --oneline`, upstream and any unpushed commits. Do not switch or pull over uncommitted work.
2. Read-only connectivity: `npm run dev:doctor`; identify API / Web endpoints and **exact database target**, migration history, backups and compatibility.
3. On a separate disposable PostgreSQL database **in the existing Docker/Postgres installation if desired** (not a second repo), explicitly approve and then test in migration order:
   - `20261114090000_restaurant_acquisition_source`;
   - `20261115090000_exclusive_menu_design_reservations`;
   - `20261116090000_verde_exclusive_renderer`;
   - `20261116100000_restaurant_owner_contacts`.
   Inspect all other pending migrations in the actual local history. Do not blindly deploy migrations or reset real/shared data. Git switching does not revert database schema.
4. Verify Platform Admin creation, owner contact, acquisition source, correct tenant-exclusive VERDE activation, another Restaurant unaffected; role/permission isolation; disable/fallback.
5. Verify real Guest Menu data (not sample HTML): TABLE and GENERIC QR, AR/EN, photos/no photos, categories, product variants/modifiers, discounts, sold out, search, cart, pickup/delivery/WhatsApp, tracking, announcements, custom logo & cover.
6. Review Light + Signature Dark on 320/360/390/430/768/desktop: category text contrast, keyboard/focus, overflow, all dialogs, reduced motion.
7. Run menu import inactive-language and extras extraction, Start Fresh with stale carts and order history retained, acquisition/contact updates. Check old migrations and DB security/RLS.
8. Review combined changes vs `main`: **134 commits** in the feature head before this candidate's own docs/workflow, not just the new two feature labels. Review broad scope and release sequencing explicitly.
9. Before main merge: owner acceptance and a migration/deployment plan must be recorded. Production deployment is a separate authorized action.

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
