import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { IsMoneyDecimalString } from '../money-decimal';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** FT-6B, mirrors ModifierOptionStatus's DTO convention exactly. */
export const MODIFIER_PRESET_OPTION_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ModifierPresetOptionStatusInput = (typeof MODIFIER_PRESET_OPTION_STATUSES)[number];

/**
 * FT-6B: client-writable fields for Modifier Preset Option creation,
 * mirroring `CreateModifierOptionDto` exactly. `priceAdjustment` here is the
 * Preset's DEFAULT price -- applying the Preset to a Product copies this
 * value into a real, independent `ModifierOption.priceAdjustment`
 * (Section 3/5); it is never read directly by Public Menu/Orders.
 */
export class CreateModifierPresetOptionDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @IsIn(MODIFIER_PRESET_OPTION_STATUSES, {
    message: `status must be one of: ${MODIFIER_PRESET_OPTION_STATUSES.join(', ')}`,
  })
  status!: ModifierPresetOptionStatusInput;

  @IsMoneyDecimalString()
  priceAdjustment!: string;

  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder!: number;
}
