-- Branch opening hours (DEC-042, slice 3). Purely ADDITIVE.
--
-- A Branch is either always open (the default, today's behavior) or follows a weekly
-- schedule kept in branch_opening_hours; "temporarily closed" is a manual override
-- that works in both modes. Times are minutes after local midnight in the Branch's
-- own timezone; an interval that ends after midnight uses closes_minute above 1440
-- (for example 18:00 to 02:00 is 1080 to 1560) and belongs to the day it opens on.
--
-- Rollback (before any use): DROP TABLE "branch_opening_hours";
-- ALTER TABLE "branches" DROP COLUMN "hours_mode", DROP COLUMN "temporarily_closed";
-- DROP TYPE "branch_hours_mode";

-- CreateEnum
CREATE TYPE "branch_hours_mode" AS ENUM ('ALWAYS_OPEN', 'SCHEDULE');

-- AlterTable
ALTER TABLE "branches"
  ADD COLUMN "hours_mode" "branch_hours_mode" NOT NULL DEFAULT 'ALWAYS_OPEN',
  ADD COLUMN "temporarily_closed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "branch_opening_hours" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "opens_minute" INTEGER NOT NULL,
    "closes_minute" INTEGER NOT NULL,

    CONSTRAINT "branch_opening_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_opening_hours_branch_id_day_of_week_idx" ON "branch_opening_hours"("branch_id", "day_of_week");

-- CreateIndex
CREATE INDEX "branch_opening_hours_restaurant_id_idx" ON "branch_opening_hours"("restaurant_id");

-- AddForeignKey
ALTER TABLE "branch_opening_hours" ADD CONSTRAINT "branch_opening_hours_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom invariants ---------------------------------------------------------

-- 0 = Sunday ... 6 = Saturday; opening within the day; an interval lasts at least a
-- minute and at most 24 hours.
ALTER TABLE "branch_opening_hours"
  ADD CONSTRAINT "branch_opening_hours_valid_range" CHECK (
    "day_of_week" BETWEEN 0 AND 6
    AND "opens_minute" BETWEEN 0 AND 1439
    AND "closes_minute" > "opens_minute"
    AND "closes_minute" - "opens_minute" <= 1440
  );
