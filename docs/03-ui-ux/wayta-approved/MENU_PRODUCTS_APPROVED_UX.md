# Wayta UX Decision Record — Menu & Products

Status: Menu/Product directions and INACTIVE creation policy APPROVED by owner. Exact implementation remains gated by explicit scope/API review; this is not authorization to code.
Scope: Design/planning only. This record does not authorize application code changes, implementation PRs, or deployment.
Approved UX direction: concepts A-D below and the INACTIVE-creation policy. Requires backend review before implementation: INACTIVE create default + explicit Activate, readiness validation, partial-save recovery/duplicate prevention, draft persistence and bulk mutations. Detailed flows, copy and wireframes: pending owner sign-off (see "Implementation gate").
Basis: Reviewed `apps/web/src/app/staff/restaurants/[restaurantId]/menu/` (MenuWorkspace, MenuContextBar, CategoryNavigation, ProductList, ProductEditor), the current Menu Hub, and `docs/01-domain/MENU_SPEC.md` / `docs/03-ui-ux/STAFF_DASHBOARD_UX_SPEC.md`.

## Earlier approved directions
- Restaurant Home: Action Queue + Adaptive Workspace.
- Orders: Priority Queue, Split Workspace on desktop, Focus Mode on mobile.
- Tables & Service: A+B (Attention First + Split Workspace) desktop; A+D (Attention First + Focus Mode) mobile.

## Approved Menu & Products concept composition
- A Product First: default list view is searchable products, not a large launcher/dashboard.
- B Guided Creation: a short, guided flow for creating a product.
- C Split Editor: desktop has product list/context and detail editor with a guest preview; mobile focuses on one editor screen.
- D Daily Operations: a compact contextual strip for relevant tasks such as sold-out and inactive items; no second dashboard.

## User goals and roles
- Restaurant owner/manager with menu-management permission: find and edit a product, price, status, or availability with minimal navigation; add products, categories, menus, and related customizations.
- View-only staff: inspect menu without fake action affordances; never bypass backend authorization.
- Respect restaurant-wide menu-management scope and any existing membership/entitlement restrictions. A frontend role selector is not required.

## Proposed information architecture
1. Staff navigation > Menu (the single top-level Menu entry for the Menu Hub; no separate Electronic Menu Experience entry). Keep existing permitted routes, especially Menu Hub and design/QR guest settings.
2. Product workspace: visible current Menu context, optional category chips/rail, search, contextual availability filters, product list, Add Product primary action.
3. Secondary actions: Manage Menus, Manage Categories, Import Menu, Offers, Modifier Library, Guest Preview, Design & QR — keep discoverable without dominating everyday work.
4. One menu only: indicate which menu is in use without forcing repeated selection. Multiple menus: explicit selector with Primary/Active states (not conflated).
5. Categories can be chosen quickly; All Products offers searchable overview within selected menu. Preserve category-level ordering and reordering restrictions.

## Desktop structure
- Persistent Staff navigation shell (dark graphite), clear menu/restaurant context, light workspace and burnt orange primary action.
- Product search + Category navigation and compact filter controls; high-density yet readable product rows (image, name, price, ACTIVE/INACTIVE, AVAILABLE/SOLD_OUT, Edit).
- When editing, maintain product context/list where space allows and show grouped editor + optional sticky guest preview. Do not force a new backend mutation model.
- Do not show empty metrics or large generic marketing banners before product tasks.

## Mobile structure
- Product search first, category chips scroll horizontally or collapse to selector; product rows as full-width touch-friendly cards.
- Product Edit becomes a full-page focused editor; sticky save action positioned above existing bottom navigation/safe area.
- Expose one primary action per screen and keep advanced configuration behind clear sections.
- Minimum practical tap target 44x44px; no horizontal page overflow; full Arabic RTL and English LTR testing.

## Flow 1 — Find/edit an existing product
1. Open Menu & Products.
2. Search product or select category; context always shows selected menu.
3. Select product. On desktop, open split editor where feasible; on mobile, dedicated editor screen.
4. Show essential fields first: name, image, category, price/size pricing, active vs availability.
5. Save and show reliable confirmation. Return to previous menu/category/search context when leaving.
6. Advanced options: translations, variants, modifiers, discount, featured, guest notes, suggestions, previews.

## Flow 2 — Add a product (guided)
0. If no Menu exists, guide creation of first Menu; if no Category exists, create a Category. Do not pretend a Product can exist without a Category.
1. Basics: default-locale name (required), category (required), optional description/image.
2. Pricing: base price for single-price item OR size prices (size setup remains compatible with current API model); discount remains optional/advanced.
3. Visibility: newly created Product must start `INACTIVE` (fixed create behavior), not a default-`ACTIVE` choice; `AVAILABLE`/`SOLD_OUT` remains a separate availability concept. Preview intended customer experience.
4. Review & Create Inactive: create the product once with validated base data and return its persisted product ID; do not present this as activation.
5. Post-create Setup & Review: land on the persisted product Edit route. Confirm required base fields and size variants/price readiness using actual server state. Optional modifiers/add-ons and recommendations may be configured separately and skipped. Only after the required checks pass, expose an explicit permitted Activate action.
6. If core create succeeds but image/translation/variant follow-up fails, show partial-success state and recovery actions using the same product ID. On uncertain writes, refetch server state first and retry only missing parts; NEVER duplicate-create. An image upload failure may require re-selecting the file.

