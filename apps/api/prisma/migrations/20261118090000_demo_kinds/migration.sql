-- Demo kinds (DEC-061). ADDITIVE: one nullable column on restaurants. A demo is built from the template of its kind
-- (restaurant, cafe or sweets); demos made before this migration keep a null kind and are shown as restaurants.
-- No existing row changes.
--
-- Rollback (before any non-restaurant demo exists): drop the constraint, then the column.

ALTER TABLE "restaurants" ADD COLUMN "demo_kind" VARCHAR(20);

-- Only a demo has a kind, and only a known one.
ALTER TABLE "restaurants"
  ADD CONSTRAINT "restaurants_demo_kind_consistent" CHECK (
    "demo_kind" IS NULL OR ("is_demo" AND "demo_kind" IN ('restaurant', 'cafe', 'sweets'))
  );
