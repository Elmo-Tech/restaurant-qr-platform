-- Private tenant-exclusive menu design assignment (additive).
-- Each Restaurant can reserve one design. Existing Restaurant/menu rows are not changed.
CREATE TYPE "exclusive_design_status" AS ENUM ('RESERVED', 'ACTIVE_BASE', 'DISABLED');

CREATE TABLE "restaurant_exclusive_designs" (
  "restaurant_id" UUID NOT NULL,
  "base_template" "menu_template" NOT NULL,
  "status" "exclusive_design_status" NOT NULL DEFAULT 'RESERVED',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_exclusive_designs_pkey" PRIMARY KEY ("restaurant_id"),
  CONSTRAINT "restaurant_exclusive_designs_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "restaurant_exclusive_designs_status_idx"
  ON "restaurant_exclusive_designs"("status");

-- The guarded NestJS Backend exclusively owns this table.
ALTER TABLE "restaurant_exclusive_designs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "restaurant_exclusive_designs" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "restaurant_exclusive_designs" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "restaurant_exclusive_designs" FROM authenticated;
  END IF;
END $$;
