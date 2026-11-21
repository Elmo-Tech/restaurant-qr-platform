-- DEC-074: Add-ons for the whole Product or for one size, from separate Product / Size presets.
-- ADDITIVE: every existing Preset becomes a PRODUCT Preset and every existing Group stays a
-- Product Group (variant_id NULL), so current menus and orders behave exactly as before.
--
-- Rollback (only while no Size Group / SIZE Preset exists):
--   DROP INDEX "modifier_groups_product_preset_key";
--   DROP INDEX "modifier_groups_product_id_variant_id_source_preset_id_key";
--   CREATE UNIQUE INDEX "modifier_groups_product_id_source_preset_id_key"
--     ON "modifier_groups"("product_id", "source_preset_id");
--   ALTER TABLE "modifier_groups" DROP COLUMN "variant_id";
--   ALTER TABLE "modifier_presets" DROP COLUMN "scope";
--   DROP TYPE "modifier_preset_scope";

CREATE TYPE "modifier_preset_scope" AS ENUM ('PRODUCT', 'SIZE');

-- The default only backfills existing rows; new Presets always choose their scope explicitly.
ALTER TABLE "modifier_presets" ADD COLUMN "scope" "modifier_preset_scope" NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE "modifier_presets" ALTER COLUMN "scope" DROP DEFAULT;

ALTER TABLE "modifier_groups" ADD COLUMN "variant_id" UUID;
CREATE INDEX "modifier_groups_variant_id_idx" ON "modifier_groups"("variant_id");
ALTER TABLE "modifier_groups"
    ADD CONSTRAINT "modifier_groups_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One Preset at most once per Product size ...
DROP INDEX "modifier_groups_product_id_source_preset_id_key";
CREATE UNIQUE INDEX "modifier_groups_product_id_variant_id_source_preset_id_key"
    ON "modifier_groups"("product_id", "variant_id", "source_preset_id");
-- ... and at most once on the whole Product (NULL variant_id values are distinct in the index above,
-- which Prisma cannot express as a partial index).
CREATE UNIQUE INDEX "modifier_groups_product_preset_key"
    ON "modifier_groups"("product_id", "source_preset_id")
    WHERE "variant_id" IS NULL;
