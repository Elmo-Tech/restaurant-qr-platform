-- Table ordering switch (DEC-038): lets a restaurant make its Table (dine-in) QR
-- view-only. Purely ADDITIVE: the column defaults to true, so every existing
-- restaurant keeps behaving exactly as before. Independent of pickup_enabled /
-- delivery_enabled (the Online channel) and of Table Session state.
--
-- Rollback (before anyone switches it off): DROP the column.

ALTER TABLE "restaurants"
  ADD COLUMN "table_ordering_enabled" BOOLEAN NOT NULL DEFAULT true;
