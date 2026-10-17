import {
  evaluateHours,
  isClosedNow,
  localClock,
  parseSchedule,
  toDays,
  type HoursConfig,
} from './branch-hours';

// 2026-10-18 is a Sunday. Cairo is UTC+2 in winter (EET) and UTC+3 in summer: pin it with a fixed zone.
const TZ = 'Etc/GMT-2'; // UTC+2, no DST
const at = (isoLocalAsUtcPlus2: string): Date =>
  new Date(`${isoLocalAsUtcPlus2}+02:00`);

const weekdays = (open: number, close: number, days = [0, 1, 2, 3, 4, 5, 6]) =>
  days.map((dayOfWeek) => ({
    dayOfWeek,
    opensMinute: open,
    closesMinute: close,
  }));

const schedule = (
  intervals: HoursConfig['intervals'],
  temporarilyClosed = false,
): HoursConfig => ({
  mode: 'SCHEDULE',
  temporarilyClosed,
  intervals,
});

describe('branch opening hours', () => {
  it('reads the local weekday and minute in the Branch timezone', () => {
    expect(localClock(at('2026-10-18T09:30:00'), TZ)).toEqual({
      dayOfWeek: 0,
      minute: 570,
    });
    // 23:30 UTC on Sunday is already Monday 01:30 in UTC+2.
    expect(localClock(new Date('2026-10-18T23:30:00Z'), TZ)).toEqual({
      dayOfWeek: 1,
      minute: 90,
    });
    // An unknown timezone falls back to UTC instead of throwing.
    expect(localClock(new Date('2026-10-18T09:30:00Z'), 'Not/AZone')).toEqual({
      dayOfWeek: 0,
      minute: 570,
    });
  });

  it('shows nothing for an always-open Branch, and closed when manually closed', () => {
    const always: HoursConfig = {
      mode: 'ALWAYS_OPEN',
      temporarilyClosed: false,
      intervals: [],
    };
    expect(evaluateHours(always, new Date(), TZ)).toBeNull();
    expect(isClosedNow(always, new Date(), TZ)).toBe(false);
    expect(
      evaluateHours({ ...always, temporarilyClosed: true }, new Date(), TZ),
    ).toMatchObject({
      open: false,
      temporarilyClosed: true,
      opensAt: null,
    });
  });

  it('is open inside an interval (closing minute exclusive) and reports when it closes', () => {
    const config = schedule(weekdays(12 * 60, 23 * 60));
    expect(evaluateHours(config, at('2026-10-18T12:00:00'), TZ)).toMatchObject({
      open: true,
      closesAtMinute: 23 * 60,
    });
    expect(evaluateHours(config, at('2026-10-18T22:59:00'), TZ)?.open).toBe(
      true,
    );
    expect(evaluateHours(config, at('2026-10-18T23:00:00'), TZ)?.open).toBe(
      false,
    );
    expect(evaluateHours(config, at('2026-10-18T11:59:00'), TZ)?.open).toBe(
      false,
    );
  });

  it('says when it opens next: later today, tomorrow, or on the next open weekday', () => {
    const config = schedule(weekdays(12 * 60, 23 * 60, [0, 2]));
    // Sunday 08:00 -> opens today at 12:00.
    expect(
      evaluateHours(config, at('2026-10-18T08:00:00'), TZ)?.opensAt,
    ).toEqual({ dayOffset: 0, minute: 720, dayOfWeek: 0 });
    // Sunday 23:30 -> next opening is Tuesday (2 days ahead).
    expect(
      evaluateHours(config, at('2026-10-18T23:30:00'), TZ)?.opensAt,
    ).toEqual({ dayOffset: 2, minute: 720, dayOfWeek: 2 });
    // Tuesday 23:30 -> next is Sunday (5 days ahead).
    expect(
      evaluateHours(config, at('2026-10-20T23:30:00'), TZ)?.opensAt,
    ).toEqual({ dayOffset: 5, minute: 720, dayOfWeek: 0 });
  });

  it('handles an overnight interval across midnight', () => {
    // Every day 18:00 to 02:00 (stored as 1080 to 1560).
    const config = schedule(weekdays(18 * 60, 26 * 60));
    expect(evaluateHours(config, at('2026-10-18T20:00:00'), TZ)?.open).toBe(
      true,
    );
    const afterMidnight = evaluateHours(config, at('2026-10-19T01:00:00'), TZ);
    expect(afterMidnight).toMatchObject({ open: true, closesAtMinute: 120 });
    expect(evaluateHours(config, at('2026-10-19T02:00:00'), TZ)?.open).toBe(
      false,
    );
    expect(
      evaluateHours(config, at('2026-10-19T02:00:00'), TZ)?.opensAt,
    ).toEqual({ dayOffset: 0, minute: 1080, dayOfWeek: 1 });
  });

  it('only a closing overnight tail on a day without its own interval still counts as open', () => {
    // Saturday 22:00 to 03:00; nothing on Sunday.
    const config = schedule([
      { dayOfWeek: 6, opensMinute: 22 * 60, closesMinute: 27 * 60 },
    ]);
    expect(evaluateHours(config, at('2026-10-18T01:00:00'), TZ)?.open).toBe(
      true,
    ); // Sunday 01:00
    expect(evaluateHours(config, at('2026-10-18T04:00:00'), TZ)?.open).toBe(
      false,
    );
  });

  it('manual closure wins over the schedule and promises no reopening time', () => {
    const config = schedule(weekdays(12 * 60, 23 * 60), true);
    expect(evaluateHours(config, at('2026-10-18T15:00:00'), TZ)).toMatchObject({
      open: false,
      temporarilyClosed: true,
      opensAt: null,
    });
  });

  it('a schedule with no interval at all is closed with no next opening', () => {
    const status = evaluateHours(schedule([]), at('2026-10-18T15:00:00'), TZ);
    expect(status).toMatchObject({ open: false, opensAt: null });
  });

  describe('parsing the Staff form', () => {
    const day = (d: number, ...intervals: Array<[string, string]>) => ({
      day: d,
      intervals: intervals.map(([opens, closes]) => ({ opens, closes })),
    });

    it('converts to minutes and treats an earlier closing time as after midnight', () => {
      const result = parseSchedule([
        day(5, ['12:00', '23:30'], ['00:00', '00:30']),
        day(6, ['22:00', '02:00']),
      ]);
      expect(result).toEqual([
        { dayOfWeek: 5, opensMinute: 720, closesMinute: 1410 },
        { dayOfWeek: 5, opensMinute: 0, closesMinute: 30 },
        { dayOfWeek: 6, opensMinute: 1320, closesMinute: 1560 },
      ]);
    });

    it('rejects bad times, equal times, duplicate days, too many intervals and overlaps', () => {
      const bad: Array<Parameters<typeof parseSchedule>[0]> = [
        [day(0, ['9:00', '17:00'])],
        [day(0, ['25:00', '17:00'])],
        [day(0, ['10:00', '10:00'])],
        [day(7, ['10:00', '12:00'])],
        [day(0, ['10:00', '12:00']), day(0, ['13:00', '15:00'])],
        [
          day(
            0,
            ['01:00', '02:00'],
            ['03:00', '04:00'],
            ['05:00', '06:00'],
            ['07:00', '08:00'],
            ['09:00', '10:00'],
          ),
        ],
        [day(0, ['10:00', '14:00'], ['13:00', '16:00'])],
        // Saturday overnight into Sunday overlaps Sunday's morning interval.
        [day(6, ['22:00', '03:00']), day(0, ['02:00', '05:00'])],
      ];
      for (const days of bad) expect(parseSchedule(days)).toBe('INVALID_HOURS');
    });

    it('accepts back-to-back intervals and round-trips through toDays', () => {
      const parsed = parseSchedule([
        day(1, ['09:00', '12:00'], ['12:00', '15:00']),
        day(6, ['22:00', '02:00']),
      ]);
      expect(Array.isArray(parsed)).toBe(true);
      if (typeof parsed === 'string') return;
      const days = toDays(parsed);
      expect(days).toHaveLength(7);
      expect(days[1].intervals).toEqual([
        { opens: '09:00', closes: '12:00' },
        { opens: '12:00', closes: '15:00' },
      ]);
      expect(days[6].intervals).toEqual([{ opens: '22:00', closes: '02:00' }]);
      expect(days[0].intervals).toEqual([]);
    });
  });
});
