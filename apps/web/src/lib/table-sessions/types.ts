import type { OrderStatus, OrderType } from '../orders/types';

/**
 * Mirrors the Backend's Table Session read models (Table Sessions design v3).
 * Every money value is a DECIMAL STRING computed by the Backend from order
 * snapshots and the payment ledger -- the Web never calculates an
 * authoritative total, balance or payment status itself.
 */

export type SessionLifecycle = 'OPEN' | 'CLOSED';
export type SessionPaymentStatus =
  | 'NO_CHARGE'
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERPAID';
export type PaymentMethod = 'CASH' | 'CARD' | 'OTHER';
export type ClosureReason =
  | 'NORMAL'
  | 'FIRST_ORDER_REJECTED'
  | 'STAFF_CORRECTION'
  | 'OTHER';

export interface SessionBillView {
  eligibleTotal: string;
  pendingAmount: string;
  paidAmount: string;
  balance: string;
  paymentStatus: SessionPaymentStatus;
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
  bill: SessionBillView;
}

export interface SessionOrderItem {
  productId: string;
  productNameSnapshot: string;
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
    billable: boolean;
    currencyCode: string;
    totalAmount: string;
    items: SessionOrderItem[];
  };
}

export interface SessionPayment {
  id: string;
  kind: 'PAYMENT';
  amount: string;
  method: PaymentMethod;
  note: string | null;
  recordedAt: string;
  recordedByMembershipId: string;
  voided: { at: string; byMembershipId: string; reason: string } | null;
}

export interface SessionEvent {
  type:
    | 'SESSION_OPENED'
    | 'SESSION_CLOSED'
    | 'PAYMENT_RECORDED'
    | 'PAYMENT_VOIDED'
    | 'BILL_PRINTED';
  actorType: 'GUEST' | 'STAFF' | 'SYSTEM';
  actorMembershipId: string | null;
  occurredAt: string;
  metadata: unknown;
}

export interface SessionDetail extends SessionListItem {
  rounds: SessionRound[];
  payments: SessionPayment[];
  events: SessionEvent[];
  excludedOrderCount: number;
}

export type TableOrderingState = 'AVAILABLE' | 'CLOSED_BY_STAFF' | 'UNAVAILABLE';

export interface TableBoardRow {
  table: { id: string; tableNumber: string; status: 'ACTIVE' | 'INACTIVE' };
  branch: { id: string; name: string };
  ordering: TableOrderingState;
  openSession: SessionListItem | null;
  outstanding: { sessionCount: number; balance: string; currencyCode: string } | null;
}

export interface SessionBillRound {
  roundNumber: number;
  orderStatus: OrderStatus;
  createdAt: string;
  totalAmount: string;
  items: SessionOrderItem[];
}

/** The printable combined bill. Rendered exactly as received. */
export interface SessionBillDocument {
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
  rounds: SessionBillRound[];
  awaitingRounds: SessionBillRound[];
  totals: SessionBillView;
  payments: { method: PaymentMethod; amount: string; recordedAt: string }[];
  voidedPaymentCount: number;
}
