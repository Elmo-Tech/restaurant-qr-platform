/**
 * Makkboz exclusive menu (MAKKBOZ_HERITAGE_V1) appearance settings.
 *
 * Self-contained on purpose (no imports): the Web app keeps a byte-identical copy at
 * `apps/web/src/lib/public-menu/makkboz-settings.ts`, and a spec asserts they stay in sync.
 * Only allowlisted copy, enums and server-owned `/media/<uuid>.<ext>` paths are accepted;
 * never CSS, HTML, scripts or arbitrary URLs.
 *
 * Copy strings may use the `{name}` token (brand text, else the Restaurant name). In a heading the
 * last line (hero, story) or the last word (menu title) is drawn in the gold accent. An empty or
 * missing value always falls back to the documented default.
 */
/** The Restaurant's default colour mode; SYSTEM follows the guest's device. A guest's own pick (cookie) wins. */
export const MAKKBOZ_THEMES = ['LIGHT', 'DARK', 'SYSTEM'] as const;
export type MakkbozTheme = (typeof MAKKBOZ_THEMES)[number];
export const MAKKBOZ_MOTIONS = ['SUBTLE', 'OFF'] as const;
export type MakkbozMotion = (typeof MAKKBOZ_MOTIONS)[number];
/** How the menu opens: photo cards or the compact list (the guest can switch). */
export const MAKKBOZ_VIEWS = ['CARDS', 'LIST'] as const;
export type MakkbozView = (typeof MAKKBOZ_VIEWS)[number];

export const MAKKBOZ_BRAND_MAX = 24;

/** Copy key -> [Arabic default, English default, max length]. Each key is stored as `<key>Ar` / `<key>En`. */
export const MAKKBOZ_COPY_FIELDS = {
  /** Brand text used when the Restaurant has no logo; empty = the Restaurant name. */
  brand: ['', '', MAKKBOZ_BRAND_MAX],
  announcement: ['حكاية طعم مصري.. معمولة من القلب', 'An Egyptian taste story… made from the heart', 70],
  heroEyebrow: ['من قلب بلدنا.. لحد عندك', 'From the heart of our country… to your table', 60],
  heroTitle: ['الطعم اللي اتربّينا عليه\nعلى أُصوله', 'The taste we grew up on,\nthe original way', 80],
  heroDesc: [
    'فطير وبيتزا وكريب وكاليزوني وملفوف… اختار اللي نفسك فيه من منيو {name}.',
    'Fiteer, pizza, crêpes, calzone and wraps… pick what you crave from the {name} menu.',
    220,
  ],
  ctaPrimary: ['اكتشف المنيو', 'Explore the menu', 30],
  ctaShare: ['شارك المنيو', 'Share the menu', 30],
  /** Words separated by `|`. */
  heroFine: ['فطير | بيتزا | كريب | ملفوف', 'Fiteer | Pizza | Crêpes | Wraps', 100],
  archLabel: ['THE TASTE OF HOME', 'THE TASTE OF HOME', 40],
  archCaption: ['من فرننا.. على سفرتك', 'From our oven… to your table', 50],
  stampTop: ['طعم', 'Real', 12],
  stampMain: ['أصيل', 'taste', 12],
  value1Title: ['على أصوله', 'The original way', 30],
  value1Sub: ['وصفة بطعم البيت', 'A home-style recipe', 40],
  value2Title: ['محشي للآخر', 'Filled to the end', 30],
  value2Sub: ['في كل لقمة حكاية', 'A story in every bite', 40],
  value3Title: ['اختيارات كتير', 'Plenty to choose from', 30],
  value3Sub: ['على مزاجك', 'Whatever your mood', 40],
  menuEyebrow: ['لذّة الاختيار', 'The joy of choosing', 40],
  menuTitle: ['قائمة {name}', 'The {name} menu', 50],
  menuNote: ['اختار اللي نفسك فيه.. واحنا نجهّزهولك بحب.', 'Pick what you crave… and we will prepare it with love.', 120],
  storyKicker: ['حِكاية {name}', 'The {name} story', 40],
  storyTitle: ['في كل لقمة..\nريحة البيت', 'In every bite…\nthe smell of home', 70],
  storyText: [
    'فيه أكلات أول ما تشم ريحتها ترجعك لذكريات حلوة. إحنا في {name} بنقدّم الفطير والبيتزا والكريب بروح الأكل المصري اللي بنحبه، في شكل جديد يليق بسفرتك.',
    'Some dishes take you back to sweet memories the moment you smell them. At {name} we serve fiteer, pizza and crêpes with the spirit of the Egyptian food we love, in a fresh style that suits your table.',
    300,
  ],
  storySignature: ['المخبوزات.. عَ أصولها ✳', 'Baked goods, the original way ✳', 60],
  footerTagline: ['عَ أصوله.. وكل يوم أحلى.', 'The original way… better every day.', 70],
  contactTitle: ['مكاننا وتواصلنا', 'Find us and reach us', 40],
} as const satisfies Record<string, readonly [string, string, number]>;

