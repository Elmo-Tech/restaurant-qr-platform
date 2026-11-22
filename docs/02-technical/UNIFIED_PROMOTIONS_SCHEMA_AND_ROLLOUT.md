# Unified Promotions — Schema, Migration and Rollout

> **Status: Accepted (2026-11-21, Product Owner) — DEC-075.** Milestone B1
> delivers storage, the `PROMOTIONS` feature key, a pure engine and a pure
> snapshot mapper only. No application code reads or writes the new tables /
> columns yet and no package or restaurant has `PROMOTIONS`; Guest and Staff
> behavior is unchanged.
> Policy: `docs/01-domain/PROMOTIONS_SPEC.md` "Implementation Amendment: Unified
> Promotions". Numbers: `docs/01-domain/PROMOTIONS_STACKING_EXAMPLES.md`.
> Persisted rows and reader audit: `UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md`.
> ~~Still awaiting approval: AGENTS.md #35 targets, the DEC-034 release label
> (Promotions = V1.1), AGENTS.md #19.~~ **Resolved 2026-11-21 by DEC-075
> Amendment (B-D2):** MENU / QUANTITY / DELIVERY scopes approved; dated notes
> under AGENTS.md #19, #35, DEC-034, PROMOTIONS_SPEC #6 / #22 / #94 and
> DATABASE_SPEC #85.

## 1. Milestones

| Milestone | Scope | State |
| --- | --- | --- |
| **B1** | Docs; pure engine `apps/api/src/promotions/promotion-engine.ts` + `validatePromotionInput`; pure snapshot mapper `promotion-snapshot.ts`; `PROMOTIONS` feature key (API, platform console, web types / labels); additive migration `20261128100000_unified_promotions` | built on `feat/unified-promotions`, not merged |
| B2 | Order flow: extract `priceCart` from `public-orders.service.ts`, call the engine once per order, persist `buildOrderPricingSnapshot`, Delivery Zone minimum on the net payable after the engine, public quote endpoint (own rate-limit group), engine gated by `PROMOTIONS` (off ⇒ legacy-identical result), update every ⚠ reader of the snapshot doc | planned |
| B3 | Staff CRUD API: `promotions.view` / `promotions.manage`, Restaurant + all-Branches guards for structural writes, CSRF, `PromotionsFeatureGuard` (`PROMOTIONS`), tenant-scoped target validation, archive vs delete, zone / category delete conflicts | planned |
| B4 | Staff UI (`/staff/restaurants/[id]/menu/promotions`), Guest cart renders the server quote and sends its total as `expectedTotal`, shortfall explanation for the zone minimum, Guest badges for item-scope winners | planned |

## 2. Schema (migration `20261128100000_unified_promotions`)

Purely additive. Part 1 was generated with `prisma migrate diff` (from a fresh
disposable database migrated to `20261127090000` to the new schema) and
reviewed; statements belonging to the **pre-existing, unrelated drift** (§8)
were removed. Part 2 is hand-written SQL. Changes against the first B1 draft
(PO decisions 2026-11-21): `orders.item_discount_amount` /
`cart_discount_amount` → one `promotion_discount_amount`; `order_promotions`
lost `source` and the PRODUCT scope (legacy discount lives only on
`order_items`); enums `order_promotion_source` / `order_promotion_scope` were
dropped (the table uses `promotion_scope`); `feature_key` gained `PROMOTIONS`;
allocation and order-promotion amounts are now strictly positive.

