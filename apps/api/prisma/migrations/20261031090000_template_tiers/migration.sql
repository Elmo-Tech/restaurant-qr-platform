-- Standard and premium Guest menu templates (DEC-052). ADDITIVE: one boolean on packages.
-- "all_standard_templates" = every standard template, also ones added later, without any premium one.
-- The tier of each template lives in code (entitlements/templates.ts); existing packages are unchanged.
--
-- Rollback: ALTER TABLE "packages" DROP COLUMN "all_standard_templates";

ALTER TABLE "packages" ADD COLUMN "all_standard_templates" BOOLEAN NOT NULL DEFAULT false;
