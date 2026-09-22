-- CreateEnum
CREATE TYPE "modifier_group_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "modifier_option_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "status" "modifier_group_status" NOT NULL,
    "minimum_selections" INTEGER NOT NULL,
    "maximum_selections" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_group_translations" (
    "id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "helper_text" TEXT,

    CONSTRAINT "modifier_group_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_options" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "status" "modifier_option_status" NOT NULL,
    "price_adjustment" DECIMAL(14,2) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "modifier_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_option_translations" (
    "id" UUID NOT NULL,
    "modifier_option_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "modifier_option_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_modifiers" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "modifier_option_id" UUID NOT NULL,
    "modifier_group_name_snapshot" TEXT NOT NULL,
    "modifier_option_name_snapshot" TEXT NOT NULL,
    "price_adjustment_snapshot" DECIMAL(14,2) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modifier_groups_restaurant_id_idx" ON "modifier_groups"("restaurant_id");

-- CreateIndex
CREATE INDEX "modifier_groups_product_id_idx" ON "modifier_groups"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_group_translations_modifier_group_id_locale_key" ON "modifier_group_translations"("modifier_group_id", "locale");

-- CreateIndex
CREATE INDEX "modifier_options_restaurant_id_idx" ON "modifier_options"("restaurant_id");

-- CreateIndex
CREATE INDEX "modifier_options_modifier_group_id_idx" ON "modifier_options"("modifier_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_option_translations_modifier_option_id_locale_key" ON "modifier_option_translations"("modifier_option_id", "locale");

-- CreateIndex
CREATE INDEX "order_item_modifiers_order_item_id_idx" ON "order_item_modifiers"("order_item_id");

-- CreateIndex
CREATE INDEX "order_item_modifiers_modifier_group_id_idx" ON "order_item_modifiers"("modifier_group_id");

-- CreateIndex
CREATE INDEX "order_item_modifiers_modifier_option_id_idx" ON "order_item_modifiers"("modifier_option_id");

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_group_translations" ADD CONSTRAINT "modifier_group_translations_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_option_translations" ADD CONSTRAINT "modifier_option_translations_modifier_option_id_fkey" FOREIGN KEY ("modifier_option_id") REFERENCES "modifier_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_modifier_option_id_fkey" FOREIGN KEY ("modifier_option_id") REFERENCES "modifier_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FT-6A (DATABASE_SPEC.md #74): basic numerical validity CHECK constraints,
-- defense-in-depth alongside application-level validation, matching the
-- existing orders_total_amount_non_negative precedent exactly.
ALTER TABLE "modifier_groups"
ADD CONSTRAINT "modifier_groups_minimum_selections_non_negative"
CHECK ("minimum_selections" >= 0);

ALTER TABLE "modifier_groups"
ADD CONSTRAINT "modifier_groups_maximum_selections_positive"
CHECK ("maximum_selections" > 0);

ALTER TABLE "modifier_groups"
ADD CONSTRAINT "modifier_groups_maximum_at_least_minimum"
CHECK ("maximum_selections" >= "minimum_selections");
