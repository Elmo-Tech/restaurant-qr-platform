-- Table Sessions, Slice 1 (Foundation & Ordering).
-- Design: docs/05-future-proposals/TABLE_SESSION_CLOSURE_AND_PAYMENT_DESIGN.md (v3).
--
-- PURELY ADDITIVE: new enums, three new tables, three new nullable/defaulted
-- columns. No existing row is rewritten and no existing order is attached to a
-- session (legacy DINE_IN orders keep table_session_id / round_number NULL,
-- decision D8). Every existing table keeps staff_open_required = false, so QR
-- ordering behaves exactly as before until a later slice introduces closing.
--
-- Part 1 is the Prisma-generated DDL. Part 2 is hand-written integrity SQL that
-- Prisma cannot express (partial unique index, CHECKs, triggers).
--
-- Rollback (only valid while no session exists): drop the two triggers and
-- their functions, drop the orders / tables columns and constraints added
-- below, then drop the three new tables and the seven enums.

-- CreateEnum
CREATE TYPE "table_session_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "table_session_opened_via" AS ENUM ('FIRST_ORDER', 'STAFF');

-- CreateEnum
CREATE TYPE "table_session_closure_reason" AS ENUM ('NORMAL', 'FIRST_ORDER_REJECTED', 'STAFF_CORRECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "table_session_ledger_kind" AS ENUM ('PAYMENT');

-- CreateEnum
CREATE TYPE "table_session_payment_method" AS ENUM ('CASH', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "table_session_event_type" AS ENUM ('SESSION_OPENED', 'SESSION_CLOSED', 'PAYMENT_RECORDED', 'PAYMENT_VOIDED', 'BILL_PRINTED');

-- CreateEnum
CREATE TYPE "table_session_actor_type" AS ENUM ('GUEST', 'STAFF', 'SYSTEM');

-- AlterTable
ALTER TABLE "tables" ADD COLUMN     "staff_open_required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "round_number" INTEGER,
ADD COLUMN     "table_session_id" UUID;

-- CreateTable
CREATE TABLE "table_sessions" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "status" "table_session_status" NOT NULL,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_via" "table_session_opened_via" NOT NULL,
    "opened_by_membership_id" UUID,
    "closed_at" TIMESTAMPTZ,
    "closed_by_membership_id" UUID,
    "closure_reason" "table_session_closure_reason",
    "next_round_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_session_payments" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_session_id" UUID NOT NULL,
    "kind" "table_session_ledger_kind" NOT NULL DEFAULT 'PAYMENT',
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "table_session_payment_method" NOT NULL,
    "client_request_id" UUID NOT NULL,
    "note" TEXT,
    "recorded_by_membership_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ,
    "voided_by_membership_id" UUID,
    "void_reason" TEXT,

    CONSTRAINT "table_session_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_session_events" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_session_id" UUID NOT NULL,
    "type" "table_session_event_type" NOT NULL,
    "actor_type" "table_session_actor_type" NOT NULL,
    "actor_membership_id" UUID,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "table_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "table_sessions_public_id_key" ON "table_sessions"("public_id");

-- CreateIndex
CREATE INDEX "table_sessions_restaurant_id_branch_id_status_idx" ON "table_sessions"("restaurant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "table_sessions_table_id_opened_at_idx" ON "table_sessions"("table_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "table_sessions_id_restaurant_id_branch_id_table_id_key" ON "table_sessions"("id", "restaurant_id", "branch_id", "table_id");

-- CreateIndex
CREATE UNIQUE INDEX "table_sessions_id_restaurant_id_branch_id_key" ON "table_sessions"("id", "restaurant_id", "branch_id");

-- CreateIndex
CREATE INDEX "table_session_payments_table_session_id_idx" ON "table_session_payments"("table_session_id");

-- CreateIndex
CREATE INDEX "table_session_payments_restaurant_id_branch_id_idx" ON "table_session_payments"("restaurant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "table_session_payments_table_session_id_client_request_id_key" ON "table_session_payments"("table_session_id", "client_request_id");

-- CreateIndex
CREATE INDEX "table_session_events_table_session_id_occurred_at_idx" ON "table_session_events"("table_session_id", "occurred_at");

-- CreateIndex
CREATE INDEX "table_session_events_restaurant_id_branch_id_type_occurred__idx" ON "table_session_events"("restaurant_id", "branch_id", "type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "tables_id_restaurant_id_branch_id_key" ON "tables"("id", "restaurant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_table_session_id_round_number_key" ON "orders"("table_session_id", "round_number");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_session_scope_fkey" FOREIGN KEY ("table_session_id", "restaurant_id", "branch_id", "table_id") REFERENCES "table_sessions"("id", "restaurant_id", "branch_id", "table_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_scope_fkey" FOREIGN KEY ("table_id", "restaurant_id", "branch_id") REFERENCES "tables"("id", "restaurant_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_opened_by_membership_id_fkey" FOREIGN KEY ("opened_by_membership_id") REFERENCES "restaurant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_closed_by_membership_id_fkey" FOREIGN KEY ("closed_by_membership_id") REFERENCES "restaurant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session_payments" ADD CONSTRAINT "table_session_payments_session_scope_fkey" FOREIGN KEY ("table_session_id", "restaurant_id", "branch_id") REFERENCES "table_sessions"("id", "restaurant_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session_payments" ADD CONSTRAINT "table_session_payments_recorded_by_membership_id_fkey" FOREIGN KEY ("recorded_by_membership_id") REFERENCES "restaurant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session_payments" ADD CONSTRAINT "table_session_payments_voided_by_membership_id_fkey" FOREIGN KEY ("voided_by_membership_id") REFERENCES "restaurant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session_events" ADD CONSTRAINT "table_session_events_session_scope_fkey" FOREIGN KEY ("table_session_id", "restaurant_id", "branch_id") REFERENCES "table_sessions"("id", "restaurant_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session_events" ADD CONSTRAINT "table_session_events_actor_membership_id_fkey" FOREIGN KEY ("actor_membership_id") REFERENCES "restaurant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- =============================================================================
-- Part 2: integrity that Prisma cannot express
-- =============================================================================

-- One OPEN session per table (INV-003). CLOSED sessions are history and never
-- conflict. This is the final backstop behind the table-row lock the ordering
-- code takes first.
CREATE UNIQUE INDEX "table_sessions_one_open_per_table"
    ON "table_sessions"("table_id")
    WHERE "status" = 'OPEN';

-- Lifecycle consistency: closure fields exist exactly when the session is
-- CLOSED. closed_by_membership_id stays optional (a SYSTEM auto-close has no
-- staff actor). A session is never reopened, so there is no CLOSED -> OPEN path.
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_closed_state_check" CHECK (
    ("status" = 'OPEN'
        AND "closed_at" IS NULL
        AND "closure_reason" IS NULL
        AND "closed_by_membership_id" IS NULL)
    OR
    ("status" = 'CLOSED'
        AND "closed_at" IS NOT NULL
        AND "closure_reason" IS NOT NULL)
);
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_next_round_number_check"
    CHECK ("next_round_number" >= 1);
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_closed_after_opened_check"
    CHECK ("closed_at" IS NULL OR "closed_at" >= "opened_at");

-- Settlement ledger foundation (written by a later slice): positive amounts
-- only, and a void is all-or-nothing with a non-blank reason (an audited
-- accounting correction, never a refund).
ALTER TABLE "table_session_payments" ADD CONSTRAINT "table_session_payments_amount_positive"
    CHECK ("amount" > 0);
ALTER TABLE "table_session_payments" ADD CONSTRAINT "table_session_payments_void_state_check" CHECK (
    ("voided_at" IS NULL AND "voided_by_membership_id" IS NULL AND "void_reason" IS NULL)
    OR
    ("voided_at" IS NOT NULL AND "voided_by_membership_id" IS NOT NULL
        AND "void_reason" IS NOT NULL AND btrim("void_reason") <> '')
);

-- Orders: session and round travel together; only a DINE_IN order with a table
-- can belong to a session; legacy / pickup / delivery orders keep both NULL.
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_session_pair_check"
    CHECK (("table_session_id" IS NULL) = ("round_number" IS NULL));
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_session_dine_in_check" CHECK (
    "table_session_id" IS NULL
    OR ("type" = 'DINE_IN' AND "table_id" IS NOT NULL AND "round_number" >= 1)
);

-- Trigger 1: never insert an order into a session that is not OPEN.
-- FOR SHARE conflicts with a concurrent close (which updates the session row),
-- so even a code path that forgot the application-level table lock cannot slip
-- an order into a session being closed: under READ COMMITTED the shared lock
-- waits for the closer, re-evaluates the row, and finds it CLOSED.
-- SQLSTATE TS001 lets the application map this to a domain error reliably.
CREATE FUNCTION "orders_require_open_table_session"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM "table_sessions"
    WHERE "id" = NEW."table_session_id" AND "status" = 'OPEN'
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'table session % is not OPEN: orders can only be attached to an OPEN session',
            NEW."table_session_id" USING ERRCODE = 'TS001';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "orders_require_open_table_session_trg"
    BEFORE INSERT ON "orders"
    FOR EACH ROW
    WHEN (NEW."table_session_id" IS NOT NULL)
    EXECUTE FUNCTION "orders_require_open_table_session"();

-- Trigger 2: an order's session link and round number are immutable once set,
-- and a legacy order (NULL) can never be attached to a session later.
-- SQLSTATE TS002.
CREATE FUNCTION "orders_protect_table_session_link"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'order % table session link and round number are immutable', OLD."id"
        USING ERRCODE = 'TS002';
END;
$$;

CREATE TRIGGER "orders_protect_table_session_link_trg"
    BEFORE UPDATE OF "table_session_id", "round_number" ON "orders"
    FOR EACH ROW
    WHEN (OLD."table_session_id" IS DISTINCT FROM NEW."table_session_id"
          OR OLD."round_number" IS DISTINCT FROM NEW."round_number")
    EXECUTE FUNCTION "orders_protect_table_session_link"();
