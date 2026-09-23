-- CreateEnum
CREATE TYPE "modifier_preset_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "modifier_preset_option_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "modifier_groups" ADD COLUMN     "source_preset_id" UUID;

-- AlterTable
-- FT-6B: `price_is_overridden` is added NOT NULL to an already-populated
-- table (existing FT-6A Modifier Options) -- added nullable first, backfilled
-- to `false` (no existing row has ever been overridden, since the override
-- concept did not exist before this migration), then locked NOT NULL. This
-- mirrors the standard safe-backfill pattern for a new required column on a
-- non-empty table; `prisma migrate dev` refuses this exact case
-- non-interactively, which is why this migration is hand-authored rather
-- than tool-generated (mirrors the precedent in
-- 20260916101622_scope_order_idempotency_to_qr).
ALTER TABLE "modifier_options" ADD COLUMN     "price_is_overridden" BOOLEAN,
ADD COLUMN     "source_preset_option_id" UUID;

UPDATE "modifier_options" SET "price_is_overridden" = false WHERE "price_is_overridden" IS NULL;

ALTER TABLE "modifier_options" ALTER COLUMN "price_is_overridden" SET NOT NULL;

-- CreateTable
CREATE TABLE "modifier_presets" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "status" "modifier_preset_status" NOT NULL,
    "minimum_selections" INTEGER NOT NULL,
    "maximum_selections" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "modifier_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_preset_translations" (
    "id" UUID NOT NULL,
    "modifier_preset_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "helper_text" TEXT,

    CONSTRAINT "modifier_preset_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_preset_options" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "modifier_preset_id" UUID NOT NULL,
    "status" "modifier_preset_option_status" NOT NULL,
    "price_adjustment" DECIMAL(14,2) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "modifier_preset_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_preset_option_translations" (
    "id" UUID NOT NULL,
    "modifier_preset_option_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "modifier_preset_option_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modifier_presets_restaurant_id_idx" ON "modifier_presets"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_preset_translations_modifier_preset_id_locale_key" ON "modifier_preset_translations"("modifier_preset_id", "locale");

-- CreateIndex
CREATE INDEX "modifier_preset_options_restaurant_id_idx" ON "modifier_preset_options"("restaurant_id");

-- CreateIndex
CREATE INDEX "modifier_preset_options_modifier_preset_id_idx" ON "modifier_preset_options"("modifier_preset_id");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_preset_option_translations_modifier_preset_option__key" ON "modifier_preset_option_translations"("modifier_preset_option_id", "locale");

-- CreateIndex
CREATE INDEX "modifier_groups_source_preset_id_idx" ON "modifier_groups"("source_preset_id");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_groups_product_id_source_preset_id_key" ON "modifier_groups"("product_id", "source_preset_id");

-- CreateIndex
CREATE INDEX "modifier_options_source_preset_option_id_idx" ON "modifier_options"("source_preset_option_id");

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_source_preset_id_fkey" FOREIGN KEY ("source_preset_id") REFERENCES "modifier_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_source_preset_option_id_fkey" FOREIGN KEY ("source_preset_option_id") REFERENCES "modifier_preset_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_presets" ADD CONSTRAINT "modifier_presets_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_preset_translations" ADD CONSTRAINT "modifier_preset_translations_modifier_preset_id_fkey" FOREIGN KEY ("modifier_preset_id") REFERENCES "modifier_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_preset_options" ADD CONSTRAINT "modifier_preset_options_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_preset_options" ADD CONSTRAINT "modifier_preset_options_modifier_preset_id_fkey" FOREIGN KEY ("modifier_preset_id") REFERENCES "modifier_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_preset_option_translations" ADD CONSTRAINT "modifier_preset_option_translations_modifier_preset_option_fkey" FOREIGN KEY ("modifier_preset_option_id") REFERENCES "modifier_preset_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
