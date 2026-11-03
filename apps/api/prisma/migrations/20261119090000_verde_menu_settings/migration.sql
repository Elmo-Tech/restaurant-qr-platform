-- DEC-062: draft / published appearance settings for the exclusive VERDE renderer.
-- SAFE / ADDITIVE: new columns with defaults only; existing reservations, menus, QRs and orders are untouched.
ALTER TABLE "restaurant_exclusive_designs"
  ADD COLUMN "draft_settings" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "published_settings" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "settings_version" INTEGER NOT NULL DEFAULT 1;
