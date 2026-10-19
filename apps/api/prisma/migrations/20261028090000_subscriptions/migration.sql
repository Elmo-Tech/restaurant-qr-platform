-- Subscriptions, payments and contracts (DEC-049): manual billing.
--
-- * restaurants gets a billing country (EG -> EGP, anything else -> USD) and a mark for "suspended
--   because the subscription ended" (so only those are reactivated automatically).
-- * packages: the single display-only price (monthly / yearly + one currency) becomes a price per
--   billing currency and period, plus an optional offer. Existing prices are carried over when their
--   currency is EGP or USD; a price in any other currency is dropped (nothing bills from it yet).
-- * subscriptions (money snapshot, periods of one restaurant can never overlap), subscription_payments
--   (a ledger: rows are voided, never deleted) and contracts (running number + terms snapshot).
--
-- Rollback (before real data is entered; it loses subscriptions, payments and contracts):
--   DROP TABLE "contracts"; DROP TABLE "subscription_payments"; DROP TABLE "subscriptions";
--   DROP SEQUENCE "contract_number_seq";
--   DROP TYPE "discount_type"; DROP TYPE "payment_method"; DROP TYPE "subscription_status"; DROP TYPE "billing_period";
--   ALTER TABLE "packages" ADD COLUMN "monthly_price" DECIMAL(12,2), ADD COLUMN "yearly_price" DECIMAL(12,2),
--     ADD COLUMN "currency_code" CHAR(3);
--   UPDATE "packages" SET "monthly_price" = COALESCE("price_egp_monthly", "price_usd_monthly"),
--     "yearly_price" = COALESCE("price_egp_yearly", "price_usd_yearly"),
--     "currency_code" = CASE WHEN "price_egp_monthly" IS NOT NULL OR "price_egp_yearly" IS NOT NULL THEN 'EGP'
--                            WHEN "price_usd_monthly" IS NOT NULL OR "price_usd_yearly" IS NOT NULL THEN 'USD' END;
--   ALTER TABLE "packages" DROP COLUMN "price_egp_monthly", DROP COLUMN "price_egp_yearly",
--     DROP COLUMN "price_usd_monthly", DROP COLUMN "price_usd_yearly", DROP COLUMN "offer_percent",
--     DROP COLUMN "offer_label", DROP COLUMN "offer_ends_at";
--   ALTER TABLE "restaurants" DROP COLUMN "country_code", DROP COLUMN "subscription_suspended_at";

-- Needed by the "no overlapping subscription periods" exclusion constraint (a trusted extension).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------------------------
-- restaurants
ALTER TABLE "restaurants"
    ADD COLUMN "country_code" CHAR(2) NOT NULL DEFAULT 'EG',
    ADD COLUMN "subscription_suspended_at" TIMESTAMPTZ;

ALTER TABLE "restaurants"
    ADD CONSTRAINT "restaurants_country_code_format" CHECK ("country_code" ~ '^[A-Z]{2}$');

-- ---------------------------------------------------------------------------------------------
-- packages
ALTER TABLE "packages"
    ADD COLUMN "price_egp_monthly" DECIMAL(12,2),
    ADD COLUMN "price_egp_yearly" DECIMAL(12,2),
    ADD COLUMN "price_usd_monthly" DECIMAL(12,2),
    ADD COLUMN "price_usd_yearly" DECIMAL(12,2),
    ADD COLUMN "offer_percent" DECIMAL(5,2),
    ADD COLUMN "offer_label" TEXT,
    ADD COLUMN "offer_ends_at" DATE;

UPDATE "packages" SET
    "price_egp_monthly" = CASE WHEN "currency_code" = 'EGP' THEN "monthly_price" END,
    "price_egp_yearly"  = CASE WHEN "currency_code" = 'EGP' THEN "yearly_price" END,
    "price_usd_monthly" = CASE WHEN "currency_code" = 'USD' THEN "monthly_price" END,
    "price_usd_yearly"  = CASE WHEN "currency_code" = 'USD' THEN "yearly_price" END;

