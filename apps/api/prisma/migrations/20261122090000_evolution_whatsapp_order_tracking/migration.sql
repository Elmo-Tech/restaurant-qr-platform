-- Additive, opt-in WhatsApp receipt tracking. Do not apply to shared/local/prod DB without
-- backup, migration review and explicit environment approval.
-- Recovery note (2026-11-05): the first attempt failed on a wrong enum type in the
-- second CREATE TABLE, after the first CREATE TABLE could already have committed.
-- IF NOT EXISTS allows *that exact* partially applied attempt to be retried
-- after `prisma migrate resolve --rolled-back` confirms the failed ledger entry.
-- Inspect existing tables before recovery; these guards are not schema validation.
CREATE TABLE IF NOT EXISTS "whatsapp_connections" (
  "restaurant_id" UUID PRIMARY KEY REFERENCES "restaurants"("id") ON DELETE RESTRICT,
  "instance_name" VARCHAR(70) NOT NULL UNIQUE,
  "webhook_secret_hash" CHAR(64) NOT NULL UNIQUE,
  "linked_number" VARCHAR(24),
  "state" VARCHAR(24) NOT NULL DEFAULT 'DISCONNECTED',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "whatsapp_order_receipts" (
  "id" UUID PRIMARY KEY,
  "restaurant_id" UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE RESTRICT,
  "branch_id" UUID NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "reference" VARCHAR(180) NOT NULL UNIQUE,
  "provider_message_id" VARCHAR(160) NOT NULL,
  "total_amount" DECIMAL(14,2) NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "order_type" "order_type" NOT NULL,
  "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_order_receipts_restaurant_id_provider_message_id_key" UNIQUE ("restaurant_id", "provider_message_id")
);
CREATE INDEX IF NOT EXISTS "whatsapp_order_receipts_restaurant_id_received_at_idx" ON "whatsapp_order_receipts" ("restaurant_id", "received_at");
CREATE INDEX IF NOT EXISTS "whatsapp_order_receipts_restaurant_id_branch_id_received_at_idx" ON "whatsapp_order_receipts" ("restaurant_id", "branch_id", "received_at");

-- Data API roles have no access; only the guarded NestJS/Postgres backend may query.
ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_order_receipts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "whatsapp_connections", "whatsapp_order_receipts" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "whatsapp_connections", "whatsapp_order_receipts" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "whatsapp_connections", "whatsapp_order_receipts" FROM authenticated;
  END IF;
END $$;
