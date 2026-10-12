-- Restaurant ordering options: two restaurant-wide switches that let staff stop
-- accepting Pickup orders and / or Delivery orders from the Restaurant QR.
-- Purely ADDITIVE: both columns default to true, so every existing restaurant
-- keeps behaving exactly as before. Dine-in (Table QR) is not affected.
--
-- Rollback (before anyone switches one off): DROP the two columns.

ALTER TABLE "restaurants"
  ADD COLUMN "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "delivery_enabled" BOOLEAN NOT NULL DEFAULT true;