-- Dropping the columns also drops the two CHECK constraints that reference them.
ALTER TABLE "packages"
    DROP COLUMN "monthly_price",
    DROP COLUMN "yearly_price",
    DROP COLUMN "currency_code";

ALTER TABLE "packages"
    ADD CONSTRAINT "packages_prices_non_negative" CHECK (
        ("price_egp_monthly" IS NULL OR "price_egp_monthly" >= 0)
        AND ("price_egp_yearly" IS NULL OR "price_egp_yearly" >= 0)
        AND ("price_usd_monthly" IS NULL OR "price_usd_monthly" >= 0)
        AND ("price_usd_yearly" IS NULL OR "price_usd_yearly" >= 0)
    ),
    ADD CONSTRAINT "packages_offer_valid" CHECK (
        "offer_percent" IS NULL OR ("offer_percent" > 0 AND "offer_percent" <= 100)
    );

-- ---------------------------------------------------------------------------------------------
-- subscriptions
CREATE TYPE "billing_period" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "subscription_status" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TRANSFER', 'INSTAPAY', 'MOBILE_WALLET', 'OTHER');
CREATE TYPE "discount_type" AS ENUM ('PERCENT', 'AMOUNT');

CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "package_name" TEXT NOT NULL,
    "period" "billing_period" NOT NULL,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'ACTIVE',
    "currency_code" CHAR(3) NOT NULL,
    "list_price" DECIMAL(12,2) NOT NULL,
    "offer_label" TEXT,
    "offer_percent" DECIMAL(5,2),
    "offer_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_type" "discount_type",
    "discount_value" DECIMAL(12,2),
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "final_price" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "created_by_admin_id" UUID,
    "created_by_email" TEXT NOT NULL,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscriptions_period_valid" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "subscriptions_money_valid" CHECK (
        "list_price" >= 0 AND "offer_amount" >= 0 AND "discount_amount" >= 0
        AND "final_price" >= 0
        AND "final_price" = "list_price" - "offer_amount" - "discount_amount"
    ),
    CONSTRAINT "subscriptions_discount_consistent" CHECK (
        ("discount_type" IS NULL AND "discount_value" IS NULL)
        OR ("discount_type" IS NOT NULL AND "discount_value" IS NOT NULL AND "discount_value" >= 0)
    ),
    -- A restaurant never has two live subscriptions covering the same day.
    CONSTRAINT "subscriptions_no_overlap" EXCLUDE USING gist (
        "restaurant_id" WITH =,
        daterange("starts_at", "ends_at", '[)') WITH &&
    ) WHERE ("status" = 'ACTIVE')
);

CREATE INDEX "subscriptions_restaurant_id_starts_at_idx" ON "subscriptions"("restaurant_id", "starts_at");
CREATE INDEX "subscriptions_package_id_idx" ON "subscriptions"("package_id");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- subscription_payments (a ledger: voided, never deleted)
CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "payment_method" NOT NULL,
    "paid_at" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recorded_by_admin_id" UUID,
    "recorded_by_email" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ,
    "void_reason" TEXT,
    "voided_by_email" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_payments_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "subscription_payments_void_consistent" CHECK (
        ("voided_at" IS NULL AND "void_reason" IS NULL) OR ("voided_at" IS NOT NULL AND "void_reason" IS NOT NULL)
    )
);

CREATE INDEX "subscription_payments_subscription_id_paid_at_idx" ON "subscription_payments"("subscription_id", "paid_at");

ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_recorded_by_admin_id_fkey"
    FOREIGN KEY ("recorded_by_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- contracts
CREATE SEQUENCE "contract_number_seq" START 1;

CREATE TABLE "contracts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "terms" JSONB NOT NULL,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contracts_subscription_id_key" ON "contracts"("subscription_id");
CREATE UNIQUE INDEX "contracts_number_key" ON "contracts"("number");

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
