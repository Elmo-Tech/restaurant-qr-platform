-- Additive size-level Modifier overrides; old Products retain exactly the same behavior.
-- No backfill: absent rows mean "inherit Product/linked Preset defaults".
-- The API verifies that Variant and Group/Options belong to the same Tenant and Product.
-- Size settings are structural children; deleting a never-ordered Variant/Group/Option cascades
-- only its settings, never an OrderItemModifier snapshot.

CREATE TABLE "modifier_group_size_settings" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "modifier_group_size_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "modifier_group_size_settings_group_id_variant_id_key"
    ON "modifier_group_size_settings"("group_id", "variant_id");
CREATE INDEX "modifier_group_size_settings_restaurant_id_idx"
    ON "modifier_group_size_settings"("restaurant_id");
CREATE INDEX "modifier_group_size_settings_variant_id_idx"
    ON "modifier_group_size_settings"("variant_id");
ALTER TABLE "modifier_group_size_settings"
    ADD CONSTRAINT "modifier_group_size_settings_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "modifier_group_size_settings"
    ADD CONSTRAINT "modifier_group_size_settings_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "modifier_group_size_settings"
    ADD CONSTRAINT "modifier_group_size_settings_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "modifier_option_size_settings" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "price_adjustment" DECIMAL(14,2),
    CONSTRAINT "modifier_option_size_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "modifier_option_size_settings_price_non_negative"
       CHECK ("price_adjustment" IS NULL OR "price_adjustment" >= 0)
);
CREATE UNIQUE INDEX "modifier_option_size_settings_option_id_variant_id_key"
    ON "modifier_option_size_settings"("option_id", "variant_id");
CREATE INDEX "modifier_option_size_settings_restaurant_id_idx"
    ON "modifier_option_size_settings"("restaurant_id");
CREATE INDEX "modifier_option_size_settings_variant_id_idx"
    ON "modifier_option_size_settings"("variant_id");
ALTER TABLE "modifier_option_size_settings"
    ADD CONSTRAINT "modifier_option_size_settings_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "modifier_option_size_settings"
    ADD CONSTRAINT "modifier_option_size_settings_option_id_fkey"
    FOREIGN KEY ("option_id") REFERENCES "modifier_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "modifier_option_size_settings"
    ADD CONSTRAINT "modifier_option_size_settings_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
