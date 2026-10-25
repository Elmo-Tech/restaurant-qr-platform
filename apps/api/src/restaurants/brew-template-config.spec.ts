import { DEFAULT_BREW_SETTINGS, isBrewCategoryId, normalizeBrewSettings } from './brew-template-config';

describe('BREW premium promotion settings', () => {
  const category = 'a0b1c2d3-1111-4222-8333-ffeeddccbbaa';
  it('preserves the approved demo reference and default card', () => {
    const config = normalizeBrewSettings(null);
    expect(config.headlineTopAr).toBe('Coffee,');
    expect(config.headlineBottomAr).toBe('slowly.');
    expect(config.promoHeadlineAr).toBe('Take a little break.');
    expect(config.promoEnabled).toBe(true);
    expect(config.promoMode).toBe('STATIC');
    expect(config.palette).toBe('FOREST');
    expect(config).toEqual(DEFAULT_BREW_SETTINGS);
  });
  it('accepts only three curated color palettes, preserving the default for old drafts', () => {
    expect(normalizeBrewSettings({palette: 'MOCHA'}).palette).toBe('MOCHA');
    expect(normalizeBrewSettings({palette: 'SAGE'}).palette).toBe('SAGE');
    expect(normalizeBrewSettings({palette: 'invalid'}).palette).toBe('FOREST');
    expect(normalizeBrewSettings({}).palette).toBe('FOREST');
  });
  it('sanitizes category-specific overrides and disallows foreign image URLs', () => {
    expect(isBrewCategoryId(category)).toBe(true);
    const settings = normalizeBrewSettings({
      promoMode: 'BY_CATEGORY', promoImageMode: 'CUSTOM',
      promoImageAssetPath: 'https://untrusted.example/cup.svg',
      categoryPromos: {
        [category]: { promoHeadlineAr: '  قهوة القسم  ', promoDescriptionAr: 'حلو' },
        '__proto__': { promoHeadlineAr: 'bad' },
        'INVALID': { promoHeadlineAr: 'bad' },
      },
      css: 'body { display:none }',
    });
    expect(settings.promoImageMode).toBe('ART');
    expect(settings.promoImageAssetPath).toBeNull();
    expect(settings.categoryPromos[category].promoHeadlineAr).toBe('قهوة القسم');
    expect(Object.keys(settings.categoryPromos)).toEqual([category]);
    expect(settings.categoryPromos[category].promoLabelAr).toBe('THE HOUSE SPECIAL');
    expect('css' in settings).toBe(false);
  });
});
