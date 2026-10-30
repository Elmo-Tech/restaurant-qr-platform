import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'EG';

/** The input displays the local number, while the API keeps the existing E.164 string contract. */
export interface InternationalPhoneDraft {
  country: CountryCode;
  national: string;
  edited: boolean;
}

export type PhoneNormalization = { valid: true; value: string | null } | { valid: false };

export function asciiPhoneDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .replace(/＋/g, '+');
}

/**
 * Existing data can include non-international phone numbers (only WhatsApp
 * was required to have a '+' previously). Never reinterpret or rewrite one
 * of those values unless the staff member edits that number.
 */
export function phoneDraftFromStored(value: string | null | undefined): InternationalPhoneDraft {
  const stored = value ?? '';
  const international = stored.trim().startsWith('+')
    ? parsePhoneNumberFromString(asciiPhoneDigits(stored))
    : undefined;
  if (international?.country) {
    return {
      country: international.country,
      national: international.formatNational(),
      edited: false,
    };
  }
  return { country: DEFAULT_PHONE_COUNTRY, national: stored, edited: false };
}

/** Recognize a pasted international number and select its actual country. */
export function editPhoneDraft(previous: InternationalPhoneDraft, text: string): InternationalPhoneDraft {
  const normalized = asciiPhoneDigits(text);
  if (normalized.trim().startsWith('+')) {
    const phone = parsePhoneNumberFromString(normalized.trim(), { extract: false });
    if (phone?.country && phone.isValid() && !phone.ext) {
      return { country: phone.country, national: phone.formatNational(), edited: true };
    }
  }
  return { ...previous, national: normalized, edited: true };
}

/** The country picker changes the dialling interpretation, not the saved record. */
export function changePhoneDraftCountry(
  previous: InternationalPhoneDraft,
  country: CountryCode,
): InternationalPhoneDraft {
  return { ...previous, country, edited: true };
}

/**
 * Strict client-side check: the server still validates/saves the resulting
 * number. We do not change the Backend's contact normalization contract.
 * 'whatsapp' and 'phone' both submit +<country-code><national-number>.
 */
export function normalizePhoneDraft(draft: InternationalPhoneDraft): PhoneNormalization {
  const input = asciiPhoneDigits(draft.national).trim();
  if (!input) return { valid: true, value: null };
  // Prevent loose extraction from text/URLs and duplicated + prefixes.
  if (!/^\+?[0-9\s().-]+$/.test(input)) return { valid: false };
  const phone = parsePhoneNumberFromString(input, {
    defaultCountry: draft.country,
    extract: false,
  });
  if (!phone || phone.ext || !phone.isValid()) return { valid: false };
  // E.164 permits at most 15 digits. The backend also enforces this bound.
  if (!/^\+[0-9]{6,15}$/.test(phone.number)) return { valid: false };
  return { valid: true, value: phone.number };
}

/**
 * A native select uses the full ISO country list and localized names.
 * The popular countries appear first, without duplicating their options.
 */
const PINNED_COUNTRIES: readonly CountryCode[] = ['EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'JO', 'US', 'GB'];

export interface PhoneCountryOption {
  country: CountryCode;
  label: string;
  callingCode: string;
}

export function countryOptionsForLocale(locale: 'ar' | 'en'): {
  popular: PhoneCountryOption[];
  remaining: PhoneCountryOption[];
} {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  const collator = new Intl.Collator(locale);
  const all = getCountries();
  const make = (country: CountryCode): PhoneCountryOption => ({
    country,
    label: names.of(country) ?? country,
    callingCode: getCountryCallingCode(country),
  });
  const popular = PINNED_COUNTRIES.filter(c => all.includes(c)).map(make);
  const remaining = all.filter(c => !PINNED_COUNTRIES.includes(c)).map(make)
    .sort((a, b) => collator.compare(a.label, b.label));
  return { popular, remaining };
}

export function countryFlag(country: CountryCode): string {
  return String.fromCodePoint(
    ...country.toUpperCase().split('').map(character => 0x1f1e6 + character.charCodeAt(0) - 65),
  );
}
