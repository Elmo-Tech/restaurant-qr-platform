/** Public FOLIO data; the same contract is used for a private staff preview. */
export type FolioPalette = 'FOREST' | 'BURGUNDY' | 'MIDNIGHT';
export type FolioArtworkMode = 'ILLUSTRATION' | 'FEATURED' | 'CUSTOM';
export interface FolioTemplateSettings {
  palette: FolioPalette; motion: 'SUBTLE' | 'OFF'; artworkMode: FolioArtworkMode; artworkAssetPath: string | null;
  categoryArtwork: Record<string, string>;
  eyebrowAr: string; eyebrowEn: string; headlineAr: string; headlineEn: string;
  coverTaglineAr: string; coverTaglineEn: string; coverCtaAr: string; coverCtaEn: string;
  collectionLabelAr: string; collectionLabelEn: string; chapterSubtitleAr: string; chapterSubtitleEn: string;
  pageFooterAr: string; pageFooterEn: string;
}
export interface FolioTemplateConfigView { draft: FolioTemplateSettings; published: FolioTemplateSettings; }
export const DEFAULT_FOLIO_SETTINGS: FolioTemplateSettings = {
  palette: 'FOREST', motion: 'SUBTLE', artworkMode: 'ILLUSTRATION', artworkAssetPath: null,
  categoryArtwork: {},
  eyebrowAr: 'EXPERIENCE THE ART OF DINING', eyebrowEn: 'EXPERIENCE THE ART OF DINING',
  headlineAr: 'Every meal tells a story.', headlineEn: 'Every meal tells a story.',
  coverTaglineAr: 'THE SIGNATURE COLLECTION', coverTaglineEn: 'THE SIGNATURE COLLECTION',
  coverCtaAr: 'افتح قائمة الطعام', coverCtaEn: 'Open the menu',
  collectionLabelAr: 'THE COLLECTION', collectionLabelEn: 'THE COLLECTION',
  chapterSubtitleAr: 'من مطبخنا إلى لحظاتك المميزة، اختر ما تحب.',
  chapterSubtitleEn: 'From our kitchen to your special moments.',
  pageFooterAr: 'CRAFTED WITH PASSION', pageFooterEn: 'CRAFTED WITH PASSION',
};
export const FOLIO_COPY_LIMITS = {
  eyebrowAr: 100, eyebrowEn: 100, headlineAr: 120, headlineEn: 120,
  coverTaglineAr: 100, coverTaglineEn: 100, coverCtaAr: 60, coverCtaEn: 60,
  collectionLabelAr: 80, collectionLabelEn: 80,
  chapterSubtitleAr: 180, chapterSubtitleEn: 180, pageFooterAr: 100, pageFooterEn: 100,
} as const;
export const FOLIO_COPY_KEYS = Object.keys(FOLIO_COPY_LIMITS) as (keyof typeof FOLIO_COPY_LIMITS)[];
export function normalizeFolioTemplateSettings(raw: unknown): FolioTemplateSettings {
  const row: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  const copy = Object.fromEntries(FOLIO_COPY_KEYS.map(key => {
    const text = typeof row[key] === 'string' ? (row[key] as string).trim().slice(0, FOLIO_COPY_LIMITS[key]) : '';
    return [key, text || DEFAULT_FOLIO_SETTINGS[key]];
  })) as Pick<FolioTemplateSettings, keyof typeof FOLIO_COPY_LIMITS>;
  const asset = typeof row.artworkAssetPath === 'string' &&
    /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(row.artworkAssetPath)
    ? row.artworkAssetPath : null;
  const categoryArtwork = Object.fromEntries(
    Object.entries(
      row.categoryArtwork && typeof row.categoryArtwork === 'object' && !Array.isArray(row.categoryArtwork)
        ? row.categoryArtwork : {},
    ).slice(0,120).filter(([id, path]) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) &&
      typeof path === 'string' &&
      /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(path),
    ),
  );
  return { ...copy, categoryArtwork,
    palette: row.palette === 'BURGUNDY' || row.palette === 'MIDNIGHT' ? row.palette : 'FOREST',
    motion: row.motion === 'OFF' ? 'OFF' : 'SUBTLE',
    artworkMode: row.artworkMode === 'FEATURED' ? 'FEATURED' :
      row.artworkMode === 'CUSTOM' && asset ? 'CUSTOM' : 'ILLUSTRATION',
    artworkAssetPath: asset,
  };
}
export function normalizeFolioTemplateConfigView(raw: unknown): FolioTemplateConfigView {
  const row: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  return {
    draft: normalizeFolioTemplateSettings(row.draft),
    published: normalizeFolioTemplateSettings(row.published),
  };
}
/**
 * Pure book artwork resolution, tested across chapters and media modes.
 * A FOLIO-only override wins; otherwise the original category photo wins.
 * A globally configured image is only a fallback, never shared blindly across
 * every category at the expense of its own photo.
 */
export function pickFolioArtwork(
  settings: FolioTemplateSettings,
  category: {
    id: string;
    imageAssetPath: string | null;
    products: { featured: boolean; primaryImageAssetPath: string | null }[];
  } | null,
): string | null {
  const featured = category?.products.find(item => item.featured && item.primaryImageAssetPath)
    ?.primaryImageAssetPath ?? category?.products.find(item => item.primaryImageAssetPath)
    ?.primaryImageAssetPath ?? null;
  const fallback = settings.artworkMode === 'FEATURED' ? featured
    : settings.artworkMode === 'CUSTOM' ? settings.artworkAssetPath : null;
  return category
    ? settings.categoryArtwork[category.id] ?? category.imageAssetPath ?? fallback
    : fallback;
}

export const FOLIO_DESIGN_PREVIEW_READY = 'wayta:folio-preview:ready:v1';
export const FOLIO_DESIGN_PREVIEW_UPDATE = 'wayta:folio-preview:update:v1';
export function isFolioPreviewUpdate(value: unknown): value is {
  type: typeof FOLIO_DESIGN_PREVIEW_UPDATE; settings: unknown;
} {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    (value as Record<string, unknown>).type === FOLIO_DESIGN_PREVIEW_UPDATE;
}
