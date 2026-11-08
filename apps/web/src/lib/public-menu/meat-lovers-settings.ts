/**
 * Meat Lovers exclusive menu (MEAT_LOVERS_BUTCHER_V1) appearance settings.
 *
 * Self-contained on purpose (no imports): the Web app keeps a byte-identical copy at
 * `apps/web/src/lib/public-menu/meat-lovers-settings.ts`, and a spec asserts they stay in sync.
 * Only allowlisted copy, enums and server-owned `/media/<uuid>.<ext>` paths are accepted;
 * never CSS, HTML, scripts or arbitrary URLs.
 *
 * Copy strings may use the `{name}` token (brand text, else the Restaurant name). In a heading the
 * last line (hero, story) or the last word (menu title) is drawn in the red accent. An empty or
 * missing value always falls back to the documented default.
 */
/** The Restaurant's default colour mode; SYSTEM follows the guest's device. A guest's own pick (cookie) wins. */
export const MEAT_LOVERS_THEMES = ['LIGHT', 'DARK', 'SYSTEM'] as const;
export type MeatLoversTheme = (typeof MEAT_LOVERS_THEMES)[number];
export const MEAT_LOVERS_MOTIONS = ['SUBTLE', 'OFF'] as const;
export type MeatLoversMotion = (typeof MEAT_LOVERS_MOTIONS)[number];
/** How the menu opens: photo cards or the compact list (the guest can switch). */
export const MEAT_LOVERS_VIEWS = ['CARDS', 'LIST'] as const;
export type MeatLoversView = (typeof MEAT_LOVERS_VIEWS)[number];

export const MEAT_LOVERS_BRAND_MAX = 24;

/** Copy key -> [Arabic default, English default, max length]. Each key is stored as `<key>Ar` / `<key>En`. */
export const MEAT_LOVERS_COPY_FIELDS = {
  /** Brand text used when the Restaurant has no logo; empty = the Restaurant name. */
  brand: ['', '', MEAT_LOVERS_BRAND_MAX],
  /** Left side of the thin strip above the header. */
  stripLabel: ['MEAT LOVERS / PREMIUM BUTCHER SHOP', 'MEAT LOVERS / PREMIUM BUTCHER SHOP', 60],
  /** Right side of the strip (the "top message"). */
  announcement: ['من اللحمة الحمراء للجاهز عالتسوية', 'From fresh red meat to ready-to-cook', 70],
  heroEyebrow: ["THE BUTCHER'S EDIT", "THE BUTCHER'S EDIT", 40],
  heroTitle: ['اللحم الصحّ\nله حكاية.', 'The right cut\nhas a story.', 80],
  heroDesc: [
    'كندوز، ضاني، وأصناف جاهزة على النار. اختار قطعتك، وحدد الوزن والتقطيع، والباقي علينا.',
    'Beef, lamb and ready-to-cook cuts. Pick your cut, choose the weight and how it is cut, and we take care of the rest.',
    220,
  ],
  ctaPrimary: ['تصفح الأصناف', 'Browse the cuts', 30],
  ctaSecondary: ['اكتشف الأقسام', 'Discover the sections', 30],
  heroUnder: ['اختيارات من قلب الجزارة', 'Picked from the heart of the butcher shop', 60],
  heroUnderTag: ["MEAT LOVERS / THE BUTCHER'S EDIT", "MEAT LOVERS / THE BUTCHER'S EDIT", 50],
  stampTop: ['THE RIGHT CUT', 'THE RIGHT CUT', 20],
  stampBottom: ['EVERY TIME', 'EVERY TIME', 20],
  heroIndex: ['CUT 01 — SIGNATURE SELECTION', 'CUT 01 — SIGNATURE SELECTION', 50],
  menuEyebrow: ['THE COLLECTION', 'THE COLLECTION', 40],
  /** The last word is drawn in the red accent. */
  menuTitle: ['المنيو على أصوله.', 'The menu, done right.', 50],
  menuNote: [
    'السعر بالكيلو · صور توضيحية · اختار الوزن في تفاصيل الصنف',
    'Priced per kilo · illustrative photos · choose the weight in the cut details',
    120,
  ],
  indexNote: ['HAND SELECTED BY MEAT LOVERS', 'HAND SELECTED BY MEAT LOVERS', 50],
  storyKicker: ['BEHIND THE CUT', 'BEHIND THE CUT', 40],
  /** The last line is drawn in the red accent. */
  storyTitle: ['من أول قطعة\nلحد أحلى أكلة.', 'From the first cut\nto the best meal.', 70],
  storyText: [
    'مش كل لحمة تتقطع بنفس الطريقة. اختار الصنف والوزن والتجهيز اللي يناسب أكلك، وباقي التفاصيل تبقى واضحة في طلبك.',
    'Not every cut is prepared the same way. Choose the cut, the weight and the preparation that suit your cooking, and every detail stays clear in your order.',
    300,
  ],
  storyLink: ['ارجع لاختيارات المنيو', 'Back to the menu', 40],
  storyCaption: ['THE BEAUTY IS IN THE CUT.', 'THE BEAUTY IS IN THE CUT.', 50],
  footerTagline: [
    'الأسعار بالجنيه المصري لكل كيلو، والصور توضيحية.',
    'Prices are in EGP per kilo; photos are illustrative.',
    90,
  ],
  contactTitle: ['العنوان وتواصل معانا', 'Find us and call us', 40],
} as const satisfies Record<string, readonly [string, string, number]>;

