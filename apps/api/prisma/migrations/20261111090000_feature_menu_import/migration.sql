-- Menu Import becomes a platform feature (DEC-057). ADDITIVE: one enum value, no backfill.
-- No existing package gets it and a restaurant with no package does not have it (it is an opt-in feature),
-- so nothing changes for any restaurant until the platform team switches it on.
--
-- Rollback: a value cannot be dropped from a PostgreSQL enum. Delete the rows that use it
-- (DELETE FROM package_features WHERE feature = 'MENU_IMPORT'; DELETE FROM restaurant_features WHERE feature = 'MENU_IMPORT';)
-- and stop using it in the application; the unused value is harmless.

ALTER TYPE "feature_key" ADD VALUE IF NOT EXISTS 'MENU_IMPORT';
