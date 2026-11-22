-- Unified Promotions, milestone B1 (DEC-075; winner policy accepted by the Product Owner 2026-11-21).
-- Storage only: nothing in the application reads or writes these tables / columns yet (order-flow wiring is B2), and no
-- package or restaurant receives the new PROMOTIONS feature, so applying this migration changes no behavior.
-- Design: docs/02-technical/UNIFIED_PROMOTIONS_SCHEMA_AND_ROLLOUT.md and UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md.
--
-- PURELY ADDITIVE:
--   * enums promotion_scope, promotion_discount_type, promotion_status, promotion_quantity_basis;
--   * feature_key value PROMOTIONS (opt-in: no package_features / restaurant_features row is created, so every existing
--     package and restaurant keeps it OFF);
--   * tables promotions, promotion_translations, promotion_branches, promotion_menus, promotion_categories,
--     promotion_products, promotion_delivery_zones, order_promotions, order_promotion_allocations;
--   * orders columns promotion_discount_amount / delivery_discount_amount (NOT NULL DEFAULT 0, metadata-only in
--     PostgreSQL 11+) and delivery_fee_original_amount (NULL = legacy / not a delivery order);
--   * UNIQUE (id, restaurant_id) on branches, menus, categories, products, delivery_zones and orders, and
--     UNIQUE (id, order_id) on order_items: the targets of the tenant-safe / order-scoped composite foreign keys (id
--     is already the primary key, so these indexes can never reject a row).
-- No existing row is rewritten or backfilled. The legacy Product discount stays on products.discount_* and, in order
-- history, on order_items.discount_amount only. Orders keep subtotal = net merchandise, delivery_fee = net fee,
-- total = subtotal + fee, discount_total = legacy + new merchandise discounts.
--
-- Historical integrity (amended 2026-11-22, Product Owner correction B-1), enforced by the DATABASE:
--   * order_promotions (order_id, restaurant_id) -> orders (id, restaurant_id)          ON DELETE RESTRICT
--     (an applied promotion can never point at another Restaurant's Order; like order_items -> orders, RESTRICT);
--   * order_promotions (promotion_id, restaurant_id) -> promotions (id, restaurant_id)  ON DELETE RESTRICT
--     (same Restaurant; promotion_id NOT NULL; a Promotion used by an Order is archived, never hard-deleted --
--     PROMOTIONS_SPEC #52 -- so deleting / editing configuration can never remove history; a column-list
--     ON DELETE SET NULL (promotion_id) cannot be represented by Prisma 7 and would drift);
--   * order_promotion_allocations.order_id (new) with (order_promotion_id, order_id) -> order_promotions (id, order_id)
--     ON DELETE CASCADE (a pure split of its parent row) and (order_item_id, order_id) -> order_items (id, order_id)
--     ON DELETE RESTRICT: a share can only point at a line of the SAME Order (hence the same Restaurant), and a line
--     carrying a share cannot be deleted.
-- Existing RESTRICT semantics (order_items -> orders, order_status_events -> orders, ...) are unchanged.
--
-- Locks: every CREATE UNIQUE INDEX takes a SHARE lock on its table while the index is built: writes wait, reads do
-- not. On the five configuration tables this is negligible. On orders and order_items (the largest tables) it blocks
-- order creation for the build time. Measured 2026-11-22 on PostgreSQL 18 (synthetic clone): 0.56 s for 1,000,000
-- orders (index 47 MB) and 1.58 s for 3,000,000 order_items (index 142 MB); the whole migration applied in 2.7 s
-- there (UNIFIED_PROMOTIONS_SCHEMA_AND_ROLLOUT.md §5), i.e. milliseconds at Pilot volume. The FKs added to the NEW
-- (empty) tables also take SHARE ROW EXCLUSIVE on the referenced orders / order_items / promotions for an instant
-- (nothing to validate). The orders CHECKs scan orders once under the ALTER TABLE lock. Run outside peak hours, after
-- a backup. Should a much larger database ever need it, the two order indexes could instead be built by an earlier,
-- separate migration file with CREATE UNIQUE INDEX CONCURRENTLY (verified to work under `prisma migrate deploy`) and
-- removed from this file -- not needed at current volume. Note: `prisma migrate deploy` does not wrap this file in one transaction (verified), so a
-- failure part-way needs `prisma migrate resolve` (no statement here can fail on existing data).
--
-- Rollback: forward-only in shared environments (disable instead: no code reads these objects in B1; from B2 on the
-- PROMOTIONS entitlement and a kill switch stop the engine). Down-SQL for DISPOSABLE databases only (loses every
-- promotion and snapshot):
--   DROP TABLE "order_promotion_allocations", "order_promotions", "promotion_delivery_zones", "promotion_products",
--              "promotion_categories", "promotion_menus", "promotion_branches", "promotion_translations", "promotions";
--   ALTER TABLE "orders" DROP CONSTRAINT "orders_delivery_discount_consistent",
--     DROP CONSTRAINT "orders_promotion_discount_within_total", DROP CONSTRAINT "orders_delivery_discount_non_negative",
--     DROP CONSTRAINT "orders_delivery_fee_original_non_negative", DROP CONSTRAINT "orders_promotion_discount_non_negative",
--     DROP COLUMN "promotion_discount_amount", DROP COLUMN "delivery_fee_original_amount",
--     DROP COLUMN "delivery_discount_amount";
--   DROP INDEX "branches_id_restaurant_id_key", "menus_id_restaurant_id_key", "categories_id_restaurant_id_key",
--              "products_id_restaurant_id_key", "delivery_zones_id_restaurant_id_key", "orders_id_restaurant_id_key",
--              "order_items_id_order_id_key";
--   (drop the tables first: the composite FKs depend on the two order indexes)
--   DROP TYPE "promotion_quantity_basis", "promotion_status", "promotion_discount_type", "promotion_scope";
--   DELETE FROM "package_features" WHERE "feature" = 'PROMOTIONS'; DELETE FROM "restaurant_features" WHERE "feature" = 'PROMOTIONS';
--   (an enum value cannot be dropped from feature_key; the unused value is harmless)
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261128100000_unified_promotions';
--
-- Part 1 is the Prisma-generated DDL (prisma migrate diff, reviewed; unrelated pre-existing drift removed).
-- Part 2 is hand-written integrity SQL Prisma cannot express (CHECKs, RLS / REVOKE).

-- CreateEnum
CREATE TYPE "promotion_scope" AS ENUM ('CATEGORY', 'MENU', 'CART', 'QUANTITY', 'DELIVERY');

-- CreateEnum
CREATE TYPE "promotion_discount_type" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "promotion_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "promotion_quantity_basis" AS ENUM ('UNITS', 'DISTINCT_PRODUCTS');

-- AlterEnum
ALTER TYPE "feature_key" ADD VALUE IF NOT EXISTS 'PROMOTIONS';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "delivery_fee_original_amount" DECIMAL(14,2),
ADD COLUMN     "promotion_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "internal_name" TEXT NOT NULL,
    "scope" "promotion_scope" NOT NULL,
    "discount_type" "promotion_discount_type" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "status" "promotion_status" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "starts_on" DATE,
    "ends_on" DATE,
    "minimum_subtotal" DECIMAL(14,2),
    "minimum_quantity" INTEGER,
    "quantity_basis" "promotion_quantity_basis",
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_translations" (
    "id" UUID NOT NULL,
    "promotion_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "promotion_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_branches" (
    "promotion_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,

    CONSTRAINT "promotion_branches_pkey" PRIMARY KEY ("promotion_id","branch_id")
);

