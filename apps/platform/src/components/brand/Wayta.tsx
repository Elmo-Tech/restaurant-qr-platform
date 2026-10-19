import type { CSSProperties } from 'react';

/**
 * The Wayta brand (master files live in `/brand-assets`). Drawn as inline SVG
 * so it stays sharp at every size, costs no request and follows the surface it
 * sits on:
 *  - `tone="dark"`  -> for dark surfaces (cream ink, saffron accent)
 *  - `tone="light"` -> for light surfaces (graphite ink, burnt-saffron accent)
 *  - `tone="auto"`  -> reads `--wayta-ink` / `--wayta-sub` from CSS, so a themed
 *    app can switch both with one rule.
 * The horizontal lockup is the bilingual one (wayta | ويتا) in every UI language.
 *
 * Keep this file identical in `apps/web` and `apps/platform`.
 */
export type WaytaTone = 'light' | 'dark' | 'auto';

const SAFFRON = '#F5A524';
const GRAPHITE = '#12100E';

const TONE_VARS = {
  light: { '--wayta-ink': GRAPHITE, '--wayta-sub': '#A9580A' },
  dark: { '--wayta-ink': '#FBF6EE', '--wayta-sub': SAFFRON },
} as const;

function toneVars(tone: WaytaTone): CSSProperties | undefined {
  return tone === 'auto' ? undefined : (TONE_VARS[tone] as CSSProperties);
}

const INK_FILL: CSSProperties = { fill: `var(--wayta-ink, ${GRAPHITE})` };
const INK_STROKE: CSSProperties = { stroke: `var(--wayta-ink, ${GRAPHITE})` };
const SUB_FILL: CSSProperties = { fill: 'var(--wayta-sub, #A9580A)' };
const SUB_STROKE: CSSProperties = { stroke: 'var(--wayta-sub, #A9580A)' };

/** The serving-cloche mark: a smiling dome on its plate. */
export function WaytaMark({
  tone = 'auto',
  size,
  className,
}: {
  tone?: WaytaTone;
  /** Rendered height in px (width follows the artwork). Omit to size with `className`. */
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="2 14 96 67"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ ...toneVars(tone), height: size, width: 'auto' }}
    >
      <path d="M12 66 A38 38 0 0 1 88 66 Z" fill={SAFFRON} />
      <rect x="4" y="70" width="92" height="9" rx="4.5" style={INK_FILL} />
      <circle cx="50" cy="22" r="6" fill={SAFFRON} />
      <circle cx="40" cy="45" r="3.6" fill={GRAPHITE} />
      <circle cx="60" cy="45" r="3.6" fill={GRAPHITE} />
      <path d="M37 54 Q50 63 63 54" fill="none" stroke={GRAPHITE} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** The word "wayta" or "ويتا". `accent` paints it in the secondary brand colour (the Arabic line under the Latin one). */
