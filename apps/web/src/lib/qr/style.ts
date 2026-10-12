/**
 * Restaurant QR appearance. Mirrors the Backend rules
 * (`apps/api/src/restaurants/qr-style.ts`) so the designer can give instant
 * feedback; the Backend re-validates every save and stays the authority.
 *
 * A QR code is only useful if phones can read it: modules must be DARKER than
 * the background (many scanners cannot read inverted codes) with enough
 * contrast.
 */

export interface QrStyle {
  foregroundColor: string;
  backgroundColor: string;
  /** Draw the restaurant logo in the center of the code. */
  showLogo: boolean;
  /** Show the restaurant name under the code. */
  showName: boolean;
}

export const DEFAULT_QR_STYLE: QrStyle = {
  foregroundColor: '#000000',
  backgroundColor: '#FFFFFF',
  showLogo: false,
  showName: true,
};

export const MIN_QR_CONTRAST_RATIO = 4;

/** Curated, scan-safe themes (all well above the contrast threshold). */
export const QR_PRESETS = [
  { key: 'classic', foregroundColor: '#000000', backgroundColor: '#FFFFFF' },
  { key: 'charcoal', foregroundColor: '#1F2937', backgroundColor: '#F3F4F6' },
  { key: 'espresso', foregroundColor: '#4A2511', backgroundColor: '#FFF8F0' },
  { key: 'forest', foregroundColor: '#14532D', backgroundColor: '#F0FDF4' },
  { key: 'navy', foregroundColor: '#1E3A8A', backgroundColor: '#EFF6FF' },
] as const;

export type QrPresetKey = (typeof QR_PRESETS)[number]['key'];

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

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

export type QrColorIssue = 'inverted' | 'lowContrast' | null;

/** `null` when the two colors make a code that scans reliably. */
export function colorIssue(foreground: string, background: string): QrColorIssue {
  if (!HEX_COLOR_PATTERN.test(foreground) || !HEX_COLOR_PATTERN.test(background)) return null;
  if (relativeLuminance(foreground) >= relativeLuminance(background)) return 'inverted';
  if (contrastRatio(foreground, background) < MIN_QR_CONTRAST_RATIO) return 'lowContrast';
  return null;
}

export function sameStyle(a: QrStyle, b: QrStyle): boolean {
  return (
    a.foregroundColor.toUpperCase() === b.foregroundColor.toUpperCase() &&
    a.backgroundColor.toUpperCase() === b.backgroundColor.toUpperCase() &&
    a.showLogo === b.showLogo &&
    a.showName === b.showName
  );
}
