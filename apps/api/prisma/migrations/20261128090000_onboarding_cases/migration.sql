-- Owner onboarding wizard, milestones A1 + A2 (PROPOSED; docs/02-technical/ONBOARDING_API_AND_PERSISTENCE.md).
-- ADDITIVE ONLY: two enums and one table. No existing table, column, index or row is changed.
-- A case is a resumable Platform-team draft of a future Restaurant + owner + attribution + onboarding mode.
-- `details` / `mode_config` are written only through the API's allow-list sanitizer and never hold a password.
--
-- Rollback (nothing else references this table):
--   DROP TABLE "onboarding_cases"; DROP TYPE "onboarding_mode"; DROP TYPE "onboarding_case_status";

CREATE TYPE "onboarding_case_status" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'PROVISIONING', 'MENU_SETUP', 'READY', 'DELIVERED', 'FAILED', 'CANCELLED');

CREATE TYPE "onboarding_mode" AS ENUM ('REAL', 'TRIAL', 'DEMO');

CREATE TABLE "onboarding_cases" (
    "id" UUID NOT NULL,
    "status" "onboarding_case_status" NOT NULL DEFAULT 'DRAFT',
    "mode" "onboarding_mode",
    "revision" INTEGER NOT NULL DEFAULT 1,
    "details" JSONB NOT NULL DEFAULT '{}',
    "mode_config" JSONB NOT NULL DEFAULT '{}',
    "completed_steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restaurant_name" VARCHAR(100),
    "owner_email" VARCHAR(254),
    "lead_id" UUID,
    "package_id" UUID,
    "restaurant_id" UUID,
    "demo_id" UUID,
    "provisioning_key" UUID,
    "last_error_code" VARCHAR(80),
    "created_by_admin_id" UUID,
    "updated_by_admin_id" UUID,
    "assigned_admin_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "cancelled_at" TIMESTAMPTZ,

    CONSTRAINT "onboarding_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "onboarding_cases_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "onboarding_cases_details_object_check" CHECK (jsonb_typeof("details") = 'object'),
    CONSTRAINT "onboarding_cases_mode_config_object_check" CHECK (jsonb_typeof("mode_config") = 'object'),
    -- The searchable owner e-mail is always the lower-cased form (so a plain index serves case-insensitive lookups).
    CONSTRAINT "onboarding_cases_owner_email_lower_check" CHECK ("owner_email" IS NULL OR "owner_email" = lower("owner_email")),
    -- A cancelled case always says when it was cancelled.
    CONSTRAINT "onboarding_cases_cancelled_at_check" CHECK ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL)
);

CREATE UNIQUE INDEX "onboarding_cases_provisioning_key_key" ON "onboarding_cases"("provisioning_key");
CREATE INDEX "onboarding_cases_status_updated_at_idx" ON "onboarding_cases"("status", "updated_at");
CREATE INDEX "onboarding_cases_owner_email_idx" ON "onboarding_cases"("owner_email");
CREATE INDEX "onboarding_cases_lead_id_idx" ON "onboarding_cases"("lead_id");

-- At most ONE open case per lead: two operators starting from the same lead get the same case.
-- CANCELLED and DELIVERED are terminal; FAILED stays open because it is recoverable (A3 retries).
CREATE UNIQUE INDEX "onboarding_cases_open_lead_key" ON "onboarding_cases"("lead_id")
    WHERE "lead_id" IS NOT NULL AND "status" NOT IN ('CANCELLED', 'DELIVERED');

-- Every reference is SET NULL: deleting a lead, package, admin or (demo) restaurant never deletes a case, and the
-- demo purge (which follows only non-SET-NULL foreign keys) never reaches this table.
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "signup_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A global Platform table: never exposed through Staff / Guest APIs; Platform session + Origin checks live in NestJS.
ALTER TABLE "onboarding_cases" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "onboarding_cases" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "onboarding_cases" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "onboarding_cases" FROM authenticated;
  END IF;
END $$;
