# Exclusive Custom Menu Design — Implementation Contract (Draft)

**Branch:** `feat/exclusive-restaurant-menu-design`  
**Status:** Architecture agreed in principle; runtime/schema/UI implementation and owner acceptance pending.  
**Base:** `main` at `d352bc8ba2d7aca27c82947f090474f318c46fc3`.  
**Scope:** A truly restaurant-exclusive branded Guest Menu design, not another package template.

## 1. Product contract

A bespoke design is developed for one Restaurant by ElmoTech and assigned by Platform Administration. Its branding, layout, and optional approved settings belong to that Restaurant alone. A design should **never** appear in the Standard/Premium catalog for unrelated Restaurants, including:
- Packages with `allTemplates` or `allStandardTemplates`.
- Restaurants with no Package.
- Restaurants with a `MENU_TEMPLATES` override.
- Guests manipulating the current `?template=` preview parameter.

The Restaurant's ordinary QR URLs remain `/q/{publicCode}`. Guests are **supposed** to see the published bespoke layout when visiting that Restaurant's QR; exclusivity means other Restaurant accounts cannot select/use it, not that the public page is secret.

## 2. Existing implementation to preserve

- `apps/api/src/entitlements/templates.ts`: global, open-ended Standard/Premium Package catalog. Do not add tenant-exclusive IDs to `MENU_TEMPLATE_KEYS` or to the Prisma `MenuTemplate` enum.
- `apps/api/src/restaurants/restaurant-profile.service.ts`: selected stock template is package-controlled; do not bypass its existing gate.
- `apps/api/src/public/public-menu.service.ts`: server-authoritative QR-to-Restaurant lookup, entitlement checks, published settings, ordering context.
- `apps/web/src/app/q/[publicCode]/page.tsx`: public QR routing and stock-template preview.
- `apps/web/src/app/q/[publicCode]/PublicMenuView.tsx`: shared product, pricing, discounts, availability, variants, modifiers, cart, checkout, order tracking and ordering guards.
- `apps/platform`: separate Platform Administrator identity, API, and UI.

## 3. Architecture proposal

Introduce a **separate, tenant-bound assignment** for exclusive designs instead of extending the shared stock template enum. A vetted code registry maps a stable design key to a compiled renderer and a versioned configuration schema; it is **not** a runtime HTML/JS/CSS upload mechanism.

Each assignment has:
- Stable `designKey` present in the build's trusted renderer registry.
- **Exactly one** `restaurantId` owner/assignee; no cross-restaurant sharing.
- Version, draft configuration and previously published configuration.
- Explicit draft/published/disabled lifecycle and published version for rollback.
- Audit metadata: who assigned/published/disabled it and when.

Database shape and names must be reviewed against `AGENTS.md`, Prisma, migration history, and actual routing before code changes. Tenant isolation is enforced by Backend lookup on the QR-resolved Restaurant ID, not solely by UI filtering or the caller's submitted ID.

## 4. Platform administration workflow

Under the selected Restaurant detail, an **Exclusive Menu Design** section is available only to Platform Admins:
1. Choose from code-registered, available bespoke renderers (or enter a proposed new design request not yet deployable).
2. Assign the renderer to **this** Restaurant.
3. Edit allowed config while in draft, with independent validation.
4. Preview securely in an authenticated, non-public flow using the target Restaurant's real menu content.
5. Publish explicitly, then verify the public QR for both generic and table contexts.
6. Disable or roll back to a previous published configuration without altering menu/order records.

No code-editor, arbitrary user JavaScript/CSS, public `designPreview` token, or all-restaurant deployment of an exclusive renderer. Reject unknown/unshipped renderer IDs and mismatched Restaurant IDs.

## 5. Restaurant Staff experience

The owner/authorized full-scope Manager sees **My Exclusive Design** ahead of Standard/Premium choices only while assigned. Published status and permitted appearance settings are visible. Restaurant Staff cannot reassign the design or install unreviewed code; optional editing is whitelisted. Unrelated Restaurants do not see a locked copy or a count in subscription plans.

Permissions derive from real Platform authority for assignment and existing `restaurant.manage` + all-branches for permitted Staff customization. Never trust a preview query parameter as authorization.

## 6. Guest rendering and fallback

The Backend resolves `publicCode -> Restaurant -> published exclusive assignment`. Only that assigned Restaurant gets an exclusive renderer key/config in its public menu response. The Web selects a compile-time trusted renderer after checking the exact key, schema version and publication state.

Preserve the existing Guest Menu's **shared** order/cart/variant/modifier/discount/checkout and status components. An exclusive skin may change the hero, sections, category navigation, card presentation and design tokens, but must never fork pricing or order submission rules.

If the renderer is unknown, the published schema version is unsupported, or loading fails, fall back safely to the currently allowed stock menu layout with monitored diagnostics — not a blank page. Draft data must never be returned by the public menu API.

## 7. Safety and review gate

The existing `main` production deploy status was unverified at specification time; no Production migration/deployment is authorized by this branch. Build/publish changes as isolated reviewable slices and test on a disposable DB or explicitly approved backed-up local test DB. Existing QR codes, Menu Hub, Settings Hub, BLOOM fonts, mobile, Arabic RTL/English LTR, and Package gates must not regress.

### Required tests
- Package `allTemplates`, `allStandardTemplates`, no package, and feature overrides do not leak exclusive designs.
- A guessed/foreign `designId` cannot be selected, edited, previewed or published by another Restaurant.
- Platform Admin assignment and audit; Staff read/manage boundaries and branch scope.
- Draft never reaches public QR, published does, rollback restores prior version, unsupported key safely falls back.
- Generic QR and table QR, mobile 320/360/390/430 px, Arabic RTL and English LTR.
- Real prices, variants, modifiers, sold-out state, cart, delivery fees, checkout, rate limiting and order submission unchanged.

## 8. Planned implementation slices

1. Tenant-bound DB model, trusted registry and Backend isolation contracts (+ migrations/tests).
2. Platform Console assignment, review, publish, rollback and audit.
3. Private preview and Staff design card/settings, built for mobile/RTL.
4. First bespoke renderer for one approved Restaurant, browser QA, owner sign-off.

**No portion is considered implemented, deployed or approved solely because this document exists.**
