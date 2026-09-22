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
  MODIFIER_GROUP_STATUSES,
  type ModifierGroupStatusInput,
} from './create-modifier-group.dto';

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
 * FT-6A: partial Modifier Group update, mirroring `UpdateProductDto`'s
 * settled convention exactly -- every field is genuinely optional
 * (`undefined` means "omitted, leave unchanged"); `helperText: null`
 * explicitly clears it, so it alone uses `@IsOptional()` while every other
 * field uses `@ValidateIf` (an explicit `null` on those must still fail
 * validation, since none of them has a "clear" concept).
 */
export class UpdateModifierGroupDto {
  @ValidateIf((o: UpdateModifierGroupDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name?: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  helperText?: string | null;

  @ValidateIf((o: UpdateModifierGroupDto) => o.status !== undefined)
  @IsIn(MODIFIER_GROUP_STATUSES, {
    message: `status must be one of: ${MODIFIER_GROUP_STATUSES.join(', ')}`,
  })
  status?: ModifierGroupStatusInput;

  @ValidateIf((o: UpdateModifierGroupDto) => o.minimumSelections !== undefined)
  @IsInt({ message: 'minimumSelections must be an integer' })
  @Min(0, { message: 'minimumSelections must not be negative' })
  minimumSelections?: number;

  @ValidateIf((o: UpdateModifierGroupDto) => o.maximumSelections !== undefined)
  @IsInt({ message: 'maximumSelections must be an integer' })
  @Min(1, { message: 'maximumSelections must be at least 1' })
  maximumSelections?: number;

  @ValidateIf((o: UpdateModifierGroupDto) => o.displayOrder !== undefined)
  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder?: number;
}
