-- Product Variants V1 (DEC-041): which sizes the Product discount applies to.
-- Purely ADDITIVE: the column defaults to true (the discount applies to every
-- size, the behaviour for all existing and new Variants), so nothing changes
-- unless Staff exclude a size. It only matters while the Product has an active
-- discount (DEC-036).
--
-- Rollback (before any size is excluded): DROP the column.

ALTER TABLE "product_variants"
  ADD COLUMN "discount_applies" BOOLEAN NOT NULL DEFAULT true;
