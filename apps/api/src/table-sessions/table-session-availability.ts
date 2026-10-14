import type { PrismaService } from '../database/prisma.service';

/**
 * Table QR ordering availability as shown to GUESTS (design v3, section 2).
 * Deliberately only two guest-safe values: a Guest never sees sessions,
 * balances or payment state (spec #14).
 *
 * This is ADVISORY. It is read without locks, so it can be stale by the time a
 * Guest submits; the order endpoint always re-checks under the table lock and
 * answers TABLE_ORDERING_UNAVAILABLE when the table is locked.
 *
 * Ordering is available when an OPEN session exists, or the table is not
 * locked by staff (`staffOpenRequired = false`, so the first order may open a
 * session). An OPEN session wins over a stale flag, mirroring the ordering
 * transaction.
 */
export type GuestTableOrdering = 'AVAILABLE' | 'CLOSED';

/**
 * What the Guest Menu reports for a TABLE QR. `DISABLED` (DEC-038) is a
 * Restaurant setting -- the Table channel is view-only -- and is distinct from
 * `CLOSED`, which is staff closing ordering for one table.
 */
export type GuestTableOrderingState = GuestTableOrdering | 'DISABLED';

export async function resolveTableOrderingAvailability(
  prisma: Pick<PrismaService, 'tableSession'>,
  table: { tableId: string; staffOpenRequired: boolean },
): Promise<GuestTableOrdering> {
  if (!table.staffOpenRequired) {
    return 'AVAILABLE';
  }
  const open = await prisma.tableSession.findFirst({
    where: { tableId: table.tableId, status: 'OPEN' },
    select: { id: true },
  });
  return open ? 'AVAILABLE' : 'CLOSED';
}