-- CreateTable
CREATE TABLE "promotion_menus" (
    "promotion_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,

    CONSTRAINT "promotion_menus_pkey" PRIMARY KEY ("promotion_id","menu_id")
);

-- CreateTable
CREATE TABLE "promotion_categories" (
    "promotion_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,

    CONSTRAINT "promotion_categories_pkey" PRIMARY KEY ("promotion_id","category_id")
);

-- CreateTable
CREATE TABLE "promotion_products" (
    "promotion_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,

    CONSTRAINT "promotion_products_pkey" PRIMARY KEY ("promotion_id","product_id")
);

-- CreateTable
CREATE TABLE "promotion_delivery_zones" (
    "promotion_id" UUID NOT NULL,
    "delivery_zone_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,

    CONSTRAINT "promotion_delivery_zones_pkey" PRIMARY KEY ("promotion_id","delivery_zone_id")
);

-- CreateTable
CREATE TABLE "order_promotions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "promotion_id" UUID NOT NULL,
    "scope" "promotion_scope" NOT NULL,
    "discount_type" "promotion_discount_type" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "internal_name_snapshot" TEXT NOT NULL,
    "title_snapshot" TEXT,
    "config_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_promotion_allocations" (
    "order_promotion_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "order_promotion_allocations_pkey" PRIMARY KEY ("order_promotion_id","order_item_id")
);

