import { fromMinorUnits, toMinorUnits } from '../public-menu/money';
import type { ProductDiscountType } from './types';

/**
 * Staff-side PREVIEW and pre-validation for a product discount. Display only:
 * the Backend (`apps/api/src/menu/product-discount.ts`) is the one authority
 * and re-validates every write. Exact BigInt minor units -- never `Number` /
 * `parseFloat` on money. A percentage is rounded HALF-UP to 2 decimals per
 * unit, exactly like the Backend, so the preview matches what Guests pay.
 */
const DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type DiscountFormError =
  | 'valueRequired'
  | 'valueInvalid'
  | 'percentageRange'
  | 'exceedsPrice'
  | 'datesOrder'
  | 'dateInvalid';

export interface DiscountPreview {
  /** Amount taken off one unit. */
  unitDiscount: string;
  /** Unit price after the discount. */
  discountedPrice: string;
  /** The whole-number-ish percentage saved, for display (e.g. "20%"), or null for a fixed amount. */
  percentLabel: string | null;
}

export function validateDiscountForm(input: {
  type: ProductDiscountType;
  value: string;
  basePrice: string;
  startsOn: string;
  endsOn: string;
}): DiscountFormError | null {
  const value = input.value.trim();
  if (value === '') return 'valueRequired';
  if (!DECIMAL_PATTERN.test(value)) return 'valueInvalid';
  const valueMinor = toMinorUnits(value);
  if (valueMinor <= BigInt(0)) return 'valueInvalid';
  if (input.type === 'PERCENTAGE' && valueMinor > BigInt(10000)) return 'percentageRange';
  if (
    input.type === 'FIXED_AMOUNT' &&
    DECIMAL_PATTERN.test(input.basePrice) &&
    valueMinor > toMinorUnits(input.basePrice)
  ) {
    return 'exceedsPrice';
  }
  for (const date of [input.startsOn, input.endsOn]) {
    if (date !== '' && !DATE_PATTERN.test(date)) return 'dateInvalid';
  }
  if (input.startsOn !== '' && input.endsOn !== '' && input.endsOn < input.startsOn) {
    return 'datesOrder';
  }
  return null;
}

/** The preview, or `null` while the inputs are not a valid discount. */
export function previewDiscount(
  basePrice: string,
  type: ProductDiscountType,
  value: string,
): DiscountPreview | null {
  if (!DECIMAL_PATTERN.test(basePrice) || !DECIMAL_PATTERN.test(value.trim())) return null;
  const baseMinor = toMinorUnits(basePrice);
  const valueMinor = toMinorUnits(value.trim());
  if (valueMinor <= BigInt(0)) return null;
  if (type === 'PERCENTAGE' && valueMinor > BigInt(10000)) return null;

  let discountMinor =
    type === 'PERCENTAGE'
      ? (baseMinor * valueMinor + BigInt(5000)) / BigInt(10000)
      : valueMinor;
  if (discountMinor > baseMinor) discountMinor = baseMinor;
  if (discountMinor <= BigInt(0)) return null;

  const percent = type === 'PERCENTAGE' ? value.trim().replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1') : null;
  return {
    unitDiscount: fromMinorUnits(discountMinor),
    discountedPrice: fromMinorUnits(baseMinor - discountMinor),
    percentLabel: percent === null ? null : `${percent}%`,
  };
}
