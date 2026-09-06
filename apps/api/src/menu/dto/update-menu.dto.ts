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
import { MENU_STATUSES, type MenuStatusInput } from './create-menu.dto';

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

/**
 * Day 1 Menu Vertical Slice, Batch F: partial Menu configuration update.
 * Every field is genuinely optional -- `undefined` means "field was omitted,
 * leave unchanged". `restaurantId`/`isPrimary`/`locale`/`createdAt`/
 * `updatedAt` are never accepted, even if present (stripped by the global
 * whitelist `ValidationPipe`, but never trusted regardless) -- `isPrimary`
 * has its own dedicated Set-Primary endpoint.
 *
 * `nameInternal`/`name`/`status`/`displayOrder` use
 * `@ValidateIf((o) => o.<field> !== undefined)` rather than `@IsOptional()`,
 * exactly mirroring `UpdateProductDto`'s settled convention (itself
 * mirroring `UpdateBranchDto`/`UpdateTableDto`): an OMITTED field must be
 * silently accepted (leave unchanged), but an explicit `null` must still
 * fail validation as invalid (`400 VALIDATION_ERROR`) -- `@IsOptional()`
 * would incorrectly treat both `undefined` and `null` as "skip validation",
 * which is exactly the `description` behavior (explicit `null` legitimately
 * clears the field) but is the wrong behavior for every other field here.
 */
export class UpdateMenuDto {
  @ValidateIf((o: UpdateMenuDto) => o.nameInternal !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'nameInternal should not be empty' })
  nameInternal?: string;

  @ValidateIf((o: UpdateMenuDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name?: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  @ValidateIf((o: UpdateMenuDto) => o.status !== undefined)
  @IsIn(MENU_STATUSES, {
    message: `status must be one of: ${MENU_STATUSES.join(', ')}`,
  })
  status?: MenuStatusInput;

  @ValidateIf((o: UpdateMenuDto) => o.displayOrder !== undefined)
  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder?: number;
}
