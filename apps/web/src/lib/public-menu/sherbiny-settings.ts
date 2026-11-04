/**
 * El Sherbiny exclusive menu (SHERBINY_FIRE_DOUGH_V1) appearance settings.
 *
 * Self-contained on purpose (no imports): the Web app keeps a byte-identical copy at
 * `apps/web/src/lib/public-menu/sherbiny-settings.ts`, and a spec asserts they stay in sync.
 * Only allowlisted copy, enums and server-owned `/media/<uuid>.<ext>` paths are accepted;
 * never CSS, HTML, scripts or arbitrary URLs.
 *
 * Copy strings may use the `{name}` token, replaced by the brand word at render time. The last word
 * of a heading is drawn in the accent colour. An empty/missing value always falls back to the
 * documented default, so the page never shows a blank slot.
 */
/** NIGHT = dark, PAPER = light; SYSTEM follows the guest's device. A guest's own pick (cookie) wins. */
export const SHERBINY_THEMES = ['NIGHT', 'PAPER', 'SYSTEM'] as const;
export type SherbinyTheme = (typeof SHERBINY_THEMES)[number];
export const SHERBINY_MOTIONS = ['SUBTLE', 'OFF'] as const;
export type SherbinyMotion = (typeof SHERBINY_MOTIONS)[number];

export const SHERBINY_BRAND_MAX = 24;

/** Copy key -> [Arabic default, English default, max length]. Each key is stored as `<key>Ar` / `<key>En`. */
export const SHERBINY_COPY_FIELDS = {
  /** Empty = the Restaurant name. */
  brand: ['', '', SHERBINY_BRAND_MAX],
  tagline: ['FIRE & DOUGH', 'FIRE & DOUGH', 40],
  heroEyebrow: ['EL SHERBINY / THE MENU EXPERIENCE', 'EL SHERBINY / THE MENU EXPERIENCE', 60],
  heroKicker: [
    'مطعم الشربيني • بيتزا وكريب وفطير… كله على مزاجك',
    'El Sherbiny • pizza, crêpes and fiteer… all to your mood',
    90,
  ],
  heroTitle: ['الطعم اللي\nبيفتح النفس.', 'The taste that\nopens the appetite.', 60],
  heroLede: [
    'حادق ولا حلو؟ إيطالي ولا شرقي؟ عند الشربيني كل اختيار ليه حكاية… وإحنا رتبنالك المنيو علشان تختار في ثواني.',
    'Savory or sweet? Italian or oriental? Every choice at El Sherbiny has a story — and we laid out the menu so you pick in seconds.',
    220,
  ],
  ctaPrimary: ['افتح المنيو', 'Open the menu', 30],
  ctaSecondary: ['شوف الترشيحات', 'See the favorites', 30],
  statSections: ['أقسام متنوعة', 'menu sections', 30],
  statItems: ['اختيار من المنيو', 'dishes to pick from', 30],
  stampTitle: ['طالع سخن!', 'Piping hot!', 24],
  stampSub: ['GOOD FOOD', 'GOOD FOOD', 24],
  sideLettering: ['MADE HOT. SERVED WITH CHARACTER.', 'MADE HOT. SERVED WITH CHARACTER.', 60],
  /** Words separated by `|`, `,` or new lines. */
  marquee: [
    'THE SHERBINY WAY | بيتزا • كريب • فطير • سوري | MADE TO CRAVE | طعم يليق بمزاجك',
    'THE SHERBINY WAY | PIZZA • CRÊPES • FITEER • SYRIAN WRAPS | MADE TO CRAVE | TASTE THAT SUITS YOUR MOOD',
    240,
  ],
  favoritesEyebrow: ['THE FAVORITES / 01', 'THE FAVORITES / 01', 40],
  favoritesTitle: ['على أصول الشربيني.', 'Made the Sherbiny way.', 60],
  favoritesNote: [
    'مختارات من المنيو… اضغط على أي صنف وشوف الأحجام والإضافات.',
    'Picks from the menu… tap any dish to see its sizes and extras.',
    160,
  ],
  favoriteTag1: ['THE HOUSE PICK', 'THE HOUSE PICK', 30],
  favoriteTag2: ['THE CLASSIC', 'THE CLASSIC', 30],
  favoriteTag3: ['THE SWEET FINISH', 'THE SWEET FINISH', 30],
  menuEyebrow: ['THE FULL MENU / 02', 'THE FULL MENU / 02', 40],
  menuTitle: ['اختار اللي على مزاجك.', 'Pick what suits your mood.', 60],
  menuNote: [
    'كل الأصناف والأسعار قدامك بشكل واضح. اختار القسم أو دور على اللي نفسك فيه.',
    'Every dish and price, clearly laid out. Pick a section or search for what you crave.',
    200,
  ],
  indexKicker: ['THE SHERBINY INDEX', 'THE SHERBINY INDEX', 40],
  indexTitle: ['المنيو / الأقسام', 'Menu / Sections', 40],
  indexNote: ['اختيارك سهل… وطعمنا ملهوش بديل.', 'Choosing is easy… the taste has no substitute.', 80],
  spotlightEyebrow: ['HOT & FRESH', 'HOT & FRESH', 30],
  storyEyebrow: ['FIRE, DOUGH & GOOD MOOD / 03', 'FIRE, DOUGH & GOOD MOOD / 03', 50],
  storyTitle: ['من أول العجينة\nلآخر لقمة.', 'From the first dough\nto the last bite.', 80],
  storyText: [
    'بيتزا إيطالي وشرقي، كريب حادق وحلو، فطير، سوري ومكرونات… كل ده في مكان واحد. اختار اللي على مزاجك.',
    'Italian and oriental pizza, savory and sweet crêpes, fiteer, Syrian wraps and pasta — all in one place. Pick what suits your mood.',
    260,
  ],
  storyQuote: [
    'مش مهم هتختار حادق ولا حلو… المهم تختار على مزاجك.',
    'Savory or sweet — it does not matter. Just pick what suits your mood.',
    140,
  ],
  storyQuoteBy: ['EL SHERBINY', 'EL SHERBINY', 40],
  contactEyebrow: ['FIND US / 04', 'FIND US / 04', 40],
  contactTitle: ['إحنا فين؟', 'Where to find us', 40],
} as const satisfies Record<string, readonly [string, string, number]>;

