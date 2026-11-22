# Promotions Stacking Examples (Unified Promotions)

> **Status: Accepted (2026-11-21, Product Owner) — DEC-075.** These examples
> describe the approved contract of the Unified Promotions engine
> (`apps/api/src/promotions/promotion-engine.ts`, milestone B1). They are not live
> order behavior yet (order wiring is B2). Every example below is covered by a
> case in `promotion-engine.spec.ts`; the persisted rows are in
> `promotion-snapshot.spec.ts` and `docs/02-technical/UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md`.

Engine fields per line (snapshot model accepted 2026-11-21): `legacyUnitDiscount`
/ `legacyLineDiscount` (non-zero only when the item strategy won and the legacy
Product discount won that line), `lineTotal` = (unit − legacy unit discount +
modifiers) × qty → `order_items.line_total`, `promotionAllocations[]`
(promotionId, scope, amount) for CATEGORY / MENU / CART / QUANTITY savings →
`order_promotion_allocations`, `netLineTotal` = lineTotal − Σ allocations.
Order level: `legacyDiscountTotal`, `promotionMerchandiseDiscountTotal`,
`merchandiseDiscountTotal` (→ `discount_total_amount`), `merchandisePayable`
(→ `subtotal_amount`), `deliveryFeeOriginal`, `deliveryDiscount`,
`deliveryFeePayable` (→ `delivery_fee_amount`), `grandTotal` (→ `total_amount`).

Notation: all money in EGP, `Decimal(14,2)`. "Item" = item-scope strategy
(legacy Product discount / CATEGORY / MENU per line). "Cart" = the single
CART / QUANTITY winner. Promotion priority defaults to 100; the legacy Product
discount has effective priority 0.

---

## 1. Mandatory example — item beats cart, delivery independent

Delivery order, zone fee 30.00.

| Line | Unit | Qty | Product discount |
| --- | --- | --- | --- |
| A | 100.00 | 1 | 20 % (saves 20.00) |
| B | 100.00 | 1 | 20 % (saves 20.00) |

Promotions: CART 15 % (no minimum); DELIVERY fixed 10.00.

| Step | Value |
| --- | --- |
| Item strategy A | 20.00 + 20.00 = **40.00** |
| Cart strategy B | 15 % × 200.00 = **30.00** |
| Winner | Item (40.00 > 30.00); CART → `LOST_TO_BETTER_OFFER` (potential 30.00) |
| Merchandise payable | 200.00 − 40.00 = **160.00** |
| Delivery | 30.00 − 10.00 = **20.00** |
| Grand total | **180.00** |

Same cart with **CART fixed 50.00** instead:

| Step | Value |
| --- | --- |
| Item A / Cart B | 40.00 / 50.00 → **Cart wins** (strictly greater) |
| Product discounts | **not applied** (never combined with a cart discount) |
| Allocation | A 25.00, B 25.00 |
| Merchandise payable | 200.00 − 50.00 = **150.00** |
| Delivery | **20.00** |
| Grand total | **170.00** |

Persisted fields of both variants:

| Field | Item wins (180) | Cart wins (170) |
| --- | --- | --- |
| line A / B `legacyLineDiscount` → `order_items.discount_amount` | 20.00 / 20.00 | **0.00 / 0.00** |
| line A / B `lineTotal` → `order_items.line_total` | 80.00 / 80.00 | 100.00 / 100.00 |
| line A / B `promotionAllocations` | — | CART 25.00 / CART 25.00 |
| `legacyDiscountTotal` / `promotionMerchandiseDiscountTotal` | 40.00 / 0.00 | 0.00 / 50.00 |
| `merchandiseDiscountTotal` (`discount_total_amount`) | 40.00 | 50.00 |
| `merchandisePayable` (`subtotal_amount`) = Σ lineTotal − Σ allocations | 160.00 | 150.00 |
| delivery original / discount / net | 30.00 / 10.00 / 20.00 | 30.00 / 10.00 / 20.00 |
| `order_promotions` rows | DELIVERY 10.00 | CART 50.00, DELIVERY 10.00 |

