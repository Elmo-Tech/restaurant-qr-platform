/**
 * Branch opening hours (DEC-042, slice 3). Pure functions only: no I/O, no database.
 * Everything is evaluated on the Branch's own clock (its IANA timezone), never the
 * server's or the Guest's.
 *
 * Model: weekdays 0 = Sunday ... 6 = Saturday; an interval is minutes after local
 * midnight. `closesMinute` above 1440 means the interval runs past midnight into the
 * next day (18:00 to 02:00 is 1080 to 1560) and belongs to the day it opens on.
 */

export type HoursMode = 'ALWAYS_OPEN' | 'SCHEDULE';

export interface HoursInterval {
  dayOfWeek: number;
  opensMinute: number;
  closesMinute: number;
}

export interface HoursConfig {
  mode: HoursMode;
  temporarilyClosed: boolean;
  intervals: HoursInterval[];
}

export interface NextOpening {
  /** 0 = later today, 1 = tomorrow ... 7 = the same weekday next week. */
  dayOffset: number;
  /** Minutes after local midnight. */
  minute: number;
  /** The weekday it opens on (0 = Sunday ... 6 = Saturday), so no caller has to guess the Branch's calendar. */
  dayOfWeek: number;
}

export interface HoursStatus {
  open: boolean;
  temporarilyClosed: boolean;
  /** When the Branch opens next (SCHEDULE only); null when unknown or when it never opens. */
  opensAt: NextOpening | null;
  /** While open on a schedule: the closing time as minutes after local midnight (0-1439). */
  closesAtMinute: number | null;
}

const DAY = 1440;

/** "09:30" -> 570. Null when not a valid HH:MM (00:00-23:59). */
export function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

/** 570 -> "09:30" (minutes beyond 24h wrap to the next day's clock). */
export function formatClock(minute: number): string {
  const normalized = ((minute % DAY) + DAY) % DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** The local weekday and minutes-after-midnight at `now` in `timeZone`. */
export function localClock(
  now: Date,
  timeZone: string,
): { dayOfWeek: number; minute: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    // An unknown timezone must never take the menu down: fall back to UTC.
    return localClock(now, 'UTC');
  }
  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    dayOfWeek: WEEKDAYS[get('weekday')] ?? 0,
    minute: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
  };
}

/**
 * The status to show for a Branch, or `null` when there is nothing to say (always
 * open and not manually closed): the menu then shows no badge at all.
 */
export function evaluateHours(
  config: HoursConfig,
  now: Date,
  timeZone: string,
): HoursStatus | null {
  if (config.mode === 'ALWAYS_OPEN') {
    return config.temporarilyClosed
      ? {
          open: false,
          temporarilyClosed: true,
          opensAt: null,
          closesAtMinute: null,
        }
      : null;
  }

  const { dayOfWeek, minute } = localClock(now, timeZone);
  const previousDay = (dayOfWeek + 6) % 7;

  let closesAt: number | null = null;
  for (const interval of config.intervals) {
    if (
      interval.dayOfWeek === dayOfWeek &&
      interval.opensMinute <= minute &&
      minute < interval.closesMinute
    ) {
      closesAt = Math.max(closesAt ?? 0, interval.closesMinute);
    }
    // The tail of yesterday's overnight interval.
    if (
      interval.dayOfWeek === previousDay &&
      interval.closesMinute > DAY &&
      minute < interval.closesMinute - DAY
    ) {
      closesAt = Math.max(closesAt ?? 0, interval.closesMinute);
    }
  }
  const isOpenBySchedule = closesAt !== null;

  let opensAt: NextOpening | null = null;
  // A manual closure promises no reopening time: staff decide when it ends.
  if (!isOpenBySchedule && !config.temporarilyClosed) {
    for (let offset = 0; offset <= 7 && opensAt === null; offset += 1) {
      const day = (dayOfWeek + offset) % 7;
      const candidates = config.intervals
        .filter(
          (interval) =>
            interval.dayOfWeek === day &&
            (offset > 0 || interval.opensMinute > minute),
        )
        .map((interval) => interval.opensMinute);
      if (candidates.length > 0) {
        opensAt = {
          dayOffset: offset,
          minute: Math.min(...candidates),
          dayOfWeek: day,
        };
      }
    }
  }

  const open = isOpenBySchedule && !config.temporarilyClosed;
  return {
    open,
    temporarilyClosed: config.temporarilyClosed,
    opensAt: open ? null : opensAt,
    closesAtMinute: open && closesAt !== null ? closesAt % DAY : null,
  };
}

/** True when ordering must be refused right now (a status exists and it says closed). */
export function isClosedNow(
  config: HoursConfig,
  now: Date,
  timeZone: string,
): boolean {
  const status = evaluateHours(config, now, timeZone);
  return status !== null && !status.open;
}

