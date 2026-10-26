/** Premium FOLIO: reference-faithful dark book and printable parchment pages. */
export const FOLIO_PALETTES = ['FOREST', 'BURGUNDY', 'MIDNIGHT'] as const;
export type FolioPalette = (typeof FOLIO_PALETTES)[number];
export type FolioMotion = 'SUBTLE' | 'OFF';
export type FolioArtworkMode = 'ILLUSTRATION' | 'FEATURED' | 'CUSTOM';
export interface FolioTemplateSettings {
  palette: FolioPalette;
  motion: FolioMotion;
  artworkMode: FolioArtworkMode;
  artworkAssetPath: string | null;
  eyebrowAr: string; eyebrowEn: string;
  headlineAr: string; headlineEn: string;
  coverTaglineAr: string; coverTaglineEn: string;
  coverCtaAr: string; coverCtaEn: string;
  collectionLabelAr: string; collectionLabelEn: string;
  chapterSubtitleAr: string; chapterSubtitleEn: string;
  pageFooterAr: string; pageFooterEn: string;
}

export const DEFAULT_FOLIO_SETTINGS: FolioTemplateSettings = {
  palette: 'FOREST',
  motion: 'SUBTLE',
  artworkMode: 'ILLUSTRATION',
  artworkAssetPath: null,
  eyebrowAr: 'EXPERIENCE THE ART OF DINING',
  eyebrowEn: 'EXPERIENCE THE ART OF DINING',
  headlineAr: 'Every meal tells a story.',
  headlineEn: 'Every meal tells a story.',
  coverTaglineAr: 'THE SIGNATURE COLLECTION',
  coverTaglineEn: 'THE SIGNATURE COLLECTION',
  coverCtaAr: 'افتح قائمة الطعام',
  coverCtaEn: 'Open the menu',
  collectionLabelAr: 'THE COLLECTION',
  collectionLabelEn: 'THE COLLECTION',
  chapterSubtitleAr: 'من مطبخنا إلى لحظاتك المميزة، اختر ما تحب.',
  chapterSubtitleEn: 'From our kitchen to your special moments.',
  pageFooterAr: 'CRAFTED WITH PASSION',
  pageFooterEn: 'CRAFTED WITH PASSION',
};
export const FOLIO_COPY_LIMITS = {
  eyebrowAr: 100, eyebrowEn: 100,
  headlineAr: 120, headlineEn: 120,
  coverTaglineAr: 100, coverTaglineEn: 100,
  coverCtaAr: 60, coverCtaEn: 60,
  collectionLabelAr: 80, collectionLabelEn: 80,
  chapterSubtitleAr: 180, chapterSubtitleEn: 180,
  pageFooterAr: 100, pageFooterEn: 100,
} as const;

export function isFolioArtworkPath(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(value);
}

export function normalizeFolioSettings(raw: unknown): FolioTemplateSettings {
  const value: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  const fields = Object.fromEntries(
    (Object.keys(FOLIO_COPY_LIMITS) as (keyof typeof FOLIO_COPY_LIMITS)[]).map((key) => {
      const candidate = value[key];
      const trimmed = typeof candidate === 'string' ? candidate.trim().slice(0, FOLIO_COPY_LIMITS[key]) : '';
      return [key, trimmed || DEFAULT_FOLIO_SETTINGS[key]];
    }),
  ) as Pick<FolioTemplateSettings, keyof typeof FOLIO_COPY_LIMITS>;
  const image = isFolioArtworkPath(value.artworkAssetPath) ? value.artworkAssetPath : null;
  const mode = value.artworkMode === 'FEATURED' ? 'FEATURED'
    : value.artworkMode === 'CUSTOM' && image ? 'CUSTOM' : 'ILLUSTRATION';
  return {
    ...fields,
    palette: FOLIO_PALETTES.includes(value.palette as FolioPalette) ? value.palette as FolioPalette : 'FOREST',
    motion: value.motion === 'OFF' ? 'OFF' : 'SUBTLE',
    artworkMode: mode,
    artworkAssetPath: image,
  };
}
