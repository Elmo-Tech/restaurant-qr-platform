import type { DashboardRange } from './dto/dashboard-query.dto';

export interface ResolvedDateRange {
  /** Inclusive UTC instant. */
  from: Date;
  /** Exclusive UTC instant. */
  to: Date;
  /** Whether `to - from` is a single day -- callers use this to bucket the time series by hour instead of by day. */
  isSingleDay: boolean;
}

/**
 * FT-11 Section 7: "Use the Restaurant/app timezone conventions already
 * present" -- `Branch.timezone` (DATABASE_SPEC.md #28, an IANA identifier)
 * is the only timezone concept this Platform already has, so "Today" means
 * midnight-to-midnight in the resolved Branch's own timezone, not the
 * server's or a hardcoded UTC day. When a Dashboard request spans every
 * Branch a Membership can see (no `branchId` filter and more than one
 * Branch), there is no single well-defined "Restaurant timezone" to use --
 * this function is always called with ONE resolved Branch's timezone
 * (documented assumption, `dashboard.service.ts`: the first authorized
 * Branch, by id, is used as the Restaurant-wide day-boundary reference).
 *
 * Deliberately simple (FT-11: "Do not implement complicated timezone
 * configuration"): the UTC offset for the timezone is computed ONCE, from
 * the current instant, and applied uniformly across the whole requested
 * range. This is exact for the common case and only theoretically
 * imprecise by up to an hour for a range that itself straddles that
 * timezone's own DST transition instant -- an acceptable, explicitly
 * documented V1 simplification for a restaurant analytics dashboard, not a
 * financial ledger.
 */
export function resolveDashboardDateRange(
  range: DashboardRange,
  timezone: string,
  custom: { from?: string; to?: string },
  now: Date = new Date(),
): ResolvedDateRange {
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, now);
  const todayStart = startOfLocalDay(now, offsetMinutes);

  switch (range) {
    case 'today':
      return { from: todayStart, to: addDays(todayStart, 1), isSingleDay: true };
    case 'yesterday':
      return { from: addDays(todayStart, -1), to: todayStart, isSingleDay: true };
    case 'last7':
      return { from: addDays(todayStart, -6), to: addDays(todayStart, 1), isSingleDay: false };
    case 'last30':
      return { from: addDays(todayStart, -29), to: addDays(todayStart, 1), isSingleDay: false };
    case 'custom': {
      if (!custom.from || !custom.to) {
        throw new Error('resolveDashboardDateRange: custom range requires both from and to');
      }
      const from = startOfLocalDay(new Date(`${custom.from}T00:00:00.000Z`), offsetMinutes);
      const toDayStart = startOfLocalDay(new Date(`${custom.to}T00:00:00.000Z`), offsetMinutes);
      const to = addDays(toDayStart, 1);
      return { from, to, isSingleDay: to.getTime() - from.getTime() <= 24 * 60 * 60 * 1000 };
    }
  }
}

/** Minutes such that `localWallClock = utcInstant + offset`. Positive east of UTC (e.g. Africa/Cairo -> +120). */
function getTimezoneOffsetMinutes(timeZone: string, instant: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** The UTC instant corresponding to local midnight, on the local calendar day that `instant` falls on. */
function startOfLocalDay(instant: Date, offsetMinutes: number): Date {
  const localWallClock = new Date(instant.getTime() + offsetMinutes * 60_000);
  const localMidnightAsUtc = Date.UTC(
    localWallClock.getUTCFullYear(),
    localWallClock.getUTCMonth(),
    localWallClock.getUTCDate(),
  );
  return new Date(localMidnightAsUtc - offsetMinutes * 60_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
