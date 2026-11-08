/**
 * The QR stand: one A6 portrait card (105 x 148 mm) with four ready-made looks.
 *
 * Everything is plain SVG in millimetres, so the card prints sharp at any size
 * (A6 as designed, A5 scaled up) and the preview, the PNG and the PDF are the
 * same drawing. The QR itself is drawn from the module matrix (`qr-matrix.ts`),
 * always black on white with a 4-module quiet zone, so a colour choice can never
 * make the code unreadable.
 *
 * Pure and dependency free on purpose (no DOM, no runtime imports): it runs in
 * the browser and in the node contract tests.
 */

export type StandTemplate = 'classic' | 'dark' | 'bold' | 'minimal';
export const STAND_TEMPLATES: readonly StandTemplate[] = ['classic', 'dark', 'bold', 'minimal'];

export type StandCaptionLang = 'ar' | 'en' | 'both';
export const STAND_CAPTION_LANGS: readonly StandCaptionLang[] = ['ar', 'en', 'both'];

/** Boolean module matrix: `matrix[row][col]` is true for a dark module. */
export type QrMatrix = readonly (readonly boolean[])[];

export interface StandOptions {
  template: StandTemplate;
  /** The one main colour, `#RRGGBB`. */
  color: string;
  captionLang: StandCaptionLang;
  nameAr: string;
  nameEn: string;
  showLogo: boolean;
  /** The restaurant logo as a `data:` URL (an SVG used as an image cannot load external files). */
  logoDataUrl: string | null;
  /** Shown as a "Table 7" tag when set. */
  tableNumber: string | null;
  matrix: QrMatrix;
  /** `@font-face` rules to embed (the export needs them; inline previews use the page fonts). */
  fontCss?: string;
  /** `mm` writes the physical size (print / export); `fluid` lets CSS size it (preview). */
  sizing?: 'mm' | 'fluid';
  /** Distinguishes `id`s when several cards are inlined in one page. */
  idPrefix?: string;
}

export const STAND_WIDTH_MM = 105;
export const STAND_HEIGHT_MM = 148;
/** About 300 dpi on A6. */
export const STAND_PNG_WIDTH = 1240;
export const STAND_PNG_HEIGHT = 1748;

export const STAND_DEFAULT_COLOR = '#C2410C';
export const STAND_COLOR_PRESETS = [
  '#C2410C',
  '#166534',
  '#1D4ED8',
  '#7C3AED',
  '#BE123C',
  '#0F766E',
  '#CA8A04',
  '#111827',
] as const;

export const HEX6 = /^#[0-9a-fA-F]{6}$/;

export const STAND_FONT_FAMILY =
  "'IBM Plex Sans Arabic','IBM Plex Sans','Segoe UI',Tahoma,'Noto Sans Arabic',Arial,sans-serif";

export const STAND_CAPTION_AR = 'امسح الكود لتصفح المنيو';
export const STAND_CAPTION_EN = 'Scan to view the menu';
export const STAND_FOOTER_AR = 'مدعوم من';
export const STAND_FOOTER_AR_BRAND = 'ويتا';
export const STAND_FOOTER_EN = 'Powered by';
export const STAND_FOOTER_EN_BRAND = 'Wayta';
export const STAND_TABLE_AR = 'طاولة';
export const STAND_TABLE_EN = 'Table';

/* ------------------------------ text helpers ------------------------------ */

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
function toArabicIndic(value: string): string {
  return value.replace(/\d/g, (digit) => ARABIC_INDIC[Number(digit)] ?? digit);
}

function isAsciiOnly(value: string): boolean {
  return /^[\x00-\x7f]*$/.test(value);
}

/** Shrinks a line so a long name still fits the card width (a rough width estimate is enough). */
function fitFontSize(text: string, size: number, maxWidth: number): number {
  const estimated = Array.from(text).length * size * 0.54;
  if (estimated <= maxWidth) return size;
  return Math.max(size * 0.5, (maxWidth / estimated) * size);
}