export type MeatLoversCopyKey = keyof typeof MEAT_LOVERS_COPY_FIELDS;
export const MEAT_LOVERS_COPY_KEYS = Object.keys(MEAT_LOVERS_COPY_FIELDS) as MeatLoversCopyKey[];
export type MeatLoversCopyField = `${MeatLoversCopyKey}Ar` | `${MeatLoversCopyKey}En`;
export const MEAT_LOVERS_COPY_LIMITS = Object.fromEntries(
  MEAT_LOVERS_COPY_KEYS.flatMap((key) => [
    [`${key}Ar`, MEAT_LOVERS_COPY_FIELDS[key][2]],
    [`${key}En`, MEAT_LOVERS_COPY_FIELDS[key][2]],
  ]),
) as Record<MeatLoversCopyField, number>;
export const MEAT_LOVERS_COPY_DEFAULTS = Object.fromEntries(
  MEAT_LOVERS_COPY_KEYS.flatMap((key) => [
    [`${key}Ar`, MEAT_LOVERS_COPY_FIELDS[key][0] as string],
    [`${key}En`, MEAT_LOVERS_COPY_FIELDS[key][1] as string],
  ]),
) as Record<MeatLoversCopyField, string>;

/** Server-managed image slots (an upload writes only the draft until published). */
export const MEAT_LOVERS_IMAGE_SLOTS = ['hero', 'story'] as const;
export type MeatLoversImageSlot = (typeof MEAT_LOVERS_IMAGE_SLOTS)[number];
export const MEAT_LOVERS_IMAGE_FIELD = {
  hero: 'heroImageAssetPath',
  story: 'storyImageAssetPath',
} as const satisfies Record<MeatLoversImageSlot, string>;
export type MeatLoversImageField = (typeof MEAT_LOVERS_IMAGE_FIELD)[MeatLoversImageSlot];

export const MEAT_LOVERS_CATEGORY_EXTRA_LIMIT = 50;
export const MEAT_LOVERS_CATEGORY_EXTRA_TEXT = {
  tagAr: 40,
  tagEn: 40,
  introAr: 120,
  introEn: 120,
} as const;

export interface MeatLoversCategoryExtra {
  tagAr: string;
  tagEn: string;
  introAr: string;
  introEn: string;
  imageAssetPath: string | null;
}

export type MeatLoversTextSettings = Record<MeatLoversCopyField, string>;

export interface MeatLoversMenuSettings extends MeatLoversTextSettings {
  theme: MeatLoversTheme;
  /** Shows the light / dark switch in the header. */
  allowThemeSwitch: boolean;
  motion: MeatLoversMotion;
  defaultView: MeatLoversView;
  showAnnouncement: boolean;
  showStory: boolean;
  heroImageAssetPath: string | null;
  storyImageAssetPath: string | null;
  /** Category UUID -> chapter overrides; unspecified categories use their own menu data. */
  categoryExtras: Record<string, MeatLoversCategoryExtra>;
}

