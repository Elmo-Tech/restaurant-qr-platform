/** BREW specialty coffee styling: no arbitrary CSS/URLs, only server-owned images. */
export const BREW_PALETTES = ['FOREST', 'MOCHA', 'SAGE'] as const;
export type BrewPalette = typeof BREW_PALETTES[number];
export const BREW_MOTIONS = ['SUBTLE', 'OFF'] as const;
export const BREW_PROMO_MODES = ['STATIC', 'BY_CATEGORY'] as const;
export type BrewMotion = typeof BREW_MOTIONS[number];
export type BrewPromoMode = typeof BREW_PROMO_MODES[number];
export type BrewImageMode = 'ART' | 'CUSTOM';
export interface BrewPromoCopy {
  promoLabelAr: string;
  promoLabelEn: string;
  promoHeadlineAr: string;
  promoHeadlineEn: string;
  promoDescriptionAr: string;
  promoDescriptionEn: string;
}
export interface BrewTemplateSettings {
  palette: BrewPalette;
  motion: BrewMotion;
  navTaglineAr: string;
  navTaglineEn: string;
  eyebrowAr: string;
  eyebrowEn: string;
  headlineTopAr: string;
  headlineTopEn: string;
  headlineBottomAr: string;
  headlineBottomEn: string;
  subtitleAr: string;
  subtitleEn: string;
  storyAr: string;
  storyEn: string;
  menuHeadingAr: string;
  menuHeadingEn: string;
  menuSubtitleAr: string;
  menuSubtitleEn: string;
  promoLabelAr: string;
  promoLabelEn: string;
  promoHeadlineAr: string;
  promoHeadlineEn: string;
  promoDescriptionAr: string;
  promoDescriptionEn: string;
  promoEnabled: boolean;
  promoMode: BrewPromoMode;
  promoImageMode: BrewImageMode;
  promoImageAssetPath: string | null;
  /** Category UUID -> copy override; all unspecified categories inherit the default. */
  categoryPromos: Record<string, BrewPromoCopy>;
}
export const BREW_TEXT_LIMITS = {
  navTaglineAr: 100,
  navTaglineEn: 100,
  eyebrowAr: 120,
  eyebrowEn: 120,
  headlineTopAr: 60,
  headlineTopEn: 60,
  headlineBottomAr: 60,
  headlineBottomEn: 60,
  subtitleAr: 180,
  subtitleEn: 180,
  storyAr: 120,
  storyEn: 120,
  menuHeadingAr: 120,
  menuHeadingEn: 120,
  menuSubtitleAr: 180,
  menuSubtitleEn: 180,
  promoLabelAr: 80,
  promoLabelEn: 80,
  promoHeadlineAr: 120,
  promoHeadlineEn: 120,
  promoDescriptionAr: 180,
  promoDescriptionEn: 180,
} as const;
export const BREW_PROMO_KEYS = ["promoLabelAr","promoLabelEn","promoHeadlineAr","promoHeadlineEn","promoDescriptionAr","promoDescriptionEn"] as const;
export const DEFAULT_BREW_SETTINGS: BrewTemplateSettings = {
  palette: 'FOREST',
  motion: 'SUBTLE',
  navTaglineAr: "YOUR DAILY COFFEE RITUAL",
  navTaglineEn: "YOUR DAILY COFFEE RITUAL",
  eyebrowAr: "SLOW DOWN. SIP BETTER.",
  eyebrowEn: "SLOW DOWN. SIP BETTER.",
  headlineTopAr: "Coffee,",
  headlineTopEn: "Coffee,",
  headlineBottomAr: "slowly.",
  headlineBottomEn: "slowly.",
  subtitleAr: "قهوة مظبوطة، تفاصيل تستاهل، ووقت هادي مخصوص ليك. من أول رشفة لآخر لحظة.",
  subtitleEn: "A perfectly made coffee, thoughtful details, and a moment to slow down.",
  storyAr: "ROASTED WITH LOVE · SERVED WITH CARE",
  storyEn: "ROASTED WITH LOVE · SERVED WITH CARE",
  menuHeadingAr: "On the menu.",
  menuHeadingEn: "On the menu.",
  menuSubtitleAr: "أجود الحبوب، وصفات متقنة، ودفء في كل كوب.",
  menuSubtitleEn: "Great beans, crafted recipes, and warmth in every cup.",
  promoLabelAr: "THE HOUSE SPECIAL",
  promoLabelEn: "THE HOUSE SPECIAL",
  promoHeadlineAr: "Take a little break.",
  promoHeadlineEn: "Take a little break.",
  promoDescriptionAr: "لحظات أحلى مع قهوتك المفضلة.",
  promoDescriptionEn: "The sweetest moments with your favorite coffee.",
  promoEnabled: true,
  promoMode: 'STATIC',
  promoImageMode: 'ART',
  promoImageAssetPath: null,
  categoryPromos: {},
};
export const isBrewMediaPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(value);
export const isBrewCategoryId = (key: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);

