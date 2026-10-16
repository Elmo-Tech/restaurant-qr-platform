import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsMoneyDecimalString } from '../money-decimal';
import {
  PRODUCT_VARIANT_STATUSES,
  type ProductVariantStatusInput,
} from './create-product-variant.dto';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Partial Variant update: every field is genuinely optional (mirrors UpdateModifierOptionDto). */
export class UpdateProductVariantDto {
  @ValidateIf((o: UpdateProductVariantDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name?: string;

  @ValidateIf((o: UpdateProductVariantDto) => o.status !== undefined)
  @IsIn(PRODUCT_VARIANT_STATUSES, {
    message: `status must be one of: ${PRODUCT_VARIANT_STATUSES.join(', ')}`,
  })
  status?: ProductVariantStatusInput;

  @ValidateIf((o: UpdateProductVariantDto) => o.priceAdjustment !== undefined)
  @IsMoneyDecimalString()
  priceAdjustment?: string;

  @ValidateIf((o: UpdateProductVariantDto) => o.displayOrder !== undefined)
  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder?: number;

  @ValidateIf((o: UpdateProductVariantDto) => o.isDefault !== undefined)
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;
}
