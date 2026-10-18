-- Feature entitlements foundation (DEC-043). Purely ADDITIVE: one enum and one table of per-Restaurant
-- overrides. A Restaurant with no rows has EVERY feature (the default lives in one place in the
-- Backend), so nothing changes for any existing Restaurant. Later the platform control dashboard
-- (and packages) only write rows here.
--
-- Rollback (before any use):
--   DROP TABLE "restaurant_features";
--   DROP TYPE "feature_key";

CREATE TYPE "feature_key" AS ENUM (
    'WHATSAPP_ORDERING',
    'ORDER_TRACKING',
    'SMART_SUGGESTIONS',
    'MENU_TEMPLATES',
    'DASHBOARD_ORDERING',
    'TABLE_ORDERING'
);

CREATE TABLE "restaurant_features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "feature" "feature_key" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_features_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_features_restaurant_id_feature_key"
    ON "restaurant_features"("restaurant_id", "feature");

-- Configuration rows, not history: they follow their Restaurant.
ALTER TABLE "restaurant_features" ADD CONSTRAINT "restaurant_features_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
