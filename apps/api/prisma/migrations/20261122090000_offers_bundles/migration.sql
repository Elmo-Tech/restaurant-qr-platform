-- Offers / Bundles (DEC-069, docs/01-domain/OFFERS_SPEC.md). ADDITIVE except one relaxation: `order_items.product_id` becomes
-- NULLABLE so an order line can be an Offer line; a CHECK keeps "exactly one of product_id / offer_id" true for every row, so every
-- existing row (all product lines) stays valid and nothing is backfilled.
--
-- New: enums `offer_status`, `offer_badge`, `offer_slot_kind`; the `OFFERS` feature key; tables `offers`, `offer_translations`,
-- `offer_slots`, `offer_slot_translations`, `offer_slot_options`, `offer_slot_option_translations`, `order_item_offer_choices`;
-- column `order_items.offer_id`.
--
-- No package receives OFFERS automatically (the platform team ticks it per package) and a restaurant with no package has every
-- customer feature, so a restaurant without a package sees the feature as soon as it creates an offer; nothing is created by this migration.
--
-- Rollback (before any offer exists / is ordered):
--   ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_xor_offer";
--   ALTER TABLE "order_items" DROP COLUMN "offer_id";  -- ALTER COLUMN "product_id" SET NOT NULL only if no offer line exists
--   DROP TABLE "order_item_offer_choices", "offer_slot_option_translations", "offer_slot_options", "offer_slot_translations",
--              "offer_slots", "offer_translations", "offers";
--   DROP TYPE "offer_slot_kind"; DROP TYPE "offer_badge"; DROP TYPE "offer_status";
--   (an enum value cannot be dropped from `feature_key`: delete rows using 'OFFERS' from package_features / restaurant_features instead).

-- CreateEnum
CREATE TYPE "offer_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "offer_badge" AS ENUM ('OFFER', 'GIFT', 'MOST_ORDERED');

-- CreateEnum
CREATE TYPE "offer_slot_kind" AS ENUM ('FIXED', 'SINGLE', 'MULTI');

