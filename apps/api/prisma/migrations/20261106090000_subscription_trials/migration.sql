-- First-class free trials (DEC-056). Trials reuse subscription coverage and Package entitlements,
-- but are not billed, have no billing period and do not create a contract.

CREATE TYPE "subscription_kind" AS ENUM ('PAID', 'TRIAL');

ALTER TABLE "subscriptions"
  ADD COLUMN "kind" "subscription_kind" NOT NULL DEFAULT 'PAID',
  ALTER COLUMN "period" DROP NOT NULL;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_kind_consistent" CHECK (
    ("kind" = 'PAID' AND "period" IS NOT NULL)
    OR
    (
      "kind" = 'TRIAL'
      AND "period" IS NULL
      AND "list_price" = 0
      AND "offer_label" IS NULL
      AND "offer_percent" IS NULL
      AND "offer_amount" = 0
      AND "discount_type" IS NULL
      AND "discount_value" IS NULL
      AND "discount_amount" = 0
      AND "final_price" = 0
    )
  );

CREATE TABLE "platform_trial_settings" (
  "id" TEXT NOT NULL DEFAULT 'trial',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "default_days" INTEGER NOT NULL DEFAULT 15,
  "default_package_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_trial_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_trial_settings_singleton" CHECK ("id" = 'trial'),
  CONSTRAINT "platform_trial_settings_days" CHECK ("default_days" BETWEEN 1 AND 365)
);

ALTER TABLE "platform_trial_settings" ADD CONSTRAINT "platform_trial_settings_default_package_id_fkey"
  FOREIGN KEY ("default_package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "platform_trial_settings" ("id", "enabled", "default_days")
VALUES ('trial', true, 15);