-- CreateIndex
CREATE INDEX "promotions_restaurant_id_status_idx" ON "promotions"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "promotions_restaurant_id_scope_status_idx" ON "promotions"("restaurant_id", "scope", "status");

-- CreateIndex
CREATE INDEX "promotions_restaurant_id_starts_on_ends_on_idx" ON "promotions"("restaurant_id", "starts_on", "ends_on");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_id_restaurant_id_key" ON "promotions"("id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_translations_promotion_id_locale_key" ON "promotion_translations"("promotion_id", "locale");

-- CreateIndex
CREATE INDEX "promotion_branches_restaurant_id_branch_id_idx" ON "promotion_branches"("restaurant_id", "branch_id");

-- CreateIndex
CREATE INDEX "promotion_menus_restaurant_id_menu_id_idx" ON "promotion_menus"("restaurant_id", "menu_id");

-- CreateIndex
CREATE INDEX "promotion_categories_restaurant_id_category_id_idx" ON "promotion_categories"("restaurant_id", "category_id");

-- CreateIndex
CREATE INDEX "promotion_products_restaurant_id_product_id_idx" ON "promotion_products"("restaurant_id", "product_id");

-- CreateIndex
CREATE INDEX "promotion_delivery_zones_restaurant_id_delivery_zone_id_idx" ON "promotion_delivery_zones"("restaurant_id", "delivery_zone_id");

-- CreateIndex
CREATE INDEX "order_promotions_order_id_idx" ON "order_promotions"("order_id");

-- CreateIndex
CREATE INDEX "order_promotions_restaurant_id_promotion_id_idx" ON "order_promotions"("restaurant_id", "promotion_id");

