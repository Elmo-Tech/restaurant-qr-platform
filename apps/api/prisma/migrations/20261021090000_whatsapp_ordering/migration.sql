-- WhatsApp ordering switch (DEC-042, slice 7). Purely ADDITIVE: one boolean, off by default, so
-- nothing changes for any existing Restaurant. When on (and a WhatsApp number is set), the
-- Guest menu offers "order via WhatsApp": the Backend prices the cart and builds the message;
-- no Order row is created.
--
-- Rollback (before any use): ALTER TABLE "restaurants" DROP COLUMN "whatsapp_ordering_enabled";

ALTER TABLE "restaurants" ADD COLUMN "whatsapp_ordering_enabled" BOOLEAN NOT NULL DEFAULT false;
