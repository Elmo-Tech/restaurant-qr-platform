import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { IsMoneyDecimalString } from '../money-decimal';
import { isValidCalendarDate } from '../product-discount';

export const PRODUCT_DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'] as const;
export type ProductDiscountTypeInput = (typeof PRODUCT_DISCOUNT_TYPES)[number];

/** `YYYY-MM-DD` that is a real calendar date (a null / omitted value is valid -- the date is optional). */
function IsCalendarDateString(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCalendarDateString',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidCalendarDate(value);
        },
        defaultMessage: () =>
          `${propertyName} must be a calendar date in the form YYYY-MM-DD`,
      },
    });
  };
}

/**
 * Product Discounts V1: the discount configuration a Staff member writes with a
 * Product. `value` is a decimal string (never a JSON number); its meaning
 * (0 < value <= 100 for PERCENTAGE, 0 < value <= base price for FIXED_AMOUNT)
 * and the date order are validated by `ProductsService` against the resulting
 * product, because they depend on the price. Dates are optional calendar dates
 * in the Branch timezone, inclusive on both ends.
 */
export class ProductDiscountDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(PRODUCT_DISCOUNT_TYPES, {
    message: `type must be one of: ${PRODUCT_DISCOUNT_TYPES.join(', ')}`,
  })
  type!: ProductDiscountTypeInput;

  @IsMoneyDecimalString()
  value!: string;

  @IsOptional()
  @IsCalendarDateString()
  startsOn?: string | null;

  @IsOptional()
  @IsCalendarDateString()
  endsOn?: string | null;
}

/** Decorator bundle for a DTO's optional `discount` property: undefined = unchanged, null = remove. */
export function ProductDiscountProperty() {
  return function (target: object, propertyKey: string): void {
    IsOptional()(target, propertyKey);
    ValidateNested()(target, propertyKey);
    Type(() => ProductDiscountDto)(target, propertyKey);
  };
}
