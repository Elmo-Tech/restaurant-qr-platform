# Promotions Stacking Examples (Unified Promotions)

> **Status: Accepted (2026-11-21, Product Owner) — DEC-075.** These examples
> describe the approved contract of the Unified Promotions engine
> (`apps/api/src/promotions/promotion-engine.ts`, milestone B1). They are not live
> order behavior yet (order wiring is B2). Every example below is covered by a
> case in `promotion-engine.spec.ts`; the persisted rows are in
> `promotion-snapshot.spec.ts` and `docs/02-technical/UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md`.
>
> **DEC-077 (2026-11-26, documentation only).** §10–§14 at the end add the approved fixed MENU / CATEGORY, CART minimum / legacy,
> preview, editor-wording and compatibility examples. Wherever §1–§9 or the engine say "CATEGORY / MENU are percentage only" the
> DEC-077 rule supersedes it once milestone B1 ships.

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

---

# DEC-077 additions (2026-11-26) — documentation only

> **Status: Accepted (2026-11-26, Product Owner) — DEC-077, milestone B0.** §10–§14 define the approved
> behavior for the follow-up milestones B1–B4 (B1 fixed item discounts, B2 CART minimum, B3 preview API, B4 editor UX and final verification). They are **not live**: today's engine refuses a fixed CATEGORY /
> MENU promotion (`INVALID_CONFIGURATION`) and has no strictly positive CART minimum. §1–§9 above are unchanged.
> Each worked example below is a required test case for the milestone that implements it
> (`docs/02-technical/PROMOTIONS_DEC077_IMPLEMENTATION_PLAN.md`). Notation as above (EGP, `Decimal(14,2)`).

## 10. Fixed MENU / CATEGORY promotions (B1)

Unit saving = `min(value, original unit price)` **per purchased unit**; line saving = unit saving × quantity. Original unit price =
size price (or base price) before any discount, without paid extras. Weighted products are sizes (DEC-067): one unit of a size is one
unit; no proration by weight, no per-kilo application.

| Case | Setup | Result |
| --- | --- | --- |
| Per unit | Product 100.00 × 3, CATEGORY fixed 15.00 | 15.00 per unit → **45.00** off, payable **255.00** |
| Cap at the unit price | Product 12.00 × 2, CATEGORY fixed 20.00 | unit saving min(20.00, 12.00) = 12.00 → **24.00** off, payable **0.00** |
| Paid extras excluded | Product 100.00 + paid extras 20.00, × 2, CATEGORY fixed 10.00 | 10.00 × 2 = **20.00** off (extras untouched); payable (100.00 − 10.00 + 20.00) × 2 = **220.00** |
| Fixed beats percentage | Unit 100.00: Product 10 % (10.00), CATEGORY fixed 25.00 | CATEGORY (greater saving) |
| Percentage beats fixed | Unit 100.00: Product 40 % (40.00), MENU fixed 30.00 | Product |
| Capped against the **original** price | Unit 100.00: Product 50 % (50.00), CATEGORY fixed 80.00 | CATEGORY: min(80.00, 100.00) = 80.00 beats 50.00; unit pays **20.00**. A cap against the already discounted 50.00 would be wrong. |
| Exact tie, same priority | Unit 100.00: CATEGORY fixed 10.00 and MENU 10 %, both priority 100 | CATEGORY (specificity) |
| Exact tie, lower priority number | CATEGORY fixed 10.00 priority 50, MENU fixed 10.00 priority 5 | MENU |
| Size without Product discount | Large 120.00, `discountApplies = false`, Product discount 50 %, CATEGORY fixed 12.00 | no Product discount; CATEGORY **12.00** off (as for percentage, DEC-041) |
| Nothing to win | Product 0.00, CATEGORY fixed 5.00 | no candidate; diagnostic `NO_EFFECTIVE_DISCOUNT` |
| Two sizes of one Product | Pizza Small 60.00 × 1 and Large 120.00 × 2, CATEGORY fixed 25.00 | Small 25.00; Large 25.00 × 2 = 50.00; total **75.00** off; payable 60.00 + 240.00 − 75.00 = **225.00** |
| Cap differs by size | Same cart, CATEGORY fixed 70.00 | Small min(70.00, 60.00) = 60.00; Large 70.00 × 2 = 140.00; total **200.00** off; payable **100.00** |
| Weighted cut (sizes) | Cut sold as 500 g 90.00 and 1 kg 170.00, CATEGORY fixed 100.00; cart 2 × 500 g + 1 × 1 kg | 500 g: min(100.00, 90.00) = 90.00 × 2 = 180.00 (free); 1 kg: 100.00 × 1; total **280.00** off; payable 180.00 + 170.00 − 280.00 = **70.00**. Not prorated by grams, not per kilo. |
| Product without sizes | Base price 40.00 × 3, MENU fixed 10.00 | 10.00 × 3 = **30.00** off; payable **90.00** |
| Fixed per order, not per unit | CART fixed 10.00 (minimum 50.00) vs CATEGORY fixed 10.00 on 3 units of a 40.00 Product | CART takes 10.00 once; CATEGORY takes 10.00 × 3 = 30.00 → item path wins |
| Item vs cart | Two lines 100.00 × 1, CATEGORY fixed 20.00 each (item 40.00); CART fixed 50.00, minimum 150.00 | CART wins (50.00 > 40.00 strictly); allocation 25.00 / 25.00; payable **150.00**; the item promotion is `LOST_TO_BETTER_OFFER` |
| Item beats cart on a tie | Same, CART fixed 40.00 | tie keeps the item path; payable **160.00** |

