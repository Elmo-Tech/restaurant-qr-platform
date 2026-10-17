-- Restaurant contact details for the Guest Menu (DEC-042): one phone for the whole
-- Restaurant, a WhatsApp number and public links. Purely ADDITIVE: nullable columns.
--
-- Rollback (before any value is used): ALTER TABLE "restaurants" DROP COLUMN for each
-- of the eleven columns below.

ALTER TABLE "restaurants"
  ADD COLUMN "contact_phone" TEXT,
  ADD COLUMN "whatsapp_number" TEXT,
  ADD COLUMN "facebook_url" TEXT,
  ADD COLUMN "instagram_url" TEXT,
  ADD COLUMN "tiktok_url" TEXT,
  ADD COLUMN "telegram_url" TEXT,
  ADD COLUMN "youtube_url" TEXT,
  ADD COLUMN "x_url" TEXT,
  ADD COLUMN "snapchat_url" TEXT,
  ADD COLUMN "maps_url" TEXT,
  ADD COLUMN "website_url" TEXT;
