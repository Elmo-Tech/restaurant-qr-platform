import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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

/** Day 1 Menu Vertical Slice, Batch C, settled contract: valid `Category.status` DTO values. */
export const CATEGORY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CategoryStatusInput = (typeof CATEGORY_STATUSES)[number];

/**
 * Day 1 Menu Vertical Slice, Batch C: client-writable fields for Category
 * creation are exactly `menuId`, `name`, `description`, `status`,
 * `displayOrder`. Unknown fields (including `restaurantId`, `locale`,
 * `imageAssetPath`, `createdAt`, `updatedAt`) are silently stripped by the
 * existing global `ValidationPipe({ whitelist: true })` -- `imageAssetPath`
 * is deliberately never client-writable in Batch C (image upload/storage
 * infrastructure is intentionally deferred, DATABASE_SPEC.md #62A); every
 * Category is created with `imageAssetPath = null`.
 *
 * `menuId` here is client-selected resource identity, NOT tenant authority
 * (settled contract #4) -- the service resolves it with both `id = menuId`
 * AND `restaurantId = authorizedRestaurantId`, never trusting it alone.
 */
export class CreateCategoryDto {
  @IsUUID('all', { message: 'menuId must be a well-formed UUID' })
  menuId!: string;

  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  @IsIn(CATEGORY_STATUSES, {
    message: `status must be one of: ${CATEGORY_STATUSES.join(', ')}`,
  })
  status!: CategoryStatusInput;

  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder!: number;
}