function n(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/* ------------------------------ colour helpers ----------------------------- */

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(hex: string, towards: string, amount: number): string {
  const parts = [1, 3, 5].map((i) => {
    const from = parseInt(hex.slice(i, i + 2), 16);
    const to = parseInt(towards.slice(i, i + 2), 16);
    return Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${parts.join('')}`;
}

/** White or near-black text, whichever reads better on `background`. */
export function inkOn(background: string): string {
  return contrast(background, '#ffffff') >= contrast(background, '#14100c') ? '#ffffff' : '#14100c';
}

/** `color` nudged lighter or darker until it is readable (>= `min`) as text on `background`. */
export function readableOn(color: string, background: string, min = 3): string {
  if (contrast(color, background) >= min) return color;
  const towards = luminance(background) > 0.4 ? '#000000' : '#ffffff';
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(color, towards, step * 0.05);
    if (contrast(candidate, background) >= min) return candidate;
  }
  return towards;
}

/** A well-formed `#RRGGBB`, else the default colour. */
export function normalizeStandColor(value: string): string {
  return HEX6.test(value) ? value.toUpperCase() : STAND_DEFAULT_COLOR;
}

/* --------------------------------- the QR ---------------------------------- */

/**
 * The code as one SVG path inside a square `box` (millimetres) whose edges are
 * the quiet zone: the module size is chosen so `matrix + 4 modules each side`
 * fills the box exactly. Horizontal runs are merged to keep the path small.
 */
export function qrPath(matrix: QrMatrix, x: number, y: number, box: number, quiet = 4): string {
  const count = matrix.length;
  const cell = box / (count + quiet * 2);
  let d = '';
  for (let row = 0; row < count; row += 1) {
    let col = 0;
    while (col < count) {
      if (matrix[row][col]) {
        let end = col;
        while (end < count && matrix[row][end]) end += 1;
        d += `M${n(x + (col + quiet) * cell)} ${n(y + (row + quiet) * cell)}h${n((end - col) * cell)}v${n(cell)}h-${n((end - col) * cell)}z`;
        col = end;
      } else {
        col += 1;
      }
    }
  }
  return d;
}

export interface QrOnlySvgOptions {
  transparent?: boolean;
  /** Pixel size written on the root element (the drawing itself scales freely). */
  px?: number;
  quiet?: number;
}

/** The code alone, black on white (or no background), quiet zone included. */
export function buildQrOnlySvg(matrix: QrMatrix, options: QrOnlySvgOptions = {}): string {
  const quiet = options.quiet ?? 4;
  const px = options.px ?? 1024;
  const total = matrix.length + quiet * 2;
  const background = options.transparent ? '' : `<rect width="${total}" height="${total}" fill="#ffffff"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" shape-rendering="crispEdges">` +
    `${background}<path fill="#000000" d="${qrPath(matrix, 0, 0, total, quiet)}"/></svg>`
  );
}

/* -------------------------------- the stand -------------------------------- */

interface Ctx {
  o: StandOptions;
  color: string;
  names: string[];
  captions: string[];
  hasLogo: boolean;
  letter: string;
  uid: string;
}

function names(o: StandOptions): string[] {
  const ar = o.nameAr.trim();
  const en = o.nameEn.trim();
  if (o.captionLang === 'en') return [en || ar].filter(Boolean);
  if (o.captionLang === 'ar') return [ar || en].filter(Boolean);
  return [ar, en].filter(Boolean);
}

function captions(lang: StandCaptionLang): string[] {
  return lang === 'ar' ? [STAND_CAPTION_AR] : lang === 'en' ? [STAND_CAPTION_EN] : [STAND_CAPTION_AR, STAND_CAPTION_EN];
}

function footer(fill: string, y: number): string {
  return (
    `<text x="52.5" y="${y}" text-anchor="middle" fill="${fill}" font-size="3.1" font-weight="400">` +
    `${STAND_FOOTER_AR} <tspan font-weight="600">${STAND_FOOTER_AR_BRAND}</tspan> · ${STAND_FOOTER_EN} <tspan font-weight="600">${STAND_FOOTER_EN_BRAND}</tspan></text>`
  );
}

function logoMark(c: Ctx, cx: number, cy: number, r: number, fill: string, ink: string, stroke?: string): string {
  if (!c.hasLogo) return '';
  const ring = stroke ? ` stroke="${stroke}" stroke-width=".7"` : '';
  if (c.o.logoDataUrl) {
    const box = (r - 0.9) * 2;
    const clip = `${c.uid}logo`;
    return (
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"${ring}/>` +
      `<clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${n(r - 0.5)}"/></clipPath>` +
      `<image href="${escapeXml(c.o.logoDataUrl)}" x="${n(cx - box / 2)}" y="${n(cy - box / 2)}" width="${n(box)}" height="${n(box)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clip})"/>`
    );
  }
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${ring}/>` +
    `<text x="${cx}" y="${n(cy + r * 0.36)}" font-size="${n(r * 1.05)}" font-weight="600" text-anchor="middle" fill="${ink}">${escapeXml(c.letter)}</text>`
  );
}

function tableTag(c: Ctx, cx: number, y: number, fill: string, ink: string, h = 7.6): string {
  const table = c.o.tableNumber?.trim();
  if (!table) return '';
  const english = c.o.captionLang === 'en';
  const label = english ? `${STAND_TABLE_EN} ${escapeXml(table)}` : `${STAND_TABLE_AR} ${escapeXml(toArabicIndic(table))}`;
  const width = Math.max(30, Array.from(label).length * 2.9 + 10);
  return (
    `<rect x="${n(cx - width / 2)}" y="${y}" width="${n(width)}" height="${h}" rx="${h / 2}" fill="${fill}"/>` +
    `<text x="${cx}" y="${n(y + h * 0.7)}" text-anchor="middle" font-size="4.2" font-weight="600" fill="${ink}">${label}</text>`
  );
}

function nameBlock(c: Ctx, y: number, size: number, fill: string): string {
  return c.names
    .map((line, index) => {
      const lineSize = fitFontSize(line, index ? size * 0.62 : size, 86);
      const dir = isAsciiOnly(line) ? ' direction="ltr"' : '';
      const lineY = y + (index ? size * 1.05 + 1 : 0);
      return `<text x="52.5" y="${n(lineY)}" text-anchor="middle" font-size="${n(lineSize)}" font-weight="600" fill="${fill}"${dir}>${escapeXml(line)}</text>`;
    })
    .join('');
}

function captionBlock(c: Ctx, y: number, fill: string, sub: string): string {
  return c.captions
    .map(
      (line, index) =>
        `<text x="52.5" y="${n(y + index * 5.4)}" text-anchor="middle" font-size="${index ? 3.6 : 4.6}" font-weight="${index ? 400 : 600}" fill="${index ? sub : fill}">${escapeXml(line)}</text>`,
    )
    .join('');
}

function qr(c: Ctx, x: number, y: number, box: number): string {
  return `<path fill="#000000" shape-rendering="crispEdges" d="${qrPath(c.o.matrix, x, y, box)}"/>`;
}

const BODY: Record<StandTemplate, (c: Ctx) => string> = {
  classic(c) {
    const accent = c.color;
    const logoY = 29;
    return (
      `<rect width="105" height="148" fill="#fffdf9"/><rect width="105" height="14" fill="${accent}"/>` +
      tableTag(c, 52.5, 3.2, '#ffffff', readableOn(accent, '#ffffff')) +
      logoMark(c, 52.5, logoY, 8.5, accent, inkOn(accent)) +
      nameBlock(c, c.hasLogo ? 49 : 38, 8, '#1f2937') +
      `<rect x="22.5" y="64" width="60" height="60" rx="6" fill="#ffffff" stroke="${accent}" stroke-width="1.2"/>` +
      qr(c, 22.5, 64, 60) +
      captionBlock(c, 132, '#1f2937', '#64748b') +
      `<rect x="30" y="140" width="45" height=".3" fill="#cbd5e1"/>` +
      footer('#94a3b8', 144.5)
    );
  },
  dark(c) {
    const bg = '#14100c';
    const accent = readableOn(c.color, bg, 3);
    return (
      `<rect width="105" height="148" fill="${bg}"/>` +
      `<rect x="4" y="4" width="97" height="140" rx="5" fill="none" stroke="${accent}" stroke-width=".6"/>` +
      logoMark(c, 52.5, 17, 7, accent, inkOn(accent)) +
      nameBlock(c, c.hasLogo ? 34 : 24, 8, '#fff7ea') +
      `<rect x="22.5" y="46" width="60" height="60" rx="7" fill="#ffffff"/>` +
      qr(c, 22.5, 46, 60) +
      `<path d="M22.5 53v-3a4 4 0 0 1 4-4h4M82.5 53v-3a4 4 0 0 0-4-4h-4M22.5 99v3a4 4 0 0 0 4 4h4M82.5 99v3a4 4 0 0 1-4 4h-4" fill="none" stroke="${accent}" stroke-width="1.4"/>` +
      captionBlock(c, 116, '#fff7ea', '#c9b79c') +
      tableTag(c, 52.5, 125, accent, inkOn(accent)) +
      footer('#8a7b66', 139.5)
    );
  },
  bold(c) {
    const accent = c.color;
    const ink = inkOn(accent);
    return (
      `<rect width="105" height="148" fill="#ffffff"/>` +
      `<path d="M0 0H105V70Q52.5 92 0 70Z" fill="${accent}"/>` +
      tableTag(c, 52.5, 2.5, ink, ink === '#ffffff' ? readableOn(accent, '#ffffff') : accent, 7) +
      logoMark(c, 52.5, 19, 7.5, ink, accent) +
      nameBlock(c, c.hasLogo ? 37 : 26, 8.4, ink) +
      `<rect x="22.5" y="56.7" width="60" height="60" rx="7" fill="#000000" opacity=".16"/>` +
      `<rect x="22.5" y="56" width="60" height="60" rx="7" fill="#ffffff"/>` +
      qr(c, 22.5, 56, 60) +
      captionBlock(c, 128, '#1f2937', '#64748b') +
      footer('#94a3b8', 144.5)
    );
  },
  minimal(c) {
    const accent = c.color;
    const rule = c.hasLogo ? 50 : 39;
    return (
      `<rect width="105" height="148" fill="#ffffff"/>` +
      `<rect x="5" y="5" width="95" height="138" fill="none" stroke="${accent}" stroke-width=".9"/>` +
      `<rect x="7.5" y="7.5" width="90" height="133" fill="none" stroke="${accent}" stroke-width=".25"/>` +
      logoMark(c, 52.5, 19, 7.5, accent, inkOn(accent), accent) +
      nameBlock(c, c.hasLogo ? 37 : 26, 7.6, '#111827') +
      `<path d="M30 ${rule}h18M57 ${rule}h18" stroke="${accent}" stroke-width=".4"/><circle cx="52.5" cy="${rule}" r="1.2" fill="${accent}"/>` +
      qr(c, 23.5, 52, 58) +
      captionBlock(c, 115, '#111827', '#64748b') +
      tableTag(c, 52.5, 124, accent, inkOn(accent)) +
      footer('#94a3b8', 137.5)
    );
  },
};

/** The whole stand as a standalone SVG document string. */
export function buildStandSvg(options: StandOptions): string {
  const color = normalizeStandColor(options.color);
  const lines = names(options);
  const first = (options.nameAr.trim() || options.nameEn.trim() || '؟').trim();
  const ctx: Ctx = {
    o: options,
    color,
    names: lines,
    captions: captions(options.captionLang),
    hasLogo: options.showLogo,
    letter: Array.from(first)[0] ?? '؟',
    uid: (options.idPrefix ?? 'stand').replace(/[^a-zA-Z0-9_-]/g, ''),
  };
  const size = options.sizing === 'fluid' ? '' : ` width="${STAND_WIDTH_MM}mm" height="${STAND_HEIGHT_MM}mm"`;
  const defs = options.fontCss ? `<defs><style>${options.fontCss}</style></defs>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STAND_WIDTH_MM} ${STAND_HEIGHT_MM}"${size} ` +
    `font-family="${STAND_FONT_FAMILY.replace(/"/g, "'")}" direction="rtl">` +
    `${defs}${BODY[options.template](ctx)}</svg>`
  );
}

/** Splits a restaurant name into the Arabic / English slots by script. */
export function defaultStandNames(name: string): { nameAr: string; nameEn: string } {
  const trimmed = name.trim();
  return /[؀-ۿ]/.test(trimmed) ? { nameAr: trimmed, nameEn: '' } : { nameAr: '', nameEn: trimmed };
}
