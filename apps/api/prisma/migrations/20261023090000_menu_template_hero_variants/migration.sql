-- Guest menu templates with their own header design (DEC-044, slice 7b). Purely ADDITIVE: three new
-- values on the existing enum. Existing rows keep their value, so no Restaurant's menu changes.
--
-- Rollback note: PostgreSQL cannot drop an enum value. To undo, first move any Restaurant using
-- one of the new values back to CLASSIC (UPDATE "restaurants" SET "menu_template" = 'CLASSIC'
-- WHERE "menu_template" IN ('FLOATING', 'CENTERED', 'COMPACT')); the unused values then do no harm.

ALTER TYPE "menu_template" ADD VALUE IF NOT EXISTS 'FLOATING';
ALTER TYPE "menu_template" ADD VALUE IF NOT EXISTS 'CENTERED';
ALTER TYPE "menu_template" ADD VALUE IF NOT EXISTS 'COMPACT';
