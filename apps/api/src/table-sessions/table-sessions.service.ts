import { Injectable } from '@nestjs/common';
import { BranchAccessService } from '../auth/context/branch-access.service';
import type { RestaurantAccessContext } from '../auth/context/restaurant-access.service';
import { hasPermission } from '../auth/permission/has-permission';
import { PERMISSIONS } from '../auth/permission/permission';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  OrderStatus,
  OrderType,
  TableSessionClosureReason,
  TableSessionPaymentMethod,
} from '../generated/prisma/client';
import { resolveOrderBranchIdFilter } from '../orders/order-branch-scope';
import type { CloseSessionDto } from './dto/close-session.dto';
import type { SessionPaymentFilter } from './dto/list-sessions-query.dto';
import {
  SESSION_LIST_DEFAULT_LIMIT,
  SESSION_LIST_MAX_LIMIT,
} from './dto/list-sessions-query.dto';
import {
  computeSessionBill,
  formatMoney,
  toBillView,
  type SessionBillView,
} from './session-billing';
import {
  findSessionIdsByPayment,
  outstandingClosedByTable,
} from './session-sql';
import { lockSessionRow, lockTableRow } from './table-session-locks';
import { createTableSessionPublicId } from './table-session-public-id';

export type SessionScope = RestaurantAccessContext;

export interface SessionListItem {
  /** The session's opaque public id (`session-<uuid>`). */
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: Date;
  openedVia: 'FIRST_ORDER' | 'STAFF';
  closedAt: Date | null;
  closureReason: TableSessionClosureReason | null;
  branch: { id: string; name: string };
  table: { id: string; tableNumber: string };
  currencyCode: string;
  orderCount: number;
  pendingOrderCount: number;
  bill: SessionBillView;
}

export interface SessionOrderItemView {
  productId: string;
  productNameSnapshot: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  modifiers: {
    groupName: string;
    optionName: string;
    priceAdjustment: string;
  }[];
}

/** One Order Round. V1 represents a round by the Dine-In Order itself (CLAUDE.md #24). */
export interface SessionRoundView {
  roundNumber: number;
  order: {
    id: string;
    status: OrderStatus;
    type: OrderType;
    createdAt: Date;
    /** True once the restaurant accepted it: only then it counts toward the bill. */
    billable: boolean;
    currencyCode: string;
    totalAmount: string;
    items: SessionOrderItemView[];
  };
}

export interface SessionPaymentView {
  id: string;
  kind: 'PAYMENT';
  amount: string;
  method: TableSessionPaymentMethod;
  note: string | null;
  recordedAt: Date;
  recordedByMembershipId: string;
  /** Set when the record was voided: an audited accounting correction, never a refund. */
  voided: {
    at: Date;
    byMembershipId: string;
    reason: string;
  } | null;
}

export interface SessionEventView {
  type: string;
  actorType: string;
  actorMembershipId: string | null;
  occurredAt: Date;
  metadata: unknown;
}

export interface SessionDetail extends SessionListItem {
  rounds: SessionRoundView[];
  payments: SessionPaymentView[];
  events: SessionEventView[];
  /** Orders that were rejected or cancelled (kept for the audit view, never billed). */
  excludedOrderCount: number;
}

export type ListSessionsFilters = {
  branchId?: string;
  tableId?: string;
  status?: 'OPEN' | 'CLOSED';
  payment?: SessionPaymentFilter;
  limit?: number;
};

/** One table on the Dashboard board: ordering availability, the live session and any old unpaid bills. */
export interface TableBoardRow {
  table: { id: string; tableNumber: string; status: 'ACTIVE' | 'INACTIVE' };
  branch: { id: string; name: string };
  /**
   * AVAILABLE: guests may order (an OPEN session exists, or the table is not
   * locked). CLOSED_BY_STAFF: locked until staff open a session. UNAVAILABLE:
   * the table itself is inactive. Independent of payment state.
   */
  ordering: 'AVAILABLE' | 'CLOSED_BY_STAFF' | 'UNAVAILABLE';
  openSession: SessionListItem | null;
  /** CLOSED sessions of this table that still owe money (never merged into the open session). */
  outstanding: {
    sessionCount: number;
    balance: string;
    currencyCode: string;
  } | null;
}

export type TableBoardFilters = { branchId?: string };

/** The printable combined bill: every value comes from the Backend, never recomputed by the client. */
export interface SessionBillRound {
  roundNumber: number;
  orderStatus: OrderStatus;
  createdAt: Date;
  totalAmount: string;
  items: SessionOrderItemView[];
}

