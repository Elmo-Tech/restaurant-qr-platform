-- Remove onboarding cases from the active list without deleting them (PO request 2026-11-23).
-- Additive and nullable: existing rows stay visible; nothing is backfilled or deleted.
ALTER TABLE "onboarding_cases"
  ADD COLUMN "archived_at" TIMESTAMPTZ,
  ADD COLUMN "archived_by_admin_id" UUID,
  -- Only a terminal case can be hidden: an open case (draft, review, provisioning, failed, ready) never is.
  ADD CONSTRAINT "onboarding_cases_archived_terminal_check"
    CHECK ("archived_at" IS NULL OR "status" IN ('CANCELLED', 'DELIVERED'));

ALTER TABLE "onboarding_cases"
  ADD CONSTRAINT "onboarding_cases_archived_by_admin_id_fkey"
  FOREIGN KEY ("archived_by_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "onboarding_cases_archived_at_updated_at_idx" ON "onboarding_cases"("archived_at", "updated_at");
