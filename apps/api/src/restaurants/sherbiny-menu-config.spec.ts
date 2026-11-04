import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_SHERBINY_SETTINGS,
  SHERBINY_COPY_KEYS,
  SHERBINY_COPY_LIMITS,
  normalizeSherbinySettings,
  sherbinyAssetPaths,
  sherbinyCopy,
} from './sherbiny-menu-config';

const media = '/media/1a63c31c-830c-4e40-a501-a82f427cc419.webp';
const categoryId = '41b84aaa-7abf-4f06-a494-2c8dca0a3cea';

describe('El Sherbiny menu settings normalization', () => {
  it('returns the documented defaults for missing, null or malformed input', () => {
    for (const input of [undefined, null, 'x', 5, [], {}]) {
      expect(normalizeSherbinySettings(input)).toEqual(DEFAULT_SHERBINY_SETTINGS);
    }
    expect(DEFAULT_SHERBINY_SETTINGS.theme).toBe('NIGHT');
    // Both languages exist for every copy key, so neither locale can render an empty headline.
    for (const key of SHERBINY_COPY_KEYS) {
      expect(`${key}Ar` in SHERBINY_COPY_LIMITS && `${key}En` in SHERBINY_COPY_LIMITS).toBe(true);
    }
  });

  it('trims, bounds and falls back for copy; rejects unknown enums', () => {
    const result = normalizeSherbinySettings({
      heroTitleEn: '  Hello  ',
      heroTitleAr: 'x'.repeat(500),
      ctaPrimaryEn: '   ',
      theme: 'NEON',
      motion: 'WILD',
      allowThemeSwitch: 'yes',
    });
    expect(result.heroTitleEn).toBe('Hello');
    expect(result.heroTitleAr).toHaveLength(SHERBINY_COPY_LIMITS.heroTitleAr);
    expect(result.ctaPrimaryEn).toBe(DEFAULT_SHERBINY_SETTINGS.ctaPrimaryEn);
    expect(result.theme).toBe('NIGHT');
    expect(result.motion).toBe('SUBTLE');
    expect(result.allowThemeSwitch).toBe(true);
    expect(normalizeSherbinySettings({ theme: 'SYSTEM' }).theme).toBe('SYSTEM');
    expect(normalizeSherbinySettings({ theme: 'PAPER', allowThemeSwitch: false })).toMatchObject({
      theme: 'PAPER',
      allowThemeSwitch: false,
    });
  });

  it('accepts only server-owned media paths, never arbitrary URLs or paths', () => {
    const result = normalizeSherbinySettings({
      heroImageAssetPath: media,
      heroPlateImageAssetPath: 'https://evil.example/x.png',
      favorite1ImageAssetPath: '/media/../../etc/passwd',
      storyImageAssetPath: '/media/1a63c31c-830c-4e40-a501-a82f427cc419.svg',
      categoryExtras: {
        [categoryId]: { titleEn: 'Hi', imageAssetPath: 'javascript:alert(1)' },
        'not-a-uuid': { titleEn: 'x' },
      },
    });
    expect(result.heroImageAssetPath).toBe(media);
    expect(result.heroPlateImageAssetPath).toBeNull();
    expect(result.favorite1ImageAssetPath).toBeNull();
    expect(result.storyImageAssetPath).toBeNull();
    expect(Object.keys(result.categoryExtras)).toEqual([categoryId]);
    expect(result.categoryExtras[categoryId].imageAssetPath).toBeNull();
  });

  it('lists every referenced upload and resolves the {name} token', () => {
    const settings = normalizeSherbinySettings({
      heroImageAssetPath: media,
      categoryExtras: { [categoryId]: { imageAssetPath: '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.jpg' } },
    });
    expect(sherbinyAssetPaths(settings)).toEqual(
      new Set([media, '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.jpg']),
    );
    const custom = normalizeSherbinySettings({ heroEyebrowEn: '{name} / MENU', heroEyebrowAr: '{name}' });
    expect(sherbinyCopy(custom, 'heroEyebrow', 'en', 'SHERBINY')).toBe('SHERBINY / MENU');
    expect(sherbinyCopy(custom, 'heroEyebrow', 'ar', 'الشربيني')).toBe('الشربيني');
  });

  it('stays byte-identical with the Web copy used for the live draft preview', () => {
    const api = readFileSync(join(__dirname, 'sherbiny-menu-config.ts'), 'utf8').replace(/\r\n/g, '\n');
    const web = readFileSync(
      join(__dirname, '../../../web/src/lib/public-menu/sherbiny-settings.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(web).toBe(api);
  });
});
