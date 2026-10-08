# Proposal: Product Discounts and Offers

Status: **PROPOSAL ONLY. Not approved, not implemented.** No pricing logic, schema or UI change accompanies this document.

Origin: Guest Menu Final Polish (FT-13B).

Read together with `docs/01-domain/PROMOTIONS_SPEC.md`, which already defines V1 Promotions (PERCENTAGE and FIXED_AMOUNT; ORDER, PRODUCT and CATEGORY targets; scheduling; branch applicability; priority; snapshots). Nothing here replaces it. This document says how the Guest Menu, the data model and the later offer types fit on top of it. The Prisma schema has no Promotion model yet.

## Principles (unchanged from the spec)

- The Backend is the only authority for eligibility and the final discount (#1, #45). React, n8n and the AI never compute it.
- Money uses `Decimal`. API money values are strings (#27). Percentages use the spec's rounding rule (#42).
- Guest sees the original price, the discounted price and an offer badge. Never a fake crossed-out price (#34).
- Paid Extras are not discounted by default (#36-37). Variant adjustments are inside the discountable amount (#35).

## Phase A: product-level discounts (the V1 Promotion, PRODUCT target)

What the Restaurant can do: attach a percentage or fixed-amount discount to a Product, with optional start and end dates and a manual active switch.

### Data model (conceptual)

```text
Promotion                 name, title/description (via PromotionTranslation), discountType, discountValue,
                          targetType, status (ACTIVE | INACTIVE), startsAt?, endsAt?, dailyStart?/dailyEnd?,
                          minimumOrderAmount?, priority, restaurantId
PromotionBranch           promotionId, branchId            (empty = all branches)
PromotionProduct          promotionId, productId           (PRODUCT target)
PromotionTranslation      promotionId, locale, title, description
```

- Tenant-scoped by `restaurantId` on every query.
- `discountValue` is `Decimal`. A CHECK constraint (custom SQL migration) keeps percentage in 0 to 100 and fixed amounts positive.
- Dates are stored as `timestamptz` and interpreted in the Branch timezone for daily windows (#15).
- Deactivate or archive only. Never hard-delete a referenced Promotion (#51-52).

### Pricing rules

1. Compute the unit price: base + Variant adjustment (eligible amount). Paid Extras are added after the discount.
2. Discount = percentage of the eligible amount, or the fixed amount capped at it (#41).
3. One Promotion per Product line in V1 (#26). If several match, the highest priority wins and ties break deterministically (#28-29).
4. Re-evaluate at order submission. If a Promotion expired or changed while the cart was open, the submitted totals follow the live rule and the Guest is told (#46-48). The cart display is never authoritative.

### API and Guest surface

- The public menu DTO adds per product: `originalPrice`, `discountedPrice`, `promotion: { badge, title }` (all strings, only when eligible).
- Order creation is unchanged: the client sends products and modifiers, never prices or discounts.
- Guest UI: `Price` shows the discounted price with the original struck through, and `ProductCard` shows a badge. These are display-only and need no pricing logic in the frontend.

### Historical snapshots

Add to the Order domain, never by rewriting existing rows:

```text
OrderItem.discountAmount          Decimal   (0.00 default)
OrderItem.promotionId?            reference for traceability only
OrderItem.promotionNameSnapshot?  string
OrderItem.promotionTypeSnapshot?, promotionValueSnapshot?   (configuration as applied)
Order.discountTotalAmount         Decimal   (sum of item discounts; subtotal - discounts + fee = total)
```

`OrderItem.unitPrice` keeps meaning "price before discount", so existing orders stay valid and totals reconcile. Changing or deleting a Promotion later never alters a past order (#50).

### Migration requirements

- New tables plus new columns with safe defaults (`0.00`, `NULL`). Existing Orders need no backfill because `discountAmount = 0` is correct for them.
- One custom SQL migration for the CHECK constraints (value ranges, `endsAt > startsAt`).
- Update seed data, API DTOs, OpenAPI and the Staff and Guest read models together (schema drift rule #89).
- Ship Staff CRUD (progressive disclosure, spec #61-62) after the read path, in vertical slices (#65).

## Phase B: advanced offers (after Phase A is proven)

Each is a new rule type or its own model, not an overloaded simple Promotion (#95-96).

| Offer | Model direction | Extra pricing concerns |
| --- | --- | --- |
| Quantity promos (3 for X, 2nd at 50%) | `PromotionRule` of type QUANTITY with thresholds | Allocate the discount across lines deterministically, with rounding that always sums to the total |
| BOGO / Buy X get Y | Rule type with buy-set and get-set | Choose which units are free (cheapest first), with a per-order cap |
| Combos / bundles (burger + fries + cola for 299) | Dedicated `Bundle` + `BundleItem` (+ slot groups with allowed products) | Bundle price vs sum of parts. Component stock and availability checks. Modifiers inside slots |
| Scheduling and eligibility | Day-of-week, happy-hour windows, branch and order-source conditions, channel (pickup, delivery, dine-in) | Evaluate in the Branch timezone. Overnight windows |
| Coupons | `Coupon` referencing a Promotion, not a second pricing engine (#97) | Usage limits and per-customer limits (deferred in #94) |
| Stacking | Explicit stacking groups and a total order of evaluation | Default stays "no stacking". Any stacking needs an explicit, tested precedence table |

Snapshot handling for Phase B: record per applied offer an `OrderPromotionApplication` row (promotion/bundle reference, name and configuration snapshot, discount amount, affected `OrderItem` ids), so one order can carry several applications without changing `OrderItem` again. Bundles need an `OrderItem` group id so the kitchen and the receipt show the bundle as one line with its components.

## Decisions needed before implementation

1. Whether Phase A ships as the spec's full Promotion entity, or as a Product-only subset of it that is forward-compatible.
2. The rounding rule for percentage discounts, confirmed against spec #42.
3. Whether the discounted price also feeds the delivery minimum-order check. The spec bases minimums on the pre-promotion merchandise subtotal (#21). Keep that unless the product owner decides otherwise.
4. Whether `Order.totalAmount` semantics change (they should not: it stays the final payable total).

## Risks and recovery

- A wrong rounding or ordering rule produces a visible price mismatch. Mitigation: pure, unit-tested calculation service used by both the menu read path and order creation, with tests drawn from the spec's acceptance examples (#100-108).
- Migrations are additive. Rollback before any Promotion is created means dropping the new tables and columns. After promotions exist, deactivate instead of dropping.
