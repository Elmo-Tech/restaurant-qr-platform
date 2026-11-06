/**
 * Guest checkout field validation (Pickup, Delivery, and the WhatsApp order): ONE place used by
 * the shared cart/checkout, so every menu template (stock and exclusive designs) gets the same
 * rules. It gives the Guest instant, localized feedback; the API repeats these rules and is the
 * authority (`apps/api/src/public/guest-order-fields.ts`: keep the two in step -- the shared
 * vectors in `checkout-validation.test.mjs` and the API spec are the guard).
 *
 * Pure functions and no UI. `libphonenumber-js` is NOT imported statically: Egyptian numbers (the
 * main market) are judged here without it, and the library is loaded on demand only for numbers
 * from other countries (`loadPhoneLibrary`), so the menu stays light.
 */
import type { CountryCode } from 'libphonenumber-js';

export type CheckoutField =
  | 'customerName'
  | 'customerPhone'
  | 'customerNotes'
  | 'deliveryAddress'
  | 'deliveryBuilding'
  | 'deliveryFloor'
  | 'deliveryApartment'
  | 'deliveryLandmark';

/** What is wrong with a field; the UI turns it into a sentence in the Guest's language. */
export type FieldIssue =
  | 'required'
  | 'tooShort'
  | 'tooLong'
  | 'invalidPhone'
  | 'needsLetter'
  /** The API refused the value with a code this build does not know. */
  | 'invalid';

export const CHECKOUT_LIMITS: Record<CheckoutField, { min?: number; max: number }> = {
  customerName: { min: 2, max: 100 },
  customerPhone: { max: 30 },
  customerNotes: { max: 500 },
  deliveryAddress: { min: 5, max: 300 },
  deliveryBuilding: { max: 50 },
  deliveryFloor: { max: 30 },
  deliveryApartment: { max: 30 },
  deliveryLandmark: { max: 150 },
};

/** The default country of the phone field when the menu did not say (Egypt is the main market). */
export const DEFAULT_PHONE_COUNTRY = 'EG';

// ---------------------------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------------------------

const hex = (code: string) => String.fromCharCode(parseInt(code, 16));
/** C0/C1 controls, zero-width space, BOM, line/paragraph separators and bidi override/isolate controls. */
const UNSAFE_CHARS = new RegExp(
  '[' +
    [
      '0000-001F',
      '007F-009F',
      '200B',
      'FEFF',
      '2028',
      '2029',
      '202A-202E',
      '2066-2069',
    ]
      .map((range) => range.split('-').map(hex).join('-'))
      .join('') +
    ']',
  'g',
);

/** Arabic-Indic, Eastern Arabic (Persian) and full-width digits become 0-9; the full-width plus becomes +. */
export function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .replace(/＋/g, '+');
}

/** Typing-time cleanup: drops unsafe characters but keeps spaces and line breaks the Guest is still typing. */
export function sanitizeWhileTyping(field: CheckoutField, value: string): string {
  if (field === 'customerPhone') {
    // Digits (any script), plus, spaces and the usual separators. Letters cannot be part of a number.
    return toWesternDigits(value)
      .replace(UNSAFE_CHARS, '')
      .replace(/[^0-9+\s().-]/g, '');
  }
  const keepLineBreaks = field === 'customerNotes';
  return value.replace(UNSAFE_CHARS, (char) =>
    keepLineBreaks && (char === '\n' || char === '\u2028' || char === '\u2029') ? '\n' : '',
  );
}