-- AlterEnum
ALTER TYPE "feature_key" ADD VALUE 'OFFERS';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "offer_id" UUID,
ALTER COLUMN "product_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "status" "offer_status" NOT NULL,
    "badge" "offer_badge" NOT NULL DEFAULT 'OFFER',
    "price" DECIMAL(14,2) NOT NULL,
    "days_of_week" SMALLINT[] DEFAULT ARRAY[]::SMALLINT[],
    "starts_on" DATE,
    "ends_on" DATE,
    "image_asset_path" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_translations" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "offer_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_slots" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "kind" "offer_slot_kind" NOT NULL,
    "required_count" INTEGER NOT NULL DEFAULT 1,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "offer_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_slot_translations" (
    "id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "offer_slot_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_slot_options" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "price_adjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "product_id" UUID,
    "variant_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "offer_slot_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_slot_option_translations" (
    "id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "offer_slot_option_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_offer_choices" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "offer_slot_id" UUID,
    "offer_slot_option_id" UUID,
    "slot_kind" "offer_slot_kind" NOT NULL,
    "slot_title_snapshot" TEXT NOT NULL,
    "option_name_snapshot" TEXT NOT NULL,
    "price_adjustment_snapshot" DECIMAL(14,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "included" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_offer_choices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offers_restaurant_id_status_idx" ON "offers"("restaurant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "offer_translations_offer_id_locale_key" ON "offer_translations"("offer_id", "locale");

-- CreateIndex
CREATE INDEX "offer_slots_restaurant_id_idx" ON "offer_slots"("restaurant_id");

-- CreateIndex
CREATE INDEX "offer_slots_offer_id_idx" ON "offer_slots"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "offer_slot_translations_slot_id_locale_key" ON "offer_slot_translations"("slot_id", "locale");

-- CreateIndex
CREATE INDEX "offer_slot_options_restaurant_id_idx" ON "offer_slot_options"("restaurant_id");

-- CreateIndex
CREATE INDEX "offer_slot_options_slot_id_idx" ON "offer_slot_options"("slot_id");

-- CreateIndex
CREATE INDEX "offer_slot_options_product_id_idx" ON "offer_slot_options"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "offer_slot_option_translations_option_id_locale_key" ON "offer_slot_option_translations"("option_id", "locale");

-- CreateIndex
CREATE INDEX "order_item_offer_choices_order_item_id_idx" ON "order_item_offer_choices"("order_item_id");

-- CreateIndex
CREATE INDEX "order_item_offer_choices_offer_slot_id_idx" ON "order_item_offer_choices"("offer_slot_id");

-- CreateIndex
CREATE INDEX "order_item_offer_choices_offer_slot_option_id_idx" ON "order_item_offer_choices"("offer_slot_option_id");

-- CreateIndex
CREATE INDEX "order_items_offer_id_idx" ON "order_items"("offer_id");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_translations" ADD CONSTRAINT "offer_translations_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_slots" ADD CONSTRAINT "offer_slots_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_slots" ADD CONSTRAINT "offer_slots_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_slot_translations" ADD CONSTRAINT "offer_slot_translations_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "offer_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_slot_options" ADD CONSTRAINT "offer_slot_options_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_slot_options" ADD CONSTRAINT "offer_slot_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_slot_options" ADD CONSTRAINT "offer_slot_options_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_slot_options" ADD CONSTRAINT "offer_slot_options_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "offer_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_slot_option_translations" ADD CONSTRAINT "offer_slot_option_translations_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "offer_slot_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_offer_choices" ADD CONSTRAINT "order_item_offer_choices_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_offer_choices" ADD CONSTRAINT "order_item_offer_choices_offer_slot_id_fkey" FOREIGN KEY ("offer_slot_id") REFERENCES "offer_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_offer_choices" ADD CONSTRAINT "order_item_offer_choices_offer_slot_option_id_fkey" FOREIGN KEY ("offer_slot_option_id") REFERENCES "offer_slot_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Custom invariants ---------------------------------------------------------

-- An order line is a Product line or an Offer line, never both and never neither.
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_product_xor_offer"
  CHECK (("product_id" IS NOT NULL) <> ("offer_id" IS NOT NULL));

-- Money is never negative.
ALTER TABLE "offers"
  ADD CONSTRAINT "offers_price_non_negative" CHECK ("price" >= 0);
ALTER TABLE "offer_slot_options"
  ADD CONSTRAINT "offer_slot_options_adjustment_non_negative" CHECK ("price_adjustment" >= 0);
ALTER TABLE "order_item_offer_choices"
  ADD CONSTRAINT "order_item_offer_choices_adjustment_non_negative" CHECK ("price_adjustment_snapshot" >= 0),
  ADD CONSTRAINT "order_item_offer_choices_quantity_positive" CHECK ("quantity" >= 1);

-- Weekdays are 0 (Sunday) to 6 (Saturday); an empty array means every day.
ALTER TABLE "offers"
  ADD CONSTRAINT "offers_days_of_week_valid"
  CHECK ("days_of_week" IS NULL OR "days_of_week" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]);

-- The end date is never before the start date.
ALTER TABLE "offers"
  ADD CONSTRAINT "offers_dates_ordered"
  CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "ends_on" >= "starts_on");

-- A deleted offer has its archive time, and only a deleted one does.
ALTER TABLE "offers"
  ADD CONSTRAINT "offers_archived_consistent"
  CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL));

-- Slot shape: FIXED takes no choice (0), SINGLE exactly one (1), MULTI between 1 and 20.
ALTER TABLE "offer_slots"
  ADD CONSTRAINT "offer_slots_required_count_valid"
  CHECK (
    ("kind" = 'FIXED' AND "required_count" = 0)
    OR ("kind" = 'SINGLE' AND "required_count" = 1)
    OR ("kind" = 'MULTI' AND "required_count" BETWEEN 1 AND 20)
  );

-- Names stay readable.
ALTER TABLE "offer_translations"
  ADD CONSTRAINT "offer_translations_name_length" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "offer_translations_description_length" CHECK ("description" IS NULL OR char_length("description") <= 300);
ALTER TABLE "offer_slot_translations"
  ADD CONSTRAINT "offer_slot_translations_title_length" CHECK (char_length(btrim("title")) BETWEEN 1 AND 80);
ALTER TABLE "offer_slot_option_translations"
  ADD CONSTRAINT "offer_slot_option_translations_name_length" CHECK (char_length(btrim("name")) BETWEEN 1 AND 80);

-- Private tables: no Guest/Staff/Supabase Data API access. Everything goes through the NestJS API.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'offers', 'offer_translations', 'offer_slots', 'offer_slot_translations',
    'offer_slot_options', 'offer_slot_option_translations', 'order_item_offer_choices'
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

-- A menu-linked offer item: a size needs its product, and an item brings 1 to 99 units.
ALTER TABLE "offer_slot_options"
  ADD CONSTRAINT "offer_slot_options_variant_needs_product" CHECK ("variant_id" IS NULL OR "product_id" IS NOT NULL),
  ADD CONSTRAINT "offer_slot_options_quantity_valid" CHECK ("quantity" BETWEEN 1 AND 99);
