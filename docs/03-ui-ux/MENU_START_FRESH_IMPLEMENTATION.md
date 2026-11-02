# Start Fresh with an Empty Menu — Safe Reset

**Branch:** `feat/menu-start-fresh` (from main `d352bc8`)
**Status:** Draft code; unit/CI and local DB+browser acceptance required. Not deployed.

## Problem and choice

Restaurant Staff should be able to empty a menu and start again quickly, especially when onboarding a client or replacing a poorly imported menu. **This is not a hard-delete feature.** Historical `order_items.product_id`, `order_items.variant_id`, `order_item_modifiers` and menu import references use `ON DELETE RESTRICT` where necessary. Deleting Products/Categories/Menu outright could break data integrity, historical pricing, refunds or reports.

**Approved first implementation direction:** "Start with a blank menu" archives the Restaurant's existing ACTIVE Menus (sets `status=INACTIVE`, `isPrimary=false`) and creates a new ACTIVE empty primary Menu. Existing categories, products, images, variants, modifiers, historical Orders, and import jobs are left untouched in their archived context. Old menus remain accessible for reference and possible restoration.

The public QR URL, Restaurant identity, Package, branches, ordering channel settings and all staff sessions remain unchanged. Guests see the new empty primary menu; stale guest carts cannot buy archived products, because `PublicOrdersService` rechecks each Product's Category belongs to the current ACTIVE primary Menu inside the order transaction.

## UX

Location: Staff → Menu → Menu & Products, only when the selected Menu is an ACTIVE non-empty **primary** Menu and the Staff member has `menu.manage` plus **allBranches**.

- Secondary action: **Start with a blank menu** / **ابدأ بمنيو فاضية**.
- Confirm with the existing accessible, mobile full-screen `Dialog`; explain the archive, the new empty Guest view, unchanged QR and retained order history.
- Require explicit acknowledgment checkbox. Show server errors with no false success.
- After success load menus and select the new primary, clearing stale category/product selection via existing MenuWorkspace request guards.
- If a first menu is already empty, return idempotent no-op; do not create duplicate empty menus.
- If a pending Menu Import is PROCESSING or READY_FOR_REVIEW, refuse with `409 MENU_IMPORT_PENDING` until resolved.
- If the user's tab references a stale/foreign/non-primary menu, return `404 MENU_NOT_FOUND` or `409 MENU_PRIMARY_CHANGED`. Never modify another Restaurant's menu.

## API

`POST /api/v1/restaurants/:restaurantId/menus/start-fresh` body:
```json
{
  "expectedPrimaryMenuId": "<UUID of current primary menu>",
  "confirmation": "ARCHIVE_AND_START_FRESH"
}
```

Auth guards: existing `AuthGuard`, `CsrfGuard`, `RestaurantAccessGuard`, `PermissionGuard` `menu.manage`, `AllBranchesRequiredGuard`. No client-provided Restaurant ID authority beyond the scoped guard. Service checks primary identity inside the transaction, prevents pending imports and rechecks empty category count, then performs archive+create+translation in one transaction.

`200 { data: { menuId: "<UUID>", changed: true|false } }` returns the new primary selection or existing empty one.

## Important limitations

- This **does not permanently delete** old menu data or images; historical data protection is intentional.
- Old menus remain visible to authorized Staff, marked INACTIVE. Reactivating and switching primary is possible using existing Staff menu editing controls, but a dedicated one-click Undo/Restore can be added after browser QA.
- This V1 action archives **all currently ACTIVE Menus**, but does not permanently delete or conceal archived Menus in Staff. A later dedicated Archive view can make them less prominent. If a future true "delete unused draft" action is needed, require a separate proposal with reference checks, explicit backup, audit and confirmation.
- No new Prisma schema or migration. Code-level CI never proves DB/Guest integration.

## QA / release gate

- Jest tests: tenant scope, invalid/stale menu, active import, already-empty, atomic transaction, default locale and guarded concurrency.
- Backend/controller authorization and CSRF, Staff mobile 320/360/390/430/768, RTL/LTR and keyboard, already-empty and loading/error states.
- Local disposable or owner-authorized backed-up DB: verify public QR shows empty after reset, old Orders/OrderItem/variants remain unchanged, old menu recoverable, pending guest cart gets availability refusal and no new Order, Setup Checklist truthfully updates from Menu/Products readiness.
- Confirm with OWNER before any merge or Production deploy, especially if other code/migrations in main remain unapplied.

**No hard-delete, database reset, or Production mutation is authorized by this document.**