export interface SessionBillDocument {
  generatedAt: Date;
  restaurant: {
    name: string;
    currencyCode: string;
    logoAssetPath: string | null;
  };
  branch: { name: string };
  table: { tableNumber: string };
  session: {
    id: string;
    status: 'OPEN' | 'CLOSED';
    openedAt: Date;
    closedAt: Date | null;
  };
  /** Accepted (billable) orders, by round. */
  rounds: SessionBillRound[];
  /** PENDING orders: awaiting acceptance, NOT included in the totals. */
  awaitingRounds: SessionBillRound[];
  totals: SessionBillView;
  /** Active (non-voided) payments only. */
  payments: {
    method: TableSessionPaymentMethod;
    amount: string;
    recordedAt: Date;
  }[];
  voidedPaymentCount: number;
}

export type GetBillResult =
  { outcome: 'found'; data: SessionBillDocument } | { outcome: 'notFound' };

export type GetSessionResult =
  { outcome: 'found'; data: SessionDetail } | { outcome: 'notFound' };

export type OpenSessionResult =
  | { outcome: 'opened'; data: SessionDetail }
  | { outcome: 'tableNotFound' }
  | { outcome: 'tableInactive' }
  | { outcome: 'alreadyOpen'; sessionId: string };

export type CloseSessionResult =
  | { outcome: 'closed'; data: SessionDetail; alreadyClosed: boolean }
  | { outcome: 'notFound' }
  | { outcome: 'pendingOrders'; pendingOrderCount: number }
  | { outcome: 'permissionDenied' };

export interface RecordPaymentInput {
  clientRequestId: string;
  method: TableSessionPaymentMethod;
  expectedAmount: string;
  note?: string;
}

export type RecordPaymentResult =
  | { outcome: 'recorded'; data: SessionDetail; replayed: boolean }
  | { outcome: 'notFound' }
  | { outcome: 'notClosed' }
  | { outcome: 'nothingToSettle' }
  | { outcome: 'amountMismatch'; balance: string };

export type VoidPaymentResult =
  | { outcome: 'voided'; data: SessionDetail }
  | { outcome: 'notFound' }
  | { outcome: 'paymentNotFound' }
  | { outcome: 'alreadyVoided' };

/** Escapes the transaction callback so the outer catch can return a distinct outcome. */
class AlreadyOpenError extends Error {
  constructor(readonly sessionId: string) {
    super('table already has an OPEN session');
  }
}
class PendingOrdersError extends Error {
  constructor(readonly count: number) {
    super('session has pending orders');
  }
}
class PermissionDeniedError extends Error {}
class TableNotOpenableError extends Error {}

const DETAIL_SELECT = {
  id: true,
  publicId: true,
  status: true,
  openedAt: true,
  openedVia: true,
  closedAt: true,
  closureReason: true,
  branchId: true,
  restaurantId: true,
  table: { select: { id: true, tableNumber: true } },
  orders: {
    orderBy: { roundNumber: 'asc' },
    select: {
      id: true,
      status: true,
      type: true,
      createdAt: true,
      roundNumber: true,
      currencyCode: true,
      totalAmount: true,
      items: {
        orderBy: { createdAt: 'asc' },
        select: {
          productId: true,
          productNameSnapshot: true,
          unitPrice: true,
          quantity: true,
          lineTotal: true,
          modifiers: {
            orderBy: { displayOrder: 'asc' },
            select: {
              modifierGroupNameSnapshot: true,
              modifierOptionNameSnapshot: true,
              priceAdjustmentSnapshot: true,
            },
          },
        },
      },
    },
  },
  payments: {
    orderBy: { recordedAt: 'asc' },
    select: {
      id: true,
      kind: true,
      amount: true,
      method: true,
      note: true,
      recordedAt: true,
      recordedByMembershipId: true,
      voidedAt: true,
      voidedByMembershipId: true,
      voidReason: true,
    },
  },
  events: {
    orderBy: { occurredAt: 'asc' },
    select: {
      type: true,
      actorType: true,
      actorMembershipId: true,
      occurredAt: true,
      metadata: true,
    },
  },
} satisfies Prisma.TableSessionSelect;

