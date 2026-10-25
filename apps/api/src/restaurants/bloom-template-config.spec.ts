import {
  DEFAULT_BLOOM_SETTINGS,
  isStoredBloomImagePath,
  normalizeBloomSettings,
} from './bloom-template-config';

describe('BLOOM premium appearance', () => {
  it('keeps the original Cormorant demo copy as actual default values', () => {
    expect(normalizeBloomSettings(null)).toEqual(DEFAULT_BLOOM_SETTINGS);
    expect(normalizeBloomSettings({ headlineTopAr: '', headlineMiddleAr: '' }))
      .toEqual(DEFAULT_BLOOM_SETTINGS);
    expect(DEFAULT_BLOOM_SETTINGS.headlineTopAr).toBe('sweet');
    expect(DEFAULT_BLOOM_SETTINGS.headlineMiddleAr).toBe('little');
    expect(DEFAULT_BLOOM_SETTINGS.headlineBottomAr).toBe('things.');
    expect(DEFAULT_BLOOM_SETTINGS.sectionHeadlineAr).toBe('The sweet selection.');
    expect(DEFAULT_BLOOM_SETTINGS.heroImageMode).toBe('ART');
  });
  it('permits only uploaded server-generated media paths and curated palettes', () => {
    const valid = '/media/9c81c329-d31e-4655-97bf-e4136288ace7.webp';
    expect(isStoredBloomImagePath(valid)).toBe(true);
    const settings = normalizeBloomSettings({
      palette: 'LILAC', motion: 'OFF',
      heroImageMode: 'CUSTOM', heroImageAssetPath: valid,
      headlineTopAr: '  عنوان مطعم  ',
      headlineMiddleEn: 'X'.repeat(200),
      extraCss: 'body{display:none}',
    });
    expect(settings.palette).toBe('LILAC');
    expect(settings.motion).toBe('OFF');
    expect(settings.heroImageMode).toBe('CUSTOM');
    expect(settings.heroImageAssetPath).toBe(valid);
    expect(settings.headlineTopAr).toBe('عنوان مطعم');
    expect(settings.headlineMiddleEn).toHaveLength(60);
    expect(Object.keys(settings).sort()).toEqual(Object.keys(DEFAULT_BLOOM_SETTINGS).sort());
  });
  it('never accepts a third-party media URL as a BLOOM image', () => {
    for (const bad of ['https://evil.example/img.svg', '/media/../../secret.jpg', 'data:image/svg+xml;base64,AA==']) {
      const settings = normalizeBloomSettings({ heroImageMode: 'CUSTOM', heroImageAssetPath: bad });
      expect(settings.heroImageMode).toBe('ART');
      expect(settings.heroImageAssetPath).toBeNull();
    }
  });
});
