-- DEC-066: readable Guest Menu links (/q/{restaurant-name}).
-- SAFE / ADDITIVE: one new table, no existing table or row is changed. Restaurants get their
-- slug from the repeatable backfill (scripts/backfill-restaurant-slugs.ts, also run by the API
-- at start-up); until then their menu link keeps working through the opaque QR public code.

CREATE TABLE "restaurant_slugs" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "is_current" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_slugs_pkey" PRIMARY KEY ("id")
);

-- Globally unique across current AND former slugs: a renamed link can never be taken by another Restaurant.
CREATE UNIQUE INDEX "restaurant_slugs_slug_key" ON "restaurant_slugs"("slug");
CREATE INDEX "restaurant_slugs_restaurant_id_idx" ON "restaurant_slugs"("restaurant_id");

-- Exactly one current slug per Restaurant (Prisma cannot express a partial unique index).
CREATE UNIQUE INDEX "restaurant_slugs_one_current_per_restaurant"
  ON "restaurant_slugs"("restaurant_id") WHERE "is_current";

-- URL-safe by construction: lowercase Latin letters, digits and single hyphens, 3 to 40 characters.
-- (40 < 43, the length of every generated QR public code, so a slug can never equal one.)
ALTER TABLE "restaurant_slugs"
  ADD CONSTRAINT "restaurant_slugs_format_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") BETWEEN 3 AND 40);

ALTER TABLE "restaurant_slugs"
  ADD CONSTRAINT "restaurant_slugs_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
