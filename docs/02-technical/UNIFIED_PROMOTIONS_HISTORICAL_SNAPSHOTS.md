# Unified Promotions — Historical Snapshot Model

> **Status: Accepted (2026-11-21, Product Owner) — DEC-075.** Storage exists from
> milestone B1 (migration `20261128100000_unified_promotions`) but **no order is
> written this way yet**: the order flow is wired in B2. The pure mapper
> `apps/api/src/promotions/promotion-snapshot.ts` (`buildOrderPricingSnapshot`,
> `checkOrderPricingSnapshot`) produces exactly the rows below from one engine
> result, so B2 only persists what it returns. Every example is a test case in
> `promotion-snapshot.spec.ts`.

## 1. Rules

| Field | Meaning |
| --- | --- |
| `order_items.unit_price` | pre-discount unit price (size price or base price) — unchanged |
| `order_items.discount_amount` + `discount_type_snapshot` / `discount_value_snapshot` | the **legacy Product discount only**, and only when it actually applied (item strategy won AND the legacy discount won that line). 0 / NULL otherwise — a legacy discount beaten by a CATEGORY / MENU promotion or removed by a winning cart discount is **not** stored |
| `order_items.line_total` | (unit price − legacy unit discount + paid modifiers) × qty — net of the legacy discount, **before** new promotions |
| `order_promotions` | one row per applied **new** promotion (CATEGORY / MENU / CART / QUANTITY / DELIVERY) with `amount > 0`, scope, type, value, internal-name / title / config snapshots; `promotion_id` is a soft reference (SET NULL) |
| `order_promotion_allocations` | per-line shares of every **merchandise** promotion: a CATEGORY / MENU winner = unit discount × qty; a CART / QUANTITY winner = largest-remainder split. Only positive shares; they sum exactly to the row amount. A DELIVERY row has none |
| `orders.promotion_discount_amount` | Σ allocations (new merchandise savings) |
| `orders.discount_total_amount` | Σ `order_items.discount_amount` (legacy) + `promotion_discount_amount` |
| `orders.subtotal_amount` | Σ `line_total` − Σ allocations = NET merchandise payable |
| `orders.delivery_fee_original_amount` | zone fee before a delivery promotion; NULL for DINE_IN / PICKUP and every legacy order |
| `orders.delivery_discount_amount` | the delivery promotion amount (0 when none) |
| `orders.delivery_fee_amount` | NET fee = original − delivery discount (0 for DINE_IN / PICKUP) |
| `orders.total_amount` | `subtotal_amount + delivery_fee_amount` (stored invariant preserved) |

