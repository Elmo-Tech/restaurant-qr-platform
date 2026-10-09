import { Prisma } from '../generated/prisma/client';
import type { OrderStatus } from '../generated/prisma/client';

/**
 * Table Sessions, design v3 section 4: the session bill and its DERIVED payment
 * status. Everything here is pure and uses `Prisma.Decimal` only -- never
 * `Number`/`parseFloat` -- over the Order `totalAmount` snapshots, so a later
 * menu or price change can never alter a bill (product decision P2).
 *
 * An order is billable once the restaurant has accepted it. PENDING orders are
 * reported separately as "awaiting acceptance"; REJECTED and CANCELLED never
 * count.
 */

export const BILLABLE_ORDER_STATUSES = [
  'ACCEPTED',
  'PREPARING',
  'READY',
  'SERVED',
] as const satisfies readonly OrderStatus[];

export type SessionPaymentStatus =
  'NO_CHARGE' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID';

export const SESSION_PAYMENT_STATUSES: readonly SessionPaymentStatus[] = [
  'NO_CHARGE',
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'OVERPAID',
];

export interface BillOrderInput {
  status: OrderStatus;
  totalAmount: Prisma.Decimal;
}

export interface BillPaymentInput {
  amount: Prisma.Decimal;
  voidedAt: Date | null;
}

export interface SessionBill {
  /** Sum of the accepted (billable) orders' snapshot totals. */
  eligibleTotal: Prisma.Decimal;
  /** Sum of PENDING orders: shown as "awaiting acceptance", not billed yet. */
  pendingAmount: Prisma.Decimal;
  /** Sum of non-voided ledger payments. */
  paidAmount: Prisma.Decimal;
  /** eligibleTotal - paidAmount (negative means overpaid). */
  balance: Prisma.Decimal;
  paymentStatus: SessionPaymentStatus;
}

const ZERO = new Prisma.Decimal(0);

const BILLABLE = new Set<OrderStatus>(BILLABLE_ORDER_STATUSES);

/**
 * Derives the payment status from the two sums (design v3 section 4):
 * - NO_CHARGE: nothing billable and nothing paid;
 * - UNPAID: billable and nothing paid;
 * - PAID: billable and fully paid;
 * - PARTIALLY_PAID: something paid but a balance remains (UI label "Balance due");
 * - OVERPAID: paid more than billable (should be unreachable in V1).
 */
export function derivePaymentStatus(
  eligibleTotal: Prisma.Decimal,
  paidAmount: Prisma.Decimal,
): SessionPaymentStatus {
  const balance = eligibleTotal.minus(paidAmount);
  if (balance.isNegative() && !balance.isZero()) {
    return 'OVERPAID';
  }
  if (eligibleTotal.isZero() && paidAmount.isZero()) {
    return 'NO_CHARGE';
  }
  if (paidAmount.isZero()) {
    return 'UNPAID';
  }
  if (balance.isZero()) {
    return 'PAID';
  }
  return 'PARTIALLY_PAID';
}

export function computeSessionBill(input: {
  orders: readonly BillOrderInput[];
  payments: readonly BillPaymentInput[];
}): SessionBill {
  let eligibleTotal = ZERO;
  let pendingAmount = ZERO;
  for (const order of input.orders) {
    if (BILLABLE.has(order.status)) {
      eligibleTotal = eligibleTotal.plus(order.totalAmount);
    } else if (order.status === 'PENDING') {
      pendingAmount = pendingAmount.plus(order.totalAmount);
    }
  }

  let paidAmount = ZERO;
  for (const payment of input.payments) {
    if (payment.voidedAt === null) {
      paidAmount = paidAmount.plus(payment.amount);
    }
  }

  return {
    eligibleTotal,
    pendingAmount,
    paidAmount,
    balance: eligibleTotal.minus(paidAmount),
    paymentStatus: derivePaymentStatus(eligibleTotal, paidAmount),
  };
}

/** The API money representation: an exact 2-fraction-digit string. */
export function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export interface SessionBillView {
  eligibleTotal: string;
  pendingAmount: string;
  paidAmount: string;
  balance: string;
  paymentStatus: SessionPaymentStatus;
}

export function toBillView(bill: SessionBill): SessionBillView {
  return {
    eligibleTotal: formatMoney(bill.eligibleTotal),
    pendingAmount: formatMoney(bill.pendingAmount),
    paidAmount: formatMoney(bill.paidAmount),
    balance: formatMoney(bill.balance),
    paymentStatus: bill.paymentStatus,
  };
}
