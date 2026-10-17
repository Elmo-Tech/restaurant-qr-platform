-- Restaurant announcements (DEC-042, slice 4). Purely ADDITIVE: two new tables and two enums.
--
-- A short message the Restaurant shows at the top of its Guest Menu ("Free delivery today over
-- 300 EGP"). Text lives in a translation child table (never language columns). `starts_on` and
-- `ends_on` are calendar dates (inclusive) read in the menu's own timezone, like Product
-- discounts. At most three ACTIVE announcements per Restaurant is an application rule.
--
-- Rollback (before any use): DROP TABLE "restaurant_announcement_translations";
-- DROP TABLE "restaurant_announcements"; DROP TYPE "announcement_style"; DROP TYPE "announcement_status";

-- CreateEnum
CREATE TYPE "announcement_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "announcement_style" AS ENUM ('INFO', 'PROMO', 'WARNING');

-- CreateTable
CREATE TABLE "restaurant_announcements" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "status" "announcement_status" NOT NULL,
    "style" "announcement_style" NOT NULL,
    "starts_on" DATE,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "restaurant_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_announcement_translations" (
    "id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "restaurant_announcement_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "restaurant_announcements_restaurant_id_status_idx" ON "restaurant_announcements"("restaurant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_announcement_translations_announcement_id_locale_key" ON "restaurant_announcement_translations"("announcement_id", "locale");

-- AddForeignKey
ALTER TABLE "restaurant_announcements" ADD CONSTRAINT "restaurant_announcements_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_announcement_translations" ADD CONSTRAINT "restaurant_announcement_translations_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "restaurant_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom invariants ---------------------------------------------------------

-- The end date is never before the start date.
ALTER TABLE "restaurant_announcements"
  ADD CONSTRAINT "restaurant_announcements_dates_ordered"
  CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "ends_on" >= "starts_on");

-- A message is never empty and stays short enough for a banner.
ALTER TABLE "restaurant_announcement_translations"
  ADD CONSTRAINT "restaurant_announcement_translations_text_length"
  CHECK (char_length(btrim("text")) BETWEEN 1 AND 200);
