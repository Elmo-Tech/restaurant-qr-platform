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
| Variants (#35) | adjustments are discountable | The platform has no Product Variant in V1; the discount applies to the product price only. |
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

---

# 27. Order-Level and Item-Level Stacking

To keep V1 deterministic:

An Order-level Promotion does not stack with Product or Category Promotions.

The backend chooses one winning Promotion path according to the configured priority rules.

Future versions may add explicit stacking configuration.

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

---

# 29. Tie Breaking

If multiple eligible Promotions have the same Priority:

The backend should choose the Promotion that gives the customer the greater valid discount.

If the calculated discount is still equal:

Use a stable deterministic tie-breaking rule.

Exact implementation details will be defined later.

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

## INV-PROMO-008

FIXED_AMOUNT CATEGORY Promotions are not supported in V1.

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
