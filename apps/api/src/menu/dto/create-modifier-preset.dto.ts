import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/** Trims a string value; leaves non-string values untouched for @IsString() to reject. */
function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Trims a string value, then normalizes an empty result to null. */
function trimToNull(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** FT-6B, mirrors ModifierGroupStatus's DTO convention exactly. */
export const MODIFIER_PRESET_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ModifierPresetStatusInput = (typeof MODIFIER_PRESET_STATUSES)[number];

export const MODIFIER_PRESET_SCOPES = ['PRODUCT', 'SIZE'] as const;
export type ModifierPresetScopeInput = (typeof MODIFIER_PRESET_SCOPES)[number];

/**
 * FT-6B: client-writable fields for Modifier Preset creation -- a
 * Restaurant-scoped reusable Group TEMPLATE, mirroring
 * `CreateModifierGroupDto` exactly (same field shape, since a Preset IS a
 * Group template). `name`/`helperText` write the Restaurant's default-locale
 * `ModifierPresetTranslation` row; secondary locales use the dedicated
 * translation endpoints, same convention as Modifier Group/Option.
 */
export class CreateModifierPresetDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  helperText?: string | null;

  @IsIn(MODIFIER_PRESET_STATUSES, {
    message: `status must be one of: ${MODIFIER_PRESET_STATUSES.join(', ')}`,
  })
  status!: ModifierPresetStatusInput;

  /**
   * DEC-074: PRODUCT = attached to a whole Product (every size); SIZE =
   * attached to one size of a Product. Fixed at creation (not in the update
   * DTO). Optional for older clients: omitted means PRODUCT, the only
   * behavior that existed before.
   */
  @IsOptional()
  @IsIn(MODIFIER_PRESET_SCOPES, {
    message: `scope must be one of: ${MODIFIER_PRESET_SCOPES.join(', ')}`,
  })
  scope?: ModifierPresetScopeInput;

  @IsInt({ message: 'minimumSelections must be an integer' })
  @Min(0, { message: 'minimumSelections must not be negative' })
  minimumSelections!: number;

  @IsInt({ message: 'maximumSelections must be an integer' })
  @Min(1, { message: 'maximumSelections must be at least 1' })
  maximumSelections!: number;

  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder!: number;
}