Persisted rows for "Per unit": `order_items.discount_amount` 0.00, `line_total` 300.00; one `order_promotions` row
(scope CATEGORY, `discount_type` `FIXED_AMOUNT`, `value` 15.00, `amount` 45.00) with one allocation of 45.00;
`subtotal_amount` 255.00. For "Cap at the unit price": `value` 20.00, `amount` **24.00** (the amount actually saved,
not `value × units`). Existing percentage rows and every pre-DEC-077 order are unchanged.

## 11. CART minimum and legacy promotions (B2)

**Create validation (CART).** `minimumSubtotal` is required and must be > 0.00 with at most 2 decimals.

| Input | Result |
| --- | --- |
| absent / `null` | `422 PROMOTION_INVALID`, problem `MINIMUM_SUBTOTAL_REQUIRED` |
| `"0.00"`, `"-5.00"` | `422 PROMOTION_INVALID`, problem `MINIMUM_SUBTOTAL_NOT_POSITIVE` |
| `"100.005"`, `"abc"` | `422 PROMOTION_INVALID`, problem `MINIMUM_SUBTOTAL_INVALID` (existing code) |
| `"0.01"`, `"200.00"` | accepted |

**Eligibility before discounts.** CART 10 %, minimum 200.00, delivery fee 30.00. Cart: Product A 100.00 + paid
extras 20.00 (120.00), Product B 60.00, Offer 150.00.

| Step | Value |
| --- | --- |
| Basis | 120.00 + 60.00 = **180.00** (paid extras counted; Offer and delivery fee excluded) |
| Result | `BELOW_MINIMUM_SUBTOTAL`, remaining **20.00**; no saving; payable 180.00 + 150.00 = **330.00**, total with the fee **360.00** |
| Add Product C 20.00 | basis **200.00** → qualifies (equality qualifies); saving 10 % × 200.00 = **20.00**; payable 200.00 − 20.00 + 150.00 = **330.00**; total **360.00** |

A legacy Product discount does not reduce the basis: Product 100.00 with a 50 % Product discount and CART fixed
10.00 (minimum 100.00) → basis 100.00 qualifies, but the item path saves 50.00 > 10.00, so the cart promotion is
`LOST_TO_BETTER_OFFER` (still eligible).

**Legacy CART promotion** (ACTIVE, 10 %, `minimumSubtotal` NULL or 0.00, existing before B1):

| Operation | Result |
| --- | --- |
| Nothing is done | Keeps applying as before: cart 40.00 → saves 4.00 |
| Change internal name or customer title / description | **Allowed**; still no minimum |
| Re-send the whole form with the stored values and a new name | **Allowed** (nothing but metadata changed) |
| Deactivate, archive | **Allowed** |
| Change value, discount type, scope | `422 PROMOTION_INVALID` `MINIMUM_SUBTOTAL_REQUIRED` unless a valid minimum is sent |
| Change start / end date, Branches, categories, products, minimum | same |
| Change priority | same (it can change which promotion wins an exact tie) |
| Reactivate (INACTIVE → ACTIVE) | same; `POST …/activate` is refused until the minimum is saved |
| Send `minimumSubtotal: "100.00"` together with any change | accepted; the promotion is no longer legacy |
| Send `minimumSubtotal: "0.00"` with any non-metadata change | `MINIMUM_SUBTOTAL_NOT_POSITIVE` |

## 12. Preview examples (B3 API, B4 UI)

All amounts are Backend engine results. Restaurant sample: Burger 120.00 (first active size, no extras), Branch "Main".

