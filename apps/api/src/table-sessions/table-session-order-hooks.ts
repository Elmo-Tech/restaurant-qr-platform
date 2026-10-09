import type { OrderStatus, Prisma } from '../generated/prisma/client';
import { lockSessionRow, lockTableRow } from './table-session-locks';

/**
 * Table Sessions: the three places the EXISTING order status transition must
 * cooperate with a session (design v3 sections 5.2 and 5.3). The transition
 * rules themselves (`order-transitions.ts`) are unchanged; these hooks only
 * add locking and two session-level rules around the existing conditional
 * update. A session-less (legacy, Pickup, Delivery) order skips all of it.
 */

/** Cancelling is blocked while the order's session has an active (non-voided) payment (decision P5). */
export class CancelBlockedBySettlementError extends Error {
  constructor() {
    super('order cannot be cancelled while its session has an active payment');
  }
}

export interface TransitionOrderRef {
  restaurantId: string;
  branchId: string;
  tableSessionId: string | null;
  roundNumber: number | null;
}

export interface PreparedTransition {
  /** True when this REJECTED transition must be followed by the first-order auto-close check. */
  checkFirstOrderAutoClose: boolean;
}

/**
 * Runs INSIDE the transition transaction, BEFORE the conditional status update.
 *
 * - ACCEPTED / CANCELLED change what the bill is, so they lock the session row
 *   first (the same lock a payment takes, so a payment's balance check can never
 *   race an acceptance or cancellation). CANCELLED additionally refuses when a
 *   non-voided payment exists (P5).
 * - A REJECTED round-1 order of a session that was opened by that order may
 *   close it (P6), so it takes the full lock chain: table row, then session row.
 * - Everything else needs no session lock.
 */
export async function prepareOrderTransition(
  tx: Prisma.TransactionClient,
  order: TransitionOrderRef,
  target: OrderStatus,
): Promise<PreparedTransition> {
  const none: PreparedTransition = { checkFirstOrderAutoClose: false };
  if (!order.tableSessionId) {
    return none;
  }
  const sessionId = order.tableSessionId;

  if (target === 'REJECTED') {
    if (order.roundNumber !== 1) {
      return none;
    }
    // Unlocked read only to learn which table to lock first (lock order).
    const probe = await tx.tableSession.findFirst({
      where: { id: sessionId, restaurantId: order.restaurantId },
      select: { tableId: true, openedVia: true },
    });
    if (!probe || probe.openedVia !== 'FIRST_ORDER') {
      return none;
    }
    await lockTableRow(tx, {
      tableId: probe.tableId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
    });
    await lockSessionRow(tx, { sessionId, restaurantId: order.restaurantId });
    return { checkFirstOrderAutoClose: true };
  }

  if (target === 'ACCEPTED' || target === 'CANCELLED') {
    await lockSessionRow(tx, { sessionId, restaurantId: order.restaurantId });
    if (target === 'CANCELLED') {
      const activePayments = await tx.tableSessionPayment.count({
        where: { tableSessionId: sessionId, voidedAt: null },
      });
      if (activePayments > 0) {
        throw new CancelBlockedBySettlementError();
      }
    }
  }
  return none;
}

/**
 * Runs INSIDE the same transaction, AFTER a successful REJECTED update, only
 * when `prepareOrderTransition` took the full lock chain.
 *
 * Closes the session (reason FIRST_ORDER_REJECTED, actor SYSTEM) ONLY when it is
 * still OPEN and has NO other order that is not REJECTED or CANCELLED. The
 * other orders are read AFTER the locks are held, so a concurrent second order
 * either committed first (and keeps the session OPEN) or is still waiting on
 * the table lock and then opens a clean new session. It deliberately does NOT
 * set `tables.staff_open_required`: the party was never served, so the table
 * stays orderable (P6).
 */
export async function autoCloseAfterFirstOrderRejection(
  tx: Prisma.TransactionClient,
  input: {
    sessionId: string;
    restaurantId: string;
    branchId: string;
    rejectedOrderId: string;
  },
): Promise<boolean> {
  const session = await tx.tableSession.findFirst({
    where: { id: input.sessionId, restaurantId: input.restaurantId },
    select: { status: true },
  });
  if (!session || session.status !== 'OPEN') {
    return false;
  }

  const otherActive = await tx.order.count({
    where: {
      tableSessionId: input.sessionId,
      id: { not: input.rejectedOrderId },
      status: { notIn: ['REJECTED', 'CANCELLED'] },
    },
  });
  if (otherActive > 0) {
    return false;
  }

  await tx.tableSession.update({
    where: { id: input.sessionId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closureReason: 'FIRST_ORDER_REJECTED',
    },
  });
  await tx.tableSessionEvent.create({
    data: {
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      tableSessionId: input.sessionId,
      type: 'SESSION_CLOSED',
      actorType: 'SYSTEM',
      metadata: { reason: 'FIRST_ORDER_REJECTED' },
    },
  });
  return true;
}
