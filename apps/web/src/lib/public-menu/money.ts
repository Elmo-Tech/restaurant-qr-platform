/**
 * FT-5, Section 20: a tiny exact-decimal helper for CLIENT-SIDE Cart
 * DISPLAY totals only -- the Backend's own total on the Order confirmation
 * remains authoritative regardless (Section 22). Never `Number`/
 * `parseFloat` on a money string: every exact-decimal string the Backend
 * returns (e.g. `"185.00"`) is parsed into an integer count of minor units
 * (cents) via plain string manipulation and BigInt, so quantity
 * multiplication and cross-line summation can never accumulate a
 * floating-point rounding error. Uses `BigInt(...)` calls rather than `0n`
 * literal syntax -- this repo's `tsconfig.json` targets ES2017, which
 * supports the `BigInt` global fully but not the newer literal suffix.
 */
const HUNDRED = BigInt(100);
const ZERO = BigInt(0);

export function toMinorUnits(exactDecimalString: string): bigint {
  const isNegative = exactDecimalString.startsWith('-');
  const unsigned = isNegative ? exactDecimalString.slice(1) : exactDecimalString;
  const [wholePartRaw, fractionPartRaw = ''] = unsigned.split('.');
  const wholePart = wholePartRaw || '0';
  const fractionPart = (fractionPartRaw + '00').slice(0, 2);
  const minorUnits = BigInt(wholePart) * HUNDRED + BigInt(fractionPart || '0');
  return isNegative ? -minorUnits : minorUnits;
}

export function fromMinorUnits(minorUnits: bigint): string {
  const isNegative = minorUnits < ZERO;
  const absolute = isNegative ? -minorUnits : minorUnits;
  const whole = absolute / HUNDRED;
  const fraction = (absolute % HUNDRED).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${whole}.${fraction}`;
}

/** `unitPrice` ("185.00") * an integer `quantity`, returned as minor units -- exact, no floating point. */
export function lineTotalMinorUnits(unitPrice: string, quantity: number): bigint {
  return toMinorUnits(unitPrice) * BigInt(quantity);
}

/** The additive identity for summing `lineTotalMinorUnits` results -- exported so callers never need their own `0n`/`BigInt(0)` literal. */
export const ZERO_MINOR_UNITS: bigint = ZERO;
