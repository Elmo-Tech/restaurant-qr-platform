-- Menu Import (DEC-040): Draft storage for "create the menu from an image, PDF or
-- Excel file". Purely ADDITIVE (new enums and tables, nothing existing changes).
-- The uploaded file itself is never stored; only the job, its Draft rows and the
-- extracted translations.
--
-- Custom SQL (Prisma cannot express it): at most ONE running (PROCESSING) import
-- per Restaurant -- a partial unique index, the final guarantee behind the
-- IMPORT_ALREADY_RUNNING answer.
--
-- Rollback (before any import exists): DROP the tables, then the enums.

-- CreateEnum
CREATE TYPE "menu_import_status" AS ENUM ('PROCESSING', 'READY_FOR_REVIEW', 'APPROVED', 'DISCARDED', 'FAILED');

-- CreateEnum
CREATE TYPE "menu_import_source_type" AS ENUM ('IMAGE', 'PDF', 'SPREADSHEET');

-- CreateEnum
CREATE TYPE "menu_import_confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "menu_import_jobs" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "target_menu_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "status" "menu_import_status" NOT NULL,
    "source_type" "menu_import_source_type" NOT NULL,
    "source_file_name" TEXT NOT NULL,
    "source_mime_type" TEXT NOT NULL,
    "source_size_bytes" INTEGER NOT NULL,
    "language_hint" TEXT NOT NULL,
    "detected_locales" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model_name" TEXT,
    "error_code" TEXT,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "approved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "menu_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_import_categories" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,
    "included" BOOLEAN NOT NULL,
    "matched_category_id" UUID,
    "use_existing" BOOLEAN NOT NULL DEFAULT false,
    "created_category_id" UUID,

    CONSTRAINT "menu_import_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_import_category_translations" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "menu_import_category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_import_products" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,
    "price" DECIMAL(14,2),
    "price_options" JSONB NOT NULL DEFAULT '[]',
    "confidence" "menu_import_confidence" NOT NULL,
    "included" BOOLEAN NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matched_product_id" UUID,
    "created_product_id" UUID,

    CONSTRAINT "menu_import_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_import_product_translations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "menu_import_product_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_import_jobs_public_id_key" ON "menu_import_jobs"("public_id");

-- CreateIndex
CREATE INDEX "menu_import_jobs_restaurant_id_created_at_idx" ON "menu_import_jobs"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "menu_import_categories_job_id_idx" ON "menu_import_categories"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_import_category_translations_category_id_locale_key" ON "menu_import_category_translations"("category_id", "locale");

-- CreateIndex
CREATE INDEX "menu_import_products_category_id_idx" ON "menu_import_products"("category_id");

-- CreateIndex
CREATE INDEX "menu_import_products_restaurant_id_idx" ON "menu_import_products"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_import_product_translations_product_id_locale_key" ON "menu_import_product_translations"("product_id", "locale");

-- AddForeignKey
ALTER TABLE "menu_import_jobs" ADD CONSTRAINT "menu_import_jobs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_import_jobs" ADD CONSTRAINT "menu_import_jobs_target_menu_id_fkey" FOREIGN KEY ("target_menu_id") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_import_jobs" ADD CONSTRAINT "menu_import_jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_import_categories" ADD CONSTRAINT "menu_import_categories_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "menu_import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_import_category_translations" ADD CONSTRAINT "menu_import_category_translations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_import_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_import_products" ADD CONSTRAINT "menu_import_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_import_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_import_product_translations" ADD CONSTRAINT "menu_import_product_translations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "menu_import_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom invariants ---------------------------------------------------------

-- At most one running import per Restaurant.
CREATE UNIQUE INDEX "menu_import_jobs_one_processing_per_restaurant"
  ON "menu_import_jobs"("restaurant_id")
  WHERE "status" = 'PROCESSING';

-- A Draft price is never negative.
ALTER TABLE "menu_import_products"
  ADD CONSTRAINT "menu_import_products_price_non_negative"
  CHECK ("price" IS NULL OR "price" >= 0);
