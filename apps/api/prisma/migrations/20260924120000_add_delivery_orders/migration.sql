-- FT-8: Delivery ordering V1.
--
-- Existing Orders stay exactly as they are: every existing row is DINE_IN or
-- PICKUP, so its new money breakdown is subtotal = total_amount and
-- delivery_fee = 0. The two NOT NULL money columns therefore use the same
-- safe 3-step pattern as earlier migrations (add nullable -> backfill -> set
-- NOT NULL), with no persisted default (application code always sets them).

-- AlterEnum (new values are not used inside this migration)
ALTER TYPE "order_status" ADD VALUE 'OUT_FOR_DELIVERY' AFTER 'READY';
ALTER TYPE "order_type" ADD VALUE 'DELIVERY';

-- CreateEnum
CREATE TYPE "delivery_zone_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "delivery_fee" DECIMAL(14,2) NOT NULL,
    "minimum_order" DECIMAL(14,2) NOT NULL,
    "status" "delivery_zone_status" NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id"),
    -- Defense in depth behind the DTO validation (same convention as
    -- products_base_price_non_negative).
    CONSTRAINT "delivery_zones_delivery_fee_non_negative" CHECK ("delivery_fee" >= 0),
    CONSTRAINT "delivery_zones_minimum_order_non_negative" CHECK ("minimum_order" >= 0)
);

-- CreateIndex
CREATE INDEX "delivery_zones_restaurant_id_idx" ON "delivery_zones"("restaurant_id");
CREATE INDEX "delivery_zones_branch_id_status_idx" ON "delivery_zones"("branch_id", "status");

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Order money breakdown (backfilled for existing rows).
ALTER TABLE "orders" ADD COLUMN "subtotal_amount" DECIMAL(14,2);
ALTER TABLE "orders" ADD COLUMN "delivery_fee_amount" DECIMAL(14,2);
UPDATE "orders" SET "subtotal_amount" = "total_amount", "delivery_fee_amount" = 0 WHERE "subtotal_amount" IS NULL;
ALTER TABLE "orders" ALTER COLUMN "subtotal_amount" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "delivery_fee_amount" SET NOT NULL;

-- AlterTable: DELIVERY-only snapshots and the traceability reference.
ALTER TABLE "orders" ADD COLUMN "delivery_zone_id" UUID;
ALTER TABLE "orders" ADD COLUMN "delivery_zone_name_snapshot" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_address_snapshot" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_building_snapshot" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_floor_snapshot" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_apartment_snapshot" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_landmark_snapshot" TEXT;

-- CreateIndex
CREATE INDEX "orders_delivery_zone_id_idx" ON "orders"("delivery_zone_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_fkey" FOREIGN KEY ("delivery_zone_id") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
