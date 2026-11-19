# Phase 0 and Implementation Gates - Wayta Restaurant Staff UX

**Status snapshot (2026-11-19):** Phase 0.1 (`refactor/staff-navigation-foundation`) is **squash-merged into `main` via PR #60** (merge commit `27bc30b`). No deployment is implied. Phase 0.2 has **not** started. Verify directly in the live checkout; this document is not proof of current git or deployment state.

## Decisions frozen for Phase 0

- **Mobile tabs (D1):** keep existing default Home / Orders / Menu / Tables + More. Kitchen promotion remains capability-based and unchanged. No mobile tab redesign during Phase 0.
- **Desktop unauthorized nav items (D2):** hide disabled `No access` rows in Phase 0.2, while preserving view-only permissions and package gates.
- **Menu hub (D3):** one top-level Menu entry. Existing menu-owned `/settings/design`, `/settings/announcements`, `/settings/suggestions`, `/settings/guest-qr` must still highlight Menu.
- Tablet split-detail layout depends on **usable content width**, not a blanket 768px breakpoint; preserve non-modal focus behavior on Desktop and focus-trapped dialog on focused Mobile.

## Scope / sequence

| Work package | Scope | Implementation status / gate |
| --- | --- | --- |
| **0.1** | Extract `staff-sections.ts`; unify Desktop shell and mobile resolver; tests; `allowImportingTsExtensions` TS setting | **Merged** via PR #60 (`27bc30b`), seven files. Pre-merge: 63/63 staff tests, Web typecheck PASS, changed-file ESLint PASS, diff check PASS. Full lint has 3 baseline errors on `main`. |
| **Documentation** | Add these approved UX records, plus a short reference in root `CLAUDE.md` | Separate documentation-only Draft PR from `docs/wayta-approved-ux`, opened after 0.1 merged. No application code. |
| **0.2** | Group Desktop Sidebar into Daily Operations / Restaurant Management / Account; hide unauthorized rows; preserve routes and Mobile nav | Requires new explicit task approval after 0.1. |
| **0.3** | Thin error + Retry pattern for already-needed Orders/Tables states; reuse existing save feedback | Separate scoped PR, no generic abstraction spree. |
| **0.4 + Phase 1 Orders** | Build responsive split/focused order detail with real usage; extract reusable abstraction later if justified | Requires Phase 1 approval; no global button resize. |

## Reported Phase 0.1 pre-merge validation (not independently rerun here)

- Node 24, npm 11, 63/63 staff tests; Web typecheck PASS; changed-file lint PASS; `git diff --check` PASS.
- Whole Web lint: 3 pre-existing `setState`-in-effect errors in `GuestHeroBloom.tsx`, `GuestHeroEmber.tsx` and `EditorialPriceDisplayEditor.tsx`, plus 2 warnings; do not fix them inside 0.1.
- No `next build` run. Do not present these checks as a new CI pass.

## Implementation invariants

- One focused PR at a time, preserve working tree and existing uncommitted edits; no unrelated refactoring, dependency upgrades, API changes or migrations without approval.
- Each screen must support RTL/LTR, accessibility, touch targets, appropriate focus behavior, mobile safe areas, explicit loading/error/success/unknown states, safe retries and backend-authorized actions.
- `READY` is not `SERVED`; DELIVERY progresses via OUT_FOR_DELIVERY. Closing a table session is not payment confirmation.
- New product `INACTIVE` + explicit activation and partial-save recovery is a **future cross-layer API contract change requiring separate planning and tests**.
- User authorization is per real permissions/branch scope/entitlement, not visual role name.

## Safe next action

Phase 0.1 is merged. Review and land the documentation-only PR. Then ask separately for explicit approval to start Phase 0.2. Never merge/deploy implicitly.
