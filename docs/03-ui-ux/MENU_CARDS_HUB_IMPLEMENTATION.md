# Menu Cards Hub Navigation — implementation and safeguards

Status: Implemented on feature branch for review; **not merged or deployed**.
Approved design reference: owner-approved Menu Cards Hub V2 (2026-10-30).

## Scope in this PR

- One responsive, bilingual Menu Cards Hub at `/staff/restaurants/:restaurantId/menu/overview`.
- Desktop Menu sidebar and mobile Menu bottom-navigation item lead to Hub.
- Cards: (1) Menus & Products, (2) Menu Design, (3) Guest Experience, (4) Share Menu & QR.
- Guest Experience launchpad at `/staff/restaurants/:restaurantId/menu/guest-experience` links to **unchanged full** Announcements and Suggestions screens.
- Localized parent-back links for Menu, Modifier Presets, Design, Announcements, Suggestions and QR pages.
- Path-aware breadcrumbs for Hub and child routes, including legacy `settings/*` URLs.
- Existing menu editing routes remain unchanged and directly accessible for product links and import flows.
- Original backend access guards, package enforcement, API DTOs, pricing and database are unmodified.

## Important product facts

- `settings/announcements`: still the complete existing CRUD with translation, types, schedules, status and preview.
- `settings/suggestions`: still `OFF/MANUAL/AUTO/BOTH` with automatic readiness; manual rules remain in Product Editor's `SuggestionsSection`.
- `settings/design`: still the full restaurant-wide Design Workspace, current saved settings and preview. No per-menu template feature introduced.
- `settings/guest-qr`: still contains **both** Restaurant QR management and existing Order Channel toggles to avoid any silent business-rule changes; this remaining UX split belongs to a later explicitly scoped settings overhaul. Table QR remains under Tables.
- `settings/*` original URLs and management actions are retained, including all nine settings features.
- Hub cards check effective `menu.view`, `restaurant.view`, and for the existing QR route `tables.view`, matching the existing page guards. Existing backend guards remain authoritative.

## Regression checks before merge

1. Verify exact routes with authorized owner, branch-scoped manager, menu-only user, settings-only user, and limited packages.
2. Check four Hub cards with wide and narrow browser layouts, 320/360/390/430/768px; Arabic RTL and English LTR.
3. Check keyboard focus, touch targets, mobile bottom navigation, browser history and parent breadcrumbs.
4. Verify announcement create/edit/delete (confirmation, locale fields, scheduling, status, preview).
5. Verify suggestion modes, automatic readiness, per-product manual suggestions, product editor.
6. Verify all existing menu/price/discount/import flows, all published design templates and previews.
7. Verify Restaurant QR create/activate/deactivate, download and style; order-channel switches still work at same legacy route.
8. Verify old bookmarked deep links and QR/menus after route transitions.
9. CI/build/lint/typecheck must pass before owner review.
10. No production deployment, database migration, main merge or branch rewrite without owner approval.

## Deliberately out of scope

- Whole-settings redesign; form validation/toast; phone-input field; onboarding checklist.
- Moving order-channel settings away from `settings/guest-qr`.
- Changing the `canViewTables` guard for QR settings, which requires a separate authorized-permissions review.
- Adding FOLIO PR #8, per-menu design settings, or new menu/import capabilities.

Known limitation for owner QA: new Hub is a navigation view; the existing standalone editors remain unchanged, not rebuilt as the prototype's simulated screens.
