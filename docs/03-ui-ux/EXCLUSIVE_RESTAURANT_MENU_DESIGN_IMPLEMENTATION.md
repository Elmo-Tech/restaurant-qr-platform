# Exclusive Custom Menu Design — Implementation Contract (Draft)

**Branch:** `feat/exclusive-restaurant-menu-design`
**Status:** Tenant-private stock-template reservation and activation implemented in Draft branch code (schema/migration SQL, Backend/Admin/Staff and public QR integration). CI validation and browser/DB QA pending; no production deployment.
**Base:** `main` at `d352bc8ba2d7aca27c82947f090474f318c46fc3`.
**Scope:** A truly restaurant-exclusive branded Guest Menu design, not another package template.

## 1. Product contract

A bespoke design is developed for one Restaurant by ElmoTech and assigned by Platform Administration. Its branding, layout, and optional approved settings belong to that Restaurant alone. A design should **never** appear in the Standard/Premium catalog for unrelated Restaurants, including:
- Packages with `allTemplates` or `allStandardTemplates`.
- Restaurants with no Package.
- Restaurants with a `MENU_TEMPLATES` override.
- Guests manipulating the current `?template=` preview parameter.

The Restaurant's ordinary QR URLs remain `/q/{publicCode}`. Guests are **supposed** to see the published bespoke layout when visiting that Restaurant's QR; exclusivity means other Restaurant accounts cannot select/use it, not that the public page is secret.

## 1A. Updated rollout: reserve an exclusive design slot FIRST

The owner wants to create and fully prepare a Restaurant account **before** the final bespoke design is ready. The safest practical contract is a **private per-Restaurant design assignment** with a temporary base template from Wayta's existing stable collection (e.g. BLOOM, EMBER, BREW, CLASSIC).

**Critical distinction:** The *assignment, published configuration and future renderer* are exclusive to that Restaurant. The **underlying stock renderer is not unique** while used as a placeholder, and must **NOT** be removed from the package catalog or made unavailable to other existing restaurants. Once a truly bespoke renderer has been authored and deployed, the same Restaurant assignment switches to its unique `rendererKey` and published version; no Restaurant recreation, menu reimport, QR rotation or Order reconfiguration is required.

Proposed states:
- **RESERVED:** Platform Admin selects `baseTemplate` and records the assignment. Restaurant can finish Setup Checklist, menu, contact, branches and QR. Guests continue seeing its currently selected normal Menu template. Staff sees **Your exclusive design is being prepared** (not a false claim that the final design exists).
- **ACTIVE_BASE:** Platform Admin explicitly chooses to show the selected stock renderer to guests as a temporary, tenant-configured bridge. Staff sees **Temporary design active**; other Restaurants do not see this private assignment.
- **ACTIVE_CUSTOM:** A compiled, reviewed `rendererKey` and published version are present. Only the assigned Restaurant's public QR selects this renderer.
- **DISABLED:** Return to the Restaurant's ordinary package-allowed saved stock template. Preserve assignment/history.

Private assignment never becomes a `MenuTemplate` enum member or an `allTemplates` package selection. The Platform Console is the ONLY authority to assign, enable or change the base/future renderer. Staff can view status and optionally edit whitelisted appearance settings, never transfer ownership. Public QR resolution must only return a status and renderer/config from the **QR-resolved** Restaurant's assignment, and must never trust a query `designId`.

**Package entitlement:** Existing stock template selection rules remain intact for ordinary customers. For an exclusive temporary assignment, the Platform explicitly grants the selected base renderer **only to the assigned tenant**, without upgrading the package's general catalog. For staff-side preview, avoid a public query-param permission bypass: scope previews to tenant and permitted roles or use the Backend-resolved published template. Do not accidentally expose the whole premium library.

**Customer account preparation:** Create Restaurant + OWNER + Branch + QR + Setup via the existing Platform onboarding flow. Then Platform Admin links an exclusive slot (RESERVED), chooses a temporary stock template and optionally activates that temporary design. Later update only the assignment to the bespoke renderer; keep all real Restaurant/Guest state.

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

## 6A. Current Draft branch implementation (2026-11-02)

- Added `RestaurantExclusiveDesign` with `restaurantId` PK and `baseTemplate` / `RESERVED | ACTIVE_BASE | DISABLED`, plus additive RLS-protected migration `20261115090000_exclusive_menu_design_reservations`. The migration has NOT been run on local/staging/Production.
- Platform Admin can reserve, activate, change or disable a tenant's temporary base stock design from Restaurant detail using a guarded Platform endpoint and audit log.
- Public Guest QR resolves assignment **only** from the QR-owned Restaurant. `ACTIVE_BASE` overrides its public stock presentation and unlocks only that one base renderer for this Restaurant. `RESERVED` and `DISABLED` leave the regular Package-gated menu layout unchanged.
- Staff's full-scope Menu Design view displays a private status card, previews the temporary renderer, and cannot replace the Platform-active selection with an ordinary stock choice. This private card is never shown to other Restaurants.
- Unit coverage includes `PublicMenuService` tenant-limited base, inactive reservation fallback and generic/table QR, and Platform Admin assignment/audit. Code-level CI does not prove database migration, production readiness or browser UX.
- **Not implemented:** final unique renderer, versioned config drafts/publish/rollback, direct Staff customization of bespoke configuration, or browser-verified first client design. These remain subsequent owner-approved phases.
- **Update (DEC-062):** the VERDE renderer, its draft/publish settings (columns on the exclusive design row) and the Staff editor now exist; see `VERDE_EXCLUSIVE_RENDERER_IMPLEMENTATION.md`. Version history/rollback is still not implemented.
- **Update (DEC-063):** a second compiled renderer, `SHERBINY_FIRE_DOUGH_V1` (El Sherbiny), exists beside VERDE with the same draft / publish model; see `SHERBINY_EXCLUSIVE_RENDERER_IMPLEMENTATION.md`. A third one, `MAKKBOZ_HERITAGE_V1` (DEC-064), follows the same model: `MAKKBOZ_EXCLUSIVE_RENDERER_IMPLEMENTATION.md`.

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

1. Tenant-private design **reservation** with a selected stock base template and explicit state, plus safe Platform-only assignment API, tenant isolation and tests.
2. Backend-resolved temporary base activation and tenant-scoped staff status card, preserving package/stock semantics.
3. Platform Admin UX for reserve/activate/disable, audit and safe preview.
4. Later bespoke compiled renderer with versioned publication, rollback and shared Guest Menu regression QA.

**No portion is considered implemented, deployed or approved solely because this document exists.**