export const DEFAULT_MEAT_LOVERS_SETTINGS: MeatLoversMenuSettings = {
  ...MEAT_LOVERS_COPY_DEFAULTS,
  theme: 'DARK',
  allowThemeSwitch: true,
  motion: 'SUBTLE',
  defaultView: 'CARDS',
  showAnnouncement: true,
  showStory: true,
  heroImageAssetPath: null,
  storyImageAssetPath: null,
  categoryExtras: {},
};

export const isMeatLoversMediaPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(value);
export const isMeatLoversCategoryId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';

/**
 * Every unrecognized or invalid value falls back to the default; the result is always render-safe.
 * `brand` defaults to empty, which means "use the Restaurant name".
 */
export function normalizeMeatLoversSettings(value: unknown): MeatLoversMenuSettings {
  const row =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = {} as MeatLoversTextSettings;
  for (const key of Object.keys(MEAT_LOVERS_COPY_LIMITS) as MeatLoversCopyField[]) {
    const raw = cleanText(row[key], MEAT_LOVERS_COPY_LIMITS[key]);
    text[key] = raw || MEAT_LOVERS_COPY_DEFAULTS[key];
  }
  const rawExtras =
    row.categoryExtras && typeof row.categoryExtras === 'object' && !Array.isArray(row.categoryExtras)
      ? (row.categoryExtras as Record<string, unknown>)
      : {};
  const categoryExtras: Record<string, MeatLoversCategoryExtra> = Object.create(null) as Record<
    string,
    MeatLoversCategoryExtra
  >;
  for (const [id, input] of Object.entries(rawExtras).slice(0, MEAT_LOVERS_CATEGORY_EXTRA_LIMIT)) {
    if (!isMeatLoversCategoryId(id) || !input || typeof input !== 'object' || Array.isArray(input)) continue;
    const entry = input as Record<string, unknown>;
    categoryExtras[id.toLowerCase()] = {
      tagAr: cleanText(entry.tagAr, MEAT_LOVERS_CATEGORY_EXTRA_TEXT.tagAr),
      tagEn: cleanText(entry.tagEn, MEAT_LOVERS_CATEGORY_EXTRA_TEXT.tagEn),
      introAr: cleanText(entry.introAr, MEAT_LOVERS_CATEGORY_EXTRA_TEXT.introAr),
      introEn: cleanText(entry.introEn, MEAT_LOVERS_CATEGORY_EXTRA_TEXT.introEn),
      imageAssetPath: isMeatLoversMediaPath(entry.imageAssetPath) ? entry.imageAssetPath : null,
    };
  }
  const bool = (key: string, fallback: boolean): boolean =>
    typeof row[key] === 'boolean' ? row[key] : fallback;
  const media = (key: MeatLoversImageField): string | null =>
    isMeatLoversMediaPath(row[key]) ? row[key] : null;
  return {
    ...text,
    theme: MEAT_LOVERS_THEMES.find((theme) => theme === row.theme) ?? 'DARK',
    allowThemeSwitch: bool('allowThemeSwitch', true),
    motion: MEAT_LOVERS_MOTIONS.find((motion) => motion === row.motion) ?? 'SUBTLE',
    defaultView: MEAT_LOVERS_VIEWS.find((view) => view === row.defaultView) ?? 'CARDS',
    showAnnouncement: bool('showAnnouncement', true),
    showStory: bool('showStory', true),
    heroImageAssetPath: media('heroImageAssetPath'),
    storyImageAssetPath: media('storyImageAssetPath'),
    categoryExtras,
  };
}

/** Every uploaded asset a settings object references (used to delete only unreferenced uploads). */
export function meatLoversAssetPaths(settings: MeatLoversMenuSettings): Set<string> {
  const paths = new Set<string>();
  for (const field of Object.values(MEAT_LOVERS_IMAGE_FIELD)) {
    const path = settings[field];
    if (path) paths.add(path);
  }
  for (const extra of Object.values(settings.categoryExtras)) {
    if (extra.imageAssetPath) paths.add(extra.imageAssetPath);
  }
  return paths;
}

/** `{name}` token and Latin/Arabic copy resolution shared by the renderer. */
export function meatLoversCopy(
  settings: MeatLoversMenuSettings,
  key: MeatLoversCopyKey,
  locale: string,
  brand: string,
): string {
  const field = `${key}${locale === 'ar' ? 'Ar' : 'En'}` as MeatLoversCopyField;
  return settings[field].split('{name}').join(brand);
}
