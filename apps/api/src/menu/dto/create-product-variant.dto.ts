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
 * `priceAdjustment` is the NON-NEGATIVE amount added to the Product base price
 * (the smallest size normally has `"0.00"`).
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
  priceAdjustment!: string;

  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder!: number;

  /** Make this the preselected size. Only an ACTIVE Variant can be the default. */
  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;
}
