import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * FT-6B: the body DTO for `PUT .../modifier-presets/:presetId/options/
 * :optionId/translations/:locale`, mirroring `PutModifierOptionTranslationDto`
 * exactly (`name` only). A change here syncs every linked Product-local
 * `ModifierOptionTranslation` for the SAME locale (Section 7).
 */
export class PutModifierPresetOptionTranslationDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;
}