## 2. Item-scope competition (per line)

| Case | Candidates on a 100.00 unit | Winner | Why |
| --- | --- | --- | --- |
| Product vs Category | Product 10 % (10.00), Category 25 % (25.00) | Category | greater saving |
| Product vs Category | Product fixed 30.00, Category 25 % | Product | greater saving |
| Product vs Menu, equal | Product 20 %, Menu 20 % priority 0 | Product | tie → priority 0 = 0 → specificity PRODUCT |
| Category vs Menu, equal | Category 10 %, Menu 10 %, both priority 100 | Category | tie → specificity |
| Category vs Menu, equal | Category 10 % priority 50, Menu 10 % priority 5 | Menu | tie → lower priority number |
| Saving first | Category 10 % priority 1, Category 11 % priority 900 | 11 % | saving beats priority |
| Equal everything | Category "b-promo" 10 %, "a-promo" 10 % | a-promo | id ascending |

Winners are chosen **per line**: line 1 (category A, product 5 %) takes the
category 20 % promotion (20.00), line 2 (product 40 %) keeps its Product
discount (40.00); item total 60.00. Persisted: line 1 `discount_amount` 0.00
(the beaten 5 % is not stored), `line_total` 100.00, allocation CATEGORY 20.00;
line 2 `discount_amount` 40.00, `line_total` 60.00; `legacyDiscountTotal`
40.00 + `promotionMerchandiseDiscountTotal` 20.00 = 60.00.

## 3. Sizes and paid extras

- Size Large 120.00 with `discountApplies = false` and a Product discount of
  50 %: no Product discount (DEC-041). A CATEGORY 10 % promotion **does** apply
  to that size: 12.00 off (design decision: `discountApplies` governs only the
  legacy Product discount).
- Product 100.00 + paid extras 20.00, qty 2:
  - CATEGORY 10 % → 10 % of 100.00 × 2 = **20.00** (extras excluded), payable 220.00.
  - CART 10 % → 10 % of (120.00 × 2 = 240.00) = **24.00** (extras included), payable 216.00.

## 4. Rounding (ROUND_HALF_UP to 2 decimals)

| Case | Computation | Result |
| --- | --- | --- |
| Item 15 % of 0.10, qty 3 | 0.015 → **0.02** per unit | line discount 0.06, payable 0.24 |
| Item 12.5 % of 1.00 | 0.125 → **0.13** | |
| Cart 12.5 % of 3 × 0.10 | 0.0375 → **0.04** (rounded once on the basis) | allocation 0.02 / 0.01 / 0.01 |
| Legacy Product 15 % of 87.50 | 13.125 → **13.13** per unit | identical to Product Discounts V1 |

Allocation of a cart discount: each line gets floor(discount × basis / total
basis) in cents; the cents left go one by one to the largest fractional
remainder, ties to the lower line index. Example 1.00 over bases 10.00 / 20.00:
0.333… / 0.666… → 0.33 / 0.66, one cent left → second line (remainder
0.666… > 0.333…) → **0.33 / 0.67**. Example 0.10 over three equal bases →
0.04 / 0.03 / 0.03.

## 5. Thresholds

Spend (CART 10 %, minimum 200.00; basis = pre-promotion eligible merchandise):

| Basis | Result |
| --- | --- |
| 199.99 | `BELOW_MINIMUM_SUBTOTAL`, remaining **0.01** |
| 200.00 | applies: 20.00 off, payable 180.00 (a net below 200 is fine) |
| 200.01 | applies |

Quantity (QUANTITY fixed 30.00, minimum 5 UNITS):

| Units | Result |
| --- | --- |
| 4 | `BELOW_MINIMUM_QUANTITY`, remaining **1** |
| 5 | applies |
| 6 | applies |

Units vs distinct products (minimum 3): one product × 3 → UNITS qualifies,
DISTINCT_PRODUCTS does not (remaining 2). Two sizes of the same product + one
other product = 2 distinct products (remaining 1).

