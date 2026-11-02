-- Temporary demo restaurants (DEC-060). ADDITIVE: three columns on restaurants (all demo-only, existing rows stay
-- exactly as they are) and one small table for the secret entry links.
--
-- A demo is a real Restaurant row flagged `is_demo` with a hard expiry. Nothing here changes how a normal Restaurant
-- behaves. The purge that removes an expired demo lives in the application and refuses anything that is not a demo.
--
-- Rollback (before any demo exists): DROP TABLE "demo_access_links"; then drop the constraint, the index and the three
-- columns below.

ALTER TABLE "restaurants"
  ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "demo_expires_at" TIMESTAMPTZ,
  ADD COLUMN "demo_label" VARCHAR(120);

-- A demo always has an expiry; a normal restaurant never has demo fields.
ALTER TABLE "restaurants"
  ADD CONSTRAINT "restaurants_demo_fields_consistent" CHECK (
    ("is_demo" AND "demo_expires_at" IS NOT NULL)
    OR (NOT "is_demo" AND "demo_expires_at" IS NULL AND "demo_label" IS NULL)
  );

-- The expiry job only ever looks at demos.
CREATE INDEX "restaurants_demo_expires_at_idx"
  ON "restaurants"("demo_expires_at") WHERE "is_demo";

CREATE TABLE "demo_access_links" (
  "id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMPTZ,
  "use_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "demo_access_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "demo_access_links_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "demo_access_links_token_hash_key" ON "demo_access_links"("token_hash");
CREATE INDEX "demo_access_links_restaurant_id_idx" ON "demo_access_links"("restaurant_id");

-- No Guest/Staff/Supabase Data API access; links are only read and written through the NestJS API.
ALTER TABLE "demo_access_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "demo_access_links" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "demo_access_links" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "demo_access_links" FROM authenticated;
  END IF;
END $$;
