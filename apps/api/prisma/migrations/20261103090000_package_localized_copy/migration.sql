-- Localized public Package copy (Arabic + English).
-- Existing names are preserved as Arabic and copied to English so the migration is
-- deploy-safe; the Platform team can replace the temporary English value after deploy.
-- Existing descriptions are preserved as Arabic. English descriptions start empty.

ALTER TABLE "packages" RENAME COLUMN "name" TO "name_ar";
ALTER TABLE "packages" RENAME COLUMN "name_normalized" TO "name_ar_normalized";
ALTER INDEX "packages_name_normalized_key" RENAME TO "packages_name_ar_normalized_key";

ALTER TABLE "packages" RENAME COLUMN "description" TO "description_ar";

ALTER TABLE "packages"
  ADD COLUMN "name_en" TEXT,
  ADD COLUMN "name_en_normalized" TEXT,
  ADD COLUMN "description_en" TEXT;

UPDATE "packages"
SET
  "name_en" = "name_ar",
  "name_en_normalized" = "name_ar_normalized";

ALTER TABLE "packages"
  ALTER COLUMN "name_en" SET NOT NULL,
  ALTER COLUMN "name_en_normalized" SET NOT NULL;

CREATE UNIQUE INDEX "packages_name_en_normalized_key"
  ON "packages"("name_en_normalized");