/** What is judged and sent: a single line (name, address parts) tidied to one clean line. */
export function cleanSingleLine(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(UNSAFE_CHARS, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Order notes keep line breaks (at most one blank line in a row). */
export function cleanMultiLine(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(UNSAFE_CHARS, (char) =>
      char === '\n' || char === '\u2028' || char === '\u2029' ? '\n' : '',
    )
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cleanCheckoutValue(field: CheckoutField, value: string): string {
  if (field === 'customerPhone') return cleanSingleLine(toWesternDigits(value));
  return field === 'customerNotes' ? cleanMultiLine(value) : cleanSingleLine(value);
}

// ---------------------------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------------------------

/** The part of libphonenumber the checkout uses; loaded on demand. */
export interface PhoneLibrary {
  parsePhoneNumberFromString: typeof import('libphonenumber-js/max').parsePhoneNumberFromString;
}

let phoneLibraryPromise: Promise<PhoneLibrary> | null = null;
let phoneLibrary: PhoneLibrary | null = null;

/** Loads libphonenumber (full metadata) once; resolves to the cached module afterwards. */
export function loadPhoneLibrary(): Promise<PhoneLibrary> {
  phoneLibraryPromise ??= import('libphonenumber-js/max').then((module) => {
    phoneLibrary = module;
    return module;
  });
  return phoneLibraryPromise;
}

/** The library if it has already loaded, else null. */
export function loadedPhoneLibrary(): PhoneLibrary | null {
  return phoneLibrary;
}

// Egyptian numbers, from libphonenumber's metadata for EG (national number, trunk 0 removed):
// mobile 1[0125]xxxxxxxx; landlines by area code (Cairo/Giza 2x + 7, Alexandria 3 + 7, the other
// governorates 4x..9x + 7, plus 13[23]xxxxxx and 15/57 + 6-7 digits). Toll-free and premium lines
// are not a customer's phone. The test file checks this against the library.
const EG_MOBILE = /^1[0-25]\d{8}$/;
const EG_LANDLINE =
  /^(?:13[23]\d{6}|(?:15|57)\d{6,7}|(?:2\d|3|4[05-8]|5[05]|6[24-689]|8[2468]|9[235-7])\d{7})$/;

const PHONE_ALLOWED = /^\+?[0-9\s().-]+$/;

export type PhoneCheck =
  | { valid: true; value: string; verified: boolean }
  | { valid: false };

/** True when judging this input needs the full library (anything that is not clearly Egyptian). */
export function phoneNeedsLibrary(raw: string, country: string): boolean {
  const input = toWesternDigits(raw).replace(UNSAFE_CHARS, '').trim();
  const international = /^(\+|00)/.test(input);
  if (international) {
    const digits = input.replace(/^(\+|00)\s*/, '').replace(/\D/g, '');
    return !digits.startsWith('20');
  }
  return country !== 'EG';
}

const REFUSED_TYPES = new Set([
  'TOLL_FREE',
  'PREMIUM_RATE',
  'SHARED_COST',
  'UAN',
  'PAGER',
  'VOICEMAIL',
  'SHORT_CODE',
]);

/**
 * Judges a customer phone and returns it as E.164. Without `library`, Egyptian numbers are decided
 * exactly; a number from elsewhere is only shape-checked (`verified: false`) until the library has
 * loaded, and the API checks it for real either way.
 */
export function checkGuestPhone(
  raw: string,
  country: string,
  library: PhoneLibrary | null,
): PhoneCheck {
  let input = toWesternDigits(raw).replace(UNSAFE_CHARS, '').trim();
  if (input === '') return { valid: false };
  if (input.startsWith('00')) input = `+${input.slice(2).trimStart()}`;
  if (!PHONE_ALLOWED.test(input)) return { valid: false };

  if (library) {
    const phone = library.parsePhoneNumberFromString(input, {
      defaultCountry: country as CountryCode,
      extract: false,
    });
    if (!phone || phone.ext || !phone.isValid()) return { valid: false };
    const type = phone.getType();
    if (type !== undefined && REFUSED_TYPES.has(type)) return { valid: false };
    if (!/^\+[0-9]{6,15}$/.test(phone.number)) return { valid: false };
    return { valid: true, value: phone.number, verified: true };
  }

  const digits = input.replace(/\D/g, '');
  if (input.startsWith('+')) {
    if (input.indexOf('+', 1) !== -1) return { valid: false };
    if (digits.startsWith('20')) return egyptianNumber(digits.slice(2));
    return /^[1-9]\d{7,14}$/.test(digits)
      ? { valid: true, value: `+${digits}`, verified: false }
      : { valid: false };
  }
  if (input.includes('+')) return { valid: false };
  if (country === 'EG') return egyptianNumber(digits);
  // Another default country with no library yet: only the shape can be judged.
  return /^\d{7,15}$/.test(digits) ? { valid: true, value: digits, verified: false } : { valid: false };
}

/** `national` may carry the trunk 0 ("01012345678" -> "1012345678"). */
function egyptianNumber(national: string): PhoneCheck {
  const withoutTrunk = national.startsWith('0') ? national.slice(1) : national;
  return EG_MOBILE.test(withoutTrunk) || EG_LANDLINE.test(withoutTrunk)
    ? { valid: true, value: `+20${withoutTrunk}`, verified: true }
    : { valid: false };
}

// ---------------------------------------------------------------------------------------------
// The whole form
// ---------------------------------------------------------------------------------------------

export interface CheckoutValidationContext {
  /** ISO 3166-1 alpha-2 of the Restaurant (the default country of the phone field). */
  country: string;
  delivery: boolean;
  library: PhoneLibrary | null;
}

export type CheckoutIssues = Partial<Record<CheckoutField, FieldIssue>>;

const REQUIRED_ALWAYS: readonly CheckoutField[] = ['customerName', 'customerPhone'];
const LETTER = /\p{L}/u;

/** Delivery-only fields; ignored (and not sent) for Pickup. */
export const DELIVERY_FIELDS: readonly CheckoutField[] = [
  'deliveryAddress',
  'deliveryBuilding',
  'deliveryFloor',
  'deliveryApartment',
  'deliveryLandmark',
];

export function fieldsToCheck(delivery: boolean): CheckoutField[] {
  return [
    'customerName',
    'customerPhone',
    ...(delivery ? (DELIVERY_FIELDS as CheckoutField[]) : []),
    'customerNotes',
  ];
}

/** The first problem of every field (a missing required value counts), in the order they appear on the form. */
export function validateCheckoutFields(
  values: Record<CheckoutField, string>,
  context: CheckoutValidationContext,
): CheckoutIssues {
  const issues: CheckoutIssues = {};
  for (const field of fieldsToCheck(context.delivery)) {
    const issue = checkField(field, values[field] ?? '', context);
    if (issue) issues[field] = issue;
  }
  return issues;
}

function checkField(
  field: CheckoutField,
  raw: string,
  context: CheckoutValidationContext,
): FieldIssue | null {
  const value = cleanCheckoutValue(field, raw);
  const required =
    REQUIRED_ALWAYS.includes(field) || (context.delivery && field === 'deliveryAddress');
  if (value === '') return required ? 'required' : null;

  if (field === 'customerPhone') {
    return checkGuestPhone(value, context.country, context.library).valid ? null : 'invalidPhone';
  }
  const limits = CHECKOUT_LIMITS[field];
  if (limits.min !== undefined && value.length < limits.min) return 'tooShort';
  if (value.length > limits.max) return 'tooLong';
  if ((field === 'customerName' || field === 'deliveryAddress') && !LETTER.test(value)) {
    return 'needsLetter';
  }
  return null;
}

/** The values to send: cleaned, and the phone as E.164 when it is known. */
export function checkoutValuesForSubmit(
  values: Record<CheckoutField, string>,
  context: CheckoutValidationContext,
): Record<CheckoutField, string> {
  const out = {} as Record<CheckoutField, string>;
  for (const field of Object.keys(CHECKOUT_LIMITS) as CheckoutField[]) {
    out[field] = cleanCheckoutValue(field, values[field] ?? '');
  }
  const phone = checkGuestPhone(out.customerPhone, context.country, context.library);
  if (phone.valid) out.customerPhone = phone.value;
  if (!context.delivery) {
    for (const field of DELIVERY_FIELDS) out[field] = '';
  }
  return out;
}

/** Maps a per-field code of the API (`error.details.fields[].code`) to the issue shown under the field. */
export function issueFromApiCode(code: string): FieldIssue {
  switch (code) {
    case 'REQUIRED':
      return 'required';
    case 'TOO_SHORT':
      return 'tooShort';
    case 'TOO_LONG':
      return 'tooLong';
    case 'INVALID_PHONE':
      return 'invalidPhone';
    case 'MUST_CONTAIN_LETTER':
      return 'needsLetter';
    default:
      return 'invalid';
  }
}

const CHECKOUT_FIELD_SET: ReadonlySet<string> = new Set(Object.keys(CHECKOUT_LIMITS));

export function isCheckoutField(name: string): name is CheckoutField {
  return CHECKOUT_FIELD_SET.has(name);
}
