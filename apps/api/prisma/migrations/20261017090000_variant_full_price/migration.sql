-- Product Variants V1 (DEC-041 amendment, 2026-10-17): a size carries its FULL
-- price (Small 60, Medium 80, Large 100, as printed on a menu) instead of an
-- adjustment from the Product price. The Product price (products.base_price)
-- now mirrors the cheapest ACTIVE size and is maintained by the application
-- whenever sizes change.
--
--   * product_variants.price_adjustment -> product_variants.price
--   * its CHECK constraint is renamed accordingly (price >= 0 still holds)
--   * order_items.variant_adjustment_snapshot -> variant_price_snapshot
--
-- Data: before this migration a Variant stored an adjustment, so each existing
-- row is converted to the full price (base_price + adjustment), each order item
-- snapshot to its unit price, and every Product that has active sizes gets its
-- base_price set to the cheapest active size (the new invariant). Rows that
-- were entered as test data in development are converted faithfully, never
-- guessed: a size entered as "+85" on a 75 product becomes 160.
--
-- Rollback (while no size price has been edited): rename the columns back and
-- subtract the Product price again.

ALTER TABLE "product_variants" RENAME COLUMN "price_adjustment" TO "price";

ALTER TABLE "product_variants"
  RENAME CONSTRAINT "product_variants_price_adjustment_non_negative"
  TO "product_variants_price_non_negative";

ALTER TABLE "order_items" RENAME COLUMN "variant_adjustment_snapshot" TO "variant_price_snapshot";

UPDATE "product_variants" AS v
SET "price" = v."price" + p."base_price"
FROM "products" AS p
WHERE p."id" = v."product_id";

UPDATE "order_items"
SET "variant_price_snapshot" = "unit_price"
WHERE "variant_id" IS NOT NULL;

-- The Product price is now the cheapest active size.
UPDATE "products" AS p
SET "base_price" = m."min_price"
FROM (
  SELECT "product_id", MIN("price") AS "min_price"
  FROM "product_variants"
  WHERE "status" = 'ACTIVE'
  GROUP BY "product_id"
) AS m
WHERE m."product_id" = p."id" AND p."base_price" <> m."min_price";
