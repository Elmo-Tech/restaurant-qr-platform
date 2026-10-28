-- Menu Import extraction engine and the model API keys, managed from the Platform console (DEC-059).
-- ADDITIVE: two enums, a singleton settings row and a keys table. Nothing changes until the Platform team
-- switches the engine: the seeded engine is N8N, which is exactly how Menu Import works today.
--
-- The key values are stored ENCRYPTED by the application (AES-256-GCM, key in the server environment); this
-- table never holds a usable secret. `fingerprint` (SHA-256 of the key) only refuses the same key twice.
--
-- Rollback (before the engine is switched): DROP TABLE "platform_ai_keys"; DROP TABLE "platform_ai_settings";
-- DROP TYPE "ai_key_status"; DROP TYPE "ai_extraction_engine";

CREATE TYPE "ai_extraction_engine" AS ENUM ('N8N', 'DIRECT');
CREATE TYPE "ai_key_status" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "platform_ai_settings" (
  "id" TEXT NOT NULL DEFAULT 'ai',
  "engine" "ai_extraction_engine" NOT NULL DEFAULT 'N8N',
  "model" TEXT NOT NULL,
  "fallback_model" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_ai_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_ai_settings_singleton" CHECK ("id" = 'ai'),
  CONSTRAINT "platform_ai_settings_model_name" CHECK ("model" ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$'),
  CONSTRAINT "platform_ai_settings_fallback_model_name" CHECK ("fallback_model" IS NULL OR "fallback_model" ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$')
);

INSERT INTO "platform_ai_settings" ("id", "engine", "model")
VALUES ('ai', 'N8N', 'gemini-3.8-flash');

CREATE TABLE "platform_ai_keys" (
  "id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "secret_encrypted" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "last4" VARCHAR(4) NOT NULL,
  "status" "ai_key_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_ai_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_ai_keys_label_length" CHECK (char_length("label") BETWEEN 1 AND 60)
);

CREATE UNIQUE INDEX "platform_ai_keys_fingerprint_key" ON "platform_ai_keys"("fingerprint");
CREATE INDEX "platform_ai_keys_status_idx" ON "platform_ai_keys"("status");
