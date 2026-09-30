import { resolveDashboardDateRange } from './dashboard-date-range';

// Asia/Dubai is a fixed UTC+4 with no DST, ever -- a stable, predictable
// zone for exact-boundary assertions (unlike Africa/Cairo, which reinstated
// seasonal DST in 2023 and would make the expected offset here depend on
// which calendar month the test happens to reference).
const DUBAI = 'Asia/Dubai';

describe('resolveDashboardDateRange', () => {
  it('resolves "today" to local midnight-to-midnight in the Branch timezone, not the server/UTC day', () => {
    // 2026-09-30T23:30:00Z is already 2026-10-01T03:30 in Dubai (UTC+4).
    const now = new Date('2026-09-30T23:30:00.000Z');
    const result = resolveDashboardDateRange('today', DUBAI, {}, now);

    expect(result.from.toISOString()).toBe('2026-09-30T20:00:00.000Z'); // 2026-10-01T00:00 Dubai
    expect(result.to.toISOString()).toBe('2026-10-01T20:00:00.000Z');
    expect(result.isSingleDay).toBe(true);
  });

  it('resolves "yesterday" to the single full local day before today', () => {
    const now = new Date('2026-09-30T10:00:00.000Z'); // 2026-09-30T14:00 Dubai
    const result = resolveDashboardDateRange('yesterday', DUBAI, {}, now);

    expect(result.from.toISOString()).toBe('2026-09-28T20:00:00.000Z'); // 2026-09-29T00:00 Dubai
    expect(result.to.toISOString()).toBe('2026-09-29T20:00:00.000Z'); // 2026-09-30T00:00 Dubai
    expect(result.isSingleDay).toBe(true);
  });

  it('resolves "last7" to 7 local calendar days including today, and is not single-day', () => {
    const now = new Date('2026-09-30T10:00:00.000Z');
    const result = resolveDashboardDateRange('last7', DUBAI, {}, now);

    const spanDays = (result.to.getTime() - result.from.getTime()) / (24 * 60 * 60 * 1000);
    expect(spanDays).toBe(7);
    expect(result.isSingleDay).toBe(false);
  });

  it('resolves "last30" to 30 local calendar days including today', () => {
    const now = new Date('2026-09-30T10:00:00.000Z');
    const result = resolveDashboardDateRange('last30', DUBAI, {}, now);

    const spanDays = (result.to.getTime() - result.from.getTime()) / (24 * 60 * 60 * 1000);
    expect(spanDays).toBe(30);
  });

  it('resolves a "custom" range as inclusive whole local days from/to', () => {
    const result = resolveDashboardDateRange(
      'custom',
      DUBAI,
      { from: '2026-09-01', to: '2026-09-02' },
      new Date('2026-09-15T00:00:00.000Z'),
    );

    expect(result.from.toISOString()).toBe('2026-08-31T20:00:00.000Z'); // 2026-09-01T00:00 Dubai
    expect(result.to.toISOString()).toBe('2026-09-02T20:00:00.000Z'); // 2026-09-03T00:00 Dubai (exclusive)
    expect(result.isSingleDay).toBe(false);
  });

  it('throws for "custom" without both from and to (defensive -- the DTO is expected to have already required them)', () => {
    expect(() => resolveDashboardDateRange('custom', DUBAI, {})).toThrow();
  });
});