export type SherbinyCopyKey = keyof typeof SHERBINY_COPY_FIELDS;
export const SHERBINY_COPY_KEYS = Object.keys(SHERBINY_COPY_FIELDS) as SherbinyCopyKey[];
export type SherbinyCopyField = `${SherbinyCopyKey}Ar` | `${SherbinyCopyKey}En`;
export const SHERBINY_COPY_LIMITS = Object.fromEntries(
  SHERBINY_COPY_KEYS.flatMap((key) => [
    [`${key}Ar`, SHERBINY_COPY_FIELDS[key][2]],
    [`${key}En`, SHERBINY_COPY_FIELDS[key][2]],
  ]),
) as Record<SherbinyCopyField, number>;
export const SHERBINY_COPY_DEFAULTS = Object.fromEntries(
  SHERBINY_COPY_KEYS.flatMap((key) => [
    [`${key}Ar`, SHERBINY_COPY_FIELDS[key][0] as string],
    [`${key}En`, SHERBINY_COPY_FIELDS[key][1] as string],
  ]),
) as Record<SherbinyCopyField, string>;

/** Server-managed image slots (an upload writes only the draft until published). */
export const SHERBINY_IMAGE_SLOTS = [
  'hero',
  'heroPlate',
  'favorite1',
  'favorite2',
  'favorite3',
  'story',
] as const;
export type SherbinyImageSlot = (typeof SHERBINY_IMAGE_SLOTS)[number];
export const SHERBINY_IMAGE_FIELD = {
  hero: 'heroImageAssetPath',
  heroPlate: 'heroPlateImageAssetPath',
  favorite1: 'favorite1ImageAssetPath',
  favorite2: 'favorite2ImageAssetPath',
  favorite3: 'favorite3ImageAssetPath',
  story: 'storyImageAssetPath',
} as const satisfies Record<SherbinyImageSlot, string>;
export type SherbinyImageField = (typeof SHERBINY_IMAGE_FIELD)[SherbinyImageSlot];

export const SHERBINY_CATEGORY_EXTRA_LIMIT = 50;
export const SHERBINY_CATEGORY_EXTRA_TEXT = {
  tagAr: 40,
  tagEn: 40,
  titleAr: 60,
  titleEn: 60,
  descAr: 160,
  descEn: 160,
} as const;

export interface SherbinyCategoryExtra {
  tagAr: string;
  tagEn: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  imageAssetPath: string | null;
}

export type SherbinyTextSettings = Record<SherbinyCopyField, string>;

export interface SherbinyMenuSettings extends SherbinyTextSettings {
  theme: SherbinyTheme;
  allowThemeSwitch: boolean;
  motion: SherbinyMotion;
  showMarquee: boolean;
  showHeroStats: boolean;
  showFavorites: boolean;
  showStory: boolean;
  showSpotlight: boolean;
  heroImageAssetPath: string | null;
  heroPlateImageAssetPath: string | null;
  favorite1ImageAssetPath: string | null;
  favorite2ImageAssetPath: string | null;
  favorite3ImageAssetPath: string | null;
  storyImageAssetPath: string | null;
  /** Category UUID -> section band overrides; unspecified categories use their own menu data. */
  categoryExtras: Record<string, SherbinyCategoryExtra>;
}

