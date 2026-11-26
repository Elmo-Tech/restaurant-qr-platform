-- DEC-077 B1 (Product Owner 2026-11-26): CATEGORY and MENU promotions may be FIXED_AMOUNT as well as PERCENTAGE.
-- Forward-only, metadata-only: exactly two DROP CONSTRAINT statements. No row is read, rewritten, inserted, deleted or
-- backfilled, no CHECK / trigger / column is added, and no enum changes. Both constraints came from
-- 20261128100000_unified_promotions (which is NOT edited) and only enforced the superseded "item scope is percentage
-- only" rule (DEC-075 B-D2, INV-PROMO-008). Every other CHECK stays: value > 0, PERCENTAGE <= 100, the quantity shape,
-- minimum_subtotal >= 0 (and only for CART / QUANTITY / DELIVERY), dates, priority range.
--
-- Rollout and rollback (docs/02-technical/PROMOTIONS_DEC077_IMPLEMENTATION_PLAN.md #5, DATABASE_SPEC.md amendment
-- 2026-11-26):
--   * Applying this migration creates NO fixed item promotion. The API refuses to write one until the default-off
--     setting PROMOTIONS_FIXED_ITEM_WRITES_ENABLED is switched on, which is done only after every pricing process
--     runs the B1 build (a pre-B1 engine ignores fixed item rows, so a mixed fleet must never serve them).
--   * These two constraints are NEVER re-added once a FIXED_AMOUNT CATEGORY / MENU row exists in promotions or
--     order_promotions: the ADD would fail on existing history, and order_promotions rows are never rewritten.
--     Rolling the schema back is a forward decision, not a revert. Back up before applying; use `migrate deploy`.

ALTER TABLE "promotions"
  DROP CONSTRAINT "promotions_item_scope_percentage_only";

ALTER TABLE "order_promotions"
  DROP CONSTRAINT "order_promotions_item_scope_percentage_only";
