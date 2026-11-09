-- Existing contracts remain issued until a platform administrator reopens one.
ALTER TABLE "contracts"
  ADD COLUMN "is_draft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "document_text" TEXT,
  ADD COLUMN "document_locale" VARCHAR(2),
  ADD COLUMN "issued_assets" JSONB,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "contract_signing_assets" (
  "id" TEXT PRIMARY KEY,
  "seal" BYTEA,
  "seal_mime" TEXT,
  "signature" BYTEA,
  "signature_mime" TEXT
);
ALTER TABLE "contract_signing_assets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "contract_signing_assets" FROM PUBLIC;
