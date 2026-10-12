-- Restaurant QR appearance: module color, background color, a centered logo and
-- the restaurant name. Restaurant-wide, applied to the Restaurant QR and the
-- Table QR panels. Purely ADDITIVE: the defaults reproduce today's plain
-- black-on-white QR with the restaurant name, so nothing changes until staff
-- opt in.
--
-- Rollback (before anyone customizes): DROP the four columns.

ALTER TABLE "restaurants"
  ADD COLUMN "qr_foreground_color" CHAR(7) NOT NULL DEFAULT '#000000',
  ADD COLUMN "qr_background_color" CHAR(7) NOT NULL DEFAULT '#FFFFFF',
  ADD COLUMN "qr_show_logo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "qr_show_name" BOOLEAN NOT NULL DEFAULT true;

-- Defense in depth (the application validates first): well-formed colors only.
ALTER TABLE "restaurants"
  ADD CONSTRAINT "restaurants_qr_foreground_color_format"
  CHECK ("qr_foreground_color" ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT "restaurants_qr_background_color_format"
  CHECK ("qr_background_color" ~ '^#[0-9A-Fa-f]{6}$');