| Draft | State | Examples shown |
| --- | --- | --- |
| CART 10 %, minimum 200.00 | REAL | **Below:** 1 × Burger = 120.00 → `BELOW_MINIMUM_SUBTOTAL`, remaining **80.00**, customer pays 120.00. **Qualifying:** 2 × Burger = 240.00 → saves **24.00**, pays **216.00**. |
| QUANTITY fixed 30.00, minimum 3 units | REAL | **Below:** 2 × Burger = 240.00 → `BELOW_MINIMUM_QUANTITY`, remaining **1**. **Qualifying:** 3 × Burger = 360.00 → saves **30.00**, pays **330.00**. |
| DELIVERY 100 % (free), minimum 150.00, fee 25.00 | REAL | **Below:** 1 × Burger = 120.00 → fee stays 25.00 (remaining **30.00**). **Qualifying:** 2 × Burger = 240.00 → fee **0.00**. |
| CATEGORY fixed 15.00 on Burgers | REAL | no threshold; 1 × Burger 120.00 → saves **15.00**, pays **105.00**; the products list shows the Burger with its unit price and per-unit saving |
| CART 10 %, minimum 50.00 | REAL | a single Burger (120.00) already qualifies, so only the **qualifying** example is shown, with the reason "one item already reaches the minimum" |
| CATEGORY 10 % on a category with no available product | ILLUSTRATIVE | sample unit price labelled "Example only"; figures still come from the engine; never styled as the restaurant's prices |
| CART 10 % with the minimum empty | INCOMPLETE | **no financial figure at all** (no example, product price, saving or total); only the problem and "Enter a minimum order amount greater than 0." |
| CATEGORY 30 % competing with an active 40 % MENU promotion | REAL | the draft is `LOST_TO_BETTER_OFFER`; the preview shows the draft's potential saving and which offer wins |

**Stale protection.** Staff change the value 10 → 12 → 15 quickly. Requests 1 and 2 are cancelled or ignored; only
the answer to value 15 may replace the card. If request 3 fails, the card shows "couldn't update", keeps no figure
labelled as current, and offers retry. After Save or Activate the preview is requested again from the saved state.

## 13. Editor wording (B4)

Plain sentences replace formulas; the values are inserted and numbers / currency are rendered as LTR runs inside RTL
text. Wording is illustrative; the final strings live in the Staff i18n messages.

| Scope / type | English | Arabic |
| --- | --- | --- |
| CATEGORY, percentage 15 | Customers get 15% off each item in the chosen categories. Paid extras are not discounted. | يحصل العملاء على خصم 15% على كل صنف في الأقسام المختارة، دون الإضافات المدفوعة. |
| CATEGORY, fixed 10 EGP | Customers get 10 EGP off each item in the chosen categories. An item never costs less than zero. Paid extras are not discounted. | يحصل العملاء على خصم 10 ج.م على كل قطعة من الأقسام المختارة، ولا يقل سعر القطعة عن صفر. الإضافات المدفوعة لا تُخصم. |
| CART, percentage 10, minimum 200 | Customers get 10% off their order when eligible items total at least 200 EGP. Paid extras count; bundles and delivery do not. | يحصل العملاء على خصم 10% على طلبهم عندما يبلغ مجموع الأصناف المؤهلة 200 ج.م على الأقل. تُحتسب الإضافات المدفوعة، ولا تُحتسب الوجبات المجمّعة ولا التوصيل. |
| Priority (Advanced settings) | If two offers save exactly the same amount, the one with the lower number is used. | إذا وفّر عرضان المبلغ نفسه تمامًا، يُستخدم العرض ذو الرقم الأقل. |

Not shown to Staff: `÷`, `×`, `max(…)`, `min(…)`, percent-of-price expressions, raw enum names.

## 14. Compatibility and rollout examples (B1)

Stored: CATEGORY "Desserts" promotion, `FIXED_AMOUNT`, value 15.00, ACTIVE, created after B1 with fixed item writes enabled.

| Case | Result |
| --- | --- |
| Pre-B1 web editor saves the whole form (its `draft.ts` forces `discountType: "PERCENTAGE"`, value `"15.00"`) | `409 PROMOTION_DISCOUNT_TYPE_CHANGE_CONFIRMATION_REQUIRED`, `details: { fields: ["discountType"], from: "FIXED_AMOUNT", to: "PERCENTAGE", value: "15.00" }`. Nothing is written; the promotion is still 15.00 EGP per unit. |
| B1 editor, Staff deliberately switch the type to percentage and confirm | `PATCH` with `confirmDiscountTypeChange: true` is accepted; Staff must also have entered the new value (15 % is not assumed from 15.00). |
| `PATCH` that omits `discountType` and renames the promotion | accepted; type unchanged |
| Pre-B1 web editor creates a new CATEGORY percentage promotion | unaffected |
| Fixed item writes switched **off**, Staff rename / deactivate / archive the fixed promotion | allowed; it keeps applying at checkout until deactivated |
| Fixed item writes switched **off**, Staff create or activate a fixed item promotion | `422 PROMOTION_INVALID`, problem `FIXED_ITEM_SCOPE_NOT_ENABLED` |
| Switching the setting off while the promotion is ACTIVE | no price changes: menu, quote and checkout still apply 15.00 per unit |
| Old API instance still running while the setting is on | **Not allowed** (rollout step "fleet check"): it would ignore the promotion and quote / checkout would disagree |
| Roll back to a pre-B1 build while the promotion is ACTIVE | **Not allowed** until the promotion is explicitly replaced or deliberately deactivated with the restaurant informed (audited); never silently inert |
