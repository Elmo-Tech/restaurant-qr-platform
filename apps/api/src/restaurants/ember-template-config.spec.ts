import { DEFAULT_EMBER_SETTINGS, normalizeEmberSettings } from './ember-template-config';

describe('EMBER premium template settings', () => {
  it('uses a stable safe default for missing/invalid JSON', () => {
    expect(normalizeEmberSettings(null)).toEqual(DEFAULT_EMBER_SETTINGS);
    expect(normalizeEmberSettings([])).toEqual(DEFAULT_EMBER_SETTINGS);
    expect(normalizeEmberSettings({ palette: 'CSS: url(evil)', motion: 'SPEED' })).toEqual(
      DEFAULT_EMBER_SETTINGS,
    );
  });

  it('keeps only the fixed palette/motion and bounded localized text', () => {
    const result = normalizeEmberSettings({
      palette: 'COPPER',
      motion: 'OFF',
      headlineAr: '   عنوان عربي   ',
      headlineEn: 'X'.repeat(120),
      subtitleAr: '  وصف مختصر ',
      subtitleEn: 'Y'.repeat(240),
      customCss: 'body { display: none }',
      heroUrl: 'https://example.com/unknown.jpg',
    });
    expect(result.palette).toBe('COPPER');
    expect(result.motion).toBe('OFF');
    expect(result.headlineAr).toBe('عنوان عربي');
    expect(result.headlineEn).toHaveLength(80);
    expect(result.subtitleAr).toBe('وصف مختصر');
    expect(result.subtitleEn).toHaveLength(180);
    expect(Object.keys(result).sort()).toEqual(Object.keys(DEFAULT_EMBER_SETTINGS).sort());
  });
});
