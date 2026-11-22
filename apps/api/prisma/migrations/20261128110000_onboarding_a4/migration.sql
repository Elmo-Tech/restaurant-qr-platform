-- A4: durable handoff and non-secret DEMO history; no change to DEMO access data.
ALTER TABLE "signup_leads" ADD COLUMN "status_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "onboarding_cases"
  ADD COLUMN "lead_status_version" INTEGER,
  ADD COLUMN "delivered_at" TIMESTAMPTZ,
  ADD COLUMN "demo_history" JSONB,
  ADD COLUMN "demo_removed_at" TIMESTAMPTZ,
  ADD CONSTRAINT "onboarding_cases_delivered_at_check" CHECK ("status" <> 'DELIVERED' OR "delivered_at" IS NOT NULL),
  ADD CONSTRAINT "onboarding_cases_demo_history_check" CHECK (
    "demo_history" IS NULL OR (
      jsonb_typeof("demo_history") = 'object'
      AND "mode" IS NOT DISTINCT FROM 'DEMO'::"onboarding_mode"
      AND "demo_history" ?& ARRAY['kind','label','packageName','createdAt','expiresAt']
      AND "demo_history" - ARRAY['kind','label','packageName','createdAt','expiresAt'] = '{}'::jsonb
    )
  );

CREATE INDEX "onboarding_cases_demo_id_idx" ON "onboarding_cases"("demo_id");

-- Older cases have no captured version. Backfill only never-handled leads, not a timestamp guess.
UPDATE "onboarding_cases" c
SET "lead_status_version" = l."status_version"
FROM "signup_leads" l
WHERE c."lead_id" = l."id" AND l."status" = 'NEW' AND l."handled_at" IS NULL;
