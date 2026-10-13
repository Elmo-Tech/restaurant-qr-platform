import type { DashboardQuery } from './api';
import type { DashboardRange } from './types';

export type PeriodComparisonLabel = 'yesterday' | 'dayBefore' | 'last7' | 'last30';

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgo(now: Date, days: number): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return toIsoDate(date);
}

/**
 * The period to compare a range against, expressed as a normal Dashboard
 * query: today vs yesterday, yesterday vs the day before, the last 7 / 30 days
 * vs the 7 / 30 days before them. The Backend resolves the dates in the
 * Branch timezone; the calendar days here only name which days to compare.
 */
export function previousPeriod(
  range: Exclude<DashboardRange, 'custom'>,
  now: Date = new Date(),
): { query: Pick<DashboardQuery, 'range' | 'from' | 'to'>; label: PeriodComparisonLabel } {
  switch (range) {
    case 'today':
      return { query: { range: 'yesterday' }, label: 'yesterday' };
    case 'yesterday':
      return {
        query: { range: 'custom', from: daysAgo(now, 2), to: daysAgo(now, 2) },
        label: 'dayBefore',
      };
    case 'last7':
      return {
        query: { range: 'custom', from: daysAgo(now, 13), to: daysAgo(now, 7) },
        label: 'last7',
      };
    case 'last30':
      return {
        query: { range: 'custom', from: daysAgo(now, 59), to: daysAgo(now, 30) },
        label: 'last30',
      };
  }
}

/** Percentage change from `previous` to `current`, or `null` when there is nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
