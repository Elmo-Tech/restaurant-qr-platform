-- Restaurant setup checklist: safe, additive, opt-in state only.
-- Existing restaurants are NOT backfilled, so established customers
-- cannot suddenly receive a checklist from this migration.
-- Only new provisioning (after this migration) or explicit OWNER opt-in creates
-- restaurant_setups. No menu/order/QR records are modified.
--
-- Preconditions: isolated DB migration review, staging smoke tests and rollback
-- plan. DO NOT RUN this on any shared local or production DB during Draft PR.
CREATE TABLE "restaurant_setups" (
  "restaurant_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "languages_signature" TEXT,
  "ordering_signature" TEXT,
  "operations_signature" TEXT,
  "preview_confirmed_at" TIMESTAMPTZ,
  "branding_skipped_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "completed_by_user_id" UUID,
  "enrolled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_setups_pkey" PRIMARY KEY ("restaurant_id"),
  CONSTRAINT "restaurant_setups_restaurant_id_fkey" FOREIGN KEY ("restaurant_id")
    REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "restaurant_setups_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "restaurant_setup_visibility" (
  "restaurant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "hidden_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_setup_visibility_pkey" PRIMARY KEY ("restaurant_id", "user_id"),
  CONSTRAINT "restaurant_setup_visibility_restaurant_id_fkey" FOREIGN KEY ("restaurant_id")
    REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "restaurant_setup_visibility_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "restaurant_setup_visibility_user_id_idx" ON "restaurant_setup_visibility"("user_id");

-- The tables are not public APIs; the guarded NestJS Backend is the ONLY
-- supported access path. Supabase Data API roles have no direct table rights.
ALTER TABLE "restaurant_setups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_setup_visibility" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "restaurant_setups", "restaurant_setup_visibility"
  FROM PUBLIC, anon, authenticated;

-- Rollback BEFORE any setup data matters (manual, explicit approval only):
-- DROP TABLE IF EXISTS "restaurant_setup_visibility";
-- DROP TABLE IF EXISTS "restaurant_setups";
