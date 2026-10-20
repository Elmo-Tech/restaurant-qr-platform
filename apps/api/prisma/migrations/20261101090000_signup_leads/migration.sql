-- Subscription requests from the public landing page (DEC-053). ADDITIVE: one enum and one table.
-- A visitor who is not a restaurant yet asks to subscribe to a package, or for a free trial; the platform
-- team follows up by hand (create the restaurant, give the subscription). Reuses the request statuses.
--
-- Rollback: DROP TABLE "signup_leads"; DROP TYPE "signup_lead_kind";

CREATE TYPE "signup_lead_kind" AS ENUM ('SUBSCRIBE', 'TRIAL');

CREATE TABLE "signup_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "signup_lead_kind" NOT NULL,
    "package_id" UUID,
    "package_name" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "restaurant_name" TEXT,
    "message" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "status" "subscription_request_status" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "handled_by_email" TEXT,
    "handled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "signup_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "signup_leads_status_created_at_idx" ON "signup_leads"("status", "created_at");
CREATE INDEX "signup_leads_email_created_at_idx" ON "signup_leads"("email", "created_at");

ALTER TABLE "signup_leads" ADD CONSTRAINT "signup_leads_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
