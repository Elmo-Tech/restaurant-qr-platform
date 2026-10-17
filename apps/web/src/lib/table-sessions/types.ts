import type { OrderStatus, OrderType } from '../orders/types';

/**
 * Mirrors the Backend's Table Session read models (Table Sessions design v3,
 * V1 scope correction). Every money value is a DECIMAL STRING computed by the
 * Backend from order snapshots -- the Web never calculates an authoritative
 * total itself.
 *
 * V1 is a QR menu and ordering platform, not a POS or accounting system: these
 * models carry order totals only. There is no payment, balance or settlement
 * state anywhere in them.
 */

export type SessionLifecycle = 'OPEN' | 'CLOSED';
export type ClosureReason =
  | 'NORMAL'
  | 'FIRST_ORDER_REJECTED'
  | 'STAFF_CORRECTION'
  | 'OTHER';

/** Order value of a session: accepted orders count; pending ones are shown separately. */
export interface SessionTotals {
  acceptedTotal: string;
  pendingTotal: string;
}

export interface SessionListItem {
  /** The session's opaque public id (`session-<uuid>`). */
  id: string;
  status: SessionLifecycle;
  openedAt: string;
  openedVia: 'FIRST_ORDER' | 'STAFF';
  closedAt: string | null;
  closureReason: ClosureReason | null;
  branch: { id: string; name: string };
  table: { id: string; tableNumber: string };
  currencyCode: string;
  orderCount: number;
  pendingOrderCount: number;
  totals: SessionTotals;
}

export interface SessionOrderItem {
  productId: string;
  productNameSnapshot: string;
  /** The size chosen for this line (DEC-041), or null for a product without sizes. */
  variantName: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  modifiers: { groupName: string; optionName: string; priceAdjustment: string }[];
}

export interface SessionRound {
  roundNumber: number;
  order: {
    id: string;
    status: OrderStatus;
    type: OrderType;
    createdAt: string;
    /** True once the restaurant accepted it: only then it counts toward the total. */
    billable: boolean;
    currencyCode: string;
    totalAmount: string;
    items: SessionOrderItem[];
  };
}

export interface SessionEvent {
  type: 'SESSION_OPENED' | 'SESSION_CLOSED' | 'BILL_PRINTED';
  actorType: 'GUEST' | 'STAFF' | 'SYSTEM';
  actorMembershipId: string | null;
  occurredAt: string;
  metadata: unknown;
}

export interface SessionDetail extends SessionListItem {
  rounds: SessionRound[];
  events: SessionEvent[];
  excludedOrderCount: number;
}

export type TableOrderingState = 'AVAILABLE' | 'CLOSED_BY_STAFF' | 'UNAVAILABLE';

export interface TableBoardRow {
  table: { id: string; tableNumber: string; status: 'ACTIVE' | 'INACTIVE' };
  branch: { id: string; name: string };
  ordering: TableOrderingState;
  openSession: SessionListItem | null;
}

export interface SessionSummaryRound {
  roundNumber: number;
  orderStatus: OrderStatus;
  createdAt: string;
  totalAmount: string;
  items: SessionOrderItem[];
}

/** The printable table order summary. Rendered exactly as received. */
export interface SessionSummaryDocument {
  generatedAt: string;
  restaurant: { name: string; currencyCode: string; logoAssetPath: string | null };
  branch: { name: string };
  table: { tableNumber: string };
  session: {
    id: string;
    status: SessionLifecycle;
    openedAt: string;
    closedAt: string | null;
  };
  rounds: SessionSummaryRound[];
  awaitingRounds: SessionSummaryRound[];
  totals: SessionTotals;
}
