/**
 * Validation and normalization of the free-text fields a Guest types at checkout (customer
 * name, phone, delivery address parts, notes). Pure functions, no I/O: the Guest DTO uses the
 * sanitizers, `PublicOrdersService` uses `validateGuestOrderFields` once the Restaurant's
 * country is known. The web checkout mirrors these rules for instant feedback
 * (`apps/web/src/lib/public-menu/checkout-validation.ts`); THIS file is the authority.
 *
 * Errors are stable machine-readable codes (API_CONVENTIONS.md #34), never English sentences.
 * Phone numbers are never logged: nothing here logs anything.
 */
import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';

/** Per-field limits, one source for the DTO decorators and the validator. */
export const GUEST_FIELD_LIMITS = {
  customerName: { min: 2, max: 100 },
  customerPhone: { max: 30 },
  customerNotes: { max: 500 },
  deliveryAddress: { min: 5, max: 300 },
  deliveryBuilding: { max: 50 },
  deliveryFloor: { max: 30 },
  deliveryApartment: { max: 30 },
  deliveryLandmark: { max: 150 },
} as const;

export type GuestOrderFieldName = keyof typeof GUEST_FIELD_LIMITS;

/** The `code` of one entry of `error.details.fields` (API_CONVENTIONS.md #34). */
export type GuestFieldErrorCode =
  | 'REQUIRED'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'INVALID_PHONE'
  | 'MUST_CONTAIN_LETTER';

export interface GuestFieldError {
  field: GuestOrderFieldName;
  code: GuestFieldErrorCode;
}

// C0/C1 controls, line/paragraph separators, zero-width space, BOM and the bidi
// embedding/override/isolate controls (they can reorder text on the staff screen).
const UNSAFE_CHARS =
  // eslint-disable-next-line no-control-regex -- the point is to match control characters
  /[\u0000-\u001F\u007F-\u009F\u200B\uFEFF\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;

/** Arabic-Indic, Eastern Arabic (Persian) and full-width digits -> 0-9; full-width plus -> +. */
export function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .replace(/＋/g, '+');
}

