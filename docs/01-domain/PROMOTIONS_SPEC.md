# Promotions Specification

## Document Purpose

This document defines the authoritative V1 behavior for:

- Promotions
- Discount types
- Promotion targets
- Branch applicability
- Product applicability
- Category applicability
- Order-level promotions
- Scheduling
- Minimum order requirements
- Eligibility
- Promotion priority
- Price recalculation
- Historical promotion snapshots
- Guest display
- AI Assistant access

This specification is the source of truth for V1 Promotion behavior.

---

## Implementation Amendment: Product Discounts V1 (2026-10-11)

The first implemented slice of this specification is **Product Discounts V1**: a
product-level percentage or fixed-amount discount with an optional start / end
date and a manual enable switch (decision DEC-036). It is a deliberate,
forward-compatible **subset** of the full Promotion model below. Everything not
listed here (ORDER and CATEGORY targets, Promotion entity, priority, stacking,
coupons, time-of-day windows, minimum-order promotions, bundles, BOGO) remains
**not implemented** and keeps the semantics of the sections that follow.

Where the full text and the implemented subset differ, this amendment wins for
Product Discounts V1:

| Topic | Full spec | Product Discounts V1 (implemented) |
| --- | --- | --- |
| Storage (#11) | `Promotion` entity + target tables | Five columns on `products` (type, value, enabled, starts-on, ends-on). One discount per product, so priority / tie-breaking (#26-29) never arises. |
| Scheduling (#13, #15) | start / end instants, daily windows | Calendar **dates**, inclusive on both ends, evaluated in the **Branch timezone** at read time. "Automatic expiry" is the date comparison itself, so no scheduled job exists. |
| Which Branch timezone | per Branch | TABLE QR: the table's Branch. Order creation: the chosen Branch. GENERIC menu display (no Branch chosen yet): the oldest ACTIVE Branch. Staff discount state labels: the same oldest-Branch "reference timezone". |
| Variants (#35) | adjustments are discountable | ~~The platform has no Product Variant in V1; the discount applies to the product price only.~~ **Superseded by DEC-041 (factual correction, 2026-11-21):** Product Variants (sizes) exist; each size carries its full price and a `discountApplies` flag (default true). The Product discount is computed on the chosen size's price, only for sizes with `discountApplies = true`; a fixed amount is capped at that size's price. |
| Extras (#36-37) | not discounted by default | Same: paid Modifier options are never discounted. |
| Rounding (#42) | open | Percentage discount is rounded **half-up to 2 decimals per unit**; a fixed amount is capped at the unit price; the unit price never goes below 0. |
| Calculation order | open | unit price = base - unit discount; line = (unit price + paid modifiers) x quantity; subtotal = sum of lines; delivery fee is added afterwards. |
| Cart changed while open (#46-48) | pricing-change response | Guest orders may send `expectedTotal`; a mismatch creates nothing and returns `422 PRICE_CHANGED` with `details.pricing` (API_CONVENTIONS.md #75). The Guest app refetches the menu and asks the Guest to confirm again. `expectedTotal` is optional so older clients keep working. |
| Minimum amount (#21) | pre-promotion subtotal for **Promotion** minimums | Product Discounts V1 has no promotion minimum. The **Delivery Zone minimum order** is evaluated on the **net payable items subtotal** (after discounts), because it protects what the restaurant actually collects for the items. See DEC-036. |
| Snapshot (#49) | promotion reference + configuration | `order_items.unit_price` stays the price **before** discount; `discount_amount` (line total discount), `discount_type_snapshot`, `discount_value_snapshot`; `orders.discount_total_amount`. `orders.subtotal_amount` stays the net payable items subtotal, so `subtotal + delivery fee = total` is unchanged. |

Authority: the Backend (`apps/api/src/menu/product-discount.ts`) is the only
place a discount is resolved or calculated. The Staff editor preview and the
Guest cart are display-only and are recomputed on submission.

---

## Implementation Amendment: Unified Promotions

> **Status: Accepted (2026-11-21, Product Owner) — DEC-075. Amends #27–#29 and
> AGENTS.md #36 for the Unified Promotions engine.** The policy below is the
> approved contract. It is **not live yet**: milestone B1 adds only a pure,
> unit-tested engine (`apps/api/src/promotions/promotion-engine.ts`), a pure
> snapshot mapper (`promotion-snapshot.ts`), the opt-in `PROMOTIONS` feature key
> and an additive migration (`20261128100000_unified_promotions`) that no order
> code reads or writes yet. Order creation, the Guest menu and the Staff UI
> still follow "Product Discounts V1" above until B2–B4 are built.
> Worked numbers: `PROMOTIONS_STACKING_EXAMPLES.md`. Schema, permissions,
> entitlement, readers and test plan:
> `docs/02-technical/UNIFIED_PROMOTIONS_SCHEMA_AND_ROLLOUT.md`. Persisted rows:
> `docs/02-technical/UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md`.
>
> **Amendment 2026-11-21 (B-D2, Product Owner second review) — Accepted.** The
> Promotion domain is extended with `MENU`, `QUANTITY` and `DELIVERY` scopes
> (DEC-075 "Amendment 2026-11-21 (B-D2)"). The three rows below that were
> "Awaiting approval" are resolved by it; their original status is kept
> struck through for traceability.

### Mapping of the original targets to engine scopes

| Original target / type (#6, AGENTS.md #35) | Unified Promotions scope | Storage |
| --- | --- | --- |
| ORDER | `CART` (pre-promotion basis of eligible product lines incl. paid extras; optional category / product restriction) | `promotions` (+ `promotion_categories` / `promotion_products`) |
| PRODUCT | the existing Product discount, item-scope candidate "PRODUCT" with effective priority 0 | `products.discount_*` (no Promotion row) |
| CATEGORY | `CATEGORY` (percentage only, INV-PROMO-008) | `promotions` + `promotion_categories` |
| — (new, B-D2) | `MENU` (percentage only), `QUANTITY` (units / distinct products threshold), `DELIVERY` (zone fee) | `promotions` + `promotion_menus` / `promotion_delivery_zones` |

### Decisions (2026-11-21) and items that were awaiting approval

| Item | Status |
| --- | --- |
| Winner rule: maximum savings first (item 1 below) | **Accepted** — amends #27–#29 and AGENTS.md #36 (dated notes added there; original text kept) |
| Legacy Product discount never stays applied when the cart strategy wins | **Accepted** (engine + tests) |
| Delivery Zone minimum on the NET merchandise payable, refusal with the existing minimum-order error, no promotion suppressed to pass it | **Accepted** |
| `discountApplies = false` governs the legacy Product discount only | **Accepted** |
| Paid modifiers never discounted by item-scope promotions; Offers / bundles never discounted again | **Accepted** |
| Permissions: existing `promotions.view` / `promotions.manage` | **Accepted** (implemented in B3) |
| Entitlement: new opt-in, customer-visible `PROMOTIONS` feature key | **Accepted and added in B1** |
| Historical snapshot model (legacy on `order_items`, new promotions as allocations) | **Accepted** (schema + pure mapper in B1) |
| AGENTS.md #35 targets (ORDER / PRODUCT / CATEGORY; MENU, QUANTITY, DELIVERY are new) | ~~Awaiting approval — #35 not edited~~ **Accepted 2026-11-21 (B-D2)** — dated note under AGENTS.md #35, #6, #94, DATABASE_SPEC #85 |
| DEC-034 release label (Promotions listed as V1.1) | ~~Awaiting approval~~ **Resolved 2026-11-21 (B-D2)** — dated note under DEC-034: availability via the opt-in `PROMOTIONS` key, not live before B2–B4 |
| AGENTS.md #19 "Delivery is deferred" (stale since DEC-034) | ~~Awaiting approval — not edited~~ **Resolved 2026-11-21** — dated superseding note under AGENTS.md #19 (DEC-034 Delivery, DEC-075 delivery-fee promotions) |

### Conflicts recorded when this amendment was proposed

1. **Winner rule (direct inversion) — resolved by DEC-075.** The original text is *priority-first*:
   - #27: "The backend chooses one winning Promotion path according to the configured priority rules."
   - #28: "Lower number = Higher priority … Priority determines which Promotion is evaluated first when several Promotions overlap."
   - #29: "If multiple eligible Promotions have the same Priority: The backend should choose the Promotion that gives the customer the greater valid discount."
   - AGENTS.md #36: "Lower numeric priority wins. If valid Promotions share the same priority: Choose the greater valid discount deterministically."

   This amendment uses **saving-first** (accepted 2026-11-21): the greatest
   monetary saving for the Guest wins; priority (lower number first) only
   breaks an *exact* tie of savings. AGENTS.md #36 carries a dated amendment
   note; ~~#35 still awaits approval~~ #35 amended by B-D2 (2026-11-21).
2. **New targets — resolved by DEC-075 Amendment 2026-11-21 (B-D2).** `MENU`, `QUANTITY` and `DELIVERY` do not exist in #6 /
   DATABASE_SPEC #85 (ORDER / PRODUCT / CATEGORY only). Quantity Discounts are
   listed as deferred in #94; delivery fees are outside Promotion calculation
   in #22. `CART` is this amendment's name for the ORDER target.
3. **Version scope (~~awaiting approval~~ resolved 2026-11-21, B-D2: dated note under DEC-034).** DEC-034 lists Promotions as **V1.1**;
   AGENTS.md #35 calls them "V1 Promotion types". DEC-075 does not relabel the
   release.
4. **Product discount as a competitor.** DEC-036 / the amendment above say "one
   discount per product, so priority never arises". Here the legacy Product
   discount becomes one item-scope candidate among others (accepted with the
   DEC-075 policy, R1 below).
5. **Resolved 2026-11-21 (dated note under AGENTS.md #19).** AGENTS.md #19 ("Delivery is deferred") is already stale since DEC-034; noted
   for the same AGENTS.md update.

### Policy (accepted)

| Rule | Behavior |
| --- | --- |
| R1 Item scope | Per product line the candidates are: the legacy Product discount (`products.discount_*`, resolved by `resolveActiveDiscount`, **only if the chosen size has `discountApplies = true`**), CATEGORY promotions targeting the line's category and MENU promotions targeting the line's menu. CATEGORY / MENU are **PERCENTAGE only** (FIXED rejected by validation and a DB CHECK, extending INV-PROMO-008). Unit discount on the pre-discount unit price (size price or base price), paid modifiers excluded, half-up to 2 decimals per unit, capped at the unit price (`computeUnitDiscount`). Winner per line = greatest line saving; exact tie → lower priority number → specificity PRODUCT (legacy) > CATEGORY > MENU → promotion id ascending. The legacy Product discount has **effective priority 0** (no column exists; it wins every exact tie by priority). |
| R1 design decision | `discountApplies` governs **only** the legacy Product discount, exactly as today (DEC-041). CATEGORY / MENU promotions apply to **all sizes** of their products. Reason: the flag was defined as "does the Product discount apply to this size"; reusing it for promotions would silently change its meaning. |
| R1 CATEGORY / MENU eligibility (exact) | A product line is eligible for a CATEGORY promotion when the line's Product `category_id` is in the promotion's category list, and for a MENU promotion when that category's `menu_id` is in its menu list (both evaluated on the Product's current category at order time; offers are never product lines). Additionally the promotion must be `ACTIVE`, `today` within `starts_on` / `ends_on` (inclusive, order Branch timezone), and the order Branch in its Branch list (empty = all). There is no spend / quantity minimum for item scope (rejected by validation and a CHECK). The saving is PERCENTAGE of the pre-discount unit price of the chosen size (or base price), half-up per unit, capped at the unit price, paid modifiers excluded; a line whose unit saving rounds to 0.00 (e.g. a 0.00 price) has nothing to win. |
| R2 Cart scope | CART and QUANTITY promotions compete for **one** winner. Eligible lines = product lines (Offer / bundle lines never), optionally restricted by the promotion's category / product targets (empty = all product lines; category ∪ product). Basis = Σ (unit price + paid modifiers per unit) × qty of eligible lines, **pre-promotion**. Cart promotions therefore discount merchandise **including** paid extras, item-scope ones exclude them. CART requires basis ≥ `minimumSubtotal` (if set). QUANTITY requires count ≥ `minimumQuantity`, count = total units (UNITS) or distinct products (DISTINCT_PRODUCTS; two sizes of one product count once), plus an optional `minimumSubtotal`. Amount: PERCENTAGE = basis × value / 100 half-up 2 dp; FIXED = min(value, basis), once per order. Winner = greatest saving → priority → id. |
| R3 Strategy | A = Σ item-scope winners; B = cart winner. **B only if B > A strictly**; exact tie keeps A. Never combined: when B wins, no item discount applies, **including legacy Product discounts**. B is allocated to its eligible lines proportionally to each line's basis: floor to cents, remaining cents one by one to the largest fractional remainder, ties by line index ascending (deterministic, sums exactly, never above a line's basis). |
| R4 Delivery | Only `DELIVERY` orders with a zone and a fee. Candidates: DELIVERY promotions whose Branch applicability matches and whose zone list includes the zone (empty = every zone of the eligible Branches). `minimumSubtotal` basis = pre-promotion merchandise total of **all** lines **including Offer lines**. PERCENTAGE of the fee half-up 2 dp (100 % = free delivery); FIXED = min(value, fee). One winner: saving → priority → id. Independent of R3: it coexists with the item or cart strategy. |
| R5 Offers | Offer / bundle lines are excluded from every merchandise promotion and from quantity counts and cart bases; their totals still count in the merchandise payable and in the delivery-promotion minimum basis (consistent with #96 / DEC-069). |
| R6 / R7 | Nothing is ever negative. `Prisma.Decimal` only, explicit ROUND_HALF_UP; allocation uses exact integer cents. |
| R8 Minimums | Promotion minimums use the **pre-promotion** basis (#21). The **Delivery Zone minimum stays on the NET merchandise payable** (DEC-036) and is checked by the caller **after** the engine with the winning strategy. If it fails, the order is refused with the existing minimum-order error (`MINIMUM_ORDER_NOT_MET`); the engine never suppresses a promotion or falls back to a worse strategy to reach the minimum. Reason: "the best discount always applies" stays deterministic and explainable, and the zone minimum keeps protecting what the restaurant actually collects, exactly as today. The Guest UI must explain the shortfall (B4). |
| R9 Eligibility | Status `ACTIVE` only (INACTIVE / ARCHIVED are never candidates). Calendar dates `startsOn` / `endsOn` inclusive, compared with `today` computed by the caller in the **order Branch timezone** (`localDateIn`). Branch applicability: empty Branch list = all Branches. |
| R10 History (accepted 2026-11-21) | `order_items.discount_amount` (+ `discount_type/value_snapshot`) = the **legacy** Product discount only, only when it applied (item strategy and the legacy discount won that line). `order_items.line_total` = (unit − legacy unit discount + modifiers) × qty, **before** new promotions. Every NEW merchandise saving (CATEGORY / MENU winners and the CART / QUANTITY winner) is stored only as `order_promotions` + per-line `order_promotion_allocations`; a beaten legacy discount is never stored. The delivery promotion is a fee adjustment: `orders.delivery_fee_original_amount`, `delivery_discount_amount`, one `order_promotions` row (no allocation); `delivery_fee_amount` = net fee. `orders.promotion_discount_amount` = Σ allocations; `discount_total_amount` = legacy line discounts + `promotion_discount_amount`; `subtotal_amount` = Σ `line_total` − Σ allocations; `total = subtotal + fee`. |
| Entitlement / permissions | Opt-in `PROMOTIONS` feature key (not gated: Product Discounts V1; Offers stay on `OFFERS`). Staff routes (B3): `promotions.view` / `promotions.manage`, structural writes behind the Restaurant + all-Branches guards. |
| Storage | No PRODUCT scope row: the legacy Product discount stays on `products` (single authority, no data migration). |
| Diagnostics | Per promotion: `APPLIED`, `LOST_TO_BETTER_OFFER`, `NOT_STARTED`, `EXPIRED`, `INACTIVE`, `WRONG_BRANCH`, `WRONG_ORDER_TYPE`, `WRONG_ZONE`, `NO_ELIGIBLE_ITEMS`, `NO_DELIVERY_FEE`, `NO_EFFECTIVE_DISCOUNT`, `BELOW_MINIMUM_SUBTOTAL` (+ remaining amount), `BELOW_MINIMUM_QUANTITY` (+ remaining quantity), `INVALID_CONFIGURATION`. A delivery promotion on a positive fee that otherwise qualifies but saves 0.00 after rounding reports `NO_EFFECTIVE_DISCOUNT` and cannot win; a zero or absent fee still reports `NO_DELIVERY_FEE`. |

Validation (`validatePromotionInput`): scope / type combos above; percentage
0 < v ≤ 100; fixed > 0; at most 2 decimals; end ≥ start; priority integer
0..1000; QUANTITY requires `minimumQuantity` (integer ≥ 1) and `quantityBasis`;
`minimumSubtotal` ≥ 0 and only for CART / QUANTITY / DELIVERY; targets per
scope: CATEGORY → categories required, MENU → menus required, CART / QUANTITY →
optional categories / products, DELIVERY → optional zones, every scope →
optional Branches; a title in the Restaurant default locale is required.

---

# 1. Core Principle

A Promotion is a backend-controlled pricing rule.

A Promotion is not:

- A Product base price
- A manually entered frontend discount
- An AI-generated discount
- A coupon code in V1
- A payment adjustment

The backend is always authoritative for Promotion eligibility and final discount value.

---

# 2. V1 Promotion Goal

V1 must support useful restaurant offers without creating a complex Promotion Engine.

The restaurant should be able to create common offers such as:

- 20% off Burgers
- 10% off Desserts
- 50 EGP off a specific Product
- 100 EGP off Orders above 1,000 EGP
- 15% off during a configured time period
- A Promotion available only in one Branch

More advanced Promotion types are deferred.

---

# 3. V1 Discount Types

V1 supports two discount types:

- PERCENTAGE
- FIXED_AMOUNT

No additional discount types are required initially.

---

# 4. Percentage Discount

Example:

Product price:
250 EGP

Promotion:
20%

Discount:
50 EGP

Final qualifying price:
200 EGP

Percentage value must be:

greater than 0
and
less than or equal to 100

---

# 5. Fixed Amount Discount

Example:

Product price:
250 EGP

Promotion:
50 EGP off

Final qualifying price:
200 EGP

A Fixed Amount Promotion must never reduce the qualifying amount below zero.

---

# 6. Promotion Target

A Promotion has one target type.

V1 target types:

- ORDER
- PRODUCT
- CATEGORY

> **Amended by DEC-075 (2026-11-21, B-D2).** The list above is kept as originally written. Scopes are now
> `CATEGORY`, `MENU`, `CART` (= ORDER), `QUANTITY` and `DELIVERY`; PRODUCT stays the existing Product discount
> (`products.discount_*`). Mapping (see "Implementation Amendment: Unified Promotions" at the top of this document).

---

# 7. ORDER Target

An ORDER Promotion applies to the qualifying Order subtotal.

Example:

Promotion:

100 EGP off Orders above 1,000 EGP.

Cart subtotal:

1,200 EGP

Discount:

100 EGP

Final merchandise total:

1,100 EGP

before any future tax or service-charge rules.

---

# 8. PRODUCT Target

A PRODUCT Promotion applies only to one or more explicitly selected Products.

Example:

20% off Beef Burger.

Other Products are unaffected.

---

# 9. CATEGORY Target

A CATEGORY Promotion applies to qualifying Products belonging to selected Categories.

Example:

15% off Desserts.

All qualifying active Products in the selected Dessert Category may receive the Promotion.

---

# 10. Fixed Amount Category Promotions

To keep V1 predictable:

FIXED_AMOUNT promotions must not target CATEGORY.

Allowed:

PERCENTAGE + CATEGORY

Allowed:

PERCENTAGE + PRODUCT

Allowed:

FIXED_AMOUNT + PRODUCT

Allowed:

PERCENTAGE + ORDER

Allowed:

FIXED_AMOUNT + ORDER

This avoids ambiguous behavior such as:

50 EGP off every item in a Category.

More advanced category pricing rules are deferred.

> **Note (DEC-075, 2026-11-21, B-D2).** Still valid; the new `MENU` scope follows the same rule (percentage only,
> validation + DB CHECK `promotions_item_scope_percentage_only`). FIXED_AMOUNT is allowed for `CART` (= ORDER),
> `QUANTITY` and `DELIVERY`.

---

# 11. Promotion Entity

A V1 Promotion should conceptually support:

- Internal ID
- Public identifier where needed
- Restaurant
- Name
- Customer-facing title
- Customer-facing description
- Discount Type
- Discount Value
- Target Type
- Active state
- Start date
- End date
- Optional daily start time
- Optional daily end time
- Branch applicability
- Minimum Order Amount where applicable
- Priority
- Created timestamp
- Updated timestamp

Exact schema will be defined in DATABASE_SPEC.md.

---

# 12. Promotion Active State

A Promotion may be:

ACTIVE
or
INACTIVE

INACTIVE Promotions:

- Do not affect pricing
- Do not appear as active guest offers
- Remain available historically

---

# 13. Promotion Scheduling

A Promotion may optionally define:

- Start Date
- End Date
- Daily Start Time
- Daily End Time

Example:

Start Date:
August 25

End Date:
August 31

Daily Time:
3:00 PM to 7:00 PM

The Promotion applies only inside the valid schedule.

---

# 14. Open-Ended Promotion

A Promotion may have no End Date if the restaurant wants it to remain active until manually disabled.

The Dashboard must clearly indicate that the Promotion is ongoing.

---

# 15. Timezone

Promotion time evaluation must use the relevant Branch timezone.

Do not evaluate restaurant-facing Promotion time using the server machine timezone.

Exact timestamp storage rules will be defined in technical specifications.

---

# 16. Overnight Time Window

Future restaurants may create offers such as:

10:00 PM
to
2:00 AM

The time-window implementation should support overnight ranges safely.

If this increases V1 implementation complexity significantly, the initial Dashboard may restrict daily time windows to same-day ranges and document the limitation.

The domain model must not permanently prevent overnight scheduling.

---

# 17. Branch Applicability

A Promotion may apply to:

- All Restaurant Branches
or
- Selected Branches

Example:

20% Dessert Promotion

New Cairo:
Enabled

Maadi:
Disabled

The backend determines eligibility using the Order Branch.

---

# 18. Product Applicability

For PRODUCT target:

Promotion must reference one or more selected Products.

The Product must belong to the same Restaurant tenant.

Cross-Tenant Product targeting is invalid.

---

# 19. Category Applicability

For CATEGORY target:

Promotion references one or more selected Categories.

The Category must belong to the same Restaurant tenant.

Only qualifying Products from those Categories receive the discount.

---

# 20. Minimum Order Amount

A Promotion may require a minimum Order subtotal.

Example:

20% off Orders above 500 EGP.

Minimum Order Amount:

500 EGP

Cart subtotal:

450 EGP

Result:

Not eligible.

Cart subtotal:

600 EGP

Result:

Eligible.

---

# 21. Minimum Amount Calculation

V1 minimum amount eligibility is evaluated using the qualifying merchandise subtotal before Promotions.

Example:

Cart subtotal:
550 EGP

Minimum:
500 EGP

Promotion:
20%

The Order qualifies based on:

550 EGP

not on the post-discount amount.

---

# 22. Taxes and Service Charges

V1 Promotion calculation applies to merchandise pricing before future:

- Taxes
- Service charges
- Delivery fees
- Tips

These financial components will receive separate specifications when introduced.

Promotion logic must not guess tax behavior.

> **Amended by DEC-075 (2026-11-21, B-D2).** Delivery fees are no longer fully outside Promotions: a `DELIVERY`
> promotion discounts the zone fee only, as one independent winner beside the merchandise strategy (R4)
> (see "Implementation Amendment: Unified Promotions" at the top of this document). Merchandise promotions still never touch the delivery fee; taxes, service charges and tips are unchanged.

---

# 23. Automatic Promotions

V1 Promotions are automatically evaluated.

Guests do not need to enter a Promotion code.

Example:

Guest adds eligible Product.

Backend determines:

Promotion applies.

Guest sees the discounted price.

---

# 24. Coupon Codes

Coupon codes are not part of V1.

Deferred examples:

- SUMMER20
- FIRSTORDER
- WELCOME50

Coupon functionality belongs to V2 or V3.

---

# 25. Promotion Stacking

V1 does not support arbitrary Promotion stacking.

This is intentional.

Combining several Promotions can quickly create:

- Unexpected totals
- Restaurant configuration mistakes
- Difficult testing
- Difficult historical explanations

---

# 26. V1 Single-Promotion Rule

A qualifying price component receives at most one Promotion.

V1 does not combine multiple Promotions on the same Product line.

> **Note (DEC-075, 2026-11-21).** Still valid for the Unified Promotions engine: each product line receives at most
> one item-scope saving or one share of the single cart winner, never both. The delivery fee is a separate price
> component with at most one `DELIVERY` promotion.

---

# 27. Order-Level and Item-Level Stacking

To keep V1 deterministic:

An Order-level Promotion does not stack with Product or Category Promotions.

The backend chooses one winning Promotion path according to the configured priority rules.

Future versions may add explicit stacking configuration.


> **Amended by DEC-075 (2026-11-21).** For the Unified Promotions engine the winner rule is maximum savings first,
> priority only breaks an exact tie (see "Implementation Amendment: Unified Promotions" at the top of this document).
> The text of #27 above is kept as originally written.

---

# 28. Promotion Priority

Every Promotion has a Priority.

Priority determines which Promotion is evaluated first when several Promotions overlap.

Recommended convention:

Lower number
=
Higher priority

Example:

Priority 10
before
Priority 20

The Dashboard should provide a reasonable default.


> **Amended by DEC-075 (2026-11-21).** For the Unified Promotions engine the winner rule is maximum savings first,
> priority only breaks an exact tie (see "Implementation Amendment: Unified Promotions" at the top of this document).
> The text of #28 above is kept as originally written.

---

# 29. Tie Breaking

If multiple eligible Promotions have the same Priority:

The backend should choose the Promotion that gives the customer the greater valid discount.

If the calculated discount is still equal:

Use a stable deterministic tie-breaking rule.

Exact implementation details will be defined later.


> **Amended by DEC-075 (2026-11-21).** For the Unified Promotions engine the winner rule is maximum savings first,
> priority only breaks an exact tie (see "Implementation Amendment: Unified Promotions" at the top of this document).
> The text of #29 above is kept as originally written.

---

# 30. Why Priority Exists

Example:

Burger Promotion A:

20% off

Burger Promotion B:

50 EGP off

If both are active:

The system needs deterministic behavior.

The restaurant must never receive different totals from identical carts.

---

# 31. Promotion Evaluation

The backend evaluates Promotions using current authoritative data.

Eligibility may include:

- Restaurant
- Branch
- Promotion active state
- Date
- Time
- Product
- Category
- Minimum Order Amount
- Promotion target
- Promotion priority

---

# 32. Guest Display vs Final Eligibility

Guest Menu may display:

`20% OFF`

when a Promotion currently appears eligible.

However:

Final Promotion eligibility is confirmed during Cart and Order validation.

The backend remains authoritative.

---

# 33. Menu Promotion Display

Guest UI may show:

- Offer badge
- Original price
- Discounted price
- Promotion title
- Promotion description
- Expiry information where useful

Example:

250 EGP

200 EGP

20% OFF

Visual treatment will be defined in UI_UX_SPEC.md.

---

# 34. Product Price Display

If an eligible Product Promotion applies:

Guest may see:

Original:
250 EGP

Current:
200 EGP

The original price must remain visually understandable.

Do not create misleading fake crossed-out prices.

---

# 35. Product with Variant

Promotion applies after authoritative Variant price calculation.

Example:

Burger base:
200

Double Variant:
+70

Current Product price:
270

20% Product Promotion:

54 EGP discount

Final:
216 EGP

unless the Promotion specification explicitly introduces another basis later.

---

# 36. Product with Modifiers

V1 Product Promotion should apply to the Product configuration subtotal including required commercial Variant price, but not automatically discount paid Extras unless explicitly defined.

Preferred V1 calculation:

Base Product
+
Variant adjustment
=
Promotion-eligible Product amount

Paid optional Modifier / Extra adjustments remain undiscounted.

This keeps Promotion behavior predictable.

---

# 37. Why Extras Are Not Discounted by Default

Example:

Burger:
200

Extra Beef Patty:
+100

20% Burger Promotion

Preferred:

Burger:
160

Extra Patty:
100

Total:
260

not:

240

This protects restaurants from unintentionally discounting expensive Extras.

Future Promotions may explicitly target Modifier Options.

---

# 38. Category Promotion and Variants

CATEGORY Promotion uses the same V1 pricing basis as PRODUCT Promotion.

Eligible:

Product base
+
Variant adjustment

Not automatically discounted:

Optional paid Extras.

---

# 39. ORDER Promotion Basis

ORDER Promotion uses the qualifying merchandise subtotal after Product configuration pricing and before any Promotion has been applied.

Only one Promotion path is applied under V1 non-stacking rules.

---

# 40. Fixed Product Discount

Example:

Burger calculated eligible amount:

250 EGP

Fixed Product Promotion:

50 EGP

Final eligible Product amount:

200 EGP

Extras remain added afterward where applicable.

---

# 41. Discount Cannot Exceed Eligible Amount

Example:

Product:

40 EGP

Promotion:

50 EGP off

Maximum discount:

40 EGP

Final:

0 EGP

Never:

-10 EGP

---

# 42. Percentage Precision

Percentage calculations must use safe monetary arithmetic.

Do not use unsafe floating-point calculations.

Rounding rules will be defined in DATABASE_SPEC.md / pricing technical specifications.

---

# 43. Promotion Currency

FIXED_AMOUNT Promotion uses the Restaurant / Branch Currency context.

A Fixed Amount value must not be applied across incompatible currencies.

Multi-currency behavior is deferred.

---

# 44. Cart Recalculation

Cart pricing must be recalculated when relevant data changes.

Examples:

- Product quantity changes
- Product Variant changes
- Product removed
- Promotion becomes active
- Promotion expires
- Minimum Order threshold becomes satisfied
- Minimum Order threshold becomes unsatisfied

---

# 45. Server-Side Calculation

Frontend may display an estimated Promotion result.

Before Order creation:

Backend recalculates:

- Base prices
- Variant prices
- Modifier prices
- Promotion eligibility
- Promotion discount
- Final totals

Client-calculated values are never trusted.

---

# 46. Promotion Changed While Cart Open

Example:

Guest sees:

20% off Burger.

Restaurant disables Promotion before guest submits.

Backend must re-evaluate current pricing.

If the final amount changes materially:

Do not silently charge the new amount.

Return a structured pricing-change response.

Guest confirms updated Cart before Order creation.

---

# 47. Promotion Starts While Cart Open

Example:

Guest Cart was:

250 EGP

Promotion activates:

20%

Backend recalculation may update Cart to:

200 EGP

Guest can benefit from the currently valid Promotion.

---

# 48. Promotion Expired While Cart Open

Example:

Guest viewed:

200 EGP promotional price

Promotion expires.

Current price:

250 EGP

Order submission should return a pricing-change result rather than silently creating a more expensive Order.

---

# 49. Promotion Snapshot

When Order is successfully created, applied Promotion information must be preserved historically.

At minimum:

- Promotion reference
- Promotion name snapshot where useful
- Discount Type
- Discount Value configuration
- Calculated discount amount
- Target
- Applied items where relevant

---

# 50. Historical Correctness

Changing or deleting a Promotion later must not modify historical Order totals.

Example:

Order created with:

20% discount

Restaurant later changes Promotion to:

10%

Historical Order remains:

20%

---

# 51. Promotion Deactivation

Restaurant may deactivate a Promotion.

Deactivation:

- Prevents future application
- Does not affect previous Orders
- Does not delete historical Promotion data

---

# 52. Promotion Deletion

Promotions referenced by historical Orders should not be hard deleted through normal Dashboard workflows.

Preferred behavior:

INACTIVE
or
Archived later.

---

# 53. Promotion Name

Restaurant administrators should define an internal recognizable name.

Example:

`Summer Burger 20`

This may differ from customer-facing translated title.

---

# 54. Customer-Facing Promotion Content

Promotion may support:

- Title
- Description

Example:

Arabic:

عرض الصيف

English:

Summer Offer

Customer-facing fields must support the translation architecture.

---

# 55. Translation

Promotion customer-facing content must support:

- Arabic
- English

Architecture must support future languages.

Do not use:

title_ar
title_en
title_fr

as the long-term model.

---

# 56. AI Assistant and Promotions

AI Restaurant Assistant may query active Promotions through controlled backend Tools.

Example guest:

`What offers do you have?`

AI receives current eligible Promotion data.

AI may explain the offer.

---

# 57. AI Cannot Create Promotions

The AI must not invent:

- Discount percentages
- Discount amounts
- Eligibility
- Expiry dates
- Promotion combinations

Only backend Promotion data is authoritative.

---

# 58. AI Budget Recommendations

If guest asks:

`I have 300 EGP. What can I order?`

AI should use effective current pricing returned by backend after applicable Promotions.

---

# 59. Branch-Specific AI Response

AI must use Promotion eligibility for the guest's current Branch.

Example:

New Cairo has offer.

Maadi does not.

AI in Maadi must not advertise the New Cairo-only offer as currently available.

---

# 60. Dashboard Promotion List

Restaurant Dashboard should clearly show:

- Promotion name
- Discount
- Target
- Active state
- Schedule
- Branch scope
- Priority

Avoid hiding important pricing rules behind complicated screens.

---

# 61. Promotion Creation UX

Recommended creation flow:

1. Promotion Name
2. Discount Type
3. Discount Value
4. Target
5. Select Products / Categories where needed
6. Branches
7. Minimum Order where needed
8. Schedule
9. Priority
10. Customer-facing content
11. Activate

---

# 62. Progressive Disclosure

If Target is:

ORDER

Do not show Product selector.

If Target is:

PRODUCT

Show Product selector.

If Target is:

CATEGORY

Show Category selector.

Only display fields relevant to the selected Promotion type.

---

# 63. Validation

Dashboard and Backend must validate:

- Discount value
- Target
- Required Product / Category selection
- Start / End date
- Start / End time
- Branch ownership
- Product ownership
- Category ownership
- Minimum order amount
- Priority

Backend validation remains mandatory.

---

# 64. Percentage Validation

Invalid:

0%

Invalid:

-10%

Invalid:

120%

Valid:

1% to 100%

---

# 65. Fixed Amount Validation

Fixed Amount must be greater than zero.

Invalid:

0 EGP

Invalid:

-50 EGP

---

# 66. Schedule Validation

If both Start Date and End Date exist:

End Date must not be before Start Date.

If the Dashboard initially restricts daily time ranges to same-day:

End Time must be after Start Time.

---

# 67. Product Target Validation

PRODUCT Promotion must target at least one valid Product.

The backend must reject Products outside the Promotion Restaurant.

---

# 68. Category Target Validation

CATEGORY Promotion must target at least one valid Category.

FIXED_AMOUNT + CATEGORY is invalid in V1.

---

# 69. Order Promotion Validation

ORDER Promotion does not require Product or Category target selection.

It may optionally use:

Minimum Order Amount.

---

# 70. Product Promotion and Minimum Order

V1 may allow a Product Promotion to also require a minimum total Order amount.

Example:

20% off Burger when Order is above 500 EGP.

This is supported if implementation remains straightforward.

---

# 71. Category Promotion and Minimum Order

Same rule:

A Category Promotion may optionally require a minimum Order subtotal.

---

# 72. Day-of-Week Scheduling

Day-of-week rules are useful but are not required in initial V1.

Example future:

Sunday to Thursday only.

If the Pilot requires this immediately, it may be added without redesigning the core Promotion model.

---

# 73. Happy Hour

A basic time-window Promotion can already represent a simple Happy Hour.

Example:

Coffee Category

20%

3 PM to 6 PM

This does not require a separate Happy Hour entity.

---

# 74. Product Special Price

V1 should prefer Promotion rules instead of mutating Product base price for temporary offers.

Example:

Normal Burger:

250 EGP

Temporary offer:

50 EGP off

Do not change base price permanently to:

200

unless the restaurant is actually changing the standard Product price.

---

# 75. Base Price vs Promotion Price

Product Base Price:

Long-term menu price.

Promotion:

Temporary pricing rule.

These concepts must remain separate.

---

# 76. Multiple Branches

Restaurant Product:

250 EGP

Branch override:

270 EGP

Promotion:

20%

At that Branch:

Promotion is calculated against:

270 EGP

because Branch effective price is authoritative before Promotion.

---

# 77. Sold Out Product

A Promotion does not make a SOLD_OUT Product orderable.

Availability rules are evaluated independently.

Example:

Burger:
SOLD_OUT

Promotion:
20%

Result:

Still unavailable.

---

# 78. Inactive Product

Promotion targeting an INACTIVE Product does not make it visible or orderable.

---

# 79. Inactive Category

Promotion targeting a Product inside an INACTIVE Category does not bypass Menu visibility rules.

---

# 80. Rejected Order

If an Order is REJECTED:

Its applied Promotion snapshot remains historical.

It contributes zero to current payable totals.

---

# 81. Cancelled Order

If an Order is fully CANCELLED:

Its Promotion snapshot remains historical.

Current payable financial totals update according to Order cancellation rules.

---

# 82. Partial Item Cancellation

If an item receiving a Product / Category Promotion is cancelled:

The current payable total must remove both:

- Item amount
- Associated discount effect

Historical audit information remains preserved.

---

# 83. Promotion Analytics

V1 may expose basic metrics where reliable:

- Number of Orders using Promotion
- Discount amount granted
- Revenue associated with Promotion

Advanced campaign ROI is deferred.

---

# 84. Promotion Analytics Accuracy

Do not report Promotion performance unless calculation definitions are explicit.

Example:

`Revenue from Promotion`

must clearly define whether it means:

- Final revenue of Orders containing Promotion
or
- Revenue of only discounted items

Exact metric definitions will be documented before production reporting.

---

# 85. Promotion Preview

Dashboard should ideally provide a simple Preview.

Example:

Promotion:

20% off Burger

Example price:

250 → 200 EGP

This helps restaurant staff catch configuration mistakes.

---

# 86. Promotion Conflict Warning

Dashboard may warn when overlapping Promotions target the same Products and schedules.

Example:

`Another active Promotion may have higher priority.`

This is desirable but not required for first vertical slice.

> **Amended by DEC-075 (2026-11-21).** With maximum savings first, a warning should say that the greater saving
> wins and priority only breaks exact ties (see "Implementation Amendment: Unified Promotions" at the top of this document).

---

# 87. Promotion Priority UX

Priority should not feel overly technical.

Dashboard may label it:

`Promotion Priority`

with helper text:

`Lower number wins when offers overlap.`

A default such as:

100

may be used.

> **Amended by DEC-075 (2026-11-21).** The helper text above no longer describes the rule: the greater saving wins
> and a lower number only breaks an exact tie of savings (see "Implementation Amendment: Unified Promotions" at the top of this document). The default 100 and the range 0–1000 stay.

---

# 88. Promotion Activation

Creating a Promotion does not necessarily mean it must be immediately active.

Restaurant may:

Create
→ Review
→ Activate

Full Draft/Publish workflow is not required.

An Active toggle is sufficient for V1.

---

# 89. Promotion Update

Editing an active Promotion affects future Cart and Order calculations.

It must not rewrite historical Orders.

---

# 90. Promotion Audit

Important administrative Promotion actions should preserve normal audit metadata.

Examples:

- Created
- Updated
- Activated
- Deactivated

Full enterprise audit history is deferred.

---

# 91. Security

Restaurant Users may only create or modify Promotions within their own Tenant.

Branch / Product / Category references must be validated server-side.

Never trust tenant IDs submitted by the frontend.

---

# 92. Permissions

Not every Restaurant User should manage pricing.

Recommended V1 permission:

`promotions.manage`

Owner / Manager may receive it.

Kitchen / Waiter should not.

---

# 93. Structured Promotion Errors

Useful API error codes may include:

- PROMOTION_NOT_FOUND
- PROMOTION_INACTIVE
- PROMOTION_EXPIRED
- PROMOTION_NOT_ELIGIBLE
- INVALID_PROMOTION_TARGET
- INVALID_PROMOTION_VALUE
- PROMOTION_PRICE_CHANGED

Guest UI should convert errors into friendly localized messages.

---

# 94. V1 Deferred Promotion Features

Not required initially:

- Coupon codes
- Buy One Get One
- Buy X Get Y
- Complex Combos
- Bundles
- Quantity Discounts
- Customer-specific Promotions
- Loyalty Promotions
- First Order Promotions
- Birthday Offers
- Advanced Day-of-Week Rules
- Campaign-specific Promotions
- Influencer Promotions
- Complex Promotion Stacking
- Promotion Budgets
- Global Usage Limits
- Per-Customer Usage Limits
- Dynamic AI Pricing
- Personalized Pricing

> **Amended by DEC-075 (2026-11-21, B-D2).** "Quantity Discounts" are no longer deferred in the bounded form of the
> `QUANTITY` scope (one order-level discount once a unit or distinct-product threshold is met; no BOGO / Buy X Get Y).
> "Complex Promotion Stacking" stays deferred: the engine chooses one merchandise path (item or cart) plus at most one
> delivery promotion (see "Implementation Amendment: Unified Promotions" at the top of this document). Bundles stay the separate Offers model (DEC-069). The rest of the list is unchanged.

---

# 95. Future BOGO

Future:

Buy 1 Burger
Get 1 Burger Free

must be introduced as a new Promotion rule type.

Do not fake BOGO in V1 using unsafe discount workarounds.

---

# 96. Future Combo

Future:

Burger + Fries + Cola

for:

299 EGP

should receive an explicit Combo / Bundle model.

**Update (DEC-069, 2026-11-06):** that explicit model now exists as **Offers / Bundles** (`docs/01-domain/OFFERS_SPEC.md`): fixed price, slots with choices and paid
adjustments, weekday validity, its own tables. It is still not a Promotion: product discounts and Promotions never apply to an Offer line in V1.

Do not overload simple V1 Promotions to represent complex Bundles.

---

# 97. Future Coupons

Future Coupon architecture may reference Promotion rules.

Concept:

Coupon
→ Promotion eligibility

Coupon itself should not become an unrelated pricing engine.

---

# 98. Future Source-Based Offers

Future example:

Instagram Orders:
10% off

This may use:

Order Source
+
Promotion eligibility

The V1 model should remain extensible enough to add source conditions later.

---

# 99. Core Invariants

## INV-PROMO-001

The backend is authoritative for Promotion eligibility.

## INV-PROMO-002

Promotions never rewrite Product base prices.

## INV-PROMO-003

Historical Orders preserve applied Promotion results.

## INV-PROMO-004

Inactive or expired Promotions do not affect new Orders.

## INV-PROMO-005

A Promotion cannot target entities from another Tenant.

## INV-PROMO-006

A Promotion never overrides Product availability.

## INV-PROMO-007

V1 does not arbitrarily stack Promotions.

> Note (DEC-075, 2026-11-21): unchanged; the only coexistence is one merchandise path + at most one `DELIVERY`
> promotion on the fee.

## INV-PROMO-008

FIXED_AMOUNT CATEGORY Promotions are not supported in V1.

> Note (DEC-075, 2026-11-21, B-D2): extended to `MENU` (FIXED_AMOUNT MENU Promotions are not supported either).

## INV-PROMO-009

Discount cannot reduce qualifying amount below zero.

## INV-PROMO-010

Client-provided discount values are never trusted.

## INV-PROMO-011

AI cannot create or invent authoritative Promotion rules.

## INV-PROMO-012

Branch effective price is resolved before Promotion calculation.

---

# 100. V1 Acceptance Example — Product Percentage

Product:

Beef Burger

Base Price:

250 EGP

Promotion:

20%

Expected:

Original:
250

Discount:
50

Final:
200

---

# 101. V1 Acceptance Example — Product Fixed Amount

Product:

Cheesecake

Base Price:

180 EGP

Promotion:

30 EGP off

Expected:

150 EGP

---

# 102. V1 Acceptance Example — Category Percentage

Category:

Desserts

Promotion:

10%

Cheesecake:

200 → 180

Brownie:

150 → 135

---

# 103. V1 Acceptance Example — Order Discount

Cart:

1,200 EGP

Promotion:

100 EGP off Orders above 1,000 EGP

Expected:

Discount:
100

Final merchandise amount:
1,100

---

# 104. V1 Acceptance Example — Minimum Not Met

Cart:

800 EGP

Promotion:

100 EGP off Orders above 1,000 EGP

Expected:

Promotion not applied.

---

# 105. V1 Acceptance Example — Branch Restriction

Promotion:

20% Coffee

Branch:

New Cairo only

New Cairo Order:

Promotion applies.

Maadi Order:

Promotion does not apply.

---

# 106. V1 Acceptance Example — Schedule

Promotion:

15% Desserts

Schedule:

3 PM to 6 PM

At 4 PM:

Eligible.

At 7 PM:

Not eligible.

Evaluation uses relevant Branch timezone.

---

# 107. V1 Acceptance Example — Sold Out

Burger:

SOLD_OUT

Promotion:

20%

Expected:

Burger remains unavailable.

Promotion does not change availability.

---

# 108. V1 Acceptance Example — Cart Price Change

Guest sees:

200 EGP promotional Burger.

Promotion expires before submission.

Current price:

250 EGP

Expected:

Backend returns updated pricing.

Order is not silently created at 250 EGP.

Guest confirms new amount before submitting again.

---

# 109. Acceptance Criteria

Promotion implementation is acceptable when:

- Restaurant can create Percentage Promotion.
- Restaurant can create Fixed Amount Promotion.
- Promotion can target Order.
- Promotion can target Product.
- Percentage Promotion can target Category.
- Fixed Amount Category Promotion is rejected.
- Restaurant can restrict Promotion to Branches.
- Promotion can use Start / End Date.
- Promotion can use a daily time window.
- Promotion can require Minimum Order Amount.
- Backend evaluates current Promotion eligibility.
- Frontend cannot force discount values.
- Overlapping Promotions resolve deterministically.
- V1 does not stack Promotions arbitrarily.
- Promotion cannot make unavailable Product orderable.
- Promotion changes while Cart is open are safely recalculated.
- Order preserves applied Promotion snapshot.
- Future Promotion edits do not change historical Orders.
- AI Assistant can read valid current Promotions.
- AI Assistant cannot invent Promotions.
- Cross-Tenant Promotion targeting is rejected.
- Arabic and English customer-facing Promotion content are supported.

---

# Promotion Principle

> Base prices describe what the menu normally costs. Promotions describe temporary pricing rules. Keep those concepts separate, deterministic, and controlled by the backend.
