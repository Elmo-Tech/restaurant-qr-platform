/**
 * DEC-066: readable Guest Menu links. `/q/{slug}` is the Restaurant's name in URL form
 * (Latin letters, digits and hyphens); two Restaurants with the same name get `-2`, `-3`, ...
 *
 * A slug is a public LOOKUP, never an authorization: it only finds the Restaurant's own
 * GENERIC QR. Table QRs keep their opaque public codes.
 */

export const SLUG_MIN_LENGTH = 3;
/** Always below 43, the length of every generated QR public code, so a slug can never equal one. */
export const SLUG_MAX_LENGTH = 40;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Words that must never become a Restaurant's link (routes, infrastructure, confusing names). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'api',
  'admin',
  'app',
  'auth',
  'cdn',
  'control',
  'dashboard',
  'demo',
  'kitchen',
  'login',
  'logout',
  'mail',
  'menu',
  'new',
  'null',
  'platform',
  'q',
  'qr',
  'restaurant',
  'restaurants',
  'staff',
  'static',
  'support',
  'test',
  'undefined',
  'wayta',
  'www',
]);

// A plain, readable romanization (not a linguistic standard): the Platform team can always edit the result.
// prettier-ignore
const ARABIC_LETTERS: Readonly<Record<string, string>> = {
  ا: 'a', أ: 'a', إ: 'e', آ: 'a', ٱ: 'a', ء: '', ؤ: 'o', ئ: 'e',
  ب: 'b', ت: 't', ث: 'th', ج: 'g', ح: 'h', خ: 'kh', د: 'd', ذ: 'z',
  ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z',
  ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n',
  ه: 'h', ة: 'a', و: 'w', ي: 'y', ى: 'a', پ: 'p', چ: 'ch', ڤ: 'v', گ: 'g',
};

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ARABIC_INDIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Arabic text to Latin letters; every other character passes through unchanged. */
export function transliterateArabic(input: string): string {
  // "ال" at the start of a word (the definite article) reads as its own syllable: "الشربيني" -> "al-sherbiny".
  const withArticle = input.replace(/(^|[\s\-_])ال(?=[؀-ۿ])/g, '$1al-');
  let out = '';
  for (const char of withArticle) {
    const digit = ARABIC_DIGITS.indexOf(char);
    const indic = ARABIC_INDIC_DIGITS.indexOf(char);
    if (digit >= 0) out += String(digit);
    else if (indic >= 0) out += String(indic);
    else if (char in ARABIC_LETTERS) out += ARABIC_LETTERS[char];
    else out += char;
  }
  return out;
}

/** The Restaurant name as a slug candidate (before collision handling). Never empty, never reserved-looking on its own. */
export function slugify(name: string): string {
  const latin = transliterateArabic(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ؀-ۿ]/g, '') // accents, and Arabic marks / letters not in the map
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let slug = truncateSlug(latin, SLUG_MAX_LENGTH);
  if (slug.length === 0) slug = 'restaurant';
  if (slug.length < SLUG_MIN_LENGTH) slug = `${slug}-menu`;
  return slug;
}

function truncateSlug(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  // Prefer to end on a whole word.
  const lastHyphen = cut.lastIndexOf('-');
  return (
    lastHyphen >= SLUG_MIN_LENGTH ? cut.slice(0, lastHyphen) : cut
  ).replace(/-+$/g, '');
}

export function isValidSlug(value: string): boolean {
  return (
    value.length >= SLUG_MIN_LENGTH &&
    value.length <= SLUG_MAX_LENGTH &&
    SLUG_PATTERN.test(value)
  );
}

/** Shape check only: could this URL segment be a slug (rather than a 43-character opaque QR code)? */
export function looksLikeSlug(value: string): boolean {
  return value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

export type SlugProblem = 'format' | 'reserved';

/** Validates a slug a person typed (Platform edit). Returns null when it is acceptable. */
export function slugProblem(value: string): SlugProblem | null {
  if (!isValidSlug(value)) return 'format';
  if (RESERVED_SLUGS.has(value)) return 'reserved';
  return null;
}

/** The numbered form: `pizza-house` + 2 -> `pizza-house-2`, still within the length limit. */
export function numberedSlug(base: string, n: number): string {
  const suffix = `-${n}`;
  const room = SLUG_MAX_LENGTH - suffix.length;
  const stem =
    base.length > room ? truncateSlug(base, room) || base.slice(0, room) : base;
  return `${stem}${suffix}`;
}

/** The minimal read this needs: which of these slugs are already taken (current AND former). */
export interface SlugLookup {
  restaurantSlug: {
    findMany(args: {
      where: { slug: { in: string[] } };
      select: { slug: true };
    }): Promise<Array<{ slug: string }>>;
  };
}

/** How many numbered variants (name-2 ... name-60) are tried before giving up. */
const MAX_VARIANTS = 60;

/**
 * Picks a free slug for a Restaurant name: the plain name, else `name-2`, `name-3`, ...
 * The database UNIQUE index stays the final guarantee; a lost race surfaces as a unique
 * violation the caller retries.
 */
export async function allocateRestaurantSlug(
  db: SlugLookup,
  name: string,
  alsoTaken: ReadonlySet<string> = new Set(),
): Promise<string> {
  const base = slugify(name);
  const candidates = [base];
  for (let n = 2; n <= MAX_VARIANTS; n += 1)
    candidates.push(numberedSlug(base, n));
  const rows = await db.restaurantSlug.findMany({
    where: { slug: { in: candidates } },
    select: { slug: true },
  });
  const taken = new Set(rows.map((row) => row.slug));
  const free = candidates.find(
    (candidate) =>
      !taken.has(candidate) &&
      !alsoTaken.has(candidate) &&
      !RESERVED_SLUGS.has(candidate),
  );
  if (!free) throw new Error('Could not allocate a restaurant slug');
  return free;
}
