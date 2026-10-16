-- Product Variants V1 (DEC-041): sizes such as Small / Medium / Large. Purely
-- ADDITIVE:
--   * product_variants + product_variant_translations (new tables)
--   * order_items.variant_id / variant_name_snapshot / variant_adjustment_snapshot
--     (all NULL for every existing item and for any product without Variants)
--
-- A Variant's price is a NON-NEGATIVE adjustment from products.base_price. When
-- a Variant is chosen, order_items.unit_price is base_price + the adjustment
-- (the price of the chosen size before any discount), so the existing identity
-- line_total = (unit_price - unit discount + modifiers) * quantity is unchanged.
-- Existing orders need no backfill.
--
-- Rollback (before any Variant exists): DROP the three order_items columns, the
-- two tables and the enum. After Variants exist, set status = 'INACTIVE'
-- instead; a Variant referenced by an order is never deleted.

-- CreateEnum
CREATE TYPE "product_variant_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "status" "product_variant_status" NOT NULL,
    "price_adjustment" DECIMAL(14,2) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant_translations" (
    "id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "product_variant_translations_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "order_items"
  ADD COLUMN "variant_id" UUID,
  ADD COLUMN "variant_name_snapshot" TEXT,
  ADD COLUMN "variant_adjustment_snapshot" DECIMAL(14,2);

-- CreateIndex
CREATE INDEX "product_variants_restaurant_id_idx" ON "product_variants"("restaurant_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_translations_product_variant_id_locale_key" ON "product_variant_translations"("product_variant_id", "locale");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_translations" ADD CONSTRAINT "product_variant_translations_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariants (custom SQL: Prisma cannot express them; the application also
-- validates them -- defense in depth, mirrors products_base_price_non_negative).

-- A price adjustment is never negative: the smallest size is the base price.
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_price_adjustment_non_negative"
  CHECK ("price_adjustment" >= 0);

-- Only an ACTIVE Variant can be the default one.
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_default_is_active"
  CHECK ("is_default" = false OR "status" = 'ACTIVE');

-- At most one default Variant per Product (partial unique index).
CREATE UNIQUE INDEX "product_variants_one_default_per_product"
  ON "product_variants"("product_id")
  WHERE "is_default" = true;

-- A Variant snapshot is all-or-nothing on an order item.
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_variant_snapshot_complete"
  CHECK (
    ("variant_id" IS NULL AND "variant_name_snapshot" IS NULL AND "variant_adjustment_snapshot" IS NULL)
    OR ("variant_id" IS NOT NULL AND "variant_name_snapshot" IS NOT NULL AND "variant_adjustment_snapshot" IS NOT NULL)
  );
