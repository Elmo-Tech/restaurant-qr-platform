/**
 * VERDE exclusive menu (VERDE_NAPOLI_V1) appearance settings.
 *
 * Self-contained on purpose (no imports): the Web app keeps a byte-identical copy at
 * `apps/web/src/lib/public-menu/verde-settings.ts`, and a spec asserts they stay in sync.
 * Only allowlisted copy, enums and server-owned `/media/<uuid>.<ext>` paths are accepted;
 * never CSS, HTML, scripts or arbitrary URLs.
 *
 * Copy strings may use the `{name}` token, replaced by the brand word at render time.
 * An empty/missing value always falls back to the documented default.
 */
export const VERDE_THEMES = ['SIGNATURE', 'LIGHT'] as const;
export type VerdeTheme = (typeof VERDE_THEMES)[number];
export const VERDE_MOTIONS = ['SUBTLE', 'OFF'] as const;
export type VerdeMotion = (typeof VERDE_MOTIONS)[number];
/** ROUND crops any photo into the hero plate; CUTOUT shows a transparent PNG/WebP as-is. */
export const VERDE_HERO_SHAPES = ['ROUND', 'CUTOUT'] as const;
export type VerdeHeroShape = (typeof VERDE_HERO_SHAPES)[number];

/** Copy key -> [Arabic default, English default, max length]. Each key is stored as `<key>Ar` / `<key>En`. */
export const VERDE_COPY_FIELDS = {
  tagline: ['RESTAURANT NAPOLETANA', 'RESTAURANT NAPOLETANA', 60],
  kicker: ['RESTAURANT NAPOLETANA ✳ THE MENU', 'RESTAURANT NAPOLETANA ✳ THE MENU', 80],
  headlineTop: ['A TASTE OF', 'A TASTE OF', 30],
  headlineLine: ['الطعم اللي على مزاجك.', 'Good food. Great mood.', 60],
  description: [
    'بيتزا، باستا، برجر، وكمان أكتر. اختار اللي نفسك فيه من عالم {name}.',
    'Pizza, pasta, burgers and more. Find your favorite from the {name} menu.',
    200,
  ],
  cta: ['اكتشف المنيو', 'Explore the menu', 30],
  heroNote: ['PIZZA · PASTA · BURGERS · MORE', 'PIZZA · PASTA · BURGERS · MORE', 60],
  stampSub: ['NAPOLETANA', 'NAPOLETANA', 24],
  sticker: ['PIZZA & MORE ↗', 'PIZZA & MORE ↗', 30],
  marquee: ['', '', 240],
  introEyebrow: ['01 — DISCOVER {name}', '01 — DISCOVER {name}', 50],
  introTitle: ['كل حاجة ليها\nطعم مختلف.', 'All your cravings.\nOne good place.', 90],
  introDescription: [
    'من البيتزا اللي بتحبها لحد آخر رشفة من مشروبك المفضل. منيو {name} متقسم بشكل يخليك توصل لطلبك في ثواني.',
    'From your favorite slice to that last sip of your drink — discover every side of {name} in just a few taps.',
    240,
  ],
  chapter1Eyebrow: ['THE ITALIAN SIDE', 'THE ITALIAN SIDE', 40],
  chapter1Title: ['البيتزا على أصولها', 'The pizza favorites', 50],
  chapter2Eyebrow: ['SOMETHING SWEET', 'SOMETHING SWEET', 40],
  chapter2Title: ['سيب مكان للحلو', 'Save room for dessert', 50],
  menuTopId: ['02 — THE {name} MENU', '02 — THE {name} MENU', 60],
  menuTopNote: ['', '', 120],
  sidebarHeading: ['MENU / THE INDEX', 'MENU / THE INDEX', 40],
  /** `{n}` is the two-digit category number. */
  sectionEyebrow: ['THE MENU / {n}', 'THE MENU / {n}', 40],
  spotlightEyebrow: ['FROM THE {name} KITCHEN', 'FROM THE {name} KITCHEN', 50],
  endEyebrow: ['{name} — RESTAURANT NAPOLETANA', '{name} — RESTAURANT NAPOLETANA', 60],
  endHeadline: ['وقت الأكل؟\nخليه {name}.', 'Good food?\nGo {name}.', 90],
  endDescription: [
    'اختار من أقسام المنيو، وشوف الأصناف والأحجام والأسعار في مكان واحد.',
    'Browse every category, with sizes and prices in one place.',
    240,
  ],
} as const satisfies Record<string, readonly [string, string, number]>;

