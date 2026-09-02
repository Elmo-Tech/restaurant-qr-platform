-- CreateEnum
CREATE TYPE "table_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "qr_type" AS ENUM ('TABLE', 'GENERIC');

-- CreateEnum
CREATE TYPE "qr_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "tables" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_number" TEXT NOT NULL,
    "status" "table_status" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" UUID NOT NULL,
    "public_code" TEXT NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "branch_id" UUID,
    "table_id" UUID,
    "type" "qr_type" NOT NULL,
    "status" "qr_status" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tables_restaurant_id_idx" ON "tables"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tables_branch_id_table_number_key" ON "tables"("branch_id", "table_number");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_public_code_key" ON "qr_codes"("public_code");

-- CreateIndex
CREATE INDEX "qr_codes_restaurant_id_idx" ON "qr_codes"("restaurant_id");

-- CreateIndex
CREATE INDEX "qr_codes_branch_id_idx" ON "qr_codes"("branch_id");

-- CreateIndex
CREATE INDEX "qr_codes_table_id_idx" ON "qr_codes"("table_id");

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business Foundation L1 (DATABASE_SPEC.md #56): at most one ACTIVE TABLE QR
-- per Table. Prisma's schema syntax cannot express a partial (WHERE-
-- predicated) unique index, so it is committed here as custom migration SQL
-- per DATABASE_SPEC.md #41's policy.
CREATE UNIQUE INDEX "qr_codes_one_active_table_qr"
ON "qr_codes" ("table_id")
WHERE "type" = 'TABLE' AND "status" = 'ACTIVE';

-- Business Foundation L1 (DATABASE_SPEC.md #55, QR_SPEC.md #55): TABLE QR
-- requires both table_id and branch_id; GENERIC QR requires table_id to be
-- null (branch_id may be null or non-null, since a future Restaurant-wide
-- Generic QR is valid scope). restaurant_id is already NOT NULL
-- independently of this constraint.
ALTER TABLE "qr_codes"
ADD CONSTRAINT "qr_codes_type_context_check"
CHECK (
  (
    "type" = 'TABLE'
    AND "table_id" IS NOT NULL
    AND "branch_id" IS NOT NULL
  )
  OR
  (
    "type" = 'GENERIC'
    AND "table_id" IS NULL
  )
);
