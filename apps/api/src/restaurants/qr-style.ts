/**
 * Restaurant QR appearance rules. A QR code is only useful if phones can read
 * it, so a style is accepted only when it stays scannable: dark modules on a
 * lighter background (many scanners cannot read inverted codes) with enough
 * contrast. Pure functions, mirrored in the Staff UI for live feedback; the
 * Backend remains the authority.
 */

export interface QrStyle {
  foregroundColor: string;
  backgroundColor: string;
  showLogo: boolean;
  showName: boolean;
}

export const DEFAULT_QR_STYLE: QrStyle = {
  foregroundColor: '#000000',
  backgroundColor: '#FFFFFF',
  showLogo: false,
  showName: true,
};

/** Minimum luminance contrast ratio between modules and background. */
export const MIN_QR_CONTRAST_RATIO = 4;

export type QrStyleErrorCode = 'QR_STYLE_LOW_CONTRAST' | 'QR_STYLE_INVERTED' | 'QR_STYLE_LOGO_REQUIRED';

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a `#rrggbb` color. */
export function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * `null` when the style is acceptable. `hasLogo`: whether the Restaurant has
 * uploaded a logo (showing a logo that does not exist is refused).
 */
export function validateQrStyle(style: QrStyle, hasLogo: boolean): QrStyleErrorCode | null {
  if (relativeLuminance(style.foregroundColor) >= relativeLuminance(style.backgroundColor)) {
    return 'QR_STYLE_INVERTED';
  }
  if (contrastRatio(style.foregroundColor, style.backgroundColor) < MIN_QR_CONTRAST_RATIO) {
    return 'QR_STYLE_LOW_CONTRAST';
  }
  if (style.showLogo && !hasLogo) {
    return 'QR_STYLE_LOGO_REQUIRED';
  }
  return null;
}
