import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { IsMoneyDecimalString } from '../money-decimal';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** FT-6A, mirrors ProductStatus's DTO convention exactly. */
export const MODIFIER_OPTION_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ModifierOptionStatusInput = (typeof MODIFIER_OPTION_STATUSES)[number];

/**
 * FT-6A: client-writable fields for Modifier Option creation. `name` is
 * written as the Restaurant's default-locale `ModifierOptionTranslation`
 * row (mirrors `CreateModifierGroupDto.name`). `priceAdjustment` reuses the
 * exact `IsMoneyDecimalString` contract Product.basePrice already uses --
 * non-negative only (Extras are positive, Ingredient Removal is zero-price;
 * no documented negative-adjustment case, MENU_SPEC.md #78-79).
 */
export class CreateModifierOptionDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @IsIn(MODIFIER_OPTION_STATUSES, {
    message: `status must be one of: ${MODIFIER_OPTION_STATUSES.join(', ')}`,
  })
  status!: ModifierOptionStatusInput;

  @IsMoneyDecimalString()
  priceAdjustment!: string;

  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder!: number;
}