export type MakkbozCopyKey = keyof typeof MAKKBOZ_COPY_FIELDS;
export const MAKKBOZ_COPY_KEYS = Object.keys(MAKKBOZ_COPY_FIELDS) as MakkbozCopyKey[];
export type MakkbozCopyField = `${MakkbozCopyKey}Ar` | `${MakkbozCopyKey}En`;
export const MAKKBOZ_COPY_LIMITS = Object.fromEntries(
  MAKKBOZ_COPY_KEYS.flatMap((key) => [
    [`${key}Ar`, MAKKBOZ_COPY_FIELDS[key][2]],
    [`${key}En`, MAKKBOZ_COPY_FIELDS[key][2]],
  ]),
) as Record<MakkbozCopyField, number>;
export const MAKKBOZ_COPY_DEFAULTS = Object.fromEntries(
  MAKKBOZ_COPY_KEYS.flatMap((key) => [
    [`${key}Ar`, MAKKBOZ_COPY_FIELDS[key][0] as string],
    [`${key}En`, MAKKBOZ_COPY_FIELDS[key][1] as string],
  ]),
) as Record<MakkbozCopyField, string>;

/** Server-managed image slots (an upload writes only the draft until published). */
export const MAKKBOZ_IMAGE_SLOTS = ['hero', 'heroSmall'] as const;
export type MakkbozImageSlot = (typeof MAKKBOZ_IMAGE_SLOTS)[number];
export const MAKKBOZ_IMAGE_FIELD = {
  hero: 'heroImageAssetPath',
  heroSmall: 'heroSmallImageAssetPath',
} as const satisfies Record<MakkbozImageSlot, string>;
export type MakkbozImageField = (typeof MAKKBOZ_IMAGE_FIELD)[MakkbozImageSlot];

export const MAKKBOZ_CATEGORY_EXTRA_LIMIT = 50;
export const MAKKBOZ_CATEGORY_EXTRA_TEXT = {
  tagAr: 40,
  tagEn: 40,
  introAr: 120,
  introEn: 120,
} as const;

export interface MakkbozCategoryExtra {
  tagAr: string;
  tagEn: string;
  introAr: string;
  introEn: string;
  imageAssetPath: string | null;
}

export type MakkbozTextSettings = Record<MakkbozCopyField, string>;

export interface MakkbozMenuSettings extends MakkbozTextSettings {
  theme: MakkbozTheme;
  /** Shows the light / dark switch in the header. */
  allowThemeSwitch: boolean;
  motion: MakkbozMotion;
  defaultView: MakkbozView;
  showAnnouncement: boolean;
  showValues: boolean;
  showStory: boolean;
  heroImageAssetPath: string | null;
  heroSmallImageAssetPath: string | null;
  /** Category UUID -> chapter overrides; unspecified categories use their own menu data. */
  categoryExtras: Record<string, MakkbozCategoryExtra>;
}

export const DEFAULT_MAKKBOZ_SETTINGS: MakkbozMenuSettings = {
  ...MAKKBOZ_COPY_DEFAULTS,
  theme: 'LIGHT',
  allowThemeSwitch: true,
  motion: 'SUBTLE',
  defaultView: 'CARDS',
  showAnnouncement: true,
  showValues: true,
  showStory: true,
  heroImageAssetPath: null,
  heroSmallImageAssetPath: null,
  categoryExtras: {},
};

