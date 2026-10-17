-- Restaurant hotline / short number (DEC-042), for example 16512. Purely ADDITIVE:
-- one nullable column. Rollback: ALTER TABLE "restaurants" DROP COLUMN "hotline_number".

ALTER TABLE "restaurants" ADD COLUMN "hotline_number" TEXT;
