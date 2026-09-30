-- FT-11: backfill exactly one OrderStatusEvent per pre-existing Order, for
-- every Order created before this migration (and therefore never write a
-- real transition event through the application code path). The only
-- transition timestamp that can be reconstructed truthfully for these rows
-- is "the Order was created, i.e. became PENDING, at orders.created_at" --
-- every Order starts PENDING (ORDER_LIFECYCLE_SPEC.md #17), so this holds
-- for every existing Order regardless of its CURRENT status. Any later
-- transition (when it was actually ACCEPTED, became READY, ...) is
-- genuinely unknown for these rows and is deliberately left absent rather
-- than invented (FT-11 Section 3).
--
-- Idempotent: guarded by NOT EXISTS, so re-running this migration (or
-- applying it to a database where some Orders already have real events,
-- e.g. a fresh Order created between the two migrations in this batch)
-- never creates a duplicate synthetic event for the same Order.
INSERT INTO "order_status_events" ("id", "restaurant_id", "branch_id", "order_id", "previous_status", "new_status", "transitioned_at")
SELECT gen_random_uuid(), "restaurant_id", "branch_id", "id", NULL, 'PENDING', "created_at"
FROM "orders" o
WHERE NOT EXISTS (
  SELECT 1 FROM "order_status_events" e WHERE e."order_id" = o."id"
);
