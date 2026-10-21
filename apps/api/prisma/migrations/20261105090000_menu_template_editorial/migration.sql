-- A second photo-free Guest menu design (DEC-044): a responsive editorial layout
-- with balanced category panels. Additive only; existing Restaurants keep their
-- current template. PostgreSQL enum values cannot be removed safely once used.

ALTER TYPE "menu_template" ADD VALUE IF NOT EXISTS 'EDITORIAL';
