import {
  contrastRatio,
  DEFAULT_QR_STYLE,
  HEX_COLOR_PATTERN,
  validateQrStyle,
} from './qr-style';

describe('qr-style', () => {
  it('the default style is valid and has the maximum contrast', () => {
    expect(validateQrStyle(DEFAULT_QR_STYLE, false)).toBeNull();
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('accepts dark modules on a light background with enough contrast', () => {
    expect(
      validateQrStyle(
        { foregroundColor: '#14532D', backgroundColor: '#F0FDF4', showLogo: false, showName: true },
        false,
      ),
    ).toBeNull();
  });

  it('refuses an inverted code (light modules on a darker background)', () => {
    expect(
      validateQrStyle(
        { foregroundColor: '#FFFFFF', backgroundColor: '#000000', showLogo: false, showName: true },
        false,
      ),
    ).toBe('QR_STYLE_INVERTED');
  });

  it('refuses colors that are too close to scan reliably', () => {
    expect(
      validateQrStyle(
        { foregroundColor: '#AAAAAA', backgroundColor: '#CCCCCC', showLogo: false, showName: true },
        false,
      ),
    ).toBe('QR_STYLE_LOW_CONTRAST');
    // dark enough to read but only just under the threshold
    expect(contrastRatio('#808080', '#FFFFFF')).toBeLessThan(4.5);
  });

  it('refuses a logo the restaurant does not have, and accepts it once there is one', () => {
    const style = { ...DEFAULT_QR_STYLE, showLogo: true };
    expect(validateQrStyle(style, false)).toBe('QR_STYLE_LOGO_REQUIRED');
    expect(validateQrStyle(style, true)).toBeNull();
  });

  it('only accepts #RRGGBB hex colors', () => {
    expect(HEX_COLOR_PATTERN.test('#1a2B3c')).toBe(true);
    for (const bad of ['red', '#FFF', '#GGGGGG', '000000', '#0000000']) {
      expect(HEX_COLOR_PATTERN.test(bad)).toBe(false);
    }
  });
});
