import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Min, ValidateIf } from 'class-validator';
import { IsMoneyDecimalString } from '../money-decimal';
import {
  MODIFIER_PRESET_OPTION_STATUSES,
  type ModifierPresetOptionStatusInput,
} from './create-modifier-preset-option.dto';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * FT-6B: partial Modifier Preset Option update, mirroring
 * `UpdateModifierOptionDto` exactly. A `priceAdjustment` change here
 * triggers a price sync (Section 7) to every linked Product-local
 * ModifierOption that has NOT been price-overridden for its own Product.
 */
export class UpdateModifierPresetOptionDto {
  @ValidateIf((o: UpdateModifierPresetOptionDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name?: string;

  @ValidateIf((o: UpdateModifierPresetOptionDto) => o.status !== undefined)
  @IsIn(MODIFIER_PRESET_OPTION_STATUSES, {
    message: `status must be one of: ${MODIFIER_PRESET_OPTION_STATUSES.join(', ')}`,
  })
  status?: ModifierPresetOptionStatusInput;

  @ValidateIf((o: UpdateModifierPresetOptionDto) => o.priceAdjustment !== undefined)
  @IsMoneyDecimalString()
  priceAdjustment?: string;

  @ValidateIf((o: UpdateModifierPresetOptionDto) => o.displayOrder !== undefined)
  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder?: number;
}
