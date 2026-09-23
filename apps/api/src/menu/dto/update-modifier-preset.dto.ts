import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  MODIFIER_PRESET_STATUSES,
  type ModifierPresetStatusInput,
} from './create-modifier-preset.dto';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimToNull(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * FT-6B: partial Modifier Preset update, mirroring `UpdateModifierGroupDto`'s
 * exact convention. Updating `minimumSelections`/`maximumSelections`
 * triggers a sync of every linked Product-local ModifierGroup (Section 7) --
 * see `ModifierPresetsService.updatePreset`.
 */
export class UpdateModifierPresetDto {
  @ValidateIf((o: UpdateModifierPresetDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name?: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  helperText?: string | null;

  @ValidateIf((o: UpdateModifierPresetDto) => o.status !== undefined)
  @IsIn(MODIFIER_PRESET_STATUSES, {
    message: `status must be one of: ${MODIFIER_PRESET_STATUSES.join(', ')}`,
  })
  status?: ModifierPresetStatusInput;

  @ValidateIf((o: UpdateModifierPresetDto) => o.minimumSelections !== undefined)
  @IsInt({ message: 'minimumSelections must be an integer' })
  @Min(0, { message: 'minimumSelections must not be negative' })
  minimumSelections?: number;

  @ValidateIf((o: UpdateModifierPresetDto) => o.maximumSelections !== undefined)
  @IsInt({ message: 'maximumSelections must be an integer' })
  @Min(1, { message: 'maximumSelections must be at least 1' })
  maximumSelections?: number;

  @ValidateIf((o: UpdateModifierPresetDto) => o.displayOrder !== undefined)
  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder?: number;
}
