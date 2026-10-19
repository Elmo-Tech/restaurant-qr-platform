-- Upgrade and renewal requests from "My subscription" (DEC-050). Purely ADDITIVE: two enums and one
-- table. At most one OPEN request (NEW or CONTACTED) per restaurant, enforced by a partial unique index.
--
-- Rollback: DROP TABLE "subscription_requests"; DROP TYPE "subscription_request_status";
--           DROP TYPE "subscription_request_kind";

CREATE TYPE "subscription_request_kind" AS ENUM ('UPGRADE', 'RENEWAL');
CREATE TYPE "subscription_request_status" AS ENUM ('NEW', 'CONTACTED', 'DONE', 'DISMISSED');

CREATE TABLE "subscription_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "kind" "subscription_request_kind" NOT NULL,
    "package_id" UUID,
    "package_name" TEXT,
    "message" TEXT,
    "requested_by_user_id" UUID,
    "requested_by_email" TEXT NOT NULL,
    "status" "subscription_request_status" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "handled_by_email" TEXT,
    "handled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_requests_upgrade_needs_package" CHECK ("kind" <> 'UPGRADE' OR "package_name" IS NOT NULL)
);

CREATE INDEX "subscription_requests_restaurant_id_created_at_idx" ON "subscription_requests"("restaurant_id", "created_at");
CREATE INDEX "subscription_requests_status_created_at_idx" ON "subscription_requests"("status", "created_at");

-- one open request per restaurant
CREATE UNIQUE INDEX "subscription_requests_one_open_per_restaurant"
    ON "subscription_requests"("restaurant_id") WHERE "status" IN ('NEW', 'CONTACTED');

ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_requested_by_user_id_fkey"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
