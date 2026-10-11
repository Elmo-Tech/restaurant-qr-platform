-- Product Discounts V1: a product-level percentage or fixed-amount discount with
-- an optional start / end date and a manual enable switch. Purely ADDITIVE:
--   * products.discount_type / discount_value / discount_enabled /
--     discount_starts_on / discount_ends_on  (all NULL / false for every
--     existing product, so nothing changes for products without a discount)
--   * order_items.discount_amount (NOT NULL DEFAULT 0), discount_type_snapshot,
--     discount_value_snapshot   -- the discount that was applied to the line
--   * orders.discount_total_amount (NOT NULL DEFAULT 0)
--
-- Existing orders need no backfill: discount 0.00 is correct for them, and the
-- identity  line_total = (unit_price + modifiers) * quantity - discount_amount
-- reduces to the historical formula. `order_items.unit_price` keeps meaning
-- "price before discount" and `orders.subtotal_amount` stays the payable items
-- subtotal (after discounts).
--
-- Dates are calendar DATEs interpreted in the Branch timezone at read time, so
-- "automatic expiry" needs no scheduled job.
--
-- Rollback (before any discount is configured or applied): DROP the columns and
-- the enum. After discounts exist, set discount_enabled = false instead.

-- CreateEnum
CREATE TYPE "product_discount_type" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- AlterTable
ALTER TABLE "products"
  ADD COLUMN "discount_type" "product_discount_type",
  ADD COLUMN "discount_value" DECIMAL(14,2),
  ADD COLUMN "discount_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "discount_starts_on" DATE,
  ADD COLUMN "discount_ends_on" DATE;

-- AlterTable
ALTER TABLE "order_items"
  ADD COLUMN "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount_type_snapshot" "product_discount_type",
  ADD COLUMN "discount_value_snapshot" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "orders"
  ADD COLUMN "discount_total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Invariants the application also validates (defense in depth; mirrors the
-- products_base_price_non_negative precedent).
ALTER TABLE "products"
  ADD CONSTRAINT "products_discount_shape_check"
  CHECK (
    ("discount_type" IS NULL AND "discount_value" IS NULL)
    OR (
      "discount_type" IS NOT NULL AND "discount_value" IS NOT NULL
      AND "discount_value" > 0
      AND ("discount_type" <> 'PERCENTAGE' OR "discount_value" <= 100)
    )
  ),
  ADD CONSTRAINT "products_discount_enabled_needs_value_check"
  CHECK ("discount_enabled" = false OR "discount_type" IS NOT NULL),
  ADD CONSTRAINT "products_discount_dates_check"
  CHECK (
    "discount_starts_on" IS NULL OR "discount_ends_on" IS NULL
    OR "discount_ends_on" >= "discount_starts_on"
  );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_discount_amount_non_negative"
  CHECK ("discount_amount" >= 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_discount_total_non_negative"
  CHECK ("discount_total_amount" >= 0);