export const DEFAULT_SHERBINY_SETTINGS: SherbinyMenuSettings = {
  ...SHERBINY_COPY_DEFAULTS,
  theme: 'NIGHT',
  allowThemeSwitch: true,
  motion: 'SUBTLE',
  showMarquee: true,
  showHeroStats: true,
  showFavorites: true,
  showStory: true,
  showSpotlight: true,
  heroImageAssetPath: null,
  heroPlateImageAssetPath: null,
  favorite1ImageAssetPath: null,
  favorite2ImageAssetPath: null,
  favorite3ImageAssetPath: null,
  storyImageAssetPath: null,
  categoryExtras: {},
};

export const isSherbinyMediaPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(value);
export const isSherbinyCategoryId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';

/**
 * Every unrecognized or invalid value falls back to the default; the result is always render-safe.
 * `brand` defaults to empty, which means "use the Restaurant name".
 */
export function normalizeSherbinySettings(value: unknown): SherbinyMenuSettings {
  const row =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = {} as SherbinyTextSettings;
  for (const key of Object.keys(SHERBINY_COPY_LIMITS) as SherbinyCopyField[]) {
    const raw = cleanText(row[key], SHERBINY_COPY_LIMITS[key]);
    text[key] = raw || SHERBINY_COPY_DEFAULTS[key];
  }
  const rawExtras =
    row.categoryExtras && typeof row.categoryExtras === 'object' && !Array.isArray(row.categoryExtras)
      ? (row.categoryExtras as Record<string, unknown>)
      : {};
  const categoryExtras: Record<string, SherbinyCategoryExtra> = Object.create(null) as Record<
    string,
    SherbinyCategoryExtra
  >;
  for (const [id, input] of Object.entries(rawExtras).slice(0, SHERBINY_CATEGORY_EXTRA_LIMIT)) {
    if (!isSherbinyCategoryId(id) || !input || typeof input !== 'object' || Array.isArray(input)) continue;
    const entry = input as Record<string, unknown>;
    categoryExtras[id.toLowerCase()] = {
      tagAr: cleanText(entry.tagAr, SHERBINY_CATEGORY_EXTRA_TEXT.tagAr),
      tagEn: cleanText(entry.tagEn, SHERBINY_CATEGORY_EXTRA_TEXT.tagEn),
      titleAr: cleanText(entry.titleAr, SHERBINY_CATEGORY_EXTRA_TEXT.titleAr),
      titleEn: cleanText(entry.titleEn, SHERBINY_CATEGORY_EXTRA_TEXT.titleEn),
      descAr: cleanText(entry.descAr, SHERBINY_CATEGORY_EXTRA_TEXT.descAr),
      descEn: cleanText(entry.descEn, SHERBINY_CATEGORY_EXTRA_TEXT.descEn),
      imageAssetPath: isSherbinyMediaPath(entry.imageAssetPath) ? entry.imageAssetPath : null,
    };
  }
  const bool = (key: string, fallback: boolean): boolean =>
    typeof row[key] === 'boolean' ? row[key] : fallback;
  const media = (key: SherbinyImageField): string | null =>
    isSherbinyMediaPath(row[key]) ? row[key] : null;
  return {
    ...text,
    theme: SHERBINY_THEMES.find((theme) => theme === row.theme) ?? 'NIGHT',
    allowThemeSwitch: bool('allowThemeSwitch', true),
    motion: SHERBINY_MOTIONS.find((motion) => motion === row.motion) ?? 'SUBTLE',
    showMarquee: bool('showMarquee', true),
    showHeroStats: bool('showHeroStats', true),
    showFavorites: bool('showFavorites', true),
    showStory: bool('showStory', true),
    showSpotlight: bool('showSpotlight', true),
    heroImageAssetPath: media('heroImageAssetPath'),
    heroPlateImageAssetPath: media('heroPlateImageAssetPath'),
    favorite1ImageAssetPath: media('favorite1ImageAssetPath'),
    favorite2ImageAssetPath: media('favorite2ImageAssetPath'),
    favorite3ImageAssetPath: media('favorite3ImageAssetPath'),
    storyImageAssetPath: media('storyImageAssetPath'),
    categoryExtras,
  };
}

/** Every uploaded asset a settings object references (used to delete only unreferenced uploads). */
export function sherbinyAssetPaths(settings: SherbinyMenuSettings): Set<string> {
  const paths = new Set<string>();
  for (const field of Object.values(SHERBINY_IMAGE_FIELD)) {
    const path = settings[field];
    if (path) paths.add(path);
  }
  for (const extra of Object.values(settings.categoryExtras)) {
    if (extra.imageAssetPath) paths.add(extra.imageAssetPath);
  }
  return paths;
}

/** `{name}` token and Latin/Arabic copy resolution shared by the renderer. */
export function sherbinyCopy(
  settings: SherbinyMenuSettings,
  key: SherbinyCopyKey,
  locale: string,
  brand: string,
): string {
  const field = `${key}${locale === 'ar' ? 'Ar' : 'En'}` as SherbinyCopyField;
  return settings[field].split('{name}').join(brand);
}
