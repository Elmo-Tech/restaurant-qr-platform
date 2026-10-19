-- Guest menu templates per package (DEC-051). ADDITIVE: one boolean on packages and one link table.
-- A package that includes the MENU_TEMPLATES feature allows either every template (all_templates,
-- including ones added later) or the listed ones; Classic is always allowed. Packages that include the
-- feature today keep their behavior (every template), so the flag is switched on for them.
--
-- Rollback: DROP TABLE "package_templates"; ALTER TABLE "packages" DROP COLUMN "all_templates";

ALTER TABLE "packages" ADD COLUMN "all_templates" BOOLEAN NOT NULL DEFAULT false;

UPDATE "packages" SET "all_templates" = true
WHERE "id" IN (SELECT "package_id" FROM "package_features" WHERE "feature" = 'MENU_TEMPLATES');

CREATE TABLE "package_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "package_id" UUID NOT NULL,
    "template" "menu_template" NOT NULL,

    CONSTRAINT "package_templates_pkey" PRIMARY KEY ("id"),
    -- Classic is always allowed, so it is never stored
    CONSTRAINT "package_templates_not_classic" CHECK ("template" <> 'CLASSIC')
);

CREATE UNIQUE INDEX "package_templates_package_id_template_key" ON "package_templates"("package_id", "template");

ALTER TABLE "package_templates" ADD CONSTRAINT "package_templates_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