export type VerdeCopyKey = keyof typeof VERDE_COPY_FIELDS;
export const VERDE_COPY_KEYS = Object.keys(VERDE_COPY_FIELDS) as VerdeCopyKey[];
export type VerdeCopyField = `${VerdeCopyKey}Ar` | `${VerdeCopyKey}En`;
export const VERDE_COPY_LIMITS = Object.fromEntries(
  VERDE_COPY_KEYS.flatMap((key) => [
    [`${key}Ar`, VERDE_COPY_FIELDS[key][2]],
    [`${key}En`, VERDE_COPY_FIELDS[key][2]],
  ]),
) as Record<VerdeCopyField, number>;
export const VERDE_COPY_DEFAULTS = Object.fromEntries(
  VERDE_COPY_KEYS.flatMap((key) => [
    [`${key}Ar`, VERDE_COPY_FIELDS[key][0] as string],
    [`${key}En`, VERDE_COPY_FIELDS[key][1] as string],
  ]),
) as Record<VerdeCopyField, string>;

/** Server-managed image slots (an upload writes only the draft until published). */
export const VERDE_IMAGE_SLOTS = ['hero', 'chapter1', 'chapter2', 'banner'] as const;
export type VerdeImageSlot = (typeof VERDE_IMAGE_SLOTS)[number];
export const VERDE_IMAGE_FIELD = {
  hero: 'heroImageAssetPath',
  chapter1: 'chapter1ImageAssetPath',
  chapter2: 'chapter2ImageAssetPath',
  banner: 'bannerImageAssetPath',
} as const satisfies Record<VerdeImageSlot, string>;
export type VerdeImageField = (typeof VERDE_IMAGE_FIELD)[VerdeImageSlot];

export const VERDE_BRAND_WORD_MAX = 24;
export const VERDE_CATEGORY_EXTRA_LIMIT = 50;
export const VERDE_CATEGORY_EXTRA_TEXT = {
  introAr: 60,
  introEn: 60,
  descAr: 160,
  descEn: 160,
} as const;

export interface VerdeCategoryExtra {
  introAr: string;
  introEn: string;
  descAr: string;
  descEn: string;
  imageAssetPath: string | null;
}

export type VerdeTextSettings = Record<VerdeCopyField, string>;

export interface VerdeMenuSettings extends VerdeTextSettings {
  /** Brand word used in the hero, stamp, watermark and `{name}`. Empty = the Restaurant name. */
  brandWord: string;
  theme: VerdeTheme;
  allowThemeSwitch: boolean;
  motion: VerdeMotion;
  heroImageShape: VerdeHeroShape;
  showMarquee: boolean;
  showChapters: boolean;
  showSpotlight: boolean;
  showEnding: boolean;
  /** Category UUID the discover cards open; null = first / last category. */
  chapter1CategoryId: string | null;
  chapter2CategoryId: string | null;
  heroImageAssetPath: string | null;
  chapter1ImageAssetPath: string | null;
  chapter2ImageAssetPath: string | null;
  bannerImageAssetPath: string | null;
  /** Category UUID -> spotlight band overrides; unspecified categories use their own menu data. */
  categoryExtras: Record<string, VerdeCategoryExtra>;
}

export const DEFAULT_VERDE_SETTINGS: VerdeMenuSettings = {
  ...VERDE_COPY_DEFAULTS,
  brandWord: '',
  theme: 'SIGNATURE',
  allowThemeSwitch: true,
  motion: 'SUBTLE',
  heroImageShape: 'ROUND',
  showMarquee: true,
  showChapters: true,
  showSpotlight: true,
  showEnding: true,
  chapter1CategoryId: null,
  chapter2CategoryId: null,
  heroImageAssetPath: null,
  chapter1ImageAssetPath: null,
  chapter2ImageAssetPath: null,
  bannerImageAssetPath: null,
  categoryExtras: {},
};

export const isVerdeMediaPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(value);
export const isVerdeCategoryId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';

