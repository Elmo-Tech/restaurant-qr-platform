/**
 * Calendar-date helpers for subscriptions (DEC-049). A subscription covers [startsAt, endsAt): the
 * first day is included, the end date is the first day it no longer covers. Dates are plain
 * calendar dates stored as UTC midnight; "today" is the date in Cairo, where the platform team works,
 * so a subscription does not flip a day early or late around midnight.
 */
export type BillingPeriodKey = 'MONTHLY' | 'YEARLY';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-19" -> that date at UTC midnight; null when it is not a real calendar date. */
export function parseDateOnly(value: string): Date | null {
  if (!DATE_ONLY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateOnly(date) === value ? date : null;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in Cairo, as UTC midnight. */
export function todayInCairo(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${parts}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * The end date of a period starting on `start`: one month or one year later, on the same day of the
 * month (clamped to the last day of a shorter month: 31 Jan + 1 month = 28/29 Feb).
 */
export function periodEnd(start: Date, period: BillingPeriodKey): Date {
  const months = period === 'YEARLY' ? 12 : 1;
  const total = start.getUTCFullYear() * 12 + start.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)));
}

export type SubscriptionPhase =
  'CANCELLED' | 'UPCOMING' | 'ACTIVE' | 'GRACE' | 'EXPIRED';

export interface SubscriptionSpan {
  status: 'ACTIVE' | 'CANCELLED';
  startsAt: Date;
  endsAt: Date;
}

/**
 * Where a subscription stands today: not started yet, running, ended but still inside the grace
 * period (the Restaurant is still served), or ended for good. `daysLeft` counts the days the
 * subscription still covers (0 once it has ended); `graceDaysLeft` the days before suspension.
 */
export function subscriptionPhase(
  sub: SubscriptionSpan,
  today: Date,
  graceDays: number,
): { phase: SubscriptionPhase; daysLeft: number; graceDaysLeft: number } {
  if (sub.status === 'CANCELLED') {
    return { phase: 'CANCELLED', daysLeft: 0, graceDaysLeft: 0 };
  }
  if (today.getTime() < sub.startsAt.getTime()) {
    return {
      phase: 'UPCOMING',
      daysLeft: daysBetween(sub.startsAt, sub.endsAt),
      graceDaysLeft: graceDays,
    };
  }
  if (today.getTime() < sub.endsAt.getTime()) {
    return {
      phase: 'ACTIVE',
      daysLeft: daysBetween(today, sub.endsAt),
      graceDaysLeft: graceDays,
    };
  }
  const graceDaysLeft = daysBetween(today, addDays(sub.endsAt, graceDays));
  return graceDaysLeft > 0
    ? { phase: 'GRACE', daysLeft: 0, graceDaysLeft }
    : { phase: 'EXPIRED', daysLeft: 0, graceDaysLeft: 0 };
}
