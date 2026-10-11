-- V1 Final Features Batch 1: Restaurant cover image and bilingual Branch /
-- Delivery zone names. Purely ADDITIVE (backward compatible, expand step):
--   * restaurants.cover_asset_path  (nullable; null keeps today's hero)
--   * branch_translations           (branch_id, locale) unique
--   * delivery_zone_translations    (delivery_zone_id, locale) unique
-- `branches.name` and `delivery_zones.name` are untouched and stay the
-- default-locale / legacy fallback name. Historical order snapshots
-- (orders.delivery_zone_name_snapshot) are never read or written here.
--
-- Backfill: one row per existing Branch and Delivery zone in the owning
-- Restaurant's default locale, copied from the current `name`. The backfill is
-- idempotent (ON CONFLICT DO NOTHING).
--
-- Rollback (before any later contract step): DROP the two tables and the
-- column; no other data depends on them.

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN "cover_asset_path" TEXT;

-- CreateTable
CREATE TABLE "branch_translations" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "branch_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zone_translations" (
    "id" UUID NOT NULL,
    "delivery_zone_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "delivery_zone_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_translations_branch_id_locale_key" ON "branch_translations"("branch_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zone_translations_delivery_zone_id_locale_key" ON "delivery_zone_translations"("delivery_zone_id", "locale");

-- AddForeignKey
ALTER TABLE "branch_translations" ADD CONSTRAINT "branch_translations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zone_translations" ADD CONSTRAINT "delivery_zone_translations_delivery_zone_id_fkey" FOREIGN KEY ("delivery_zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (default-locale row per existing Branch / Delivery zone)
INSERT INTO "branch_translations" ("id", "branch_id", "locale", "name")
SELECT gen_random_uuid(), b."id", r."default_locale", b."name"
FROM "branches" b
JOIN "restaurants" r ON r."id" = b."restaurant_id"
ON CONFLICT ("branch_id", "locale") DO NOTHING;

INSERT INTO "delivery_zone_translations" ("id", "delivery_zone_id", "locale", "name")
SELECT gen_random_uuid(), z."id", r."default_locale", z."name"
FROM "delivery_zones" z
JOIN "restaurants" r ON r."id" = z."restaurant_id"
ON CONFLICT ("delivery_zone_id", "locale") DO NOTHING;
