-- FT-9: at most ONE Generic (Restaurant-wide) QR per Restaurant -- active or
-- inactive. The Staff "Restaurant QR" toggles its status instead of creating
-- a second row, and a concurrent double-create loses to this index rather
-- than producing two QRs. Prisma's schema syntax cannot express a partial
-- (WHERE-predicated) unique index, so this is committed custom SQL, exactly
-- like qr_codes_one_active_table_qr.
--
-- Safe on existing data: it only fails if a Restaurant already owns more
-- than one GENERIC QR row, which no code path could create before this
-- migration (there was no creation path at all).
CREATE UNIQUE INDEX "qr_codes_one_generic_qr_per_restaurant"
ON "qr_codes" ("restaurant_id")
WHERE "type" = 'GENERIC';
