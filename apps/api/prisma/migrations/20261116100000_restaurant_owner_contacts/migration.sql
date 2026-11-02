-- Additive, private Platform-only owner/customer contact. Existing Restaurants
-- have no record until explicitly entered by a Platform Administrator.
CREATE TABLE "restaurant_owner_contacts" (
  "restaurant_id" UUID NOT NULL,
  "full_name" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "facebook_url" VARCHAR(300),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_owner_contacts_pkey" PRIMARY KEY ("restaurant_id"),
  CONSTRAINT "restaurant_owner_contacts_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "restaurant_owner_contacts_full_name_idx"
  ON "restaurant_owner_contacts"("full_name");
CREATE INDEX "restaurant_owner_contacts_phone_idx"
  ON "restaurant_owner_contacts"("phone");

-- No Guest/Staff/Supabase Data API access; records are returned only through
-- PlatformAuthGuard-protected NestJS endpoints.
ALTER TABLE "restaurant_owner_contacts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "restaurant_owner_contacts" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "restaurant_owner_contacts" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "restaurant_owner_contacts" FROM authenticated;
  END IF;
END $$;
