import type { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { BILLABLE_ORDER_STATUSES } from './session-billing';
import type { SessionPaymentFilter } from './dto/list-sessions-query.dto';

/**
 * Set-based (SQL) evaluation of the DERIVED payment status. The status is never
 * stored, so a payment filter or an "outstanding balance" total has to be
 * computed from the order snapshots and the ledger. Doing it in one SQL
 * statement means a filtered list is EXACT and never truncated by a scan limit
 * (an application-side scan with a cap could silently hide older unpaid
 * sessions).
 *
 * The predicates below are the SQL twin of `derivePaymentStatus` in
 * `session-billing.ts`; `test/table-sessions-lifecycle.e2e-spec.ts` asserts the
 * two agree on real rows. Money stays `numeric` end to end (never a float).
 */

const BILLABLE = Prisma.join(
  BILLABLE_ORDER_STATUSES.map((status) => Prisma.sql`${status}::order_status`),
);

/** Joins that expose `e.eligible` and `p.paid` for each session alias `s`. */
const BILL_JOINS = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(o."total_amount"), 0) AS eligible
      FROM "orders" o
     WHERE o."table_session_id" = s."id" AND o."status" IN (${BILLABLE})
  ) e ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p."amount"), 0) AS paid
      FROM "table_session_payments" p
     WHERE p."table_session_id" = s."id" AND p."voided_at" IS NULL
  ) p ON TRUE`;

const UNPAID = Prisma.sql`(e.eligible > 0 AND p.paid = 0)`;
const PARTIALLY_PAID = Prisma.sql`(p.paid > 0 AND e.eligible - p.paid > 0)`;

export function paymentPredicate(filter: SessionPaymentFilter): Prisma.Sql {
  switch (filter) {
    case 'NO_CHARGE':
      return Prisma.sql`(e.eligible = 0 AND p.paid = 0)`;
    case 'UNPAID':
      return UNPAID;
    case 'PAID':
      return Prisma.sql`(e.eligible > 0 AND e.eligible - p.paid = 0)`;
    case 'PARTIALLY_PAID':
      return PARTIALLY_PAID;
    case 'OVERPAID':
      return Prisma.sql`(e.eligible - p.paid < 0)`;
    case 'OUTSTANDING':
      return Prisma.sql`(${UNPAID} OR ${PARTIALLY_PAID})`;
  }
}

function branchClause(branchIds: string[] | undefined): Prisma.Sql {
  if (!branchIds) {
    return Prisma.empty;
  }
  return Prisma.sql`AND s."branch_id" IN (${Prisma.join(
    branchIds.map((id) => Prisma.sql`${id}::uuid`),
  )})`;
}

/**
 * Ids (internal) of the sessions that match every filter INCLUDING the derived
 * payment status, newest first, limited. Tenant-scoped by `restaurantId`.
 */
export async function findSessionIdsByPayment(
  prisma: Pick<PrismaService, '$queryRaw'>,
  input: {
    restaurantId: string;
    branchIds?: string[];
    tableId?: string;
    status?: 'OPEN' | 'CLOSED';
    payment: SessionPaymentFilter;
    limit: number;
  },
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT s."id"::text AS "id"
      FROM "table_sessions" s
      ${BILL_JOINS}
     WHERE s."restaurant_id" = ${input.restaurantId}::uuid
       ${branchClause(input.branchIds)}
       ${input.tableId ? Prisma.sql`AND s."table_id" = ${input.tableId}::uuid` : Prisma.empty}
       ${input.status ? Prisma.sql`AND s."status" = ${input.status}::table_session_status` : Prisma.empty}
       AND ${paymentPredicate(input.payment)}
     ORDER BY s."opened_at" DESC, s."id" DESC
     LIMIT ${input.limit}`);
  return rows.map((row) => row.id);
}

export interface TableOutstanding {
  sessionCount: number;
  balance: Prisma.Decimal;
}

/**
 * Per table: how many CLOSED sessions still owe money and how much. Used by the
 * Dashboard to flag "old unpaid bills" next to a table that may already have a
 * NEW open session. Exact (no scan cap); balances come from `numeric` sums.
 */
export async function outstandingClosedByTable(
  prisma: Pick<PrismaService, '$queryRaw'>,
  input: { restaurantId: string; branchIds?: string[] },
): Promise<Map<string, TableOutstanding>> {
  const rows = await prisma.$queryRaw<
    { table_id: string; session_count: bigint; balance: Prisma.Decimal }[]
  >(Prisma.sql`
    SELECT s."table_id"::text AS "table_id",
           COUNT(*) AS "session_count",
           SUM(e.eligible - p.paid) AS "balance"
      FROM "table_sessions" s
      ${BILL_JOINS}
     WHERE s."restaurant_id" = ${input.restaurantId}::uuid
       AND s."status" = 'CLOSED'::table_session_status
       ${branchClause(input.branchIds)}
       AND e.eligible - p.paid > 0
     GROUP BY s."table_id"`);
  return new Map(
    rows.map((row) => [
      row.table_id,
      {
        sessionCount: Number(row.session_count),
        balance: new Prisma.Decimal(row.balance),
      },
    ]),
  );
}