export const isMakkbozMediaPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(value);
export const isMakkbozCategoryId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';

/**
 * Every unrecognized or invalid value falls back to the default; the result is always render-safe.
 * `brand` defaults to empty, which means "use the Restaurant name".
 */
export function normalizeMakkbozSettings(value: unknown): MakkbozMenuSettings {
  const row =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = {} as MakkbozTextSettings;
  for (const key of Object.keys(MAKKBOZ_COPY_LIMITS) as MakkbozCopyField[]) {
    const raw = cleanText(row[key], MAKKBOZ_COPY_LIMITS[key]);
    text[key] = raw || MAKKBOZ_COPY_DEFAULTS[key];
  }
  const rawExtras =
    row.categoryExtras && typeof row.categoryExtras === 'object' && !Array.isArray(row.categoryExtras)
      ? (row.categoryExtras as Record<string, unknown>)
      : {};
  const categoryExtras: Record<string, MakkbozCategoryExtra> = Object.create(null) as Record<
    string,
    MakkbozCategoryExtra
  >;
  for (const [id, input] of Object.entries(rawExtras).slice(0, MAKKBOZ_CATEGORY_EXTRA_LIMIT)) {
    if (!isMakkbozCategoryId(id) || !input || typeof input !== 'object' || Array.isArray(input)) continue;
    const entry = input as Record<string, unknown>;
    categoryExtras[id.toLowerCase()] = {
      tagAr: cleanText(entry.tagAr, MAKKBOZ_CATEGORY_EXTRA_TEXT.tagAr),
      tagEn: cleanText(entry.tagEn, MAKKBOZ_CATEGORY_EXTRA_TEXT.tagEn),
      introAr: cleanText(entry.introAr, MAKKBOZ_CATEGORY_EXTRA_TEXT.introAr),
      introEn: cleanText(entry.introEn, MAKKBOZ_CATEGORY_EXTRA_TEXT.introEn),
      imageAssetPath: isMakkbozMediaPath(entry.imageAssetPath) ? entry.imageAssetPath : null,
    };
  }
  const bool = (key: string, fallback: boolean): boolean =>
    typeof row[key] === 'boolean' ? row[key] : fallback;
  const media = (key: MakkbozImageField): string | null =>
    isMakkbozMediaPath(row[key]) ? row[key] : null;
  return {
    ...text,
    theme: MAKKBOZ_THEMES.find((theme) => theme === row.theme) ?? 'LIGHT',
    allowThemeSwitch: bool('allowThemeSwitch', true),
    motion: MAKKBOZ_MOTIONS.find((motion) => motion === row.motion) ?? 'SUBTLE',
    defaultView: MAKKBOZ_VIEWS.find((view) => view === row.defaultView) ?? 'CARDS',
    showAnnouncement: bool('showAnnouncement', true),
    showValues: bool('showValues', true),
    showStory: bool('showStory', true),
    heroImageAssetPath: media('heroImageAssetPath'),
    heroSmallImageAssetPath: media('heroSmallImageAssetPath'),
    categoryExtras,
  };
}

/** Every uploaded asset a settings object references (used to delete only unreferenced uploads). */
export function makkbozAssetPaths(settings: MakkbozMenuSettings): Set<string> {
  const paths = new Set<string>();
  for (const field of Object.values(MAKKBOZ_IMAGE_FIELD)) {
    const path = settings[field];
    if (path) paths.add(path);
  }
  for (const extra of Object.values(settings.categoryExtras)) {
    if (extra.imageAssetPath) paths.add(extra.imageAssetPath);
  }
  return paths;
}

/** `{name}` token and Latin/Arabic copy resolution shared by the renderer. */
export function makkbozCopy(
  settings: MakkbozMenuSettings,
  key: MakkbozCopyKey,
  locale: string,
  brand: string,
): string {
  const field = `${key}${locale === 'ar' ? 'Ar' : 'En'}` as MakkbozCopyField;
  return settings[field].split('{name}').join(brand);
}