const LIST_SELECT = {
  id: true,
  publicId: true,
  status: true,
  openedAt: true,
  openedVia: true,
  closedAt: true,
  closureReason: true,
  branchId: true,
  table: { select: { id: true, tableNumber: true } },
  orders: { select: { status: true, totalAmount: true, currencyCode: true } },
  payments: { select: { amount: true, voidedAt: true } },
} satisfies Prisma.TableSessionSelect;

type ListRow = Prisma.TableSessionGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.TableSessionGetPayload<{
  select: typeof DETAIL_SELECT;
}>;

function toListItem(
  row: ListRow,
  branchName: string,
  fallbackCurrency: string,
): SessionListItem {
  const bill = computeSessionBill({
    orders: row.orders.map((o) => ({
      status: o.status,
      totalAmount: o.totalAmount,
    })),
    payments: row.payments,
  });
  return {
    id: row.publicId,
    status: row.status,
    openedAt: row.openedAt,
    openedVia: row.openedVia,
    closedAt: row.closedAt,
    closureReason: row.closureReason,
    branch: { id: row.branchId, name: branchName },
    table: row.table,
    currencyCode: row.orders[0]?.currencyCode ?? fallbackCurrency,
    orderCount: row.orders.length,
    pendingOrderCount: row.orders.filter((o) => o.status === 'PENDING').length,
    bill: toBillView(bill),
  };
}

/**
 * Staff-facing Table Session operations (Table Sessions design v3, Slices 2-4).
 *
 * Authorization model: the controller enforces the route Permission
 * (`sessions.view|open|close|settle`); this service resolves BRANCH scope per
 * row through the existing `BranchAccessService` (exactly like orders), so a
 * foreign-Restaurant session and a session in a Branch outside the
 * Membership's scope both converge on one `notFound` outcome. Every query is
 * explicitly scoped by `restaurantId`.
 *
 * Concurrency: every mutation takes the fixed lock chain from
 * `table-session-locks.ts` (tables row, then session row, then orders), so it
 * serializes against guest order creation, other staff actions and the order
 * status transitions that affect the bill.
 */
