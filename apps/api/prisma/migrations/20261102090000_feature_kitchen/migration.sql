-- The kitchen screen becomes a package feature (DEC-054). ADDITIVE: one enum value.
-- The value cannot be used in the same transaction that adds it, so the backfill is the next migration.
--
-- Rollback: a value cannot be dropped from a PostgreSQL enum. Delete the rows that use it
-- (DELETE FROM package_features WHERE feature = 'KITCHEN'; DELETE FROM restaurant_features WHERE feature = 'KITCHEN';)
-- and stop using it in the application; the unused value is harmless.

ALTER TYPE "feature_key" ADD VALUE IF NOT EXISTS 'KITCHEN';
