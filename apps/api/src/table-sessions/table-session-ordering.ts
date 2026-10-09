import type { Prisma } from '../generated/prisma/client';
import { createTableSessionPublicId } from './table-session-public-id';

/**
 * Table Sessions, Slice 1: how a Dine-In order finds (or opens) its session and
 * its round number. Called INSIDE the Order-creation transaction, so the
 * session, its audit event, the round and the Order commit or roll back
 * together: a rejected or failed first order can never leave an orphan OPEN
 * session behind.
 *
 * Locking protocol (design v3, section 7.1) -- one fixed order everywhere:
 *   tables row (FOR NO KEY UPDATE)  ->  table_sessions row  ->  orders rows
 * The table row is locked FIRST, so every writer that can open, close or
 * allocate a round on one table is serialized and sees the previous writer's
 * committed result. `FOR NO KEY UPDATE` (not `FOR UPDATE`) deliberately does
 * not block unrelated foreign-key inserts that take `FOR KEY SHARE`. The
 * partial unique index and the database triggers are backstops, not the
 * primary mechanism.
 */

/** The Table cannot take a new Table QR order right now (locked by staff, or no OPEN session and a staff open is required). Maps to TABLE_ORDERING_UNAVAILABLE. */
export class TableOrderingUnavailableError extends Error {
  constructor() {
    super('table ordering is unavailable');
  }
}

/** The Table vanished or stopped being ACTIVE between the QR lookup and the lock -- indistinguishable from an unknown QR. */
export class TableNotOrderableError extends Error {
  constructor() {
    super('table is not orderable');
  }
}

export interface DineInSessionScope {
  restaurantId: string;
  branchId: string;
  tableId: string;
}

export interface DineInSessionSlot {
  tableSessionId: string;
  /** Sequential within the session, starting at 1. */
  roundNumber: number;
}

/**
 * SQLSTATE the `orders_require_open_table_session` trigger raises (migration
 * 20261009100000_add_table_sessions) when an order would be attached to a
 * session that is not OPEN.
 */
export const TABLE_SESSION_NOT_OPEN_SQLSTATE = 'TS001';

/**
 * True when `error` is the closed-session trigger firing. Prisma wraps a raw
 * driver error differently depending on the path, so the SQLSTATE is looked
 * for anywhere on the (shallow) error object, with the message as a fallback.
 */
export function isClosedSessionTriggerViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number): boolean => {
    if (
      value === null ||
      typeof value !== 'object' ||
      depth > 6 ||
      seen.has(value)
    ) {
      return false;
    }
    seen.add(value);
    for (const [key, inner] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (
        (key === 'code' || key === 'originalCode' || key === 'sqlState') &&
        inner === TABLE_SESSION_NOT_OPEN_SQLSTATE
      ) {
        return true;
      }
      if (visit(inner, depth + 1)) {
        return true;
      }
    }
    return false;
  };
  if (visit(error, 0)) {
    return true;
  }
  return (
    error instanceof Error &&
    /orders can only be attached to an OPEN session/.test(error.message)
  );
}

/**
 * Resolves the session slot for ONE new Dine-In order. Must run inside the
 * Order-creation transaction.
 *
 * - Locks the Table row (tenant- and branch-scoped, re-checking it is ACTIVE).
 * - OPEN session exists -> allocates the next round on it atomically.
 * - No OPEN session and the Table is not locked by staff -> creates the OPEN
 *   session (`openedVia = FIRST_ORDER`) plus its SESSION_OPENED event and
 *   returns round 1.
 * - No OPEN session and `staff_open_required` -> TableOrderingUnavailableError.
 *
 * A CLOSED session is never touched, so it can never be reopened here.
 */
export async function resolveDineInSessionSlot(
  tx: Prisma.TransactionClient,
  scope: DineInSessionScope,
): Promise<DineInSessionSlot> {
  const { restaurantId, branchId, tableId } = scope;

  const tableRows = await tx.$queryRaw<
    { status: string; staff_open_required: boolean }[]
  >`SELECT "status"::text AS "status", "staff_open_required"
      FROM "tables"
     WHERE "id" = ${tableId}::uuid
       AND "restaurant_id" = ${restaurantId}::uuid
       AND "branch_id" = ${branchId}::uuid
       FOR NO KEY UPDATE`;
  const table = tableRows[0];
  if (!table || table.status !== 'ACTIVE') {
    throw new TableNotOrderableError();
  }

  const open = await tx.tableSession.findFirst({
    where: { restaurantId, branchId, tableId, status: 'OPEN' },
    select: { id: true },
  });

  if (open) {
    // One atomic statement: takes the session row lock and hands out the round.
    const allocated = await tx.$queryRaw<{ round_number: number }[]>`
      UPDATE "table_sessions"
         SET "next_round_number" = "next_round_number" + 1,
             "updated_at" = now()
       WHERE "id" = ${open.id}::uuid
         AND "restaurant_id" = ${restaurantId}::uuid
         AND "branch_id" = ${branchId}::uuid
         AND "table_id" = ${tableId}::uuid
         AND "status" = 'OPEN'
      RETURNING "next_round_number" - 1 AS "round_number"`;
    if (allocated.length !== 1) {
      // Only reachable if a writer closed the session without taking the table
      // lock first (a protocol violation) -- fail loudly, never guess.
      throw new Error('table session changed while allocating a round');
    }
    return {
      tableSessionId: open.id,
      roundNumber: Number(allocated[0].round_number),
    };
  }

  if (table.staff_open_required) {
    throw new TableOrderingUnavailableError();
  }

  const session = await tx.tableSession.create({
    data: {
      publicId: createTableSessionPublicId(),
      restaurantId,
      branchId,
      tableId,
      status: 'OPEN',
      openedVia: 'FIRST_ORDER',
      // This order takes round 1; the next order gets 2.
      nextRoundNumber: 2,
    },
    select: { id: true },
  });
  await tx.tableSessionEvent.create({
    data: {
      restaurantId,
      branchId,
      tableSessionId: session.id,
      type: 'SESSION_OPENED',
      actorType: 'GUEST',
      metadata: { openedVia: 'FIRST_ORDER' },
    },
  });
  return { tableSessionId: session.id, roundNumber: 1 };
}
