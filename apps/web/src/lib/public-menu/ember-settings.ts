/** Published/Draft EMBER display settings; text defaults match its original reference demo. */
export type EmberPalette = 'EMBER' | 'NOIR' | 'COPPER';
export type EmberMotion = 'SUBTLE' | 'OFF';
export type EmberImageMode = 'AUTO' | 'CUSTOM';

export interface EmberTemplateSettings {
  palette: EmberPalette;
  motion: EmberMotion;
  navTaglineAr: string;
  navTaglineEn: string;
  eyebrowAr: string;
  eyebrowEn: string;
  headlineAr: string;
  headlineEn: string;
  subtitleAr: string;
  subtitleEn: string;
  signatureAr: string;
  signatureEn: string;
  marqueeAr: string;
  marqueeEn: string;
  heroImageMode: EmberImageMode;
  /** Server-owned asset returned by the dedicated upload endpoint. */
  heroImageAssetPath: string | null;
}

export interface EmberTemplateConfigView {
  draft: EmberTemplateSettings;
  published: EmberTemplateSettings;
}

export const DEFAULT_EMBER_SETTINGS: EmberTemplateSettings = {
  palette: 'EMBER',
  motion: 'SUBTLE',
  navTaglineAr: "نكهة مختلفة · طعم لا يُنسى",
  navTaglineEn: "BOLD FLAVORS · MADE FRESH",
  eyebrowAr: "THE ART OF THE PERFECT BITE — 01",
  eyebrowEn: "THE ART OF THE PERFECT BITE — 01",
  headlineAr: "FIRE FIRST.",
  headlineEn: "FIRE FIRST.",
  subtitleAr: "مذاق مختلف. أطباق تتحضّر بعناية، وتجربة تستحقها كل مرة.",
  subtitleEn: "Bold flavors. Freshly crafted. Every bite worth remembering.",
  signatureAr: "طازج. مميز. معمول بحب.",
  signatureEn: "FRESH. BOLD. UNFORGETTABLE.",
  marqueeAr: "✳ FRESH FOOD ✳ MADE WITH FIRE ✳ THE REAL DEAL",
  marqueeEn: "✳ FRESH FOOD ✳ MADE WITH FIRE ✳ THE REAL DEAL",
  heroImageMode: 'AUTO',
  heroImageAssetPath: null,
};

// Keep the Staff editor safe when the database contains pre-EMBER fields or the
// running API has not yet been restarted with the new settings contract.
const EMBER_TEXT_LIMITS = {
  navTaglineAr: 100,
  navTaglineEn: 100,
  eyebrowAr: 100,
  eyebrowEn: 100,
  headlineAr: 80,
  headlineEn: 80,
  subtitleAr: 180,
  subtitleEn: 180,
  signatureAr: 120,
  signatureEn: 120,
  marqueeAr: 180,
  marqueeEn: 180,
} as const;

export const EMBER_COPY_KEYS = Object.keys(EMBER_TEXT_LIMITS) as (keyof typeof EMBER_TEXT_LIMITS)[];

function asObject(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

/**
 * The HTTP boundary must not assume that older API responses contain recently
 * introduced properties. Populate every input with the same defaults as the API.
 */
export function normalizeEmberTemplateSettings(input: unknown): EmberTemplateSettings {
  const source = asObject(input);
  const text = (key: keyof typeof EMBER_TEXT_LIMITS): string => {
    const raw = source[key];
    const trimmed = typeof raw === 'string' ? raw.trim().slice(0, EMBER_TEXT_LIMITS[key]) : '';
    return trimmed || DEFAULT_EMBER_SETTINGS[key];
  };
  const assetPath =
    typeof source.heroImageAssetPath === 'string' &&
    /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(source.heroImageAssetPath)
      ? source.heroImageAssetPath
      : null;
  return {
    palette: source.palette === 'NOIR' || source.palette === 'COPPER' ? source.palette : 'EMBER',
    motion: source.motion === 'OFF' ? 'OFF' : 'SUBTLE',
    navTaglineAr: text('navTaglineAr'),
    navTaglineEn: text('navTaglineEn'),
    eyebrowAr: text('eyebrowAr'),
    eyebrowEn: text('eyebrowEn'),
    headlineAr: text('headlineAr'),
    headlineEn: text('headlineEn'),
    subtitleAr: text('subtitleAr'),
    subtitleEn: text('subtitleEn'),
    signatureAr: text('signatureAr'),
    signatureEn: text('signatureEn'),
    marqueeAr: text('marqueeAr'),
    marqueeEn: text('marqueeEn'),
    heroImageMode: source.heroImageMode === 'CUSTOM' && assetPath ? 'CUSTOM' : 'AUTO',
    heroImageAssetPath: assetPath,
  };
}

export function normalizeEmberTemplateConfigView(input: unknown): EmberTemplateConfigView {
  const source = asObject(input);
  return {
    draft: normalizeEmberTemplateSettings(source.draft),
    published: normalizeEmberTemplateSettings(source.published),
  };
}

/** Same-origin staff iframe messages; all overrides affect rendering only. */
export const EMBER_DESIGN_PREVIEW_UPDATE = 'wayta:ember-design-preview:update:v1';
export const EMBER_DESIGN_PREVIEW_READY = 'wayta:ember-design-preview:ready:v1';

export function isEmberPreviewUpdate(input: unknown): input is {
  type: typeof EMBER_DESIGN_PREVIEW_UPDATE;
  settings: unknown;
} {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return false;
  return (input as Record<string, unknown>).type === EMBER_DESIGN_PREVIEW_UPDATE;
}