> **Note 2026-11-22:** the migration was generated against `20261127090000` (base `b61c549`). Main has since gained
> `20261127120000_order_client_request_fingerprint` (PR #74, `orders.client_request_fingerprint CHAR(64) NULL`). The B1
> migration is unchanged: it neither references nor alters that column, still sorts after it, and applies cleanly on
> top of it in either order relative to `20261128090000_onboarding_cases` (verified on disposable PostgreSQL 18 copies
> of a populated main database; see §8 for the drift re-check).

### Enums

| Enum (DB name) | Values |
| --- | --- |
| `PromotionScope` (`promotion_scope`) | CATEGORY, MENU, CART, QUANTITY, DELIVERY |
| `PromotionDiscountType` (`promotion_discount_type`) | PERCENTAGE, FIXED_AMOUNT |
| `PromotionStatus` (`promotion_status`) | ACTIVE, INACTIVE, ARCHIVED |
| `PromotionQuantityBasis` (`promotion_quantity_basis`) | UNITS, DISTINCT_PRODUCTS |
| `FeatureKey` (`feature_key`) | + `PROMOTIONS` (`ADD VALUE IF NOT EXISTS`; no row inserted) |

There is **no PRODUCT promotion scope**: the legacy Product discount stays on
`products.discount_*` as the single authority (no data migration, no dual
write) and, in history, on `order_items.discount_amount`. The engine enters it
as an item candidate with effective priority 0.

### `promotions`

`id` uuid PK · `restaurant_id` → `restaurants` ON DELETE CASCADE
(configuration, not history; orders still block a restaurant deletion through
their own RESTRICT FKs) · `internal_name` · `scope` · `discount_type` · `value`
numeric(14,2) · `status` · `priority` int default 100 · `starts_on` / `ends_on`
date (inclusive, order Branch timezone) · `minimum_subtotal` numeric(14,2)? ·
`minimum_quantity` int? · `quantity_basis`? · `created_by_user_id` /
`updated_by_user_id` → `users` SET NULL · `created_at` / `updated_at` /
`archived_at` timestamptz.

UNIQUE (`id`, `restaurant_id`) (target of the composite FKs). Indexes
(`restaurant_id`, `status`), (`restaurant_id`, `scope`, `status`),
(`restaurant_id`, `starts_on`, `ends_on`).

CHECKs: `promotions_value_positive` · `promotions_percentage_max_100` ·
`promotions_item_scope_percentage_only` (CATEGORY / MENU ⇒ PERCENTAGE) ·
`promotions_quantity_shape` (QUANTITY ⇔ `minimum_quantity` ≥ 1 and
`quantity_basis`) · `promotions_minimum_subtotal_shape` (≥ 0, only CART /
QUANTITY / DELIVERY) · `promotions_dates_ordered` · `promotions_priority_range`
(0..1000) · `promotions_archived_consistent` · `promotions_internal_name_length`
(1..120 trimmed).

### `promotion_translations`

`id`, `promotion_id` → `promotions` CASCADE, `locale`, `title`, `description`?;
UNIQUE (`promotion_id`, `locale`); CHECK title 1..120 trimmed, description
≤ 500. A title in `restaurants.default_locale` is required by validation.

### Target tables (tenant-safe)

`promotion_branches`, `promotion_menus`, `promotion_categories`,
`promotion_products`, `promotion_delivery_zones`: columns (`promotion_id`,
`<target>_id`, `restaurant_id`), PK (`promotion_id`, `<target>_id`), index
(`restaurant_id`, `<target>_id`), and two composite FKs:

- (`promotion_id`, `restaurant_id`) → `promotions`(`id`, `restaurant_id`) ON DELETE CASCADE;
- (`<target>_id`, `restaurant_id`) → `<targets>`(`id`, `restaurant_id`) ON DELETE **RESTRICT**.

A cross-tenant link is impossible in the database (INV-PROMO-005). Every target
table already has `restaurant_id`; the migration adds the missing UNIQUE
(`id`, `restaurant_id`) on `branches`, `menus`, `categories`, `products`,
`delivery_zones` (cannot reject a row: `id` is the PK). RESTRICT on the target
side is deliberate: an empty Branch / Zone list means "all", so a cascade could
silently *widen* a promotion. Today only delivery zones are hard-deleted
(`delivery-zones.service.ts` `deleteZone`, which maps any FK violation to
`hasOrders`); no promotion rows exist until B3, and B3 must answer a dedicated
conflict for "zone used by a promotion".

> **Amended 2026-11-22 (Product Owner correction B-2, implemented in B1).** Because
> `promotion_delivery_zones_zone_scope_fkey` already affects the LIVE delete route once any row exists, B1 now
> includes the minimum compatibility repair: `DELETE /restaurants/{id}/delivery-zones/{zoneId}` answers
> `409 DELIVERY_ZONE_USED_BY_PROMOTIONS` when a promotion targets the zone (pre-check on
> `_count.promotionLinks`; a racing P2003 is mapped by the violated constraint name read from
> `meta.driverAdapterError.cause.constraint.index`), `409 DELIVERY_ZONE_HAS_ORDERS` when Orders reference it
> (unchanged; **takes precedence** when both apply, because Orders block the delete for good), `204` otherwise.
> `canDelete` in the Delivery overview is false in both cases. Web: EN / AR message
> `error.DELIVERY_ZONE_USED_BY_PROMOTIONS` (shown through `describeError`). Tests: `delivery-zones.service.spec.ts`
> and `test/delivery-zone-delete-postgres.e2e-spec.ts` (four cases + race path on real PostgreSQL). B3 obligations:
> `UNIFIED_PROMOTIONS_IMPLEMENTATION_PLAN.md` "Mandatory B3 prerequisites".

### Orders (additive columns)

| Column | Type | Meaning |
| --- | --- | --- |
| `promotion_discount_amount` | numeric(14,2) NOT NULL DEFAULT 0 | Σ new merchandise promotion allocations (CATEGORY / MENU / CART / QUANTITY); never the legacy discount |
| `delivery_fee_original_amount` | numeric(14,2) NULL | zone fee before a delivery promotion; NULL for legacy and non-delivery orders |
| `delivery_discount_amount` | numeric(14,2) NOT NULL DEFAULT 0 | delivery promotion amount |

Unchanged meanings: `subtotal_amount` = NET merchandise payable (= Σ
`line_total` − Σ allocations); `delivery_fee_amount` = NET fee;
`total_amount = subtotal + fee`; `discount_total_amount` = legacy line
discounts + `promotion_discount_amount` (so `subtotal + discount_total` is
still the gross merchandise total).

CHECKs: `orders_promotion_discount_non_negative`,
`orders_delivery_fee_original_non_negative`,
`orders_delivery_discount_non_negative`,
`orders_promotion_discount_within_total` (`promotion_discount_amount ≤
discount_total_amount`, i.e. the legacy part is never negative),
`orders_delivery_discount_consistent` (original NULL ⇒ discount 0; otherwise
discount ≤ original and `delivery_fee_amount = original − discount`). Legacy
rows and the current order code satisfy all of them as-is (evidence T28). The
cross-row rules (Σ allocations = `promotion_discount_amount`, Σ line totals −
allocations = subtotal, Σ legacy + promotion = discount total) are enforced by
`checkOrderPricingSnapshot` before B2 persists.

### `order_promotions` and `order_promotion_allocations`

> **Superseded 2026-11-22 (Product Owner correction B-1)** for the foreign keys / `promotion_id` nullability in the
> next three paragraphs (kept as originally written); the current design is in the amendment that follows them.

`order_promotions`: `id`, `order_id` → `orders` CASCADE, `restaurant_id` →
`restaurants` RESTRICT, `promotion_id` → `promotions` **SET NULL**, `scope`
(`promotion_scope`), `discount_type`, `value`, `amount`,
`internal_name_snapshot`, `title_snapshot`?, `config_snapshot` jsonb,
`created_at`. CHECKs: value > 0, percentage ≤ 100, CATEGORY / MENU ⇒
PERCENTAGE, **amount > 0**, internal name not blank. One row per applied **new**
promotion; the legacy Product discount is never recorded here
(`UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md` §1 explains why).

`order_promotion_allocations`: PK (`order_promotion_id`, `order_item_id`), both
CASCADE, **amount > 0**. Holds the per-line share of every merchandise
promotion (CATEGORY / MENU winners and CART / QUANTITY splits).

Tenant consistency of `order_promotions.restaurant_id` with its order and
promotion, and of an allocation's item with the same order, is written by the
B2 transaction and not enforced by composite FKs (a composite FK that nulls only
`promotion_id` cannot be expressed in Prisma, and new UNIQUE indexes on
`orders` / `order_items` would be built on the two largest tables).

> **Amendment 2026-11-22 (Product Owner correction B-1): historical tenant isolation is enforced by the database.**
>
> | Constraint | Columns → target | ON DELETE | Guarantees |
> | --- | --- | --- | --- |
> | `order_promotions_order_scope_fkey` | (`order_id`, `restaurant_id`) → `orders` (`id`, `restaurant_id`) | RESTRICT | the row's Order belongs to the row's Restaurant; an Order with applied promotions cannot be deleted (same as `order_items_order_id_fkey`) |
> | `order_promotions_promotion_scope_fkey` | (`promotion_id`, `restaurant_id`) → `promotions` (`id`, `restaurant_id`) | RESTRICT | the Promotion belongs to the same Restaurant; a Promotion used by an Order cannot be hard-deleted (archive it — PROMOTIONS_SPEC #52) |
> | `order_promotions_restaurant_id_fkey` | `restaurant_id` → `restaurants` | RESTRICT | unchanged |
> | `order_promotion_allocations_order_promotion_scope_fkey` | (`order_promotion_id`, `order_id`) → `order_promotions` (`id`, `order_id`) | CASCADE | a share has an existing parent row of the same Order; it is a pure split of that row (like `order_item_modifiers`) |
> | `order_promotion_allocations_order_item_scope_fkey` | (`order_item_id`, `order_id`) → `order_items` (`id`, `order_id`) | RESTRICT | a share points only at a line of the SAME Order (so also the same Restaurant); a line carrying a share cannot be deleted |
>
> Supporting UNIQUE indexes: `orders_id_restaurant_id_key`, `order_items_id_order_id_key`,
> `order_promotions_id_order_id_key` (plus the existing `promotions_id_restaurant_id_key`). New column
> `order_promotion_allocations.order_id` (uuid NOT NULL); `order_promotions.promotion_id` is now NOT NULL. All keys
> are `ON UPDATE CASCADE` (Prisma default, like the other composite keys), which turns any attempt to re-point a
> history row — moving a promoted line or applied row to another Order, or a used Promotion to another Restaurant —
> into a foreign-key refusal (tested).
>
> **Why RESTRICT and not a column-list `ON DELETE SET NULL (promotion_id)`.** A plain composite `SET NULL` would
> also null the NOT NULL `restaurant_id` and fail. PostgreSQL 15+ can null only `promotion_id`, but Prisma 7 cannot
> represent the column list: a `SetNull` composite relation is accepted only with a schema warning, the drift check
> ignores the column list (so a regenerated migration would silently lose it), and Prisma itself would generate
> the failing plain `SET NULL` (probe 2026-11-22, `/tmp/wayta-pr74c/evidence/track-b/r3/setnull-probe/`). RESTRICT
> is expressed natively by Prisma (no drift, no warning) and is what `PROMOTIONS_SPEC.md` #52 asks for: a
> Promotion referenced by historical Orders is deactivated / archived, never hard-deleted. Editing or archiving a
> Promotion never touches `order_promotions` / allocations (the snapshot columns are the history; tested).
> Unused Promotions can still be deleted (their configuration rows cascade).
>
> Nothing outside B1 changes: existing `orders` / `order_items` foreign keys and their RESTRICT semantics are
> untouched; the new UNIQUE indexes cannot reject a row (`id` is the primary key). Tests:
> `test/unified-promotions-integrity-postgres.e2e-spec.ts` (inserts refused with SQLSTATE 23503 and the exact
> constraint name; deletes refused by a RESTRICT key report SQLSTATE 23001 `restrict_violation`, which Prisma also
> maps to P2003).

### Security

RLS enabled and `REVOKE ALL` from PUBLIC / `anon` / `authenticated` on the nine
new tables (same block as the Offers migration; evidence T31-T32).

## 3. Permissions (PO decision 2026-11-21)

- Reuse the existing `promotions.view` / `promotions.manage` permissions
  (`apps/api/src/auth/permission/permission.ts`; starter-role templates: OWNER
  all, MANAGER view + manage, CASHIER view, KITCHEN / WAITER none). **No new
  permission.**
- Structural writes (create / edit / enable / archive a promotion and its
  targets) keep the Restaurant + all-Branches guards (`AllBranchesRequiredGuard`)
  and CSRF, like Offers and Delivery Zones.
- Product discount editing (Product editor, `menu.manage`) is unchanged and is
  not gated by `promotions.*`.
- Implementation: B3 (no route exists in B1).

## 4. Entitlement `PROMOTIONS` (PO decision 2026-11-21; implemented in B1)

| Where | Change |
| --- | --- |
| `schema.prisma` `enum FeatureKey` + migration | `PROMOTIONS` value |
| `apps/api/src/entitlements/features.ts` | `FEATURE_KEYS` + `PROMOTIONS`; `OPT_IN_FEATURES = [MENU_IMPORT, PROMOTIONS]`; new `PLATFORM_ONLY_FEATURES = [MENU_IMPORT]` so `CUSTOMER_FEATURE_KEYS` (= all minus platform-only) **includes** PROMOTIONS (customer-visible in packages, My subscription, upgrade options, contracts, landing data); new `DEFAULT_ON_CUSTOMER_FEATURE_KEYS` (customer minus opt-in) |
| `platform-overview.service.ts`, `platform-restaurants.service.ts` | "restricted" count / disabled-feature list use `DEFAULT_ON_CUSTOMER_FEATURE_KEYS`, so a restaurant without an opt-in feature is still not "restricted" (unchanged behavior) |
| `apps/platform/src/lib/api/platform.ts`, `lib/i18n/messages.ts` | key + opt-in list; en / ar label and hint (package editor and restaurant overrides show it; "Select all" skips opt-in keys) |
| `apps/web/src/lib/auth/types.ts`, `lib/subscription/api.ts`, `lib/i18n/messages/subscription.ts` | key in the types; en / ar label and hint for My subscription |
| `entitlements.spec.ts` | PROMOTIONS tests mirroring the MENU_IMPORT opt-in tests |

Packages store an **explicit list** of features (`package_features` rows), and
restaurant overrides are explicit rows (`restaurant_features`); the migration
inserts neither, so every existing package and override leaves PROMOTIONS
**off**. The no-package rule is unchanged — "every feature except the opt-in
ones" — and because PROMOTIONS is opt-in, **a restaurant without a package
does NOT get advanced promotions unless a restaurant override enables it**.
The API is authoritative: B3 adds a `PROMOTIONS` feature guard on the Staff
routes and B2 makes the engine treat a restaurant without the feature as
having no Promotion rows (legacy-identical pricing). The landing page plan
table (`apps/web/src/app/_landing*/copy.ts` `PLAN_FEATURES`) is a curated
display list and was not changed.

### Package compatibility matrix

| Restaurant situation | Product Discounts V1 | Offers (`OFFERS`) | Advanced promotions (`PROMOTIONS`) |
| --- | --- | --- | --- |
| No package, no override | works (never gated) | **on** (default-on customer feature) | **off** (opt-in) |
| No package + override `PROMOTIONS = true` | works | on | **on** |
| Existing package (explicit list, written before B1) | works | as listed (on only if `OFFERS` listed) | **off** (not listed) |
| New package that lists `PROMOTIONS` | works | as listed | **on** |
| Any package + override `PROMOTIONS = false` | works | as listed / overridden | **off** |
| Any package + override `PROMOTIONS = true` | works | as listed / overridden | **on** |
| Override `OFFERS = false` | works | off | unchanged (independent) |

## 5. Rollback and disable

- **Forward-only** in shared environments (AGENTS.md #82). In B1 nothing reads
  the objects, so "disable" = do nothing. From B2: turn `PROMOTIONS` off per
  package / restaurant (engine sees no Promotion rows ⇒ legacy pricing), or set
  promotions INACTIVE / ARCHIVED.
- Down-SQL for **disposable** databases only is in the migration header (drops
  the nine tables, three order columns and five CHECKs, five
  `*_id_restaurant_id_key` indexes, four enums, deletes any PROMOTIONS feature
  rows — the enum value itself cannot be dropped and is harmless — and the
  `_prisma_migrations` row).
- Locks: five `CREATE UNIQUE INDEX` on small configuration tables (SHARE lock
  while building); `orders` gets metadata-only `ADD COLUMN … DEFAULT` and one
  validation scan for the new CHECKs. Back up first; run outside peak hours.

> **Amended 2026-11-22 (correction B-1): two more UNIQUE indexes on the largest tables.** `orders_id_restaurant_id_key`
> and `order_items_id_order_id_key` are built with a plain `CREATE UNIQUE INDEX`: it holds a SHARE lock (verified in
> `pg_locks`), so order creation waits while each index builds; reads continue. Measured on PostgreSQL 18:
>
> | Data | `orders` (id, restaurant_id) | `order_items` (id, order_id) | Whole B1 migration |
> | --- | --- | --- | --- |
> | Populated main clone (235 orders, 274 items) | 0.44 ms | 0.46 ms | 41 ms of statements; `prisma migrate deploy` 1.0 s wall |
> | Synthetic clone (1,000,234 orders, 3,000,993 items; heap 270 MB / 385 MB) | 0.56 s, index 47 MB | 1.58 s, index 142 MB | `prisma migrate deploy` 2.7 s wall |
>
> At Pilot volume the write pause is milliseconds, so the indexes stay in the B1 migration. `CREATE UNIQUE INDEX
> CONCURRENTLY` (SHARE UPDATE EXCLUSIVE, writes continue; 0.47 s / 1.47 s at the synthetic size) was verified to work
> under `prisma migrate deploy`, both alone and mixed with other statements in one file, because **Prisma 7 does
> not wrap a migration file in a transaction** (verified: a statement before a failing one stays committed). If the
> tables ever grow by orders of magnitude, move the two indexes to an earlier separate migration built
> CONCURRENTLY. Consequence of the non-atomic apply (true for every migration of this repository): a failure part-way
> leaves a partial state to be fixed and marked with `prisma migrate resolve`; no B1 statement can fail on existing
> data (unique on a primary key, CHECKs satisfied by legacy rows — compat evidence). The FKs of the new (empty)
> tables take a momentary SHARE ROW EXCLUSIVE lock on `orders` / `order_items` / `promotions`. Down-SQL in the
> migration header now also drops `orders_id_restaurant_id_key` and `order_items_id_order_id_key` (after the
> tables). Evidence: `/tmp/wayta-pr74c/evidence/track-b/r3/compat/`, `.../concurrently-probe/`.

## 6. Compatibility matrix — readers of order money

Superseded by the detailed per-reader audit in
`UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md` §3 (with example rows (a)–(d)). In
B1 every reader is safe because no order uses the new columns. In B2 the
readers that assume Σ `line_total` = subtotal (table-session summary / bill /
drawer, dashboard top products, per-line displays in guest confirmation, staff
detail and receipt) and the client-computed Guest cart total must change in the
same slice.

## 7. Test plan

| Milestone | Test | State |
| --- | --- | --- |
| B1 | `promotion-engine.spec.ts` (64 cases): mandatory 180 / 170 example, Product / Category / Menu / Cart / Quantity competitions, tie-breaks, priorities, sizes (`discountApplies`), paid extras, zero price, 100 %, fixed > basis, half-cent rounding, thresholds below / at / above, units vs distinct products, offers, delivery (vs item, vs cart, multiple, wrong zone, wrong order type, zero fee, minimum), local dates incl. `localDateIn` boundary, Branch applicability, zone-minimum no-fallback, legacy-identical math, allocation determinism; **every scenario asserts the reconciliation identities and `checkOrderPricingSnapshot` = []** | **exists, passing** |
| B1 | `promotion-snapshot.spec.ts` (12 cases): rows (a)–(d), delivery without promotion, zero-share allocations, tamper detection | **exists, passing** |
| B1 | `entitlements.spec.ts`: PROMOTIONS opt-in / customer-visible / overrides / no-package / existing packages | **exists, passing** |
| B1 | regression: `product-discount*`, `public-orders*`, `money-decimal`, platform / my-subscription / landing specs | **passing** |
| B1 | Migration on a **fresh** disposable DB: full `migrate deploy`, status, no promotion drift, CHECK / composite-FK / cascade / restrict / RLS probes, reconciliation of example (a) in SQL | **done** (evidence `wayta-review/track-b-r2/evidence/`) |
| B1 (round 3) | `test/unified-promotions-integrity-postgres.e2e-spec.ts` (15): cross-tenant order / promotion refused, NOT NULL promotion, missing parent, line of another Order (same Restaurant) and of another Restaurant refused both ways, valid same-Order share reconciles, used Promotion delete refused while edit / archive keep history byte-identical, used Promotion cannot change Restaurant, unused Promotion deletable, Order with promotions / with lines RESTRICT, promoted line cannot be deleted or moved, applied row cannot be re-pointed, shares cascade with their row only | **exists, passing** |
| B1 (round 3) | `delivery-zones.service.spec.ts` (+6) and `test/delivery-zone-delete-postgres.e2e-spec.ts` (5): Orders / promotions / both / none, `canDelete`, HTTP code via the controller, race path mapped by constraint name on real PostgreSQL | **exists, passing** |
| B2 | `priceCart` unit tests with mocked Prisma; e2e (sandbox DB): each strategy for Dine-In / Pickup / Delivery, snapshot rows equal the mapper output, zone minimum refusal after a cart win, `PRICE_CHANGED` with the quote total, idempotent retry, `PROMOTIONS` off ⇒ legacy-identical orders | planned |
| B2 | Reader updates of the snapshot doc §3 | planned |
| B3 | Staff API: permissions / Branch scope / CSRF / feature guard, validation codes, tenant-scoped targets, archive vs delete, zone-delete conflict | planned |
| B4 | Web `node --test` contract tests for the quote-driven cart; Playwright Guest cart with a CART promotion; RTL / AR copy; shortfall message | planned |

## 8. Pre-existing drift (not introduced by B1)

`prisma migrate diff` between a database migrated to HEAD `b61c549` and
`schema.prisma` at HEAD already reports 100 lines of unrelated drift
(`DROP DEFAULT` on several `id` / `updated_at` columns of platform / package /
subscription tables, and re-created `whatsapp_*` foreign keys). After applying
B1 on a fresh database the diff is **identical** (0 promotion / feature-key
statements). Reported, not fixed here.

> **Re-measured 2026-11-22 on `origin/main` `d0d608a` (after PR #74):** `prisma migrate diff --from-config-datasource
> --to-schema prisma/schema.prisma --script` against a fresh database migrated to main (72 migrations) gives the same
> pre-existing statement set (69 non-empty SQL lines: `DROP DEFAULT` on `id` / `updated_at` columns of platform /
> package / subscription / WhatsApp tables and re-created `whatsapp_*` foreign keys). With B1 applied on top (73
> migrations) the output is byte-identical: 0 promotion, `feature_key` or `client_request_fingerprint` statements.
> PR #74's migration `20261127120000_order_client_request_fingerprint` sorts before `20261128100000_unified_promotions`;
> the two touch disjoint `orders` columns.
