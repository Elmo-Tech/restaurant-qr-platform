import {
  checkSlotShapes,
  cleanOfferText,
  normalizeDays,
  offerAvailability,
  storedRequiredCount,
  weekdayOf,
} from './offer-rules';

describe('offer rules (DEC-069)', () => {
  describe('weekdayOf', () => {
    it('reads 0 = Sunday ... 6 = Saturday', () => {
      expect(weekdayOf('2026-11-01')).toBe(0); // Sunday
      expect(weekdayOf('2026-11-06')).toBe(5); // Friday
      expect(weekdayOf('2026-11-07')).toBe(6); // Saturday
    });
  });

  describe('normalizeDays', () => {
    it('sorts, de-duplicates and treats all seven days as every day', () => {
      expect(normalizeDays([5, 1, 5])).toEqual([1, 5]);
      expect(normalizeDays([0, 1, 2, 3, 4, 5, 6])).toEqual([]);
      expect(normalizeDays([])).toEqual([]);
      expect(normalizeDays(undefined)).toEqual([]);
    });
    it('refuses anything that is not an integer 0..6', () => {
      expect(normalizeDays([7])).toBeNull();
      expect(normalizeDays([-1])).toBeNull();
      expect(normalizeDays([1.5])).toBeNull();
      expect(normalizeDays(['1'])).toBeNull();
    });
  });

  describe('offerAvailability', () => {
    const base = { status: 'ACTIVE' as const, daysOfWeek: [] as number[], startsOn: null, endsOn: null };
    it('is available every day when no weekdays and no dates are set', () => {
      expect(offerAvailability(base, '2026-11-06')).toBe('AVAILABLE');
    });
    it('is OFF unless ACTIVE', () => {
      expect(offerAvailability({ ...base, status: 'INACTIVE' }, '2026-11-06')).toBe('OFF');
      expect(offerAvailability({ ...base, status: 'ARCHIVED' }, '2026-11-06')).toBe('OFF');
    });
    it('is TODAY_OFF on a weekday that is not listed (Friday-only offer)', () => {
      const friday = { ...base, daysOfWeek: [5] };
      expect(offerAvailability(friday, '2026-11-06')).toBe('AVAILABLE'); // Friday
      expect(offerAvailability(friday, '2026-11-07')).toBe('TODAY_OFF'); // Saturday
    });
    it('treats the dates as inclusive calendar dates', () => {
      const window = { ...base, startsOn: '2026-11-10', endsOn: '2026-11-12' };
      expect(offerAvailability(window, '2026-11-09')).toBe('NOT_STARTED');
      expect(offerAvailability(window, '2026-11-10')).toBe('AVAILABLE');
      expect(offerAvailability(window, '2026-11-12')).toBe('AVAILABLE');
      expect(offerAvailability(window, '2026-11-13')).toBe('ENDED');
    });
    it('checks the dates before the weekday', () => {
      const offer = { ...base, daysOfWeek: [5], endsOn: '2026-11-01' };
      expect(offerAvailability(offer, '2026-11-06')).toBe('ENDED');
    });
  });

  describe('checkSlotShapes', () => {
    const single = { kind: 'SINGLE' as const, requiredCount: 1, optionCount: 2, hasAdjustment: false };
    it('accepts a valid breakfast shape (single + fixed)', () => {
      expect(
        checkSlotShapes([
          { ...single, hasAdjustment: true },
          { kind: 'FIXED', requiredCount: 0, optionCount: 1, hasAdjustment: false },
        ]),
      ).toBeNull();
    });
    it('needs at least one slot and at most six', () => {
      expect(checkSlotShapes([])).toBe('NO_SLOTS');
      expect(checkSlotShapes(Array.from({ length: 7 }, () => single))).toBe('TOO_MANY_SLOTS');
    });
    it('caps the options of the whole offer at 20', () => {
      const big = { ...single, optionCount: 7 };
      expect(checkSlotShapes([big, big, big])).toBe('TOO_MANY_OPTIONS');
      expect(checkSlotShapes([big, big, { ...big, optionCount: 6 }])).toBeNull();
    });
    it('needs options in every slot, two in a SINGLE slot', () => {
      expect(checkSlotShapes([{ ...single, optionCount: 0 }])).toBe('SLOT_NEEDS_OPTIONS');
      expect(checkSlotShapes([{ ...single, optionCount: 1 }])).toBe('SINGLE_NEEDS_TWO');
    });
    it('MULTI needs a count between 1 and 20', () => {
      const multi = { kind: 'MULTI' as const, requiredCount: 3, optionCount: 6, hasAdjustment: false };
      expect(checkSlotShapes([multi])).toBeNull();
      expect(checkSlotShapes([{ ...multi, requiredCount: 0 }])).toBe('MULTI_COUNT_INVALID');
      expect(checkSlotShapes([{ ...multi, requiredCount: 21 }])).toBe('MULTI_COUNT_INVALID');
    });
    it('an included (FIXED) item can never carry a price', () => {
      expect(
        checkSlotShapes([{ kind: 'FIXED', requiredCount: 0, optionCount: 1, hasAdjustment: true }]),
      ).toBe('FIXED_ADJUSTMENT');
    });
  });

  it('stores the required count the migration CHECK expects', () => {
    expect(storedRequiredCount('FIXED', 5)).toBe(0);
    expect(storedRequiredCount('SINGLE', 9)).toBe(1);
    expect(storedRequiredCount('MULTI', 3)).toBe(3);
  });

  it('cleans texts: control characters, whitespace and length; emoji stay', () => {
    expect(cleanOfferText('  وجبة\u0000   الفطار 🎁 ', 120)).toBe('وجبة الفطار 🎁');
    expect(cleanOfferText('abcdef', 3)).toBe('abc');
  });
});
