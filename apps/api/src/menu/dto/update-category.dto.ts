import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  CATEGORY_STATUSES,
  type CategoryStatusInput,
} from './create-category.dto';

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
 * Day 1 Menu Vertical Slice, Batch F: partial Category configuration update.
 * Every field is genuinely optional -- `undefined` means "field was
 * omitted, leave unchanged". `restaurantId`/`imageAssetPath`/`locale`/
 * `createdAt`/`updatedAt` are never accepted, even if present (stripped by
 * the global whitelist `ValidationPipe`, but never trusted regardless) --
 * image upload/storage infrastructure remains deferred.
 *
 * `menuId`/`name`/`status`/`displayOrder` use
 * `@ValidateIf((o) => o.<field> !== undefined)` rather than `@IsOptional()`,
 * exactly mirroring `UpdateProductDto`'s settled convention: an OMITTED
 * field must be silently accepted (leave unchanged), but an explicit `null`
 * must still fail validation as invalid (`400 VALIDATION_ERROR`).
 *
 * `menuId`, when supplied, moves the Category to another Menu in the same
 * Restaurant -- client-selected resource identity, NOT tenant authority --
 * the service resolves it with both `id = menuId` AND
 * `restaurantId = authorizedRestaurantId`.
 */
export class UpdateCategoryDto {
  @ValidateIf((o: UpdateCategoryDto) => o.menuId !== undefined)
  @IsUUID('all', { message: 'menuId must be a well-formed UUID' })
  menuId?: string;

  @ValidateIf((o: UpdateCategoryDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name?: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  @ValidateIf((o: UpdateCategoryDto) => o.status !== undefined)
  @IsIn(CATEGORY_STATUSES, {
    message: `status must be one of: ${CATEGORY_STATUSES.join(', ')}`,
  })
  status?: CategoryStatusInput;

  @ValidateIf((o: UpdateCategoryDto) => o.displayOrder !== undefined)
  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder?: number;
}
