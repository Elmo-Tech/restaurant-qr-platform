import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_VERDE_SETTINGS,
  VERDE_COPY_KEYS,
  VERDE_COPY_LIMITS,
  normalizeVerdeSettings,
  verdeAssetPaths,
  verdeCopy,
} from './verde-menu-config';

const media = '/media/1a63c31c-830c-4e40-a501-a82f427cc419.webp';
const categoryId = '41b84aaa-7abf-4f06-a494-2c8dca0a3cea';

describe('VERDE menu settings normalization', () => {
  it('returns the documented defaults for missing, null or malformed input', () => {
    for (const input of [undefined, null, 'x', 5, [], {}]) {
      expect(normalizeVerdeSettings(input)).toEqual(DEFAULT_VERDE_SETTINGS);
    }
    expect(DEFAULT_VERDE_SETTINGS.theme).toBe('SIGNATURE');
    // Both languages exist for every copy key, so neither locale can render an empty headline.
    for (const key of VERDE_COPY_KEYS) {
      expect(`${key}Ar` in VERDE_COPY_LIMITS && `${key}En` in VERDE_COPY_LIMITS).toBe(true);
    }
  });

  it('trims, bounds and falls back for copy; rejects unknown enums', () => {
    const result = normalizeVerdeSettings({
      headlineTopEn: '  HELLO  ',
      headlineTopAr: 'x'.repeat(500),
      ctaEn: '   ',
      theme: 'NEON',
      motion: 'WILD',
      allowThemeSwitch: 'yes',
    });
    expect(result.headlineTopEn).toBe('HELLO');
    expect(result.headlineTopAr).toHaveLength(VERDE_COPY_LIMITS.headlineTopAr);
    expect(result.ctaEn).toBe(DEFAULT_VERDE_SETTINGS.ctaEn);
    expect(result.theme).toBe('SIGNATURE');
    expect(result.motion).toBe('SUBTLE');
    expect(result.allowThemeSwitch).toBe(true);
    expect(normalizeVerdeSettings({ theme: 'LIGHT', allowThemeSwitch: false })).toMatchObject({
      theme: 'LIGHT',
      allowThemeSwitch: false,
    });
  });

  it('accepts only server-owned media paths, never arbitrary URLs or paths', () => {
    const result = normalizeVerdeSettings({
      heroImageAssetPath: media,
      chapter1ImageAssetPath: 'https://evil.example/x.png',
      chapter2ImageAssetPath: '/media/../../etc/passwd',
      bannerImageAssetPath: '/media/1a63c31c-830c-4e40-a501-a82f427cc419.svg',
      categoryExtras: {
        [categoryId]: { introEn: 'Hi', imageAssetPath: 'javascript:alert(1)' },
        'not-a-uuid': { introEn: 'x' },
      },
    });
    expect(result.heroImageAssetPath).toBe(media);
    expect(result.chapter1ImageAssetPath).toBeNull();
    expect(result.chapter2ImageAssetPath).toBeNull();
    expect(result.bannerImageAssetPath).toBeNull();
    expect(Object.keys(result.categoryExtras)).toEqual([categoryId]);
    expect(result.categoryExtras[categoryId].imageAssetPath).toBeNull();
  });

  it('lists every referenced upload and resolves the {name} token', () => {
    const settings = normalizeVerdeSettings({
      heroImageAssetPath: media,
      categoryExtras: { [categoryId]: { imageAssetPath: '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.jpg' } },
    });
    expect(verdeAssetPaths(settings)).toEqual(
      new Set([media, '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.jpg']),
    );
    expect(verdeCopy(DEFAULT_VERDE_SETTINGS, 'endHeadline', 'en', 'VERDE')).toBe('Good food?\nGo VERDE.');
    expect(verdeCopy(DEFAULT_VERDE_SETTINGS, 'introEyebrow', 'ar', 'VERDE')).toBe('01 — DISCOVER VERDE');
  });

  it('stays byte-identical with the Web copy used for the live draft preview', () => {
    const api = readFileSync(join(__dirname, 'verde-menu-config.ts'), 'utf8').replace(/\r\n/g, '\n');
    const web = readFileSync(
      join(__dirname, '../../../web/src/lib/public-menu/verde-settings.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(web).toBe(api);
  });
});
