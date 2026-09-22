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

/** FT-6A, mirrors ProductStatus's DTO convention exactly. */
export const MODIFIER_GROUP_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ModifierGroupStatusInput = (typeof MODIFIER_GROUP_STATUSES)[number];

/**
 * FT-6A: client-writable fields for Modifier Group creation. `name`/
 * `helperText` are written as the Restaurant's default-locale
 * `ModifierGroupTranslation` row (mirrors `CreateProductDto.name` -- the
 * client never selects a locale here; secondary-locale translation is out
 * of scope for this batch). `minimumSelections`/`maximumSelections` alone
 * express required/optional/single/multi-select (DATABASE_SPEC.md #74) --
 * no separate `required` boolean or `selectionType` enum.
 */
export class CreateModifierGroupDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  helperText?: string | null;

  @IsIn(MODIFIER_GROUP_STATUSES, {
    message: `status must be one of: ${MODIFIER_GROUP_STATUSES.join(', ')}`,
  })
  status!: ModifierGroupStatusInput;

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
