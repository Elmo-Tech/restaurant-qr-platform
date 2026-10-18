-- Guest menu template (DEC-044, slice 7). Purely ADDITIVE: one enum and one column that defaults
-- to CLASSIC, so every existing Restaurant keeps exactly the menu it has today. The template only
-- changes how the Guest menu is laid out; no price, order or availability rule depends on it.
--
-- Rollback (before any use):
--   ALTER TABLE "restaurants" DROP COLUMN "menu_template";
--   DROP TYPE "menu_template";

CREATE TYPE "menu_template" AS ENUM ('CLASSIC', 'LIST', 'GALLERY', 'MENU');

ALTER TABLE "restaurants" ADD COLUMN "menu_template" "menu_template" NOT NULL DEFAULT 'CLASSIC';
