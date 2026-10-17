/**
 * Restaurant contact details for the Guest Menu (DEC-042). Every value is typed by
 * Staff and later rendered as a link on a public page, so each one is validated and
 * normalized here: a phone is digits only, a social link must be https on the
 * platform's own domain, nothing carries credentials. Pure functions, no I/O.
 */

export type ContactField =
  | 'phone'
  | 'whatsapp'
  | 'hotline'
  | 'facebookUrl'
  | 'instagramUrl'
  | 'tiktokUrl'
  | 'telegramUrl'
  | 'youtubeUrl'
  | 'xUrl'
  | 'snapchatUrl'
  | 'mapsUrl'
  | 'websiteUrl';

export const CONTACT_FIELDS: readonly ContactField[] = [
  'phone',
  'whatsapp',
  'hotline',
  'facebookUrl',
  'instagramUrl',
  'tiktokUrl',
  'telegramUrl',
  'youtubeUrl',
  'xUrl',
  'snapchatUrl',
  'mapsUrl',
  'websiteUrl',
];

/** What the Guest Menu and the Staff settings both see: every field, null when not set. */
export type RestaurantContact = Record<ContactField, string | null>;

export const EMPTY_CONTACT: RestaurantContact = {
  phone: null,
  whatsapp: null,
  hotline: null,
  facebookUrl: null,
  instagramUrl: null,
  tiktokUrl: null,
  telegramUrl: null,
  youtubeUrl: null,
  xUrl: null,
  snapchatUrl: null,
  mapsUrl: null,
  websiteUrl: null,
};

const MAX_URL_LENGTH = 300;

/** Hosts a link of each platform may use (the host itself or any subdomain of it). `null` = any https host. */
const ALLOWED_HOSTS: Partial<Record<ContactField, readonly string[] | null>> = {
  facebookUrl: ['facebook.com', 'fb.com', 'fb.me', 'fb.watch'],
  instagramUrl: ['instagram.com', 'instagr.am'],
  tiktokUrl: ['tiktok.com'],
  telegramUrl: ['t.me', 'telegram.me', 'telegram.org'],
  youtubeUrl: ['youtube.com', 'youtu.be'],
  xUrl: ['x.com', 'twitter.com'],
  snapchatUrl: ['snapchat.com'],
  mapsUrl: ['google.com', 'goo.gl', 'maps.app.goo.gl', 'g.page', 'apple.com'],
  websiteUrl: null,
};

export type ContactErrorCode = 'INVALID_PHONE' | 'INVALID_URL';

export class ContactValidationError extends Error {
  constructor(
    readonly field: ContactField,
    readonly code: ContactErrorCode,
  ) {
    super(`${field}: ${code}`);
    this.name = 'ContactValidationError';
  }
}

/** A hotline / short number such as 16512: 3 to 8 digits, no plus. Null for blank. */
export function normalizeHotline(
  field: ContactField,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const digits = trimmed.replace(/[\s-]/g, '');
  if (!/^\d{3,8}$/.test(digits))
    throw new ContactValidationError(field, 'INVALID_PHONE');
  return digits;
}

/** "+20 (10) 1234-5678" -> "+201012345678"; 6 to 15 digits, optional leading "+". Null for blank. */
export function normalizePhone(
  field: ContactField,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[\s().-]/g, '').replace(/^\+/, '');
  if (!/^\d{6,15}$/.test(digits))
    throw new ContactValidationError(field, 'INVALID_PHONE');
  // wa.me only works with the country code, so a WhatsApp number must be international.
  if (field === 'whatsapp' && !plus) {
    throw new ContactValidationError(field, 'INVALID_PHONE');
  }
  return `${plus ? '+' : ''}${digits}`;
}

function hostMatches(host: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

/** A clean https URL on the platform's own domain; blank -> null. A bare "instagram.com/x" gets https added. */
export function normalizeUrl(
  field: ContactField,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_URL_LENGTH || /\s/.test(trimmed)) {
    throw new ContactValidationError(field, 'INVALID_URL');
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ContactValidationError(field, 'INVALID_URL');
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    throw new ContactValidationError(field, 'INVALID_URL');
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes('.'))
    throw new ContactValidationError(field, 'INVALID_URL');
  const allowed = ALLOWED_HOSTS[field];
  if (allowed && !hostMatches(host, allowed)) {
    throw new ContactValidationError(field, 'INVALID_URL');
  }
  return url.toString();
}

/** Validates one field value (string | null | undefined). `undefined` means "leave unchanged" and is the caller's concern. */
export function normalizeContactValue(
  field: ContactField,
  value: string | null,
): string | null {
  if (value === null) return null;
  if (field === 'hotline') return normalizeHotline(field, value);
  return field === 'phone' || field === 'whatsapp'
    ? normalizePhone(field, value)
    : normalizeUrl(field, value);
}

/** The wa.me link for a stored WhatsApp number (digits only, as wa.me requires). */
export function whatsappLink(number: string): string {
  return `https://wa.me/${number.replace(/^\+/, '')}`;
}

/** The Restaurant columns that hold the contact details; spread into any Prisma `select`. */
export const CONTACT_COLUMNS = {
  contactPhone: true,
  whatsappNumber: true,
  hotlineNumber: true,
  facebookUrl: true,
  instagramUrl: true,
  tiktokUrl: true,
  telegramUrl: true,
  youtubeUrl: true,
  xUrl: true,
  snapchatUrl: true,
  mapsUrl: true,
  websiteUrl: true,
} as const;

export type ContactColumns = {
  -readonly [K in keyof typeof CONTACT_COLUMNS]: string | null;
};

export function contactFromColumns(row: ContactColumns): RestaurantContact {
  return {
    phone: row.contactPhone,
    whatsapp: row.whatsappNumber,
    hotline: row.hotlineNumber,
    facebookUrl: row.facebookUrl,
    instagramUrl: row.instagramUrl,
    tiktokUrl: row.tiktokUrl,
    telegramUrl: row.telegramUrl,
    youtubeUrl: row.youtubeUrl,
    xUrl: row.xUrl,
    snapchatUrl: row.snapchatUrl,
    mapsUrl: row.mapsUrl,
    websiteUrl: row.websiteUrl,
  };
}

const COLUMN_OF_FIELD: Record<ContactField, keyof ContactColumns> = {
  phone: 'contactPhone',
  whatsapp: 'whatsappNumber',
  hotline: 'hotlineNumber',
  facebookUrl: 'facebookUrl',
  instagramUrl: 'instagramUrl',
  tiktokUrl: 'tiktokUrl',
  telegramUrl: 'telegramUrl',
  youtubeUrl: 'youtubeUrl',
  xUrl: 'xUrl',
  snapchatUrl: 'snapchatUrl',
  mapsUrl: 'mapsUrl',
  websiteUrl: 'websiteUrl',
};

/** Validated column updates for a PATCH body: only the fields that were sent. Throws `ContactValidationError`. */
export function contactColumnUpdates(
  patch: Partial<Record<ContactField, string | null | undefined>>,
): Partial<ContactColumns> {
  const updates: Partial<ContactColumns> = {};
  for (const field of CONTACT_FIELDS) {
    const value = patch[field];
    if (value === undefined) continue;
    updates[COLUMN_OF_FIELD[field]] = normalizeContactValue(field, value);
  }
  return updates;
}
