import { Prisma } from '../generated/prisma/client';
import {
  BILLABLE_ORDER_STATUSES,
  computeSessionBill,
  derivePaymentStatus,
  toBillView,
} from './session-billing';

const d = (value: string) => new Prisma.Decimal(value);
const order = (status: string, total: string) => ({
  status: status as never,
  totalAmount: d(total),
});
const payment = (amount: string, voided = false) => ({
  amount: d(amount),
  voidedAt: voided ? new Date('2026-01-01T00:00:00Z') : null,
});

describe('computeSessionBill', () => {
  it('bills only accepted orders (ACCEPTED, PREPARING, READY, SERVED) from their snapshot totals', () => {
    const bill = computeSessionBill({
      orders: [
        order('ACCEPTED', '10.00'),
        order('PREPARING', '20.00'),
        order('READY', '30.00'),
        order('SERVED', '40.00'),
        order('PENDING', '500.00'),
        order('REJECTED', '600.00'),
        order('CANCELLED', '700.00'),
      ],
      payments: [],
    });

    expect(bill.eligibleTotal.toFixed(2)).toBe('100.00');
    expect(bill.pendingAmount.toFixed(2)).toBe('500.00');
    expect(bill.paidAmount.toFixed(2)).toBe('0.00');
    expect(bill.balance.toFixed(2)).toBe('100.00');
    expect(bill.paymentStatus).toBe('UNPAID');
  });

  it('is exact with Decimal where floating point is not (0.1 + 0.2, many small amounts)', () => {
    const orders = [order('SERVED', '0.10'), order('SERVED', '0.20')];
    expect(
      computeSessionBill({ orders, payments: [] }).eligibleTotal.toFixed(2),
    ).toBe('0.30');

    const many = Array.from({ length: 1000 }, () => order('SERVED', '0.01'));
    const bill = computeSessionBill({
      orders: many,
      payments: [payment('10.00')],
    });
    expect(bill.eligibleTotal.toFixed(2)).toBe('10.00');
    expect(bill.balance.toFixed(2)).toBe('0.00');
    expect(bill.paymentStatus).toBe('PAID');
  });

  it('handles large totals without precision loss', () => {
    const bill = computeSessionBill({
      orders: [order('SERVED', '99999999999.99'), order('SERVED', '0.01')],
      payments: [payment('99999999999.99')],
    });
    expect(bill.eligibleTotal.toFixed(2)).toBe('100000000000.00');
    expect(bill.balance.toFixed(2)).toBe('0.01');
    expect(bill.paymentStatus).toBe('PARTIALLY_PAID');
  });

  it('ignores voided payments', () => {
    const bill = computeSessionBill({
      orders: [order('SERVED', '50.00')],
      payments: [payment('50.00', true)],
    });
    expect(bill.paidAmount.toFixed(2)).toBe('0.00');
    expect(bill.paymentStatus).toBe('UNPAID');
  });

  it('counts only the active payment when a void is followed by a corrected payment', () => {
    const bill = computeSessionBill({
      orders: [order('SERVED', '80.00')],
      payments: [payment('100.00', true), payment('80.00')],
    });
    expect(bill.paidAmount.toFixed(2)).toBe('80.00');
    expect(bill.paymentStatus).toBe('PAID');
  });

  it('a late-accepted order after full settlement reopens a balance (Balance due)', () => {
    const settled = computeSessionBill({
      orders: [order('SERVED', '100.00'), order('PENDING', '25.00')],
      payments: [payment('100.00')],
    });
    expect(settled.paymentStatus).toBe('PAID');
    expect(settled.pendingAmount.toFixed(2)).toBe('25.00');

    const lateAccepted = computeSessionBill({
      orders: [order('SERVED', '100.00'), order('ACCEPTED', '25.00')],
      payments: [payment('100.00')],
    });
    expect(lateAccepted.balance.toFixed(2)).toBe('25.00');
    expect(lateAccepted.paymentStatus).toBe('PARTIALLY_PAID');
  });

  it('formats money as exact two-digit strings', () => {
    const view = toBillView(
      computeSessionBill({
        orders: [order('SERVED', '12.5'), order('PENDING', '3')],
        payments: [],
      }),
    );
    expect(view).toEqual({
      eligibleTotal: '12.50',
      pendingAmount: '3.00',
      paidAmount: '0.00',
      balance: '12.50',
      paymentStatus: 'UNPAID',
    });
  });

  it('exposes exactly the four accepted statuses as billable', () => {
    expect([...BILLABLE_ORDER_STATUSES]).toEqual([
      'ACCEPTED',
      'PREPARING',
      'READY',
      'SERVED',
    ]);
  });
});

describe('derivePaymentStatus (zero-charge edge cases, decision D12)', () => {
  it.each([
    ['no orders, no payments', '0.00', '0.00', 'NO_CHARGE'],
    [
      'accepted free items (total 0.00), no payments',
      '0.00',
      '0.00',
      'NO_CHARGE',
    ],
    ['billable, nothing paid', '10.00', '0.00', 'UNPAID'],
    ['billable, fully paid', '10.00', '10.00', 'PAID'],
    ['billable, partly paid', '10.00', '4.00', 'PARTIALLY_PAID'],
    ['paid more than billable', '10.00', '10.01', 'OVERPAID'],
    [
      'paid but nothing billable (should be unreachable)',
      '0.00',
      '5.00',
      'OVERPAID',
    ],
  ])('%s -> %s', (_name, eligible, paid, expected) => {
    expect(derivePaymentStatus(d(eligible), d(paid))).toBe(expected);
  });

  it('never calls an all-cancelled, never-paid session UNPAID', () => {
    const bill = computeSessionBill({
      orders: [order('CANCELLED', '30.00'), order('REJECTED', '12.00')],
      payments: [],
    });
    expect(bill.paymentStatus).toBe('NO_CHARGE');
  });

  it('only-PENDING sessions are NO_CHARGE with the pending amount reported', () => {
    const bill = computeSessionBill({
      orders: [order('PENDING', '40.00')],
      payments: [],
    });
    expect(bill.paymentStatus).toBe('NO_CHARGE');
    expect(bill.pendingAmount.toFixed(2)).toBe('40.00');
  });
});
