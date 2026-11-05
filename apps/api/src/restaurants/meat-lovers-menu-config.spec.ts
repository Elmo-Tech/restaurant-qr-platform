import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_MEAT_LOVERS_SETTINGS,
  MEAT_LOVERS_COPY_KEYS,
  MEAT_LOVERS_COPY_LIMITS,
  normalizeMeatLoversSettings,
  meatLoversAssetPaths,
  meatLoversCopy,
} from './meat-lovers-menu-config';

const media = '/media/1a63c31c-830c-4e40-a501-a82f427cc419.webp';
const categoryId = '41b84aaa-7abf-4f06-a494-2c8dca0a3cea';

describe('Meat Lovers menu settings normalization', () => {
  it('returns the documented defaults for missing, null or malformed input', () => {
    for (const input of [undefined, null, 'x', 5, [], {}]) {
      expect(normalizeMeatLoversSettings(input)).toEqual(DEFAULT_MEAT_LOVERS_SETTINGS);
    }
    expect(DEFAULT_MEAT_LOVERS_SETTINGS.defaultView).toBe('CARDS');
    expect(DEFAULT_MEAT_LOVERS_SETTINGS.theme).toBe('DARK');
    expect(DEFAULT_MEAT_LOVERS_SETTINGS.allowThemeSwitch).toBe(true);
    // Both languages exist for every copy key, so neither locale can render an empty headline.
    for (const key of MEAT_LOVERS_COPY_KEYS) {
      expect(`${key}Ar` in MEAT_LOVERS_COPY_LIMITS && `${key}En` in MEAT_LOVERS_COPY_LIMITS).toBe(true);
    }
  });

  it('trims, bounds and falls back for copy; rejects unknown enums', () => {
    const result = normalizeMeatLoversSettings({
      heroTitleEn: '  Hello  ',
      heroTitleAr: 'x'.repeat(500),
      ctaPrimaryEn: '   ',
      defaultView: 'GRID',
      theme: 'SEPIA',
      motion: 'WILD',
      showStory: 'yes',
    });
    expect(result.heroTitleEn).toBe('Hello');
    expect(result.heroTitleAr).toHaveLength(MEAT_LOVERS_COPY_LIMITS.heroTitleAr);
    expect(result.ctaPrimaryEn).toBe(DEFAULT_MEAT_LOVERS_SETTINGS.ctaPrimaryEn);
    expect(result.defaultView).toBe('CARDS');
    expect(result.theme).toBe('DARK');
    expect(normalizeMeatLoversSettings({ theme: 'SYSTEM' }).theme).toBe('SYSTEM');
    expect(normalizeMeatLoversSettings({ theme: 'DARK', allowThemeSwitch: false })).toMatchObject({ theme: 'DARK', allowThemeSwitch: false });
    expect(result.motion).toBe('SUBTLE');
    expect(result.showStory).toBe(true);
    expect(normalizeMeatLoversSettings({ defaultView: 'LIST', showStory: false })).toMatchObject({
      defaultView: 'LIST',
      showStory: false,
    });
  });

  it('accepts only server-owned media paths, never arbitrary URLs or paths', () => {
    const result = normalizeMeatLoversSettings({
      heroImageAssetPath: media,
      storyImageAssetPath: 'https://evil.example/x.png',
      categoryExtras: {
        [categoryId]: { introEn: 'Hi', imageAssetPath: 'javascript:alert(1)' },
        'not-a-uuid': { introEn: 'x' },
      },
    });
    expect(result.heroImageAssetPath).toBe(media);
    expect(result.storyImageAssetPath).toBeNull();
    expect(Object.keys(result.categoryExtras)).toEqual([categoryId]);
    expect(result.categoryExtras[categoryId].imageAssetPath).toBeNull();
  });

  it('lists every referenced upload and resolves the {name} token', () => {
    const settings = normalizeMeatLoversSettings({
      heroImageAssetPath: media,
      categoryExtras: { [categoryId]: { imageAssetPath: '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.jpg' } },
    });
    expect(meatLoversAssetPaths(settings)).toEqual(
      new Set([media, '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.jpg']),
    );
    const custom = normalizeMeatLoversSettings({ menuTitleEn: 'The {name} counter', menuTitleAr: 'ركن {name}' });
    expect(meatLoversCopy(custom, 'menuTitle', 'en', 'Meat Lovers')).toBe('The Meat Lovers counter');
    expect(meatLoversCopy(custom, 'menuTitle', 'ar', 'ميت لافرز')).toBe('ركن ميت لافرز');
    expect(meatLoversCopy(DEFAULT_MEAT_LOVERS_SETTINGS, 'menuTitle', 'en', 'Meat Lovers')).toBe('The menu, done right.');
  });

  it('stays byte-identical with the Web copy used for the live draft preview', () => {
    const api = readFileSync(join(__dirname, 'meat-lovers-menu-config.ts'), 'utf8').replace(/\r\n/g, '\n');
    const web = readFileSync(
      join(__dirname, '../../../web/src/lib/public-menu/meat-lovers-settings.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(web).toBe(api);
  });
});
