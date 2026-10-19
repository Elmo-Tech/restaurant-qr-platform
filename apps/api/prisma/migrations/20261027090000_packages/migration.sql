-- Packages (DEC-046): a named bundle of the platform features (DEC-043) that the platform team
-- creates and assigns to Restaurants. Purely ADDITIVE: two new tables and one nullable column.
-- A Restaurant with no package keeps today's behavior (every feature), so nothing changes for
-- existing Restaurants. A price is display only here (no billing yet).
--
-- Rollback (before any package is assigned):
--   ALTER TABLE "restaurants" DROP COLUMN "package_id";
--   DROP TABLE "package_features";
--   DROP TABLE "packages";
--   DROP TYPE "package_status";

CREATE TYPE "package_status" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "description" TEXT,
    "status" "package_status" NOT NULL DEFAULT 'ACTIVE',
    "monthly_price" DECIMAL(12,2),
    "yearly_price" DECIMAL(12,2),
    "currency_code" CHAR(3),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "packages_prices_non_negative" CHECK (
        ("monthly_price" IS NULL OR "monthly_price" >= 0)
        AND ("yearly_price" IS NULL OR "yearly_price" >= 0)
    ),
    CONSTRAINT "packages_price_needs_currency" CHECK (
        ("monthly_price" IS NULL AND "yearly_price" IS NULL) OR "currency_code" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "packages_name_normalized_key" ON "packages"("name_normalized");

-- The features a package INCLUDES: a row means included, no row means not included.
CREATE TABLE "package_features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "package_id" UUID NOT NULL,
    "feature" "feature_key" NOT NULL,

    CONSTRAINT "package_features_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "package_features_package_id_feature_key" ON "package_features"("package_id", "feature");

ALTER TABLE "package_features" ADD CONSTRAINT "package_features_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A package that Restaurants use cannot be deleted (archive it instead).
ALTER TABLE "restaurants" ADD COLUMN "package_id" UUID;

CREATE INDEX "restaurants_package_id_idx" ON "restaurants"("package_id");

ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
