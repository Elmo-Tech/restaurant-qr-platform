import {
  DEFAULT_EMBER_SETTINGS,
  isStoredEmberHeroAssetPath,
  normalizeEmberSettings,
} from './ember-template-config';

describe('EMBER premium template settings', () => {
  it('loads the real default copy into all fields, including legacy empty values', () => {
    expect(normalizeEmberSettings(null)).toEqual(DEFAULT_EMBER_SETTINGS);
    expect(normalizeEmberSettings([])).toEqual(DEFAULT_EMBER_SETTINGS);
    expect(normalizeEmberSettings({ headlineAr: '', subtitleEn: '' })).toEqual(DEFAULT_EMBER_SETTINGS);
    expect(DEFAULT_EMBER_SETTINGS.headlineAr).toBe('FIRE FIRST.');
    expect(DEFAULT_EMBER_SETTINGS.navTaglineAr).toBe('نكهة مختلفة · طعم لا يُنسى');
    expect(DEFAULT_EMBER_SETTINGS.marqueeAr).toContain('MADE WITH FIRE');
  });

  it('rejects custom external paths while keeping uploaded server-generated assets', () => {
    const valid = '/media/9c81c329-d31e-4655-97bf-e4136288ace7.webp';
    expect(isStoredEmberHeroAssetPath(valid)).toBe(true);
    expect(normalizeEmberSettings({ heroImageMode: 'CUSTOM', heroImageAssetPath: valid })
      .heroImageMode).toBe('CUSTOM');
    for (const path of ['https://bad.example/a.png', '../../file.png', '/media/../../etc/passwd']) {
      expect(normalizeEmberSettings({ heroImageMode: 'CUSTOM', heroImageAssetPath: path })
        .heroImageMode).toBe('AUTO');
    }
  });

  it('whitelists only curated presets, valid photo paths and bounded text', () => {
    const settings = normalizeEmberSettings({
      palette: 'COPPER',
      motion: 'OFF',
      headlineAr: '  عنوان عربي  ',
      headlineEn: 'X'.repeat(120),
      subtitleAr: '  وصف مختصر ',
      subtitleEn: 'Y'.repeat(240),
      signatureAr: 'Z'.repeat(220),
      heroImageMode: 'CUSTOM',
      heroImageAssetPath: 'https://example.com/fake.png',
      customCss: 'body { display: none }',
    });
    expect(settings.palette).toBe('COPPER');
    expect(settings.motion).toBe('OFF');
    expect(settings.headlineAr).toBe('عنوان عربي');
    expect(settings.headlineEn).toHaveLength(80);
    expect(settings.subtitleAr).toBe('وصف مختصر');
    expect(settings.subtitleEn).toHaveLength(180);
    expect(settings.signatureAr).toHaveLength(120);
    expect(settings.heroImageMode).toBe('AUTO');
    expect(settings.heroImageAssetPath).toBeNull();
    expect(Object.keys(settings).sort()).toEqual(Object.keys(DEFAULT_EMBER_SETTINGS).sort());
  });
});
