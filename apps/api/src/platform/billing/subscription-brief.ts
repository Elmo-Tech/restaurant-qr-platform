import type { Prisma } from '../../generated/prisma/client';
import { paymentSummary, type PaymentStatus } from './pricing';
import {
  formatDateOnly,
  pickCurrent,
  subscriptionPhase,
  type SubscriptionPhase,
} from './subscription-dates';

/**
 * A one-line summary of where a Restaurant's subscription stands, for lists and the platform home screen
 * (DEC-049). Pure: the same phase and payment rules as the subscription page, applied to the rows given.
 */
export interface SubscriptionBrief {
  phase: SubscriptionPhase;
  daysLeft: number;
  graceDaysLeft: number;
  /** YYYY-MM-DD. */
  endsAt: string;
  packageName: string;
  period: 'MONTHLY' | 'YEARLY';
  currencyCode: string;
  /** What is still owed (money as a string; negative = paid more than agreed). */
  balance: string;
  paymentStatus: PaymentStatus;
}

export interface BriefInput {
  status: 'ACTIVE' | 'CANCELLED';
  startsAt: Date;
  endsAt: Date;
  packageName: string;
  period: 'MONTHLY' | 'YEARLY';
  currencyCode: string;
  finalPrice: Prisma.Decimal;
  /** Payments that are not voided. */
  payments: readonly { amount: Prisma.Decimal }[];
}

export function subscriptionBrief(
  subscriptions: readonly BriefInput[],
  today: Date,
  graceDays: number,
): SubscriptionBrief | null {
  const rows = subscriptions.map((row) => {
    const info = subscriptionPhase(row, today, graceDays);
    return {
      row,
      info,
      phase: info.phase,
      status: row.status,
      startsAt: formatDateOnly(row.startsAt),
    };
  });
  const current = pickCurrent(rows);
  if (!current) return null;
  const { row, info } = current;
  const summary = paymentSummary(
    row.finalPrice,
    row.payments.map((p) => p.amount),
  );
  return {
    phase: info.phase,
    daysLeft: info.daysLeft,
    graceDaysLeft: info.graceDaysLeft,
    endsAt: formatDateOnly(row.endsAt),
    packageName: row.packageName,
    period: row.period,
    currencyCode: row.currencyCode,
    balance: summary.balance.toFixed(2),
    paymentStatus: summary.status,
  };
}