> **Amended 2026-11-22 (Product Owner correction B-1).** The table above is kept as written, except that
> `promotion_id` is **no longer a soft SET NULL reference**: it is NOT NULL and RESTRICT, and the row is tied to its
> Order and Promotion on (`id`, `restaurant_id`); `order_promotion_allocations` carries `order_id` and is tied to its
> parent row and its line on (`id`, `order_id`), so a share can never point at another Order's line. A Promotion used
> by an Order is archived, never deleted (PROMOTIONS_SPEC #52); editing / archiving it never changes these rows. The
> snapshot columns remain the history. Constraint table: `UNIFIED_PROMOTIONS_SCHEMA_AND_ROLLOUT.md` §2.

Identities (asserted by the engine spec on **every** scenario and by
`checkOrderPricingSnapshot`):

```text
Σ line_total − Σ allocations                 = subtotal_amount
Σ line_total + Σ legacy discount_amount      = gross merchandise
subtotal_amount + discount_total_amount      = gross merchandise          (existing readers keep working)
discount_total_amount − promotion_discount   = Σ legacy discount_amount   (≥ 0, DB CHECK promotion ≤ total)
delivery_fee_original − delivery_discount    = delivery_fee_amount        (DB CHECK)
subtotal_amount + delivery_fee_amount        = total_amount
```

**Why no `PRODUCT_DISCOUNT` row in `order_promotions`.** The B1 draft also
recorded the legacy discount as an `order_promotions` row. It was removed: the
legacy discount already has one complete historical home
(`order_items.discount_amount` + type / value snapshots, written exactly as
today), a second copy could disagree with it, and `order_promotions` now means
one thing — "a Promotion row was applied". The `source` column and the PRODUCT
scope value were dropped with it; the table reuses the `promotion_scope` enum.

## 2. Example rows

Common data: Restaurant currency EGP; products at 100.00 with a legacy Product
discount of 20 % (saves 20.00 per unit); delivery zone fee 30.00.

### (a) 170 EGP — CART fixed 50 beats the 40 item path; delivery −10

| table | row |
| --- | --- |
| `order_items` #1 | unit_price 100.00 · qty 1 · **discount_amount 0.00** · type / value NULL · **line_total 100.00** |
| `order_items` #2 | unit_price 100.00 · qty 1 · discount_amount 0.00 · type / value NULL · line_total 100.00 |
| `order_promotions` P1 | scope CART · FIXED_AMOUNT · value 50.00 · **amount 50.00** · internal_name / title / config snapshots |
| `order_promotion_allocations` | (P1, #1, 25.00) · (P1, #2, 25.00) |
| `order_promotions` P2 | scope DELIVERY · FIXED_AMOUNT · value 10.00 · amount 10.00 · no allocation |
| `orders` | subtotal **150.00** · discount_total 50.00 · promotion_discount 50.00 · delivery_fee_original 30.00 · delivery_discount 10.00 · delivery_fee **20.00** · total **170.00** |

Arithmetic: Σ line_total 200.00 − Σ allocations 50.00 = 150.00; legacy 0.00 +
promotion 50.00 = 50.00; 150.00 + 50.00 = 200.00 gross; 30.00 − 10.00 = 20.00;
150.00 + 20.00 = 170.00. (Verified on the disposable database, evidence T20.)

### (b) 180 EGP — item path wins (40 > cart 15 % = 30); delivery −10

| table | row |
| --- | --- |
| `order_items` #1 | unit_price 100.00 · **discount_amount 20.00** · PERCENTAGE · 20.00 · **line_total 80.00** |
| `order_items` #2 | same |
| `order_promotions` | P2 only: DELIVERY · FIXED 10.00 · amount 10.00 |
| `order_promotion_allocations` | none |
| `orders` | subtotal 160.00 · discount_total 40.00 · promotion_discount 0.00 · delivery_fee_original 30.00 · delivery_discount 10.00 · delivery_fee 20.00 · total 180.00 |

Σ line_total 160.00 − 0.00 = 160.00; 40.00 + 0.00 = 40.00; 160.00 + 20.00 = 180.00.

### (c) CATEGORY 30 % beats the legacy 20 % on one line (Dine-In)

Line #1: category A, 100.00 × 1, legacy 20 % (20.00) vs CATEGORY 30 % (30.00) →
category wins. Line #2: category B (not targeted), 50.00 × 2, legacy 20 %
(10.00 / unit) → legacy stays.

| table | row |
| --- | --- |
| `order_items` #1 | unit_price 100.00 · **discount_amount 0.00** (beaten legacy not stored) · line_total **100.00** |
| `order_items` #2 | unit_price 50.00 · qty 2 · discount_amount 20.00 · PERCENTAGE · 20.00 · line_total 80.00 |
| `order_promotions` P3 | scope CATEGORY · PERCENTAGE · 30.00 · amount 30.00 |
| `order_promotion_allocations` | (P3, #1, 30.00) |
| `orders` | subtotal 150.00 · discount_total 50.00 · promotion_discount 30.00 · delivery_fee_original NULL · delivery_discount 0.00 · delivery_fee 0.00 · total 150.00 |

Σ line_total 180.00 − 30.00 = 150.00; legacy 20.00 + 30.00 = 50.00; 150.00 + 50.00 = 200.00 gross.

### (d) Legacy order (or any order with no Promotion configured)

Product 100.00 with legacy 20 % and a 5.00 paid extra; an Offer at 120.00.

| table | row |
| --- | --- |
| `order_items` #1 | unit_price 100.00 · discount_amount 20.00 · PERCENTAGE · 20.00 · line_total 85.00 |
| `order_items` #2 (Offer) | unit_price 120.00 · discount_amount 0.00 · line_total 120.00 |
| `order_promotions` / allocations | none |
| `orders` | subtotal 205.00 · discount_total 20.00 · promotion_discount **0.00** · delivery_fee_original **NULL** · delivery_discount **0.00** · delivery_fee 0.00 · total 205.00 |

Identical to what Product Discounts V1 writes today; every pre-B1 order reads
as this case (new columns default 0 / NULL, no promotion rows).

## 3. Reader audit (every reader of order money)

Found with the audit §4 list plus a fresh search for
`lineTotal|line_total|subtotalAmount|discountTotal|deliveryFeeAmount|totalAmount`
in `apps/api/src` and `apps/web/src` (excluding specs and the generated client).
"OK" means the reader shows correct numbers for (a)–(d) unchanged; ⚠ means it
assumes Σ line_total = subtotal (or hides a saving) and needs the B2 change.

| Reader | Reads | (a) cart / (c) category | (b) item / (d) legacy | Required B2 change |
| --- | --- | --- | --- | --- |
| api `public/public-orders.service.ts` `toGuestOrderView` L316-373, `OrderQuote` L96-141 | subtotal, discountTotal, deliveryFee, total; item unitPrice / discountAmount / lineTotal | totals OK (150 / 50 / 20 / 170); per-line only shows legacy, so a line saving from a promotion is invisible | OK | add `promotions[]` (title snapshot, scope, amount), per-line `promotionDiscount` (Σ allocations of the line), `deliveryFeeOriginal` / `deliveryDiscount`; keep existing fields and meanings |
| web guest `app/q/[publicCode]/CartPanel.tsx` confirmation L991-1017 | item `lineTotal + discountAmount` as "original", `subtotal + discountTotal`, discountTotal, deliveryFee | ⚠ order totals reconcile (items 200, discount −50, delivery 20, total 170) but item rows show no saving and the delivery discount is invisible (shows net 20) | OK | render promotion rows and per-line promotion saving; show delivery "30.00 − 10.00" (B4); keep identity `subtotal + discountTotal` |
| web guest `PublicMenuView.tsx` cart totals L1099-1136, `expectedTotal` L1234-1243 | client-computed totals | ⚠ cannot reproduce CART / QUANTITY / CATEGORY / MENU / DELIVERY winners → `PRICE_CHANGED` loop | OK | cart renders the server quote and sends the quote total as `expectedTotal` (B2 endpoint, B4 UI); shortfall to the zone minimum explained from the quote (net payable) |
| api `orders/orders.service.ts` item view L141-177, list L238-260, detail L283-353 | lineTotal, discountAmount, subtotalAmount, deliveryFeeAmount, discountTotalAmount, totalAmount | totals OK; comments L57 / L88 stay true (lineTotal net of the legacy discount; subtotal net of discountTotal) | OK | add applied promotions + per-line allocations + delivery original / discount to the Staff DTO; update L85 comment ("subtotal + deliveryFee = total" still true; fee is net) |
| web staff `orders/OrderDetailContent.tsx` L94, L293-353 | same | ⚠ items list sums to 200 but shows no promotion row; "discount 50" is unexplained; delivery shows net only | OK | show one row per applied promotion (title + amount) under the items, delivery original / discount |
| web staff `orders/OrderReceipt.tsx` L49, L143-203 | same | ⚠ same as detail (printed receipt) | OK | same as detail |
| api `public/whatsapp-order-message.ts` item lines L228-235, totals L293-308 | quote subtotal, discountTotal, deliveryFee, total | totals OK (items 200 − 50 + 20 = 170) but the discount is unnamed and the delivery discount invisible | OK | list applied promotion titles; delivery as original − discount (keep `subtotal + discountTotal` identity) |
| api `whatsapp-tracking/whatsapp-tracking.service.ts` L265-268, L332-351 | quote `total`; receipt `totalAmount` | OK (signs / stores the final total) | OK | none |
| api `table-sessions/table-sessions.service.ts` summary L1115-1135 (+ L246-257, L307-324, L527, L873, L1091) | order `totalAmount`, item `lineTotal`, `unitPrice` | ⚠ **Σ item lineTotal (200 / 180) ≠ round total (150)** on the Table Order Summary | OK | include each round's applied merchandise promotions (title, −amount) in the summary DTO so items − promotions = round total |
| web staff `tables/SessionBillReceipt.tsx` L170-214, `tables/SessionDrawer.tsx` L380-400 | item lineTotal, round totalAmount | ⚠ same mismatch printed / shown | OK | print / show the promotion rows from the DTO above |
| api `table-sessions/session-billing.ts` `computeSessionBill` L85-112 | `totalAmount` | OK (net) | OK | none |
| api `dashboard/dashboard.service.ts` revenue / AOV / by type L138-170, L276-296 | `totalAmount` (incl. net fee) | OK (net revenue) | OK | none |
| api `dashboard/dashboard.service.ts` top products L205-240 | item `lineTotal` | ⚠ overstates product revenue by the allocations (200 instead of 150) | OK | subtract each item's allocations (join `order_promotion_allocations`) so product amounts stay net |
| api `public/public-order-tracking.service.ts` L48, L184 | `totalAmount` | OK | OK | none |
| api `orders/kitchen.service.ts`, `public/order-tracking.ts` | no money | OK | OK | none |
| web types `lib/orders/types.ts`, `lib/public-menu/types.ts`, `app/q/[publicCode]/guest-view-types.ts`, `lib/table-sessions/types.ts`, `lib/public-menu/money.ts` | contracts / helpers | — | — | additive optional fields only |

Readers that assume **Σ line_total = subtotal** (all ⚠ above): table-session
summary + bill receipt + drawer, dashboard top products, and every per-line
display (guest confirmation, staff detail, receipt). The stored order-level
identities (`subtotal + discountTotal = gross`, `subtotal + fee = total`) hold
for every reader, so no historical order and no total changes meaning.

## 4. Persisting in B2

1. `evaluatePromotions` → `buildOrderPricingSnapshot` (labels = default-locale
   title and internal name read in the same transaction) →
   `checkOrderPricingSnapshot` must return `[]` (else 500, never persist).
2. Create `orders` with the order fields, `order_items` with `line_total` /
   `discount_*`, then `order_promotions` and `order_promotion_allocations`
   (mapping engine line index → created `order_items.id`) in the same
   transaction as today's order creation. Each `order_promotions` row carries the Order's `restaurant_id` and
   each allocation the Order's `order_id` (2026-11-22: the composite keys reject anything else).
3. Delivery Zone minimum: `snapshot.order.subtotalAmount < zone.minimumOrder` →
   `MINIMUM_ORDER_NOT_MET`, nothing created (no fallback strategy).
4. `PRICE_CHANGED` compares `expectedTotal` with `snapshot.order.totalAmount`.
