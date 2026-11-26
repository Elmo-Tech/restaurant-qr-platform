# Unified Promotions — Implementation Plan (Track B)

Status: **Decisions recorded 2026-11-21 (Product Owner) — DEC-075 Accepted.** Nothing here is merged or deployed.
Branch: `feat/unified-promotions` (base `origin/main` `b61c549`).
**Re-based for review 2026-11-22:** reconstructed unchanged on `origin/main` `d0d608a` (PR #74, public order
idempotency request identity) in the review worktree `review/promotions-after-pr74`; no B1 code change was needed.
Related: `docs/01-domain/PROMOTIONS_SPEC.md` (amendment "Unified Promotions", accepted),
`docs/00-product/PROJECT_DECISIONS.md` DEC-075 (Accepted),
`docs/01-domain/PROMOTIONS_STACKING_EXAMPLES.md`,
`docs/02-technical/UNIFIED_PROMOTIONS_SCHEMA_AND_ROLLOUT.md`,
`docs/02-technical/UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md`.

## Decisions

| # | Decision | PO decision (2026-11-21) | Code / docs match? |
| --- | --- | --- | --- |
| B-D1 | Winner rule | **Maximum savings first** accepted; amends `PROMOTIONS_SPEC.md` #27–#29 and `AGENTS.md` #36 (dated notes, original text kept) | Yes — engine + 64 engine tests; DEC-075, spec, AGENTS.md #36 note updated |
| B-D2 | New targets MENU / QUANTITY / DELIVERY and release scope | ~~Not decided: `AGENTS.md` #35 targets and the DEC-034 label still await approval~~ **Accepted 2026-11-21 (second review)**: Promotion domain extended with MENU, QUANTITY and DELIVERY; recorded as DEC-075 "Amendment 2026-11-21 (B-D2)"; dated notes under `AGENTS.md` #19 / #35 / #36, DEC-034, `PROMOTIONS_SPEC.md`, `DATABASE_SPEC.md` #85 | Yes — engine / schema implement them (unused by order creation until B2) |
| B-D3 | Staff permission set | **`promotions.view` / `promotions.manage`** (existing; no new permission); structural writes keep Restaurant + all-Branches guards; Product discount editing unchanged | Documented (rollout §3); routes come in B3 |
| B-D4 | Package entitlement | **New opt-in, customer-visible `PROMOTIONS` key** approved; not added to existing packages; no-package restaurants do not get it without an override; Product Discounts V1 not gated; Offers stay on `OFFERS` | Yes — implemented in B1 (schema + migration, `features.ts`, platform console + web types / labels, entitlement tests); API guard in B3 |
| B-D5 | Historical snapshot model | **Reworked**: `order_items.discount_amount` = legacy only (when applied); `line_total` net of legacy, before new promotions; new merchandise savings only as `order_promotions` + allocations; delivery as fee adjustment; `discount_total` = legacy + `promotion_discount_amount` | Yes — schema / migration reworked, engine output reshaped, pure `buildOrderPricingSnapshot` + `checkOrderPricingSnapshot` with 12 tests; rows in the snapshot doc |
| B-D6 | Delivery Zone minimum failure | **Refuse** with the existing minimum-order error on the NET payable; never suppress a promotion; Guest UI explains the shortfall (B4) | Yes — engine has no fallback (test); caller check in B2 |
| B-D7 | `discountApplies=false` scope | **Legacy Product discount only**; CATEGORY / MENU use their own eligibility rules (documented in the spec R1 row) | Yes — engine + test |
| — | Legacy discount when the cart wins | **Must not remain applied** | Yes — engine + tests assert 0.00 legacy on every line when CART wins |
| — | Paid modifiers / offers | Item scope never discounts paid modifiers; offers never discounted again; Offer gate / lifecycle untouched | Yes — engine + tests; no Offer code touched |

Pre-existing issue found (not fixed, out of scope): public order idempotency keys on body
`clientRequestId` without a payload fingerprint; same key + different cart silently returns the
original order instead of `409 IDEMPOTENCY_KEY_REUSED` (`API_CONVENTIONS.md` #76–#81,
`public-orders.service.ts` ~L697–705).

