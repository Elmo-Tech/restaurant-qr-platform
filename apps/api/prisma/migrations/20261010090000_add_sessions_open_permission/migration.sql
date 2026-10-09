-- Table Sessions design v3, decision D3 / P8: the new `sessions.open` permission
-- (manually open a Table Session).
--
-- Roles are stored per Restaurant, and an unknown/absent key never grants
-- anything, so every existing role is DENIED `sessions.open` by default. This
-- data migration grants it ONLY to a Restaurant's STARTER Roles that already
-- hold BOTH `sessions.close` and `sessions.settle`:
--   - OWNER (always evaluated as holding every key; stored for consistency),
--   - MANAGER and CASHIER, unless an owner has deliberately removed either key.
-- It never touches a CUSTOM Role, WAITER or KITCHEN, matches by `kind` (never by
-- name, so renamed starter roles are still matched), and is idempotent.
--
-- Rollback: remove the key from the stored arrays (the registry entry can stay;
-- a stored key that no code reads grants nothing).

UPDATE "restaurant_roles"
SET "permissions" = array_append("permissions", 'sessions.open'),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "kind" IN ('OWNER', 'MANAGER', 'CASHIER')
  AND 'sessions.close' = ANY("permissions")
  AND 'sessions.settle' = ANY("permissions")
  AND NOT ('sessions.open' = ANY("permissions"));