export function WaytaWordmark({
  script,
  accent = false,
  tone = 'auto',
  size,
  className,
}: {
  script: 'latin' | 'arabic';
  accent?: boolean;
  tone?: WaytaTone;
  size?: number;
  className?: string;
}) {
  const fill = accent ? SUB_FILL : INK_FILL;
  const stroke = accent ? SUB_STROKE : INK_STROKE;
  const style = { ...toneVars(tone), height: size, width: 'auto' };

  if (script === 'arabic') {
    return (
      <svg viewBox="0 20 184 117" aria-hidden="true" focusable="false" className={className} style={style}>
        <path
          d="M7.5 29 V85 A8 8 0 0 0 15.5 93 H97.5 A8 8 0 0 0 105.5 85 V60 M77.5 93 V60 M162 72 A14 14 0 1 1 162 71.9 M162 72 V98 Q162 126 134 128"
          fill="none"
          strokeWidth="15"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={stroke}
        />
        <circle cx="68.5" cy="41" r="7.5" style={fill} />
        <circle cx="86.5" cy="41" r="7.5" style={fill} />
        <circle cx="96.5" cy="115" r="7.5" style={fill} />
        <circle cx="114.5" cy="115" r="7.5" style={fill} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 20 324 116" aria-hidden="true" focusable="false" className={className} style={style}>
      <path
        d="M7.5 51 V79 A14 14 0 0 0 35.5 79 V64 M35.5 79 A14 14 0 0 0 63.5 79 V51 M129 72 A21 21 0 1 1 129 71.9 M129 51 V93 M152 51 V77 A14 14 0 0 0 180 77 M180 51 V110 A17 17 0 0 1 163 127 H156 M212 29 V80 A13 13 0 0 0 225 93 H231 M201 51 H228 M295 72 A21 21 0 1 1 295 71.9 M295 51 V93"
        fill="none"
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={stroke}
      />
    </svg>
  );
}

/**
 * The primary horizontal lockup, identical in every UI language: mark, "wayta",
 * a hairline divider and "ويتا" (master: `wayta-horizontal-bilingual-*.svg`).
 * `size` is the total height in px; the width follows (about 5.8 : 1).
 */
export function WaytaLockup({
  tone = 'auto',
  size = 32,
  className,
}: {
  tone?: WaytaTone;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 14 688 118"
      role="img"
      aria-label="Wayta ويتا"
      className={className}
      style={{ ...toneVars(tone), height: size, width: 'auto' }}
    >
      <g transform="scale(1.2)">
        <path d="M12 66 A38 38 0 0 1 88 66 Z" fill={SAFFRON} />
        <rect x="4" y="70" width="92" height="9" rx="4.5" style={INK_FILL} />
        <circle cx="50" cy="22" r="6" fill={SAFFRON} />
        <circle cx="40" cy="45" r="3.6" fill={GRAPHITE} />
        <circle cx="60" cy="45" r="3.6" fill={GRAPHITE} />
        <path d="M37 54 Q50 63 63 54" fill="none" stroke={GRAPHITE} strokeWidth="5" strokeLinecap="round" />
      </g>
      <g transform="translate(142 -5.2)">
        <path
          d="M7.5 51 V79 A14 14 0 0 0 35.5 79 V64 M35.5 79 A14 14 0 0 0 63.5 79 V51 M129 72 A21 21 0 1 1 129 71.9 M129 51 V93 M152 51 V77 A14 14 0 0 0 180 77 M180 51 V110 A17 17 0 0 1 163 127 H156 M212 29 V80 A13 13 0 0 0 225 93 H231 M201 51 H228 M295 72 A21 21 0 1 1 295 71.9 M295 51 V93"
          fill="none"
          strokeWidth="15"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={INK_STROKE}
        />
      </g>
      <rect x="471" y="24.8" width="3" height="70" rx="1.5" opacity=".25" style={INK_FILL} />
      <g transform="translate(500 -5.2)">
        <path
          d="M7.5 29 V85 A8 8 0 0 0 15.5 93 H97.5 A8 8 0 0 0 105.5 85 V60 M77.5 93 V60 M162 72 A14 14 0 1 1 162 71.9 M162 72 V98 Q162 126 134 128"
          fill="none"
          strokeWidth="15"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={SUB_STROKE}
        />
        <circle cx="68.5" cy="41" r="7.5" style={SUB_FILL} />
        <circle cx="86.5" cy="41" r="7.5" style={SUB_FILL} />
        <circle cx="96.5" cy="115" r="7.5" style={SUB_FILL} />
        <circle cx="114.5" cy="115" r="7.5" style={SUB_FILL} />
      </g>
    </svg>
  );
}

/** Centered lockup: mark over "wayta" over "ويتا". `size` is the mark height in px. */
export function WaytaStacked({
  tone = 'auto',
  size = 64,
  className,
}: {
  tone?: WaytaTone;
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Wayta ويتا"
      className={`inline-flex flex-col items-center ${className ?? ''}`}
      style={toneVars(tone)}
    >
      <WaytaMark size={size} />
      <span className="flex" style={{ marginTop: Math.round(size * 0.5) }}>
        <WaytaWordmark script="latin" size={Math.round(size * 1.05)} />
      </span>
      <span className="flex" style={{ marginTop: Math.round(size * 0.2) }}>
        <WaytaWordmark script="arabic" accent size={Math.round(size * 0.65)} />
      </span>
    </span>
  );
}
