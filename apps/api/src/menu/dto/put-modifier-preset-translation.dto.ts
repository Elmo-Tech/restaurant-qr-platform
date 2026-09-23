import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
 * FT-6B: the body DTO for `PUT .../modifier-presets/:presetId/
 * translations/:locale`, mirroring `PutModifierGroupTranslationDto`
 * exactly. A change here syncs every linked Product-local
 * `ModifierGroupTranslation` for the SAME locale (Section 7).
 */
export class PutModifierPresetTranslationDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  helperText?: string | null;
}
