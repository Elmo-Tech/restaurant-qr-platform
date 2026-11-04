import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_MAKKBOZ_SETTINGS,
  MAKKBOZ_COPY_KEYS,
  MAKKBOZ_COPY_LIMITS,
  normalizeMakkbozSettings,
  makkbozAssetPaths,
  makkbozCopy,
} from './makkboz-menu-config';

const media = '/media/1a63c31c-830c-4e40-a501-a82f427cc419.webp';
const categoryId = '41b84aaa-7abf-4f06-a494-2c8dca0a3cea';

describe('Makkboz menu settings normalization', () => {
  it('returns the documented defaults for missing, null or malformed input', () => {
    for (const input of [undefined, null, 'x', 5, [], {}]) {
      expect(normalizeMakkbozSettings(input)).toEqual(DEFAULT_MAKKBOZ_SETTINGS);
    }
    expect(DEFAULT_MAKKBOZ_SETTINGS.defaultView).toBe('CARDS');
    expect(DEFAULT_MAKKBOZ_SETTINGS.theme).toBe('LIGHT');
    expect(DEFAULT_MAKKBOZ_SETTINGS.allowThemeSwitch).toBe(true);
    // Both languages exist for every copy key, so neither locale can render an empty headline.
    for (const key of MAKKBOZ_COPY_KEYS) {
      expect(`${key}Ar` in MAKKBOZ_COPY_LIMITS && `${key}En` in MAKKBOZ_COPY_LIMITS).toBe(true);
    }
  });

  it('trims, bounds and falls back for copy; rejects unknown enums', () => {
    const result = normalizeMakkbozSettings({
      heroTitleEn: '  Hello  ',
      heroTitleAr: 'x'.repeat(500),
      ctaPrimaryEn: '   ',
      defaultView: 'GRID',
      theme: 'SEPIA',
      motion: 'WILD',
      showStory: 'yes',
    });
    expect(result.heroTitleEn).toBe('Hello');
    expect(result.heroTitleAr).toHaveLength(MAKKBOZ_COPY_LIMITS.heroTitleAr);
    expect(result.ctaPrimaryEn).toBe(DEFAULT_MAKKBOZ_SETTINGS.ctaPrimaryEn);
    expect(result.defaultView).toBe('CARDS');
    expect(result.theme).toBe('LIGHT');
    expect(normalizeMakkbozSettings({ theme: 'SYSTEM' }).theme).toBe('SYSTEM');
    expect(normalizeMakkbozSettings({ theme: 'DARK', allowThemeSwitch: false })).toMatchObject({ theme: 'DARK', allowThemeSwitch: false });
    expect(result.motion).toBe('SUBTLE');
    expect(result.showStory).toBe(true);
    expect(normalizeMakkbozSettings({ defaultView: 'LIST', showStory: false })).toMatchObject({
      defaultView: 'LIST',
      showStory: false,
    });
  });

  it('accepts only server-owned media paths, never arbitrary URLs or paths', () => {
    const result = normalizeMakkbozSettings({
      heroImageAssetPath: media,
      heroSmallImageAssetPath: 'https://evil.example/x.png',
      categoryExtras: {
        [categoryId]: { introEn: 'Hi', imageAssetPath: 'javascript:alert(1)' },
        'not-a-uuid': { introEn: 'x' },
      },
    });
    expect(result.heroImageAssetPath).toBe(media);
    expect(result.heroSmallImageAssetPath).toBeNull();
    expect(Object.keys(result.categoryExtras)).toEqual([categoryId]);
    expect(result.categoryExtras[categoryId].imageAssetPath).toBeNull();
  });

  it('lists every referenced upload and resolves the {name} token', () => {
    const settings = normalizeMakkbozSettings({
      heroImageAssetPath: media,
      categoryExtras: { [categoryId]: { imageAssetPath: '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.jpg' } },
    });
    expect(makkbozAssetPaths(settings)).toEqual(
      new Set([media, '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.jpg']),
    );
    expect(makkbozCopy(DEFAULT_MAKKBOZ_SETTINGS, 'menuTitle', 'en', 'Makkboz')).toBe('The Makkboz menu');
    expect(makkbozCopy(DEFAULT_MAKKBOZ_SETTINGS, 'menuTitle', 'ar', 'مخبوز')).toBe('قائمة مخبوز');
  });

  it('stays byte-identical with the Web copy used for the live draft preview', () => {
    const api = readFileSync(join(__dirname, 'makkboz-menu-config.ts'), 'utf8').replace(/\r\n/g, '\n');
    const web = readFileSync(
      join(__dirname, '../../../web/src/lib/public-menu/makkboz-settings.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(web).toBe(api);
  });
});
