-- Private ElmoTech restaurant acquisition attribution (additive; no backfill).
-- No guest, staff, menu, QR, order, billing or setup records are modified.
CREATE TYPE "restaurant_acquisition_source_type" AS ENUM (
  'CUSTOMER_REFERRAL', 'EMPLOYEE_REFERRAL', 'SALES', 'SOCIAL_MEDIA',
  'PAID_AD', 'WEBSITE', 'DIRECT', 'OTHER', 'UNKNOWN'
);

CREATE TABLE "restaurant_acquisitions" (
  "restaurant_id" UUID NOT NULL,
  "source_type" "restaurant_acquisition_source_type" NOT NULL,
  "referring_restaurant_id" UUID,
  "referring_restaurant_name" VARCHAR(200),
  "source_name" VARCHAR(200),
  "source_platform" VARCHAR(40),
  "source_detail" VARCHAR(300),
  "campaign" VARCHAR(160),
  "recorded_by_admin_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_acquisitions_pkey" PRIMARY KEY ("restaurant_id"),
  CONSTRAINT "restaurant_acquisitions_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "restaurant_acquisitions_referring_restaurant_id_fkey"
    FOREIGN KEY ("referring_restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "restaurant_acquisitions_source_type_source_platform_idx"
  ON "restaurant_acquisitions"("source_type", "source_platform");
CREATE INDEX "restaurant_acquisitions_referring_restaurant_id_idx"
  ON "restaurant_acquisitions"("referring_restaurant_id");

-- Only the Platform Backend is supported. Deny Supabase client/Data API roles.
ALTER TABLE "restaurant_acquisitions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "restaurant_acquisitions" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "restaurant_acquisitions" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "restaurant_acquisitions" FROM authenticated;
  END IF;
END $$;