Quantity + spend (minimum 3 units and 300.00): 2 × 100.00 →
`BELOW_MINIMUM_QUANTITY` remaining 1 **and** remaining amount 100.00;
3 × 90.00 → `BELOW_MINIMUM_SUBTOTAL` remaining 30.00.

Quantity vs cart: 3 × 100.00, CART 10 % (30.00) vs QUANTITY fixed 45.00 →
QUANTITY wins, payable 255.00.

Cart caps: CART fixed 100.00 on a 35.00 basis → 35.00 off, payable 0.00. CART
100 % on (100.00 + 7.50) × 2 plus an Offer 50.00 → 215.00 off, payable 50.00.

## 6. Delivery

| Case | Result |
| --- | --- |
| Product 100.00, CART 10 %, DELIVERY 50 %, fee 30.00 | cart 10.00 **and** delivery 15.00 → total 105.00 |
| Product 100.00 with 10 % Product discount, free delivery, fee 20.00 | item 10.00 **and** fee 0.00 → total 90.00 |
| Fee 30.00: fixed 5.00 (priority 0), 40 % (12.00), fixed 50.00 (capped 30.00) | fixed 50.00 wins (30.00) |
| Fee 30.00: fixed 10.00 ×2 (priority 3), 50 % (15.00, priority 9) | 50 % wins: saving first |
| Fee 30.00: "dlv-b" 10.00, "dlv-a" 10.00, same priority | dlv-a (id) |
| Zone targets [zone-2], order in zone-1 | `WRONG_ZONE`, fee stays 30.00 |
| PICKUP or DINE_IN | every DELIVERY promotion `WRONG_ORDER_TYPE` |
| Fee 0.00 | `NO_DELIVERY_FEE` |
| Minimum 150.00, product 160.00 with 50 % Product discount | qualifies on the pre-promotion 160.00 (net is 80.00) |
| Minimum 150.00, product 120.00 | `BELOW_MINIMUM_SUBTOTAL`, remaining 30.00 |
| Minimum 200.00, product 100.00 + Offer 100.00 | qualifies (Offer lines count for the delivery basis) |

## 7. Offers / bundles

- Product 100.00 + Offer 150.00 × 2. CATEGORY 50 % → 50.00 off the product
  only. QUANTITY 3 units → `BELOW_MINIMUM_QUANTITY` (the offer units do not
  count). CART minimum 300.00 → `BELOW_MINIMUM_SUBTOTAL` (basis 100.00, offers
  excluded). Payable 50.00 + 300.00 = **350.00**.
- Offer-only order 120.00 with CART and CATEGORY promotions → both
  `NO_ELIGIBLE_ITEMS`, total 120.00.

## 8. Minimum order refusal (Delivery Zone minimum, DEC-036)

Zone minimum 150.00 (NET merchandise), fee 20.00. Cart: two products
100.00 each, CART fixed 60.00.

| Step | Value |
| --- | --- |
| Engine | Cart wins (60.00 > 0.00), payable **140.00** |
| Caller check | 140.00 < 150.00 → **refused `MINIMUM_ORDER_NOT_MET`** |
| Fallback? | **No.** The engine never switches to a worse strategy (no discount → 200.00) to satisfy the minimum. |

Reason: "the best discount always applies" stays deterministic and explainable,
and the zone minimum keeps protecting what the restaurant actually collects —
the same rule as Product Discounts V1 today (DEC-036). The Guest adds items
(the shortfall is 10.00) or the Restaurant lowers the promotion / minimum.

## 9. No promotions configured

With no Promotion rows, every line is exactly the Product Discounts V1 math:
`line = (unit − unit discount + modifiers) × qty`, e.g. 87.50 with 15 % and
12.25 extras × 3 = (87.50 − 13.13 + 12.25) × 3 = **259.86**; size price
40.00 with fixed 7.50 × 2 = **65.00**; a disabled discount takes nothing off.