/** Every unrecognized or invalid value falls back to the default; the result is always render-safe. */
export function normalizeVerdeSettings(value: unknown): VerdeMenuSettings {
  const row =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = {} as VerdeTextSettings;
  for (const key of Object.keys(VERDE_COPY_LIMITS) as VerdeCopyField[]) {
    const raw = cleanText(row[key], VERDE_COPY_LIMITS[key]);
    // `marquee` and `menuTopNote` default to empty, which means "derive / hide".
    text[key] = raw || VERDE_COPY_DEFAULTS[key];
  }
  const rawExtras =
    row.categoryExtras && typeof row.categoryExtras === 'object' && !Array.isArray(row.categoryExtras)
      ? (row.categoryExtras as Record<string, unknown>)
      : {};
  const categoryExtras: Record<string, VerdeCategoryExtra> = Object.create(null) as Record<
    string,
    VerdeCategoryExtra
  >;
  for (const [id, input] of Object.entries(rawExtras).slice(0, VERDE_CATEGORY_EXTRA_LIMIT)) {
    if (!isVerdeCategoryId(id) || !input || typeof input !== 'object' || Array.isArray(input)) continue;
    const entry = input as Record<string, unknown>;
    categoryExtras[id.toLowerCase()] = {
      introAr: cleanText(entry.introAr, VERDE_CATEGORY_EXTRA_TEXT.introAr),
      introEn: cleanText(entry.introEn, VERDE_CATEGORY_EXTRA_TEXT.introEn),
      descAr: cleanText(entry.descAr, VERDE_CATEGORY_EXTRA_TEXT.descAr),
      descEn: cleanText(entry.descEn, VERDE_CATEGORY_EXTRA_TEXT.descEn),
      imageAssetPath: isVerdeMediaPath(entry.imageAssetPath) ? entry.imageAssetPath : null,
    };
  }
  const bool = (key: string, fallback: boolean): boolean =>
    typeof row[key] === 'boolean' ? row[key] : fallback;
  const categoryRef = (key: string): string | null =>
    isVerdeCategoryId(row[key]) ? row[key].toLowerCase() : null;
  const media = (key: VerdeImageField): string | null =>
    isVerdeMediaPath(row[key]) ? row[key] : null;
  return {
    ...text,
    brandWord: cleanText(row.brandWord, VERDE_BRAND_WORD_MAX).replace(/\n/g, ' '),
    theme: VERDE_THEMES.find((theme) => theme === row.theme) ?? 'SIGNATURE',
    allowThemeSwitch: bool('allowThemeSwitch', true),
    motion: VERDE_MOTIONS.find((motion) => motion === row.motion) ?? 'SUBTLE',
    heroImageShape: VERDE_HERO_SHAPES.find((shape) => shape === row.heroImageShape) ?? 'ROUND',
    showMarquee: bool('showMarquee', true),
    showChapters: bool('showChapters', true),
    showSpotlight: bool('showSpotlight', true),
    showEnding: bool('showEnding', true),
    chapter1CategoryId: categoryRef('chapter1CategoryId'),
    chapter2CategoryId: categoryRef('chapter2CategoryId'),
    heroImageAssetPath: media('heroImageAssetPath'),
    chapter1ImageAssetPath: media('chapter1ImageAssetPath'),
    chapter2ImageAssetPath: media('chapter2ImageAssetPath'),
    bannerImageAssetPath: media('bannerImageAssetPath'),
    categoryExtras,
  };
}

/** Every uploaded asset a settings object references (used to delete only unreferenced uploads). */
export function verdeAssetPaths(settings: VerdeMenuSettings): Set<string> {
  const paths = new Set<string>();
  for (const field of Object.values(VERDE_IMAGE_FIELD)) {
    const path = settings[field];
    if (path) paths.add(path);
  }
  for (const extra of Object.values(settings.categoryExtras)) {
    if (extra.imageAssetPath) paths.add(extra.imageAssetPath);
  }
  return paths;
}

/** `{name}` token and Latin/Arabic copy resolution shared by the renderer. */
export function verdeCopy(
  settings: VerdeMenuSettings,
  key: VerdeCopyKey,
  locale: string,
  brand: string,
): string {
  const field = `${key}${locale === 'ar' ? 'Ar' : 'En'}` as VerdeCopyField;
  return settings[field].split('{name}').join(brand);
}