export function normalizeBrewSettings(value: unknown): BrewTemplateSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { ...DEFAULT_BREW_SETTINGS, categoryPromos: {} };
  const row = value as Record<string, unknown>;
  const asText = (key: keyof typeof BREW_TEXT_LIMITS): string =>
    typeof row[key] === 'string' && (row[key] as string).trim()
      ? (row[key] as string).trim().slice(0, BREW_TEXT_LIMITS[key])
      : DEFAULT_BREW_SETTINGS[key];
  const rawOverrides = row.categoryPromos && typeof row.categoryPromos === 'object' &&
    !Array.isArray(row.categoryPromos) ? row.categoryPromos as Record<string, unknown> : {};
  const categoryPromos: Record<string, BrewPromoCopy> = Object.create(null);
  for (const [categoryId, input] of Object.entries(rawOverrides).slice(0, 50)) {
    if (!isBrewCategoryId(categoryId) || !input || typeof input !== 'object' || Array.isArray(input)) continue;
    const entry = input as Record<string, unknown>;
    categoryPromos[categoryId.toLowerCase()] = Object.fromEntries(BREW_PROMO_KEYS.map((key) => {
      const raw = entry[key];
      return [key, typeof raw === 'string' && raw.trim()
        ? raw.trim().slice(0, BREW_TEXT_LIMITS[key])
        : asText(key)];
    })) as unknown as BrewPromoCopy;
  }
  return {
    palette: BREW_PALETTES.includes(row.palette as BrewPalette) ? row.palette as BrewPalette : 'FOREST',
    motion: BREW_MOTIONS.includes(row.motion as BrewMotion) ? row.motion as BrewMotion : 'SUBTLE',
    navTaglineAr: asText('navTaglineAr'),
    navTaglineEn: asText('navTaglineEn'),
    eyebrowAr: asText('eyebrowAr'),
    eyebrowEn: asText('eyebrowEn'),
    headlineTopAr: asText('headlineTopAr'),
    headlineTopEn: asText('headlineTopEn'),
    headlineBottomAr: asText('headlineBottomAr'),
    headlineBottomEn: asText('headlineBottomEn'),
    subtitleAr: asText('subtitleAr'),
    subtitleEn: asText('subtitleEn'),
    storyAr: asText('storyAr'),
    storyEn: asText('storyEn'),
    menuHeadingAr: asText('menuHeadingAr'),
    menuHeadingEn: asText('menuHeadingEn'),
    menuSubtitleAr: asText('menuSubtitleAr'),
    menuSubtitleEn: asText('menuSubtitleEn'),
    promoLabelAr: asText('promoLabelAr'),
    promoLabelEn: asText('promoLabelEn'),
    promoHeadlineAr: asText('promoHeadlineAr'),
    promoHeadlineEn: asText('promoHeadlineEn'),
    promoDescriptionAr: asText('promoDescriptionAr'),
    promoDescriptionEn: asText('promoDescriptionEn'),
    promoEnabled: row.promoEnabled !== false,
    promoMode: BREW_PROMO_MODES.includes(row.promoMode as BrewPromoMode)
      ? row.promoMode as BrewPromoMode : 'STATIC',
    promoImageMode: row.promoImageMode === 'CUSTOM' && isBrewMediaPath(row.promoImageAssetPath) ? 'CUSTOM' : 'ART',
    promoImageAssetPath: isBrewMediaPath(row.promoImageAssetPath) ? row.promoImageAssetPath : null,
    categoryPromos,
  };
}
