-- Smart suggestions / upselling (DEC-042, slice 8). Purely ADDITIVE:
--   * restaurants.suggestions_mode: OFF by default, so nothing changes for any existing Restaurant;
--   * product_suggestions: the manual rules ("with this product, suggest these"), one row per pair.
-- Automatic "bought together" suggestions need no table: the Backend aggregates the Restaurant's own
-- served orders when asked.
--
-- Rollback (before any use):
--   DROP TABLE "product_suggestions";
--   ALTER TABLE "restaurants" DROP COLUMN "suggestions_mode";
--   DROP TYPE "suggestions_mode";

CREATE TYPE "suggestions_mode" AS ENUM ('OFF', 'MANUAL', 'AUTO', 'BOTH');

ALTER TABLE "restaurants" ADD COLUMN "suggestions_mode" "suggestions_mode" NOT NULL DEFAULT 'OFF';

CREATE TABLE "product_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "suggested_product_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_suggestions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_suggestions_not_self" CHECK ("product_id" <> "suggested_product_id"),
    CONSTRAINT "product_suggestions_position_non_negative" CHECK ("position" >= 0)
);

CREATE UNIQUE INDEX "product_suggestions_product_id_suggested_product_id_key"
    ON "product_suggestions"("product_id", "suggested_product_id");
CREATE INDEX "product_suggestions_restaurant_id_product_id_idx"
    ON "product_suggestions"("restaurant_id", "product_id");

-- Configuration rows, not history: they follow their products and their Restaurant.
ALTER TABLE "product_suggestions" ADD CONSTRAINT "product_suggestions_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_suggestions" ADD CONSTRAINT "product_suggestions_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_suggestions" ADD CONSTRAINT "product_suggestions_suggested_product_id_fkey"
    FOREIGN KEY ("suggested_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
