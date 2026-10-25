/** BLOOM dessert template settings; only approved presets and server-uploaded art. */
export const BLOOM_PALETTES = ['ROSE', 'LILAC', 'PEACH'] as const;
export const BLOOM_MOTIONS = ['SUBTLE', 'OFF'] as const;
export type BloomPalette = typeof BLOOM_PALETTES[number];
export type BloomMotion = typeof BLOOM_MOTIONS[number];
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
export function isStoredBloomImagePath(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(value);
}
export function normalizeBloomSettings(value: unknown): BloomTemplateSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_BLOOM_SETTINGS };
  const row = value as Record<string, unknown>;
  const text = (key: keyof BloomTemplateSettings, limit: number): string => {
    const raw = row[key];
    const cleaned = typeof raw === 'string' ? raw.trim().slice(0, limit) : '';
    return cleaned || DEFAULT_BLOOM_SETTINGS[key] as string;
  };
  const asset = isStoredBloomImagePath(row.heroImageAssetPath) ? row.heroImageAssetPath : null;
  return {
    palette: BLOOM_PALETTES.includes(row.palette as BloomPalette) ? row.palette as BloomPalette : 'ROSE',
    motion: BLOOM_MOTIONS.includes(row.motion as BloomMotion) ? row.motion as BloomMotion : 'SUBTLE',
    ribbonAr: text('ribbonAr', 180),
    ribbonEn: text('ribbonEn', 180),
    navTaglineAr: text('navTaglineAr', 100),
    navTaglineEn: text('navTaglineEn', 100),
    eyebrowAr: text('eyebrowAr', 120),
    eyebrowEn: text('eyebrowEn', 120),
    headlineTopAr: text('headlineTopAr', 60),
    headlineTopEn: text('headlineTopEn', 60),
    headlineMiddleAr: text('headlineMiddleAr', 60),
    headlineMiddleEn: text('headlineMiddleEn', 60),
    headlineBottomAr: text('headlineBottomAr', 60),
    headlineBottomEn: text('headlineBottomEn', 60),
    subtitleAr: text('subtitleAr', 180),
    subtitleEn: text('subtitleEn', 180),
    ctaAr: text('ctaAr', 60),
    ctaEn: text('ctaEn', 60),
    sectionEyebrowAr: text('sectionEyebrowAr', 100),
    sectionEyebrowEn: text('sectionEyebrowEn', 100),
    sectionHeadlineAr: text('sectionHeadlineAr', 100),
    sectionHeadlineEn: text('sectionHeadlineEn', 100),
    heroImageMode: row.heroImageMode === 'CUSTOM' && asset ? 'CUSTOM' : 'ART',
    heroImageAssetPath: asset,
  };
}
