/** Restaurant contact details (DEC-042): a field is null when not set. */
export interface RestaurantContact {
  phone: string | null;
  whatsapp: string | null;
  /** A short / hotline number such as 16512. */
  hotline: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  telegramUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  snapchatUrl: string | null;
  mapsUrl: string | null;
  websiteUrl: string | null;
}

export type ContactField = keyof RestaurantContact;

/** Phone-like fields first, then the links in the order they are shown. */
export const CONTACT_FIELDS: readonly ContactField[] = [
  'phone',
  'whatsapp',
  'hotline',
  'instagramUrl',
  'facebookUrl',
  'tiktokUrl',
  'youtubeUrl',
  'telegramUrl',
  'xUrl',
  'snapchatUrl',
  'mapsUrl',
  'websiteUrl',
];

/** The wa.me link for a stored WhatsApp number (digits only, as wa.me requires). */
export function whatsappHref(number: string): string {
  return `https://wa.me/${number.replace(/^\+/, '')}`;
}

/** A tel: link; the stored number is already digits with an optional leading plus. */
export function telHref(number: string): string {
  return `tel:${number}`;
}
