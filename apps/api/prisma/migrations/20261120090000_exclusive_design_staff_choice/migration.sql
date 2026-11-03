-- DEC-062: the Restaurant chooses whether guests see its exclusive design or one of the stock templates.
-- SAFE / ADDITIVE: defaults to TRUE so every existing active exclusive design keeps being shown.
ALTER TABLE "restaurant_exclusive_designs"
  ADD COLUMN "use_exclusive" BOOLEAN NOT NULL DEFAULT true;
