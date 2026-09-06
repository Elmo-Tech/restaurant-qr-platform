import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Day 1 Menu Vertical Slice, Batch D, settled contract: the HTTP money
 * contract for `Product.basePrice` is a decimal string, never a JavaScript
 * number (DATABASE_SPEC.md #13-14, API_CONVENTIONS.md #48 -- "Returning
 * decimal strings prevents accidental floating-point precision assumptions
 * across clients"). This pattern is the single source of truth for what a
 * "well-formed money decimal string" is, shared by Create and Update so the
 * rule is never duplicated or allowed to drift between the two DTOs.
 *
 * - No leading `+`/`-` (negative rejected outright; DATABASE_SPEC.md #141's
 *   `products_base_price_non_negative` CHECK is defense-in-depth only, not
 *   the primary defense).
 * - No scientific notation, no `NaN`/`Infinity`, no whitespace.
 * - At most 2 fractional digits.
 * - At most 12 integer digits (no leading zero unless the value is exactly
 *   `"0"`), matching `Decimal(14,2)`'s maximum representable positive value
 *   `999999999999.99` -- a 13th integer digit can never be valid here.
 */
const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;

export function isWellFormedMoneyDecimalString(
  value: unknown,
): value is string {
  return typeof value === 'string' && MONEY_DECIMAL_PATTERN.test(value);
}

/**
 * Custom class-validator decorator (no existing repository precedent for a
 * reusable numeric-format validator, mirroring `IsValidBranchScope`'s
 * `registerDecorator` pattern from Business Foundation S).
 */
export function IsMoneyDecimalString(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isMoneyDecimalString',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isWellFormedMoneyDecimalString(value);
        },
        defaultMessage(): string {
          return `${propertyName} must be a non-negative decimal string with at most 2 fractional digits (e.g. "250.00")`;
        },
      },
    });
  };
}