@Injectable()
export class TableSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccessService: BranchAccessService,
  ) {}

  // ------------------------------------------------------------------ reads

  async listSessions(
    scope: SessionScope,
    filters: ListSessionsFilters,
  ): Promise<SessionListItem[]> {
    const branchIdFilter = await resolveOrderBranchIdFilter(
      this.prisma,
      scope,
      filters.branchId,
    );
    if (branchIdFilter && branchIdFilter.length === 0) {
      return [];
    }
    const limit = Math.min(
      Math.max(filters.limit ?? SESSION_LIST_DEFAULT_LIMIT, 1),
      SESSION_LIST_MAX_LIMIT,
    );

    let rows: ListRow[];
    if (filters.payment) {
      // The payment status is DERIVED (never stored). It is evaluated set-based
      // in SQL, so the filtered list is exact: there is no scan cap that could
      // silently hide older unpaid sessions.
      const ids = await findSessionIdsByPayment(this.prisma, {
        restaurantId: scope.restaurantId,
        branchIds: branchIdFilter,
        tableId: filters.tableId,
        status: filters.status,
        payment: filters.payment,
        limit,
      });
      const found =
        ids.length === 0
          ? []
          : await this.prisma.tableSession.findMany({
              where: { restaurantId: scope.restaurantId, id: { in: ids } },
              select: LIST_SELECT,
            });
      const byId = new Map(found.map((row) => [row.id, row]));
      rows = ids
        .map((id) => byId.get(id))
        .filter((row): row is ListRow => row !== undefined);
    } else {
      rows = await this.prisma.tableSession.findMany({
        where: {
          restaurantId: scope.restaurantId,
          ...(branchIdFilter ? { branchId: { in: branchIdFilter } } : {}),
          ...(filters.tableId ? { tableId: filters.tableId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
        },
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: LIST_SELECT,
      });
    }

    const [branches, restaurant] = await Promise.all([
      this.prisma.branch.findMany({
        where: {
          restaurantId: scope.restaurantId,
          id: { in: [...new Set(rows.map((r) => r.branchId))] },
        },
        select: { id: true, name: true },
      }),
      this.prisma.restaurant.findUnique({
        where: { id: scope.restaurantId },
        select: { currencyCode: true },
      }),
    ]);
    const branchNames = new Map(branches.map((b) => [b.id, b.name]));
    const currency = restaurant?.currencyCode ?? '';

    return rows.map((row) =>
      toListItem(row, branchNames.get(row.branchId) ?? '', currency),
    );
  }

  async getSession(
    scope: SessionScope,
    publicId: string,
  ): Promise<GetSessionResult> {
    const located = await this.locate(scope, publicId);
    if (!located) {
      return { outcome: 'notFound' };
    }
    return { outcome: 'found', data: await this.loadDetail(scope, located.id) };
  }

  /**
   * Dashboard board: one row per table in the caller's Branch scope with its
   * ordering availability (separate from lifecycle and payment), the live OPEN
   * session summary and the old unpaid closed bills. Tenant- and
   * Branch-scoped exactly like the list.
   */
  async getBoard(
    scope: SessionScope,
    filters: TableBoardFilters,
  ): Promise<TableBoardRow[]> {
    const branchIdFilter = await resolveOrderBranchIdFilter(
      this.prisma,
      scope,
      filters.branchId,
    );
    if (branchIdFilter && branchIdFilter.length === 0) {
      return [];
    }

    const [tables, branches, restaurant, outstanding] = await Promise.all([
      this.prisma.table.findMany({
        where: {
          restaurantId: scope.restaurantId,
          ...(branchIdFilter ? { branchId: { in: branchIdFilter } } : {}),
        },
        orderBy: [{ branchId: 'asc' }, { tableNumber: 'asc' }],
        select: {
          id: true,
          tableNumber: true,
          status: true,
          branchId: true,
          staffOpenRequired: true,
        },
      }),
      this.prisma.branch.findMany({
        where: {
          restaurantId: scope.restaurantId,
          ...(branchIdFilter ? { id: { in: branchIdFilter } } : {}),
        },
        select: { id: true, name: true },
      }),
      this.prisma.restaurant.findUnique({
        where: { id: scope.restaurantId },
        select: { currencyCode: true },
      }),
      outstandingClosedByTable(this.prisma, {
        restaurantId: scope.restaurantId,
        branchIds: branchIdFilter,
      }),
    ]);
    const currency = restaurant?.currencyCode ?? '';
    const branchNames = new Map(branches.map((b) => [b.id, b.name]));

    const openRows =
      tables.length === 0
        ? []
        : await this.prisma.tableSession.findMany({
            where: {
              restaurantId: scope.restaurantId,
              status: 'OPEN',
              tableId: { in: tables.map((t) => t.id) },
            },
            select: LIST_SELECT,
          });
    const openByTable = new Map(openRows.map((row) => [row.table.id, row]));

    return tables.map((table) => {
      const open = openByTable.get(table.id) ?? null;
      const owed = outstanding.get(table.id);
      const branchName = branchNames.get(table.branchId) ?? '';
      let ordering: TableBoardRow['ordering'] = 'AVAILABLE';
      if (table.status !== 'ACTIVE') {
        ordering = 'UNAVAILABLE';
      } else if (!open && table.staffOpenRequired) {
        ordering = 'CLOSED_BY_STAFF';
      }
      return {
        table: {
          id: table.id,
          tableNumber: table.tableNumber,
          status: table.status,
        },
        branch: { id: table.branchId, name: branchName },
        ordering,
        openSession: open ? toListItem(open, branchName, currency) : null,
        outstanding: owed
          ? {
              sessionCount: owed.sessionCount,
              balance: formatMoney(owed.balance),
              currencyCode: currency,
            }
          : null,
      };
    });
  }

  /** The combined bill document for printing. Read-only; see `recordBillPrinted` for the audit event. */
  async getBill(scope: SessionScope, publicId: string): Promise<GetBillResult> {
    const located = await this.locate(scope, publicId);
    if (!located) {
      return { outcome: 'notFound' };
    }
    const detail = await this.loadDetail(scope, located.id);
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: scope.restaurantId },
      select: { name: true, currencyCode: true, logoAssetPath: true },
    });
    const toRound = (round: SessionRoundView): SessionBillRound => ({
      roundNumber: round.roundNumber,
      orderStatus: round.order.status,
      createdAt: round.order.createdAt,
      totalAmount: round.order.totalAmount,
      items: round.order.items,
    });
    return {
      outcome: 'found',
      data: {
        generatedAt: new Date(),
        restaurant: {
          name: restaurant?.name ?? '',
          currencyCode: restaurant?.currencyCode ?? detail.currencyCode,
          logoAssetPath: restaurant?.logoAssetPath ?? null,
        },
        branch: { name: detail.branch.name },
        table: { tableNumber: detail.table.tableNumber },
        session: {
          id: detail.id,
          status: detail.status,
          openedAt: detail.openedAt,
          closedAt: detail.closedAt,
        },
        rounds: detail.rounds.filter((r) => r.order.billable).map(toRound),
        awaitingRounds: detail.rounds
          .filter((r) => r.order.status === 'PENDING')
          .map(toRound),
        totals: detail.bill,
        payments: detail.payments
          .filter((p) => p.voided === null)
          .map((p) => ({
            method: p.method,
            amount: p.amount,
            recordedAt: p.recordedAt,
          })),
        voidedPaymentCount: detail.payments.filter((p) => p.voided !== null)
          .length,
      },
    };
  }

  /**
   * Audit only: staff pressed Print on the combined bill (design v3 #54). It
   * changes nothing about the session, its bill or its payments.
   */
  async recordBillPrinted(
    scope: SessionScope,
    publicId: string,
  ): Promise<{ outcome: 'recorded' } | { outcome: 'notFound' }> {
    const located = await this.locate(scope, publicId);
    if (!located) {
      return { outcome: 'notFound' };
    }
    await this.prisma.tableSessionEvent.create({
      data: {
        restaurantId: scope.restaurantId,
        branchId: located.branchId,
        tableSessionId: located.id,
        type: 'BILL_PRINTED',
        actorType: 'STAFF',
        actorMembershipId: scope.membershipId,
      },
    });
    return { outcome: 'recorded' };
  }

  // --------------------------------------------------------------- open/close

  /**
   * Manual open. Locks the table row (tenant/branch scoped), refuses when an
   * OPEN session already exists, creates the OPEN session (`openedVia = STAFF`),
   * clears `staff_open_required` and writes SESSION_OPENED -- all atomically.
   * An older CLOSED session (paid or unpaid) is never touched or reopened.
   */
  async openSession(
    scope: SessionScope,
    input: { tableId: string },
  ): Promise<OpenSessionResult> {
    if (!isWellFormedUuid(input.tableId)) {
      return { outcome: 'tableNotFound' };
    }
    const table = await this.prisma.table.findFirst({
      where: { id: input.tableId, restaurantId: scope.restaurantId },
      select: { id: true, branchId: true, status: true },
    });
    if (!table || !(await this.branchInScope(scope, table.branchId))) {
      return { outcome: 'tableNotFound' };
    }
    if (table.status !== 'ACTIVE') {
      return { outcome: 'tableInactive' };
    }

    try {
      const sessionId = await this.prisma.$transaction(async (tx) => {
        const locked = await lockTableRow(tx, {
          tableId: table.id,
          restaurantId: scope.restaurantId,
          branchId: table.branchId,
        });
        if (!locked || locked.status !== 'ACTIVE') {
          throw new TableNotOpenableError();
        }
        const open = await tx.tableSession.findFirst({
          where: {
            restaurantId: scope.restaurantId,
            branchId: table.branchId,
            tableId: table.id,
            status: 'OPEN',
          },
          select: { publicId: true },
        });
        if (open) {
          throw new AlreadyOpenError(open.publicId);
        }
        const session = await tx.tableSession.create({
          data: {
            publicId: createTableSessionPublicId(),
            restaurantId: scope.restaurantId,
            branchId: table.branchId,
            tableId: table.id,
            status: 'OPEN',
            openedVia: 'STAFF',
            openedByMembershipId: scope.membershipId,
          },
          select: { id: true },
        });
        await tx.table.update({
          where: { id: table.id },
          data: { staffOpenRequired: false },
        });
        await tx.tableSessionEvent.create({
          data: {
            restaurantId: scope.restaurantId,
            branchId: table.branchId,
            tableSessionId: session.id,
            type: 'SESSION_OPENED',
            actorType: 'STAFF',
            actorMembershipId: scope.membershipId,
            metadata: { openedVia: 'STAFF' },
          },
        });
        return session.id;
      });
      return {
        outcome: 'opened',
        data: await this.loadDetail(scope, sessionId),
      };
    } catch (error) {
      if (error instanceof AlreadyOpenError) {
        return { outcome: 'alreadyOpen', sessionId: error.sessionId };
      }
      if (error instanceof TableNotOpenableError) {
        return { outcome: 'tableInactive' };
      }
      throw error;
    }
  }

  /**
   * Closing stops further Table QR ordering (it sets `staff_open_required`) and
   * never touches payment. Idempotent: closing an already CLOSED session returns
   * it unchanged with no second event. PENDING orders require an explicit
   * KEEP / REJECT choice (P3); REJECT reuses the existing reject transition
   * rules (PENDING -> REJECTED with its OrderStatusEvent) and additionally needs
   * `orders.reject`.
   */
  async closeSession(
    scope: SessionScope,
    publicId: string,
    input: CloseSessionDto,
  ): Promise<CloseSessionResult> {
    const located = await this.locate(scope, publicId);
    if (!located) {
      return { outcome: 'notFound' };
    }

    try {
      const alreadyClosed = await this.prisma.$transaction(async (tx) => {
        await lockTableRow(tx, {
          tableId: located.tableId,
          restaurantId: scope.restaurantId,
          branchId: located.branchId,
        });
        const session = await lockSessionRow(tx, {
          sessionId: located.id,
          restaurantId: scope.restaurantId,
        });
        if (!session) {
          throw new TableNotOpenableError();
        }
        if (session.status === 'CLOSED') {
          return true;
        }

        const pending = await tx.order.findMany({
          where: { tableSessionId: located.id, status: 'PENDING' },
          select: { id: true },
        });
        let rejected = 0;
        if (pending.length > 0) {
          if (!input.pendingOrders) {
            throw new PendingOrdersError(pending.length);
          }
          if (input.pendingOrders === 'REJECT') {
            if (!hasPermission(scope.permissions, PERMISSIONS.ORDERS_REJECT)) {
              throw new PermissionDeniedError();
            }
            for (const order of pending) {
              // The same conditional update the staff reject action performs.
              const result = await tx.order.updateMany({
                where: {
                  id: order.id,
                  restaurantId: scope.restaurantId,
                  status: 'PENDING',
                },
                data: { status: 'REJECTED' },
              });
              if (result.count > 0) {
                rejected += 1;
                await tx.orderStatusEvent.create({
                  data: {
                    restaurantId: scope.restaurantId,
                    branchId: located.branchId,
                    orderId: order.id,
                    previousStatus: 'PENDING',
                    newStatus: 'REJECTED',
                  },
                });
              }
            }
          }
        }

        const reason = input.reason ?? 'NORMAL';
        await tx.tableSession.update({
          where: { id: located.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            closedByMembershipId: scope.membershipId,
            closureReason: reason,
          },
        });
        // Table QR ordering stays locked until staff open a new session.
        await tx.table.update({
          where: { id: located.tableId },
          data: { staffOpenRequired: true },
        });
        await tx.tableSessionEvent.create({
          data: {
            restaurantId: scope.restaurantId,
            branchId: located.branchId,
            tableSessionId: located.id,
            type: 'SESSION_CLOSED',
            actorType: 'STAFF',
            actorMembershipId: scope.membershipId,
            metadata: {
              reason,
              pendingOrders: pending.length > 0 ? input.pendingOrders : null,
              pendingOrderCount: pending.length,
              rejectedOrderCount: rejected,
            },
          },
        });
        return false;
      });
      return {
        outcome: 'closed',
        alreadyClosed,
        data: await this.loadDetail(scope, located.id),
      };
    } catch (error) {
      if (error instanceof PendingOrdersError) {
        return { outcome: 'pendingOrders', pendingOrderCount: error.count };
      }
      if (error instanceof PermissionDeniedError) {
        return { outcome: 'permissionDenied' };
      }
      if (error instanceof TableNotOpenableError) {
        return { outcome: 'notFound' };
      }
      throw error;
    }
  }

  // ----------------------------------------------------------------- payments

  /**
   * Full-balance settlement of a CLOSED session (V1). Under the session lock:
   * an existing record with the same `clientRequestId` is returned as a replay
   * (idempotent); otherwise the session must be CLOSED, the live balance must
   * be positive and must equal `expectedAmount`. The amount recorded is the
   * Backend's own computed balance, never a client number.
   */
  async recordPayment(
    scope: SessionScope,
    publicId: string,
    input: RecordPaymentInput,
  ): Promise<RecordPaymentResult> {
    const located = await this.locate(scope, publicId);
    if (!located) {
      return { outcome: 'notFound' };
    }

    const result = await this.prisma.$transaction(
      async (
        tx,
      ): Promise<
        | { kind: 'recorded'; replayed: boolean }
        | { kind: 'notFound' }
        | { kind: 'notClosed' }
        | { kind: 'nothingToSettle' }
        | { kind: 'mismatch'; balance: Prisma.Decimal }
      > => {
        const session = await lockSessionRow(tx, {
          sessionId: located.id,
          restaurantId: scope.restaurantId,
        });
        if (!session) {
          return { kind: 'notFound' };
        }

        const existing = await tx.tableSessionPayment.findUnique({
          where: {
            tableSessionId_clientRequestId: {
              tableSessionId: located.id,
              clientRequestId: input.clientRequestId,
            },
          },
          select: { id: true },
        });
        if (existing) {
          return { kind: 'recorded', replayed: true };
        }

        if (session.status !== 'CLOSED') {
          return { kind: 'notClosed' };
        }

        const [orders, payments] = await Promise.all([
          tx.order.findMany({
            where: { tableSessionId: located.id },
            select: { status: true, totalAmount: true },
          }),
          tx.tableSessionPayment.findMany({
            where: { tableSessionId: located.id },
            select: { amount: true, voidedAt: true },
          }),
        ]);
        const bill = computeSessionBill({ orders, payments });
        if (bill.balance.lessThanOrEqualTo(0)) {
          return { kind: 'nothingToSettle' };
        }
        if (!new Prisma.Decimal(input.expectedAmount).equals(bill.balance)) {
          return { kind: 'mismatch', balance: bill.balance };
        }

        const payment = await tx.tableSessionPayment.create({
          data: {
            restaurantId: scope.restaurantId,
            branchId: located.branchId,
            tableSessionId: located.id,
            kind: 'PAYMENT',
            amount: bill.balance,
            method: input.method,
            clientRequestId: input.clientRequestId,
            note: input.note ? input.note : null,
            recordedByMembershipId: scope.membershipId,
          },
          select: { id: true },
        });
        await tx.tableSessionEvent.create({
          data: {
            restaurantId: scope.restaurantId,
            branchId: located.branchId,
            tableSessionId: located.id,
            type: 'PAYMENT_RECORDED',
            actorType: 'STAFF',
            actorMembershipId: scope.membershipId,
            metadata: {
              paymentId: payment.id,
              amount: formatMoney(bill.balance),
              method: input.method,
            },
          },
        });
        return { kind: 'recorded', replayed: false };
      },
    );

    switch (result.kind) {
      case 'notFound':
        return { outcome: 'notFound' };
      case 'notClosed':
        return { outcome: 'notClosed' };
      case 'nothingToSettle':
        return { outcome: 'nothingToSettle' };
      case 'mismatch':
        return {
          outcome: 'amountMismatch',
          balance: formatMoney(result.balance),
        };
      case 'recorded':
        return {
          outcome: 'recorded',
          replayed: result.replayed,
          data: await this.loadDetail(scope, located.id),
        };
    }
  }

  /**
   * Voids a payment record: an audited accounting correction (mandatory reason),
   * never a refund. The record is kept; only its void fields are set. The
   * session stays exactly as it was (a CLOSED session is not reopened).
   */
  async voidPayment(
    scope: SessionScope,
    publicId: string,
    paymentId: string,
    reason: string,
  ): Promise<VoidPaymentResult> {
    const located = await this.locate(scope, publicId);
    if (!located || !isWellFormedUuid(paymentId)) {
      return { outcome: located ? 'paymentNotFound' : 'notFound' };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const session = await lockSessionRow(tx, {
        sessionId: located.id,
        restaurantId: scope.restaurantId,
      });
      if (!session) {
        return 'notFound' as const;
      }
      const payment = await tx.tableSessionPayment.findFirst({
        where: {
          id: paymentId,
          tableSessionId: located.id,
          restaurantId: scope.restaurantId,
        },
        select: { id: true, amount: true, voidedAt: true },
      });
      if (!payment) {
        return 'paymentNotFound' as const;
      }
      if (payment.voidedAt) {
        return 'alreadyVoided' as const;
      }
      await tx.tableSessionPayment.update({
        where: { id: payment.id },
        data: {
          voidedAt: new Date(),
          voidedByMembershipId: scope.membershipId,
          voidReason: reason,
        },
      });
      await tx.tableSessionEvent.create({
        data: {
          restaurantId: scope.restaurantId,
          branchId: located.branchId,
          tableSessionId: located.id,
          type: 'PAYMENT_VOIDED',
          actorType: 'STAFF',
          actorMembershipId: scope.membershipId,
          // The free-text reason lives on the payment row; the event keeps ids only.
          metadata: {
            paymentId: payment.id,
            amount: formatMoney(payment.amount),
          },
        },
      });
      return 'voided' as const;
    });

    if (result === 'voided') {
      return {
        outcome: 'voided',
        data: await this.loadDetail(scope, located.id),
      };
    }
    return { outcome: result };
  }

  // ---------------------------------------------------------------- internals

  /** Resolves a session by its PUBLIC id within the tenant AND the Membership's Branch scope. */
  private async locate(
    scope: SessionScope,
    publicId: string,
  ): Promise<{ id: string; branchId: string; tableId: string } | null> {
    if (
      typeof publicId !== 'string' ||
      publicId.length === 0 ||
      publicId.length > 100
    ) {
      return null;
    }
    const session = await this.prisma.tableSession.findFirst({
      where: { publicId, restaurantId: scope.restaurantId },
      select: { id: true, branchId: true, tableId: true },
    });
    if (!session || !(await this.branchInScope(scope, session.branchId))) {
      return null;
    }
    return session;
  }

  private async branchInScope(
    scope: SessionScope,
    branchId: string,
  ): Promise<boolean> {
    const result = await this.branchAccessService.resolveBranchManagementAccess(
      scope,
      branchId,
    );
    return result.outcome === 'authorized';
  }

  private async loadDetail(
    scope: SessionScope,
    sessionId: string,
  ): Promise<SessionDetail> {
    const [row, restaurant] = await Promise.all([
      this.prisma.tableSession.findFirstOrThrow({
        where: { id: sessionId, restaurantId: scope.restaurantId },
        select: DETAIL_SELECT,
      }),
      this.prisma.restaurant.findUnique({
        where: { id: scope.restaurantId },
        select: { currencyCode: true },
      }),
    ]);
    const branch = await this.prisma.branch.findFirst({
      where: { id: row.branchId, restaurantId: scope.restaurantId },
      select: { name: true },
    });
    return toDetail(row, branch?.name ?? '', restaurant?.currencyCode ?? '');
  }
}