## Flow 3 — Mark an item sold out
1. Search/locate product on the list.
2. Use the availability switch (one direct action), labeled and permission gated.
3. While pending, disable repeat action; after success display server-confirmed AVAILABLE/SOLD_OUT state.
4. On failure, restore confirmed state and show a retryable explanation. Do not treat INACTIVE as SOLD_OUT.

## Flow 4 — Change price
1. Find and select product.
2. Open Pricing directly within the product editor.
3. Single-price product: edit base price. Size-priced product: edit relevant size prices, not an ineffective disabled base-price field.
4. Validate decimal values and existing discount constraints, save, then reflect backend-confirmed price in list and guest preview.

## Flow 5 — Menu and category management
1. Use secondary menu/category management controls; do not force them into every daily product edit.
2. Set a Menu as Primary through the dedicated action, separate from ACTIVE status.
3. Support category editing, moving and reordering without losing the selected Menu context; guard against data from a previously selected menu.
4. Never imply a change to primary menu is a change to product availability.

## Prioritization, states and safeguards
- Daily operations panel: compact and contextual, shown only when there are genuine items to address. No invented inventory/stock-count, fake AI analysis, or backend-unsupported bulk action.
- State checklist: no Menu; no Category; no Products; no search matches; loading; permission denied; suspended restaurant; API error; no connectivity; save in progress; conflicting/stale update; partially successful create; failed image upload; missing secondary translations.
- First use: offer first Menu/Category/Product actions in sequence, without giant one-time promotional banners.
- Make copy explicit: 'Hidden from guest menu' vs 'Sold out temporarily'. Color alone cannot convey state.
- Avoid implicit saving: visibly indicate unsaved changes; warn on navigation away if supported by an actual draft-state model.
- Protect existing permissions, tenant isolation, menu ordering, currency/money calculations, and preview accuracy; the backend is authoritative.
- Do not invent a one-click bulk-edit, branch-specific stock, hard deletes, or other unsupported features.

## Proposed UX acceptance tests
- Find a product by name and open edit from the Menu & Products workspace without navigating unrelated hubs.
- Mark a product SOLD_OUT from the list with one clear availability action; confirmation reflects backend success.
- Change a single-price item, and separately a variant-priced item, without ambiguity.
- Create first Menu, first Category and first Product with a clear guided path.
- Create product with secondary image/translation failure; prevent duplicate creation on retry.
- Verify narrow-mobile (360px) layout, long Arabic names, English LTR, keyboard/focus and screen reader labels.
- Verify manager, owner, view-only, and restricted menu-management permissions.
- Verify 50+ item category, multiple menus, filtered reorder limitations, errors, loading and empty states.

## Explicitly deferred decisions
- Exact screen copy and detailed wireframe spacing.
- Whether desktop editor is an in-place side panel or route-preserving split layout (must not break current editor lifecycle).
- Unsaved draft persistence (requires explicit product/API decision if beyond local form state).
- Bulk product mutations or new backend features (out of scope).

## Implementation gate
No coding until owner signs off the detailed UX flows and edge cases. When approved, execute one focused feature/PR at a time, preserve existing routes/behavior where possible, use repository rules, and verify desktop/mobile + RTL/LTR + existing tests.

## Additional owner-approved policy (2026-11-18)

- Product starts `INACTIVE` during setup and must require explicit Activate after server-backed readiness validation. Do **not** invent a `DRAFT` enum, bypass permission checks, or confuse activation with availability or guest visibility through Menu/Category status.
- Required activation checks: valid core fields and prices; correct size-variant state if variants apply; final review. Optional add-on groups, images where not required by current API, secondary translations, and suggestions must not arbitrarily block activation. Confirm real backend requirements before implementation.
- Add-ons: use an existing reusable preset or create a custom modifier group. Avoid duplicate application of a preset (consult `sourcePresetId`/server state); separate save and error states per section. Do not blindly repeat a group create after a timeout.
- Suggestions: restaurant-wide mode is one of `OFF`, `MANUAL`, `AUTO`, `BOTH`; a Product editor must not silently change restaurant-wide mode. Product suggestions save separately, with a maximum of six manual rules in the verified client implementation. Do not suggest the same product itself. Show unsaved and failed states.
- Failed/partial/uncertain outcomes must be distinguished. Refetch persisted data before retries to avoid duplicate products, variants or presets. Do not claim idempotency support unless verified in the API.
- This is a cross-layer policy change, not a cosmetic redraw: audit current create DTO/defaults, API authorization, guest visibility rules, variant write semantics and test coverage before coding.