/** One line of text: unsafe characters removed, every whitespace run (tabs, newlines) one space, trimmed. */
export function cleanSingleLine(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  return input
    .normalize('NFC')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(UNSAFE_CHARS, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Free text with line breaks (order notes): unsafe characters removed, at most one blank line in a row. */
export function cleanMultiLine(input: unknown): unknown {
  if (typeof input !== 'string') return input;
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

/** Phone as typed -> Western digits, no unsafe characters, trimmed. Format is NOT judged here. */
export function cleanPhoneInput(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  return (cleanSingleLine(toWesternDigits(input)) as string).trim();
}

const PHONE_ALLOWED = /^\+?[0-9\s().-]+$/;

// Lines that reach a person: ordinary lines and mobiles. Toll-free, premium, shared-cost and
// other service numbers can never be a customer's own phone.
const REFUSED_PHONE_TYPES: ReadonlySet<string> = new Set([
  'TOLL_FREE',
  'PREMIUM_RATE',
  'SHARED_COST',
  'UAN',
  'PAGER',
  'VOICEMAIL',
  'SHORT_CODE',
]);

export type GuestPhoneResult =
  { valid: true; value: string } | { valid: false };

/**
 * Validates a customer phone and returns it as E.164 ("+201012345678"). `defaultCountry` is the
 * Restaurant's country (restaurants.countryCode): a number without a country prefix is read as
 * that country's; a number written with "+" or "00" may belong to any country. The rules are
 * libphonenumber's per-country metadata (Egypt: mobile 01[0125]xxxxxxxx, landlines by area
 * code), so a made-up number such as "548" is refused.
 */
export function normalizeGuestPhone(
  raw: string,
  defaultCountry: string,
): GuestPhoneResult {
  let input = toWesternDigits(raw).replace(UNSAFE_CHARS, '').trim();
  if (input === '') return { valid: false };
  if (input.startsWith('00')) input = `+${input.slice(2).trimStart()}`;
  if (!PHONE_ALLOWED.test(input)) return { valid: false };
  const phone = parsePhoneNumberFromString(input, {
    defaultCountry: defaultCountry as CountryCode,
    extract: false,
  });
  if (!phone || phone.ext || !phone.isValid()) return { valid: false };
  const type = phone.getType();
  if (type !== undefined && REFUSED_PHONE_TYPES.has(type))
    return { valid: false };
  if (!/^\+[0-9]{6,15}$/.test(phone.number)) return { valid: false };
  return { valid: true, value: phone.number };
}

const LETTER = /\p{L}/u;

/** The values after DTO sanitizing; `undefined`/empty means "not provided". */
export interface GuestOrderFieldValues {
  customerName?: string;
  customerPhone?: string;
  customerNotes?: string;
  deliveryAddress?: string;
  deliveryBuilding?: string;
  deliveryFloor?: string;
  deliveryApartment?: string;
  deliveryLandmark?: string;
}

export interface ValidatedGuestOrderFields {
  customerName: string | null;
  /** E.164, or null when none was given. */
  customerPhone: string | null;
  customerNotes: string | null;
  deliveryAddress: string | null;
  deliveryBuilding: string | null;
  deliveryFloor: string | null;
  deliveryApartment: string | null;
  deliveryLandmark: string | null;
}

/**
 * Checks the fields that were PROVIDED (blank = not provided: requiredness is the service's
 * existing PICKUP_CUSTOMER_DETAILS_REQUIRED / DELIVERY_DETAILS_REQUIRED rule). Returns every
 * problem at once so the Guest can fix them in one go, or the clean values to store.
 */
export function validateGuestOrderFields(
  values: GuestOrderFieldValues,
  options: { defaultCountry: string; delivery: boolean },
):
  | { ok: true; fields: ValidatedGuestOrderFields }
  | { ok: false; errors: GuestFieldError[] } {
  const errors: GuestFieldError[] = [];
  const clean = (v: string | undefined): string | null =>
    v && v.trim() !== '' ? v.trim() : null;

  const text = (
    field: GuestOrderFieldName,
    value: string | undefined,
    needsLetter: boolean,
  ): string | null => {
    const v = clean(value);
    if (v === null) return null;
    const limits: { min?: number; max: number } = GUEST_FIELD_LIMITS[field];
    if (limits.min !== undefined && v.length < limits.min) {
      errors.push({ field, code: 'TOO_SHORT' });
    } else if (v.length > limits.max) {
      errors.push({ field, code: 'TOO_LONG' });
    } else if (needsLetter && !LETTER.test(v)) {
      errors.push({ field, code: 'MUST_CONTAIN_LETTER' });
    }
    return v;
  };

  const customerName = text('customerName', values.customerName, true);
  const customerNotes = text('customerNotes', values.customerNotes, false);

  let customerPhone: string | null = null;
  const rawPhone = clean(values.customerPhone);
  if (rawPhone !== null) {
    const phone = normalizeGuestPhone(rawPhone, options.defaultCountry);
    if (phone.valid) customerPhone = phone.value;
    else errors.push({ field: 'customerPhone', code: 'INVALID_PHONE' });
  }

  // Delivery text only exists for a Delivery order; the service ignores it otherwise.
  let deliveryAddress: string | null = null;
  let deliveryBuilding: string | null = null;
  let deliveryFloor: string | null = null;
  let deliveryApartment: string | null = null;
  let deliveryLandmark: string | null = null;
  if (options.delivery) {
    deliveryAddress = text('deliveryAddress', values.deliveryAddress, true);
    deliveryBuilding = text('deliveryBuilding', values.deliveryBuilding, false);
    deliveryFloor = text('deliveryFloor', values.deliveryFloor, false);
    deliveryApartment = text(
      'deliveryApartment',
      values.deliveryApartment,
      false,
    );
    deliveryLandmark = text('deliveryLandmark', values.deliveryLandmark, false);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      customerName,
      customerPhone,
      customerNotes,
      deliveryAddress,
      deliveryBuilding,
      deliveryFloor,
      deliveryApartment,
      deliveryLandmark,
    },
  };
}
