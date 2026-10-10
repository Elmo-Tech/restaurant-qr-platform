import type {
  SessionBillDocument,
  SessionDetail,
  SessionEventView,
  SessionListItem,
  TableBoardRow,
} from './table-sessions.service';

/**
 * V1 transport views of the Table Session read models.
 *
 * Restaurant QR Platform V1 is a QR menu and ordering platform, not a POS or an
 * accounting system. The service still derives a payment ledger view for the
 * deferred payment infrastructure; NOTHING financial leaves the API in V1. These
 * mappers are the single place where a service model becomes a Staff response,
 * so a payment status, a paid amount, a balance, a payment record or an
 * "unpaid" total can never leak into a V1 client by accident.
 *
 * What a V1 session total means: the sum of the ACCEPTED orders' snapshot
 * totals (`acceptedTotal`) and, separately, the PENDING orders that are not
 * counted yet (`pendingTotal`). It is an order value, never a claim that
 * anything was paid.
 */

export interface SessionTotalsView {
  /** Sum of accepted (kitchen-bound) orders' snapshot totals. */
  acceptedTotal: string;
  /** Sum of PENDING orders: shown separately, not counted until accepted. */
  pendingTotal: string;
}

export type StaffSessionListItem = Omit<SessionListItem, 'bill'> & {
  totals: SessionTotalsView;
};

export type StaffSessionDetail = Omit<
  SessionDetail,
  'bill' | 'payments' | 'events'
> & {
  totals: SessionTotalsView;
  events: SessionEventView[];
};

export type StaffTableBoardRow = Omit<TableBoardRow, 'openSession'> & {
  openSession: StaffSessionListItem | null;
};

export type StaffSessionSummaryDocument = Omit<
  SessionBillDocument,
  'totals' | 'payments' | 'voidedPaymentCount'
> & { totals: SessionTotalsView };

/** Ledger event types belong to the deferred payment infrastructure and are never shown in V1. */
const DEFERRED_EVENT_TYPES = new Set(['PAYMENT_RECORDED', 'PAYMENT_VOIDED']);

function totalsOf(bill: {
  eligibleTotal: string;
  pendingAmount: string;
}): SessionTotalsView {
  return {
    acceptedTotal: bill.eligibleTotal,
    pendingTotal: bill.pendingAmount,
  };
}

export function toStaffListItem(item: SessionListItem): StaffSessionListItem {
  const { bill, ...rest } = item;
  return { ...rest, totals: totalsOf(bill) };
}

export function toStaffDetail(detail: SessionDetail): StaffSessionDetail {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `payments` is deliberately dropped
  const { bill, payments, events, ...rest } = detail;
  return {
    ...rest,
    totals: totalsOf(bill),
    events: events.filter((event) => !DEFERRED_EVENT_TYPES.has(event.type)),
  };
}

export function toStaffBoardRow(row: TableBoardRow): StaffTableBoardRow {
  return {
    ...row,
    openSession: row.openSession ? toStaffListItem(row.openSession) : null,
  };
}

export function toStaffSummary(
  document: SessionBillDocument,
): StaffSessionSummaryDocument {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- payment fields are deliberately dropped
  const { totals, payments, voidedPaymentCount, ...rest } = document;
  return { ...rest, totals: totalsOf(totals) };
}