// ---------------------------------------------------------------- Staff input

export interface DayHoursInput {
  day: number;
  intervals: { opens: string; closes: string }[];
}

export type HoursInputError = 'INVALID_HOURS';

const MAX_INTERVALS_PER_DAY = 4;

/**
 * Turns the Staff form (HH:MM strings per weekday) into stored intervals. A closing
 * time at or before the opening time means "after midnight" (22:00 to 02:00); equal
 * times are rejected, as are overlaps anywhere in the week (an overnight interval
 * counts into the next day).
 */
export function parseSchedule(
  days: DayHoursInput[],
): HoursInterval[] | HoursInputError {
  const result: HoursInterval[] = [];
  const seenDays = new Set<number>();
  for (const entry of days) {
    if (
      !Number.isInteger(entry.day) ||
      entry.day < 0 ||
      entry.day > 6 ||
      seenDays.has(entry.day)
    ) {
      return 'INVALID_HOURS';
    }
    seenDays.add(entry.day);
    if (entry.intervals.length > MAX_INTERVALS_PER_DAY) return 'INVALID_HOURS';
    for (const interval of entry.intervals) {
      const opens = parseClock(interval.opens);
      const closes = parseClock(interval.closes);
      if (opens === null || closes === null || opens === closes)
        return 'INVALID_HOURS';
      result.push({
        dayOfWeek: entry.day,
        opensMinute: opens,
        closesMinute: closes > opens ? closes : closes + DAY,
      });
    }
  }

  // Overlap check on the circular week.
  const WEEK = 7 * DAY;
  const spans = result
    .map((interval) => ({
      start: interval.dayOfWeek * DAY + interval.opensMinute,
      end: interval.dayOfWeek * DAY + interval.closesMinute,
    }))
    .sort((a, b) => a.start - b.start);
  for (let index = 0; index < spans.length; index += 1) {
    const current = spans[index];
    const next = spans[(index + 1) % spans.length];
    const nextStart = index + 1 < spans.length ? next.start : next.start + WEEK;
    if (spans.length > 1 && current.end > nextStart) return 'INVALID_HOURS';
    if (spans.length === 1 && current.end - current.start > WEEK)
      return 'INVALID_HOURS';
  }
  return result;
}

/** Stored intervals back to the Staff form: seven days, each with HH:MM strings. */
export function toDays(intervals: HoursInterval[]): DayHoursInput[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    intervals: intervals
      .filter((interval) => interval.dayOfWeek === day)
      .sort((a, b) => a.opensMinute - b.opensMinute)
      .map((interval) => ({
        opens: formatClock(interval.opensMinute),
        closes: formatClock(interval.closesMinute),
      })),
  }));
}

// ------------------------------------------------------------ Guest-facing shape

/** What the Guest Menu receives: no internal minutes, only clock strings in the Branch's own time. */
export interface PublicHours {
  open: boolean;
  temporarilyClosed: boolean;
  /** The next opening (SCHEDULE only), as a day offset and an "HH:MM" clock. */
  opensAt: { dayOffset: number; time: string; dayOfWeek: number } | null;
  /** While open on a schedule: the closing clock "HH:MM". */
  closesAt: string | null;
}

export function toPublicHours(status: HoursStatus | null): PublicHours | null {
  if (status === null) return null;
  return {
    open: status.open,
    temporarilyClosed: status.temporarilyClosed,
    opensAt: status.opensAt
      ? {
          dayOffset: status.opensAt.dayOffset,
          time: formatClock(status.opensAt.minute),
          dayOfWeek: status.opensAt.dayOfWeek,
        }
      : null,
    closesAt:
      status.closesAtMinute === null
        ? null
        : formatClock(status.closesAtMinute),
  };
}

/**
 * One status for several Branches (a generic QR serves all of them): nothing to show if
 * any Branch is always open, "open" if any is open, otherwise closed with the earliest
 * next opening among them.
 */
export function summarizeHours(
  statuses: (PublicHours | null)[],
): PublicHours | null {
  if (statuses.length === 0 || statuses.some((status) => status === null))
    return null;
  const all = statuses as PublicHours[];
  if (all.some((status) => status.open)) {
    return {
      open: true,
      temporarilyClosed: false,
      opensAt: null,
      closesAt: all.length === 1 ? all[0].closesAt : null,
    };
  }
  const next = all
    .map((status) => status.opensAt)
    .filter(
      (opening): opening is NonNullable<PublicHours['opensAt']> =>
        opening !== null,
    )
    .sort(
      (a, b) => a.dayOffset - b.dayOffset || a.time.localeCompare(b.time),
    )[0];
  return {
    open: false,
    temporarilyClosed: all.every((status) => status.temporarilyClosed),
    opensAt: next ?? null,
    closesAt: null,
  };
}