-- CreateIndex
CREATE INDEX "order_promotions_promotion_id_idx" ON "order_promotions"("promotion_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_promotions_id_order_id_key" ON "order_promotions"("id", "order_id");

-- CreateIndex
CREATE INDEX "order_promotion_allocations_order_item_id_idx" ON "order_promotion_allocations"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_id_restaurant_id_key" ON "branches"("id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_restaurant_id_key" ON "categories"("id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_id_restaurant_id_key" ON "delivery_zones"("id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "menus_id_restaurant_id_key" ON "menus"("id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_id_order_id_key" ON "order_items"("id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_id_restaurant_id_key" ON "orders"("id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_id_restaurant_id_key" ON "products"("id", "restaurant_id");

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_translations" ADD CONSTRAINT "promotion_translations_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_branches" ADD CONSTRAINT "promotion_branches_promotion_scope_fkey" FOREIGN KEY ("promotion_id", "restaurant_id") REFERENCES "promotions"("id", "restaurant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_branches" ADD CONSTRAINT "promotion_branches_branch_scope_fkey" FOREIGN KEY ("branch_id", "restaurant_id") REFERENCES "branches"("id", "restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_menus" ADD CONSTRAINT "promotion_menus_promotion_scope_fkey" FOREIGN KEY ("promotion_id", "restaurant_id") REFERENCES "promotions"("id", "restaurant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_menus" ADD CONSTRAINT "promotion_menus_menu_scope_fkey" FOREIGN KEY ("menu_id", "restaurant_id") REFERENCES "menus"("id", "restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_categories" ADD CONSTRAINT "promotion_categories_promotion_scope_fkey" FOREIGN KEY ("promotion_id", "restaurant_id") REFERENCES "promotions"("id", "restaurant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_categories" ADD CONSTRAINT "promotion_categories_category_scope_fkey" FOREIGN KEY ("category_id", "restaurant_id") REFERENCES "categories"("id", "restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_promotion_scope_fkey" FOREIGN KEY ("promotion_id", "restaurant_id") REFERENCES "promotions"("id", "restaurant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_product_scope_fkey" FOREIGN KEY ("product_id", "restaurant_id") REFERENCES "products"("id", "restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_delivery_zones" ADD CONSTRAINT "promotion_delivery_zones_promotion_scope_fkey" FOREIGN KEY ("promotion_id", "restaurant_id") REFERENCES "promotions"("id", "restaurant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_delivery_zones" ADD CONSTRAINT "promotion_delivery_zones_zone_scope_fkey" FOREIGN KEY ("delivery_zone_id", "restaurant_id") REFERENCES "delivery_zones"("id", "restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_order_scope_fkey" FOREIGN KEY ("order_id", "restaurant_id") REFERENCES "orders"("id", "restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_promotion_scope_fkey" FOREIGN KEY ("promotion_id", "restaurant_id") REFERENCES "promotions"("id", "restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_promotion_allocations" ADD CONSTRAINT "order_promotion_allocations_order_promotion_scope_fkey" FOREIGN KEY ("order_promotion_id", "order_id") REFERENCES "order_promotions"("id", "order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_promotion_allocations" ADD CONSTRAINT "order_promotion_allocations_order_item_scope_fkey" FOREIGN KEY ("order_item_id", "order_id") REFERENCES "order_items"("id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- Part 2: integrity that Prisma cannot express
-- =============================================================================

-- Promotion shape (validatePromotionInput mirrors these rules; the CHECKs are the backstop).
ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_value_positive" CHECK ("value" > 0),
  ADD CONSTRAINT "promotions_percentage_max_100"
    CHECK ("discount_type" <> 'PERCENTAGE' OR "value" <= 100),
  -- INV-PROMO-008 extended to MENU: item-scope promotions are percentage only.
  ADD CONSTRAINT "promotions_item_scope_percentage_only"
    CHECK ("scope" NOT IN ('CATEGORY', 'MENU') OR "discount_type" = 'PERCENTAGE'),
  -- QUANTITY needs a threshold (>= 1) and its basis; every other scope has neither.
  ADD CONSTRAINT "promotions_quantity_shape" CHECK (
    ("scope" = 'QUANTITY' AND "minimum_quantity" IS NOT NULL AND "minimum_quantity" >= 1
        AND "quantity_basis" IS NOT NULL)
    OR ("scope" <> 'QUANTITY' AND "minimum_quantity" IS NULL AND "quantity_basis" IS NULL)
  ),
  -- A spend minimum is never negative and only exists for CART / QUANTITY / DELIVERY.
  ADD CONSTRAINT "promotions_minimum_subtotal_shape" CHECK (
    "minimum_subtotal" IS NULL
    OR ("minimum_subtotal" >= 0 AND "scope" IN ('CART', 'QUANTITY', 'DELIVERY'))
  ),
  ADD CONSTRAINT "promotions_dates_ordered"
    CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "ends_on" >= "starts_on"),
  ADD CONSTRAINT "promotions_priority_range" CHECK ("priority" BETWEEN 0 AND 1000),
  -- An archived promotion has its archive time, and only an archived one does (same rule as offers).
  ADD CONSTRAINT "promotions_archived_consistent"
    CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL)),
  ADD CONSTRAINT "promotions_internal_name_length"
    CHECK (char_length(btrim("internal_name")) BETWEEN 1 AND 120);

ALTER TABLE "promotion_translations"
  ADD CONSTRAINT "promotion_translations_title_length"
    CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "promotion_translations_description_length"
    CHECK ("description" IS NULL OR char_length("description") <= 500);

-- Order money (snapshot model accepted 2026-11-21). Legacy rows (new columns 0 / NULL) satisfy every CHECK as they
-- are, so existing orders and the current order code keep working.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_promotion_discount_non_negative" CHECK ("promotion_discount_amount" >= 0),
  ADD CONSTRAINT "orders_delivery_fee_original_non_negative"
    CHECK ("delivery_fee_original_amount" IS NULL OR "delivery_fee_original_amount" >= 0),
  ADD CONSTRAINT "orders_delivery_discount_non_negative" CHECK ("delivery_discount_amount" >= 0),
  -- discount_total_amount = legacy line discounts + promotion_discount_amount; the legacy part (a sum over
  -- order_items) cannot be checked here, but it is never negative.
  ADD CONSTRAINT "orders_promotion_discount_within_total"
    CHECK ("promotion_discount_amount" <= "discount_total_amount"),
  -- delivery_fee_amount stays the NET fee payable; the original fee and its discount are recorded beside it.
  ADD CONSTRAINT "orders_delivery_discount_consistent" CHECK (
    ("delivery_fee_original_amount" IS NULL AND "delivery_discount_amount" = 0)
    OR (
      "delivery_fee_original_amount" IS NOT NULL
      AND "delivery_discount_amount" <= "delivery_fee_original_amount"
      AND "delivery_fee_amount" = "delivery_fee_original_amount" - "delivery_discount_amount"
    )
  );

-- Applied NEW promotions only (the legacy Product discount lives on order_items). The snapshot columns are the
-- history; tenant / order scoping is the composite foreign keys of Part 1 (order_promotions_order_scope_fkey,
-- order_promotions_promotion_scope_fkey, order_promotion_allocations_order_promotion_scope_fkey,
-- order_promotion_allocations_order_item_scope_fkey). promotion_id is NOT NULL and RESTRICT: a Promotion used by an
-- Order is archived, never hard-deleted (PROMOTIONS_SPEC #52), so the history link can never be lost.
ALTER TABLE "order_promotions"
  ADD CONSTRAINT "order_promotions_value_positive" CHECK ("value" > 0),
  ADD CONSTRAINT "order_promotions_percentage_max_100"
    CHECK ("discount_type" <> 'PERCENTAGE' OR "value" <= 100),
  ADD CONSTRAINT "order_promotions_item_scope_percentage_only"
    CHECK ("scope" NOT IN ('CATEGORY', 'MENU') OR "discount_type" = 'PERCENTAGE'),
  -- A row exists only for a promotion that actually saved money.
  ADD CONSTRAINT "order_promotions_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "order_promotions_internal_name_present"
    CHECK (char_length(btrim("internal_name_snapshot")) >= 1);

-- Only positive shares are stored; they sum to their order_promotions.amount (checked by the application, cross-row).
ALTER TABLE "order_promotion_allocations"
  ADD CONSTRAINT "order_promotion_allocations_amount_positive" CHECK ("amount" > 0);

-- Private tables: no Guest/Staff/Supabase Data API access. Everything goes through the NestJS API.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'promotions', 'promotion_translations', 'promotion_branches', 'promotion_menus', 'promotion_categories',
    'promotion_products', 'promotion_delivery_zones', 'order_promotions', 'order_promotion_allocations'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