function toDetail(
  row: DetailRow,
  branchName: string,
  fallbackCurrency: string,
): SessionDetail {
  const base = toListItem(
    {
      id: row.id,
      publicId: row.publicId,
      status: row.status,
      openedAt: row.openedAt,
      openedVia: row.openedVia,
      closedAt: row.closedAt,
      closureReason: row.closureReason,
      branchId: row.branchId,
      table: row.table,
      orders: row.orders.map((o) => ({
        status: o.status,
        totalAmount: o.totalAmount,
        currencyCode: o.currencyCode,
      })),
      payments: row.payments.map((p) => ({
        amount: p.amount,
        voidedAt: p.voidedAt,
      })),
    },
    branchName,
    fallbackCurrency,
  );

  const billable = new Set<OrderStatus>([
    'ACCEPTED',
    'PREPARING',
    'READY',
    'SERVED',
  ]);
  return {
    ...base,
    excludedOrderCount: row.orders.filter(
      (o) => o.status === 'REJECTED' || o.status === 'CANCELLED',
    ).length,
    rounds: row.orders.map((order) => ({
      roundNumber: order.roundNumber ?? 0,
      order: {
        id: order.id,
        status: order.status,
        type: order.type,
        createdAt: order.createdAt,
        billable: billable.has(order.status),
        currencyCode: order.currencyCode,
        totalAmount: formatMoney(order.totalAmount),
        items: order.items.map((item) => ({
          productId: item.productId,
          productNameSnapshot: item.productNameSnapshot,
          unitPrice: formatMoney(item.unitPrice),
          quantity: item.quantity,
          lineTotal: formatMoney(item.lineTotal),
          modifiers: item.modifiers.map((m) => ({
            groupName: m.modifierGroupNameSnapshot,
            optionName: m.modifierOptionNameSnapshot,
            priceAdjustment: formatMoney(m.priceAdjustmentSnapshot),
          })),
        })),
      },
    })),
    payments: row.payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      amount: formatMoney(p.amount),
      method: p.method,
      note: p.note,
      recordedAt: p.recordedAt,
      recordedByMembershipId: p.recordedByMembershipId,
      voided:
        p.voidedAt && p.voidedByMembershipId && p.voidReason
          ? {
              at: p.voidedAt,
              byMembershipId: p.voidedByMembershipId,
              reason: p.voidReason,
            }
          : null,
    })),
    events: row.events.map((e) => ({
      type: e.type,
      actorType: e.actorType,
      actorMembershipId: e.actorMembershipId,
      occurredAt: e.occurredAt,
      metadata: e.metadata,
    })),
  };
}
