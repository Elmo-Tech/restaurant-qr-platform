import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IsMoneyDecimalString } from '../money-decimal';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Product Variants V1 (DEC-041): same two states as Product / Modifier Option. */
export const PRODUCT_VARIANT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ProductVariantStatusInput =
  (typeof PRODUCT_VARIANT_STATUSES)[number];

/**
 * Client-writable fields for Variant creation. `name` is written as the
 * Restaurant's default-locale `ProductVariantTranslation` row (the client never
 * selects a locale); other locales go through the translation resource.
 * `price` is the FULL price of this size (non-negative), written as on the menu
 * (Small 60, Medium 80, Large 100).
 */
export class CreateProductVariantDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @IsIn(PRODUCT_VARIANT_STATUSES, {
    message: `status must be one of: ${PRODUCT_VARIANT_STATUSES.join(', ')}`,
  })
  status!: ProductVariantStatusInput;

  @IsMoneyDecimalString()
  price!: string;

  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder!: number;

  /** Make this the preselected size. Only an ACTIVE Variant can be the default. */
  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;

  /** Does the Product discount apply to this size? Defaults to true (all sizes). */
  @IsOptional()
  @IsBoolean({ message: 'discountApplies must be a boolean' })
  discountApplies?: boolean;
}
