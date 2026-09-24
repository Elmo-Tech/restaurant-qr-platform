-- FT-7: External Pickup / Takeaway ordering.
--
-- `type` is added nullable -> backfilled -> set NOT NULL (same safe 3-step
-- pattern as `20260923114512_add_modifier_presets`'s `price_is_overridden`
-- column): every existing Order was created exclusively through a TABLE QR
-- before this migration, so every existing row is unambiguously DINE_IN.
-- No persisted column DEFAULT is kept afterward -- mirrors every other
-- Order/enum column in this schema (application code always sets `type`
-- explicitly going forward, exactly like `status`).

-- CreateEnum
CREATE TYPE "order_type" AS ENUM ('DINE_IN', 'PICKUP');

-- AlterTable: add "type" nullable, backfill, then require it.
ALTER TABLE "orders" ADD COLUMN "type" "order_type";
UPDATE "orders" SET "type" = 'DINE_IN' WHERE "type" IS NULL;
ALTER TABLE "orders" ALTER COLUMN "type" SET NOT NULL;

-- AlterTable: a PICKUP Order (GENERIC QR) has no Table -- safe relaxation,
-- no data loss, every existing row already has a non-null table_id.
ALTER TABLE "orders" ALTER COLUMN "table_id" DROP NOT NULL;

-- AlterTable: PICKUP-only Guest checkout snapshots (Section 4) -- always
-- NULL for a DINE_IN Order.
ALTER TABLE "orders" ADD COLUMN "customer_name_snapshot" TEXT;
ALTER TABLE "orders" ADD COLUMN "customer_phone_snapshot" TEXT;
ALTER TABLE "orders" ADD COLUMN "customer_notes_snapshot" TEXT;

-- Extend the idempotency uniqueness scope to include branch_id (Section 6):
-- one GENERIC QR is shared across every Pickup Branch of a Restaurant, so
-- `qr_code_id` alone can no longer distinguish two genuinely different
-- Pickup submissions that coincidentally reuse the same client-chosen id
-- for two different Branches. For a TABLE QR, branch_id is already fixed by
-- the Table, so this is a pure extension -- never a behavior change for
-- DINE_IN idempotency.
DROP INDEX "orders_qr_code_id_client_request_id_key";
CREATE UNIQUE INDEX "orders_qr_code_id_branch_id_client_request_id_key" ON "orders"("qr_code_id", "branch_id", "client_request_id");
