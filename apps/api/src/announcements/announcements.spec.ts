import {
  cleanAnnouncementText,
  dateOnly,
  isLiveOn,
  parseDateOnly,
  resolveAnnouncementText,
} from './announcements';

describe('announcement rules', () => {
  const base = { status: 'ACTIVE' as const, startsOn: null, endsOn: null };

  it('is live only while ACTIVE and inside the inclusive date range', () => {
    expect(isLiveOn(base, '2026-10-20')).toBe(true);
    expect(isLiveOn({ ...base, status: 'INACTIVE' }, '2026-10-20')).toBe(false);
    const ranged = { ...base, startsOn: '2026-10-20', endsOn: '2026-10-22' };
    expect(isLiveOn(ranged, '2026-10-19')).toBe(false);
    expect(isLiveOn(ranged, '2026-10-20')).toBe(true);
    expect(isLiveOn(ranged, '2026-10-22')).toBe(true);
    expect(isLiveOn(ranged, '2026-10-23')).toBe(false);
    expect(isLiveOn({ ...base, startsOn: '2026-10-25' }, '2026-10-20')).toBe(
      false,
    );
    expect(isLiveOn({ ...base, endsOn: '2026-10-19' }, '2026-10-20')).toBe(
      false,
    );
  });

  it('cleans text: control characters, runs of spaces, length; keeps emoji', () => {
    expect(cleanAnnouncementText('  🎉 Free   delivery\n today\u0000 ')).toBe(
      '🎉 Free delivery today',
    );
    expect(cleanAnnouncementText('x'.repeat(500))).toHaveLength(200);
    expect(cleanAnnouncementText('   ')).toBe('');
  });

  it('parses only real calendar dates', () => {
    expect(parseDateOnly('2026-10-20')?.toISOString()).toBe(
      '2026-10-20T00:00:00.000Z',
    );
    for (const bad of [
      '2026-13-01',
      '2026-02-30',
      '20-10-2026',
      '2026-10-2',
      '',
      'tomorrow',
    ]) {
      expect(parseDateOnly(bad)).toBeNull();
    }
    expect(dateOnly(new Date('2026-10-20T00:00:00.000Z'))).toBe('2026-10-20');
    expect(dateOnly(null)).toBeNull();
  });

  it('shows the Guest language, then the default, then anything, then nothing', () => {
    const rows = [
      { locale: 'en', text: 'Free delivery' },
      { locale: 'ar', text: 'توصيل مجاني' },
    ];
    expect(resolveAnnouncementText(rows, 'ar', 'en')).toBe('توصيل مجاني');
    expect(resolveAnnouncementText(rows, 'fr', 'en')).toBe('Free delivery');
    expect(resolveAnnouncementText([rows[1]], 'fr', 'en')).toBe('توصيل مجاني');
    expect(resolveAnnouncementText([], 'en', 'en')).toBeNull();
    expect(
      resolveAnnouncementText([{ locale: 'en', text: '  ' }], 'en', 'en'),
    ).toBeNull();
  });
});
