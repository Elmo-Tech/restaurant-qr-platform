import type { Prisma } from '../generated/prisma/client';

/**
 * Table Sessions, design v3 section 7.1: row locks. Every writer that changes a
 * session, its table's ordering availability, or anything that affects the bill
 * takes locks in ONE fixed order, so deadlock cycles cannot form:
 *
 *   tables row (FOR NO KEY UPDATE)  ->  table_sessions row  ->  orders rows
 *
 * `FOR NO KEY UPDATE` (not `FOR UPDATE`) does not block unrelated foreign-key
 * inserts that take `FOR KEY SHARE`.
 */

export interface LockedTable {
  status: string;
  staffOpenRequired: boolean;
}

export interface LockedSession {
  id: string;
  status: 'OPEN' | 'CLOSED';
  tableId: string;
  branchId: string;
  openedVia: 'FIRST_ORDER' | 'STAFF';
}

/** Locks one Table row, scoped by tenant and branch. Null when it is not found in that scope. */
export async function lockTableRow(
  tx: Prisma.TransactionClient,
  scope: { tableId: string; restaurantId: string; branchId: string },
): Promise<LockedTable | null> {
  const rows = await tx.$queryRaw<
    { status: string; staff_open_required: boolean }[]
  >`SELECT "status"::text AS "status", "staff_open_required"
      FROM "tables"
     WHERE "id" = ${scope.tableId}::uuid
       AND "restaurant_id" = ${scope.restaurantId}::uuid
       AND "branch_id" = ${scope.branchId}::uuid
       FOR NO KEY UPDATE`;
  const row = rows[0];
  return row
    ? { status: row.status, staffOpenRequired: row.staff_open_required }
    : null;
}

/** Locks one TableSession row by its internal id, scoped by tenant. Null when not found in that scope. */
export async function lockSessionRow(
  tx: Prisma.TransactionClient,
  scope: { sessionId: string; restaurantId: string },
): Promise<LockedSession | null> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      status: 'OPEN' | 'CLOSED';
      table_id: string;
      branch_id: string;
      opened_via: 'FIRST_ORDER' | 'STAFF';
    }[]
  >`SELECT "id"::text AS "id", "status"::text AS "status", "table_id"::text AS "table_id",
           "branch_id"::text AS "branch_id", "opened_via"::text AS "opened_via"
      FROM "table_sessions"
     WHERE "id" = ${scope.sessionId}::uuid
       AND "restaurant_id" = ${scope.restaurantId}::uuid
       FOR NO KEY UPDATE`;
  const row = rows[0];
  return row
    ? {
        id: row.id,
        status: row.status,
        tableId: row.table_id,
        branchId: row.branch_id,
        openedVia: row.opened_via,
      }
    : null;
}
