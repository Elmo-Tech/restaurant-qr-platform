ALTER TABLE "onboarding_cases"
  ADD COLUMN "restaurant_provisioned_at" TIMESTAMPTZ,
  ADD COLUMN "menu_draft" JSONB,
  ADD COLUMN "menu_published_at" TIMESTAMPTZ,
  ADD COLUMN "import_expires_at" TIMESTAMPTZ,
  ADD COLUMN "import_reviewed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "import_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "import_lease_until" TIMESTAMPTZ,
  ADD COLUMN "trial_subscription_id" UUID,
  ADD CONSTRAINT "onboarding_menu_draft_object" CHECK (jsonb_typeof("menu_draft") = 'object'),
  ADD CONSTRAINT "onboarding_import_attempts_bounds" CHECK ("import_attempts" BETWEEN 0 AND 3);

CREATE INDEX "onboarding_cases_import_expiry_idx" ON "onboarding_cases" ("import_expires_at")
  WHERE "menu_draft" IS NOT NULL AND "import_expires_at" IS NOT NULL;
