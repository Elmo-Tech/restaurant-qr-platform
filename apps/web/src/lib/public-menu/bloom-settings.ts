/** BLOOM visual copy mirrors the Cormorant Garamond/Tajawal reference concept. */
export type BloomPalette = 'ROSE' | 'LILAC' | 'PEACH';
export type BloomMotion = 'SUBTLE' | 'OFF';
export type BloomImageMode = 'ART' | 'CUSTOM';
export interface BloomTemplateSettings {
  palette: BloomPalette;
  motion: BloomMotion;
  ribbonAr: string;
  ribbonEn: string;
  navTaglineAr: string;
  navTaglineEn: string;
  eyebrowAr: string;
  eyebrowEn: string;
  headlineTopAr: string;
  headlineTopEn: string;
  headlineMiddleAr: string;
  headlineMiddleEn: string;
  headlineBottomAr: string;
  headlineBottomEn: string;
  subtitleAr: string;
  subtitleEn: string;
  ctaAr: string;
  ctaEn: string;
  sectionEyebrowAr: string;
  sectionEyebrowEn: string;
  sectionHeadlineAr: string;
  sectionHeadlineEn: string;
  heroImageMode: BloomImageMode;
  heroImageAssetPath: string | null;
}
export interface BloomTemplateConfigView {
  draft: BloomTemplateSettings;
  published: BloomTemplateSettings;
}
export const DEFAULT_BLOOM_SETTINGS: BloomTemplateSettings = {
  palette: 'ROSE',
  motion: 'SUBTLE',
  ribbonAr: "✳ BAKED WITH LOVE, SERVED WITH JOY ✳",
  ribbonEn: "✳ BAKED WITH LOVE, SERVED WITH JOY ✳",
  navTaglineAr: "THE LITTLE SWEET THINGS",
  navTaglineEn: "THE LITTLE SWEET THINGS",
  eyebrowAr: "✳ A LITTLE HAPPINESS IN EVERY BITE",
  eyebrowEn: "✳ A LITTLE HAPPINESS IN EVERY BITE",
  headlineTopAr: "sweet",
  headlineTopEn: "sweet",
  headlineMiddleAr: "little",
  headlineMiddleEn: "little",
  headlineBottomAr: "things.",
  headlineBottomEn: "things.",
  subtitleAr: "كل قطعة حلوى حكاية صغيرة، وكل لحظة تستحق حاجة حلوة.",
  subtitleEn: "Every little dessert tells a story, and every moment deserves something sweet.",
  ctaAr: "استكشف الحلويات",
  ctaEn: "Explore the sweets",
  sectionEyebrowAr: "OUR LITTLE PLEASURES",
  sectionEyebrowEn: "OUR LITTLE PLEASURES",
  sectionHeadlineAr: "The sweet selection.",
  sectionHeadlineEn: "The sweet selection.",
  heroImageMode: 'ART',
  heroImageAssetPath: null,
};
const TEXT_LIMITS = {
  ribbonAr: 180,
  ribbonEn: 180,
  navTaglineAr: 100,
  navTaglineEn: 100,
  eyebrowAr: 120,
  eyebrowEn: 120,
  headlineTopAr: 60,
  headlineTopEn: 60,
  headlineMiddleAr: 60,
  headlineMiddleEn: 60,
  headlineBottomAr: 60,
  headlineBottomEn: 60,
  subtitleAr: 180,
  subtitleEn: 180,
  ctaAr: 60,
  ctaEn: 60,
  sectionEyebrowAr: 100,
  sectionEyebrowEn: 100,
  sectionHeadlineAr: 100,
  sectionHeadlineEn: 100,
} as const;
export const BLOOM_COPY_KEYS = Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[];
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
export function normalizeBloomTemplateSettings(input: unknown): BloomTemplateSettings {
  const source = asObject(input);
  const text = (key: keyof typeof TEXT_LIMITS): string => {
    const raw = source[key];
    const value = typeof raw === 'string' ? raw.trim().slice(0, TEXT_LIMITS[key]) : '';
    return value || DEFAULT_BLOOM_SETTINGS[key];
  };
  const assetPath =
    typeof source.heroImageAssetPath === 'string' &&
    /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(source.heroImageAssetPath)
      ? source.heroImageAssetPath : null;
  return {
    palette: source.palette === 'LILAC' || source.palette === 'PEACH' ? source.palette : 'ROSE',
    motion: source.motion === 'OFF' ? 'OFF' : 'SUBTLE',
    ribbonAr: text('ribbonAr'),
    ribbonEn: text('ribbonEn'),
    navTaglineAr: text('navTaglineAr'),
    navTaglineEn: text('navTaglineEn'),
    eyebrowAr: text('eyebrowAr'),
    eyebrowEn: text('eyebrowEn'),
    headlineTopAr: text('headlineTopAr'),
    headlineTopEn: text('headlineTopEn'),
    headlineMiddleAr: text('headlineMiddleAr'),
    headlineMiddleEn: text('headlineMiddleEn'),
    headlineBottomAr: text('headlineBottomAr'),
    headlineBottomEn: text('headlineBottomEn'),
    subtitleAr: text('subtitleAr'),
    subtitleEn: text('subtitleEn'),
    ctaAr: text('ctaAr'),
    ctaEn: text('ctaEn'),
    sectionEyebrowAr: text('sectionEyebrowAr'),
    sectionEyebrowEn: text('sectionEyebrowEn'),
    sectionHeadlineAr: text('sectionHeadlineAr'),
    sectionHeadlineEn: text('sectionHeadlineEn'),
    heroImageMode: source.heroImageMode === 'CUSTOM' && assetPath ? 'CUSTOM' : 'ART',
    heroImageAssetPath: assetPath,
  };
}
export function normalizeBloomTemplateConfigView(input: unknown): BloomTemplateConfigView {
  const source = asObject(input);
  return {
    draft: normalizeBloomTemplateSettings(source.draft),
    published: normalizeBloomTemplateSettings(source.published),
  };
}
export const BLOOM_DESIGN_PREVIEW_UPDATE = 'wayta:bloom-design-preview:update:v1';
export const BLOOM_DESIGN_PREVIEW_READY = 'wayta:bloom-design-preview:ready:v1';
export function isBloomPreviewUpdate(value: unknown): value is {
  type: typeof BLOOM_DESIGN_PREVIEW_UPDATE;
  settings: unknown;
} {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    (value as Record<string, unknown>).type === BLOOM_DESIGN_PREVIEW_UPDATE ? true : false;
}