> **Resolved on main 2026-11-22 (PR #74, `d0d608a`):** `orders.client_request_fingerprint` (migration
> `20261127120000_order_client_request_fingerprint`) now stores a versioned SHA-256 of the canonical material request;
> same key + different payload → `409 IDEMPOTENCY_KEY_REUSED` (`API_CONVENTIONS.md` #81 clarification). The
> fingerprint deliberately **excludes prices, totals and `expectedTotal`**, so B2 promotion results never take part
> in request identity. If B2 adds a Guest-supplied promotion input (for example a code), that input is material and
> needs a new fingerprint version (keeping the old canonicalizer), per the versioning rule of that clarification.

> **Follow-up (DEC-077, 2026-11-26, documentation only).** Fixed MENU / CATEGORY discounts, the strictly positive CART minimum, real
> previews and the editor UX are planned in `PROMOTIONS_DEC077_IMPLEMENTATION_PLAN.md` as a separate B1–B4 series (labels differ from the
> milestones below).

## Milestones

### B1 — Domain model, policy amendment, pure engine — **DONE (round 2, awaiting review)**
- [x] Spec amendment + DEC-075 **Accepted** + AGENTS.md #36 dated note + stacking examples + schema/rollout doc + historical snapshot doc.
- [x] Additive migration `20261128100000_unified_promotions` (promotions, translations, 5 tenant-safe target tables with composite FKs, `order_promotions`, `order_promotion_allocations`, 3 additive `orders` columns, `feature_key` `PROMOTIONS`, CHECKs, RLS/REVOKE).
- [x] Pure engine `apps/api/src/promotions/promotion-engine.ts` + `validatePromotionInput` (output reshaped for the accepted snapshot model).
- [x] Pure snapshot mapper `promotion-snapshot.ts` (`buildOrderPricingSnapshot`, `checkOrderPricingSnapshot`).
- [x] `PROMOTIONS` entitlement (opt-in, customer-visible) in API, platform console and web types / labels.
- [x] 64 engine + 12 snapshot unit tests; reconciliation identities asserted on every engine scenario.
- [x] Migration applied to a **fresh** disposable PostgreSQL 18 database from scratch; constraint, cross-tenant FK, cascade / restrict, RLS and reconciliation checks executed (`wayta-review/track-b-r2/evidence/`).
- [x] **Round 3 (2026-11-22, Product Owner corrections B-1 / B-2):** historical tenant isolation enforced by the
  database — `order_promotions` references its Order and its Promotion on (`id`, `restaurant_id`), both RESTRICT
  (`promotion_id` NOT NULL: a Promotion used by an Order is archived, never deleted — PROMOTIONS_SPEC #52);
  `order_promotion_allocations` gained `order_id` and references its parent row and its line on (`id`, `order_id`);
  new UNIQUE (`id`, `restaurant_id`) on `orders` and (`id`, `order_id`) on `order_items` / `order_promotions`
  (B1 migration edited in place; it is unmerged and unapplied anywhere shared). Live Delivery Zone delete now answers
  `409 DELIVERY_ZONE_USED_BY_PROMOTIONS` (EN / AR copy) when a promotion targets the zone instead of the false
  `DELIVERY_ZONE_HAS_ORDERS`; Orders take precedence when both apply. Real-PostgreSQL specs
  `test/unified-promotions-integrity-postgres.e2e-spec.ts` and `test/delivery-zone-delete-postgres.e2e-spec.ts`.
  Details: `UNIFIED_PROMOTIONS_SCHEMA_AND_ROLLOUT.md` §2 / §5, `DATABASE_SPEC.md` #112–#114.

### B2 — Quote + order integration, historical snapshots — NOT STARTED (held by Product Owner STOP of 2026-11-21; B-D1/B-D5 now decided; recommended prerequisite: the separate idempotency-reuse fix PR, see `wayta-review/baseline/IDEMPOTENCY_REUSE_FINDING.md`; **prerequisite met 2026-11-22: merged as PR #74**)
- [ ] Extract `priceCart(tx, ctx)` from `public-orders.service.ts` (menu/products/offers resolution → engine → delivery) without moving Table Session slot resolution into it.
- [ ] Load candidate promotions (restaurant, ACTIVE, target joins) once per request; evaluate with Order Branch `today`.
- [ ] `POST /api/v1/public/qr/:publicCode/quote` with its own rate-limit group (`publicQuote`), no idempotency lookup, no session/lock, no customer fields.
- [ ] Order creation + WhatsApp dry run use the same `priceCart`; persist `buildOrderPricingSnapshot` output (after `checkOrderPricingSnapshot`); keep `subtotal + deliveryFee = total`.
- [ ] Engine gated by `PROMOTIONS` (feature off ⇒ no Promotion rows loaded ⇒ legacy-identical pricing).
- [ ] `PRICE_CHANGED` compares against the engine grand total.
- [ ] Update every ⚠ reader of `UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md` §3: Staff order detail/receipt, table-session summary/bill/drawer, dashboard top products, WhatsApp message, guest confirmation.
- [ ] Real-DB e2e: B5 scenario end-to-end, idempotent retries, concurrent submissions, promotion disabled mid-checkout, legacy orders.

### B3 — Staff Promotions workspace — implemented on `feat/promotions-b3` (review pending)

> **Mandatory B3 prerequisites (recorded 2026-11-22, Product Owner correction B-2; not built in B1).**
> 1. **Delivery Zone delete vs promotions.** B1 already answers `409 DELIVERY_ZONE_USED_BY_PROMOTIONS` from
>    `DELETE /restaurants/{id}/delivery-zones/{zoneId}` (and `canDelete = false`) when a zone is a promotion target;
>    `DELIVERY_ZONE_HAS_ORDERS` keeps precedence when the zone also has Orders. B3 must keep both codes stable and
>    give Staff a way out: the Promotions workspace shows which promotions target a zone, lets Staff remove the zone
>    from them (an empty zone list means "all zones", so removing the LAST zone must be an explicit, confirmed
>    widening — or the promotion is deactivated / archived instead), and the Delivery settings UI explains why
>    the delete button is missing (today it is simply hidden, as for zones with Orders). The same rule applies to
>    every other RESTRICT target (`promotion_branches`, `promotion_menus`, `promotion_categories`,
>    `promotion_products`): any future hard delete of those rows needs its own distinct conflict code, never a
>    generic one.
> 2. **Archive, never delete, a used Promotion.** `order_promotions.promotion_id` is RESTRICT: deleting a Promotion
>    that any Order used fails in the database (P2003 / SQLSTATE 23001 on
>    `order_promotions_promotion_scope_fkey`). The B3 API must offer archive (`status = ARCHIVED`, `archived_at`) and
>    may hard-delete only a never-used Promotion, mapping a racing P2003 on that constraint to a distinct conflict
>    code (to be added to `API_CONVENTIONS.md` with B3) instead of a 500.
> 3. **B2 writer contract.** Each allocation row carries the Order id (`order_promotion_allocations.order_id`) and
>    each `order_promotions` row the Order's Restaurant id; the composite keys reject anything else.
- [x] Staff CRUD API (`promotions.view` / `promotions.manage`, tenant-safe target validation, `AllBranchesRequiredGuard`, CSRF, opt-in `PROMOTIONS`). Safe target edits and terminal archive release explicit links; historical rows are immutable. The Delivery settings explain both deletion blockers and link to the filtered Promotions list. There is no Staff hard-delete route for the other targets; their existing RESTRICT keys remain in place.
- [x] `/staff/restaurants/[restaurantId]/menu/promotions` registered in `MenuSectionTabs`; list/search/filter/create/edit/activate/archive, engine-backed sample preview, and bilingual conflict recovery.
- [x] Persisted checkout takes key-share locks on date-eligible Promotion rows. If checkout wins, history blocks a racing delete; if deletion wins, checkout prices without the removed row and retains `PRICE_CHANGED` / reconfirmation. Quotes, WhatsApp dry runs and pricing policy are unchanged. See `API_CONVENTIONS.md` #111–#112 for the B3 contract.

### B4 — Guest display, receipts, financial QA — PENDING
- [ ] Cart renders the server quote (debounced, cancellable), sends quote total as `expectedTotal`.
- [ ] Item-level promo labels on menu cards (best item-scope candidate only); cart-level savings + remaining-to-qualify; delivery before/after.
- [ ] Visual QA matrix and financial reconciliation (Guest/Staff/receipt/WhatsApp/history).
