import { DEFAULT_FOLIO_SETTINGS, normalizeFolioSettings } from './folio-template-config';
describe('FOLIO premium defaults and security', () => {
  it('preserves the reference typography copy by default', () => {
    expect(normalizeFolioSettings({})).toEqual(DEFAULT_FOLIO_SETTINGS);
    expect(normalizeFolioSettings(null).headlineEn).toBe('Every meal tells a story.');
  });
  it('only accepts curated palettes and reduced-motion option', () => {
    expect(normalizeFolioSettings({ palette: 'BURGUNDY', motion: 'OFF' }).palette).toBe('BURGUNDY');
    expect(normalizeFolioSettings({ palette: 'MIDNIGHT' }).palette).toBe('MIDNIGHT');
    expect(normalizeFolioSettings({ palette: 'HACK' }).palette).toBe('FOREST');
    expect(normalizeFolioSettings({ motion: 'HACK' }).motion).toBe('SUBTLE');
  });
  it('forbids untrusted image URLs and arbitrary CSS', () => {
    const settings = normalizeFolioSettings({
      artworkMode: 'CUSTOM', artworkAssetPath: 'https://example.com/evil.svg',
      css: 'body { display:none }', headlineEn: '  Test  ',
    });
    expect(settings.artworkMode).toBe('ILLUSTRATION');
    expect(settings.artworkAssetPath).toBeNull();
    expect(settings.headlineEn).toBe('Test');
    expect('css' in settings).toBe(false);
    expect(settings.categoryArtwork).toEqual({});
    expect(normalizeFolioSettings({
      categoryArtwork: {
        'a0b1c2d3-1111-4222-8333-ffeeddccbbaa': 'https://untrusted.example/image.svg',
        '__proto__': '/media/01234567-89ab-4cde-8f01-23456789abcd.webp',
      },
    }).categoryArtwork).toEqual({});
  });
  it('allows server-owned artwork paths only', () => {
    const path = '/media/01234567-89ab-4cde-8f01-23456789abcd.webp';
    expect(normalizeFolioSettings({ artworkMode: 'CUSTOM', artworkAssetPath: path }))
      .toMatchObject({ artworkMode: 'CUSTOM', artworkAssetPath: path });
  });
});
