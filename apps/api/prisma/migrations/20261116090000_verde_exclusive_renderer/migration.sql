-- Adds support for a single vetted bespoke renderer assigned to exactly one Restaurant.
-- SAFE / ADDITIVE: keeps all existing reservations, Restaurant IDs, Menus, QRs and Orders.
-- Requires the earlier 20261115090000_exclusive_menu_design_reservations migration.
ALTER TYPE "exclusive_design_status" ADD VALUE IF NOT EXISTS 'ACTIVE_CUSTOM';
ALTER TABLE "restaurant_exclusive_designs"
  ADD COLUMN "renderer_key" VARCHAR(80);
-- A renderer key can never be claimed by a second Restaurant, even if the first is disabled.
-- Multiple NULLs are permitted for existing/base-only assignments.
CREATE UNIQUE INDEX "restaurant_exclusive_designs_renderer_key_key"
  ON "restaurant_exclusive_designs" ("renderer_key");
