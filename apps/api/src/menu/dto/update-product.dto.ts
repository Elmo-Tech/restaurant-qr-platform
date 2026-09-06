import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsMoneyDecimalString } from '../money-decimal';
import {
  PRODUCT_STATUSES,
  type ProductStatusInput,
} from './create-product.dto';

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
 * Day 1 Menu Vertical Slice, Batch D (corrected): partial Product
 * configuration update. Every field is genuinely optional -- `undefined`
 * means "field was omitted, leave unchanged". `availability` is
 * deliberately NOT part of this DTO -- it has its own dedicated endpoint
 * (`UpdateProductAvailabilityDto`). `publicId`/`restaurantId`/
 * `primaryImageAssetPath`/`locale`/`createdAt`/`updatedAt` are never
 * accepted, even if present (stripped by the global whitelist
 * `ValidationPipe`, but never trusted regardless).
 *
 * `categoryId`/`name`/`status`/`basePrice`/`displayOrder`/
 * `allowCustomerNotes`/`featured` use `@ValidateIf((o) => o.<field> !==
 * undefined)` rather than `@IsOptional()`, mirroring `UpdateBranchDto`'s
 * `name`/`timezone` and `UpdateTableDto`'s `tableNumber` convention: an
 * OMITTED field must be silently accepted (leave unchanged), but an
 * explicit `null` must still fail validation as invalid (`400
 * VALIDATION_ERROR`) -- `@IsOptional()` would incorrectly treat both
 * `undefined` and `null` as "skip validation", which is exactly the
 * `description` behavior (explicit `null` legitimately clears the field)
 * but is the wrong behavior for every other field here, none of which has
 * a "clear" concept.
 *
 * `categoryId`, when supplied, is client-selected resource identity, NOT
 * tenant authority -- the service resolves it with both `id = categoryId`
 * AND `restaurantId = authorizedRestaurantId`.
 */
export class UpdateProductDto {
  @ValidateIf((o: UpdateProductDto) => o.categoryId !== undefined)
  @IsUUID('all', { message: 'categoryId must be a well-formed UUID' })
  categoryId?: string;

  @ValidateIf((o: UpdateProductDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name?: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  @ValidateIf((o: UpdateProductDto) => o.status !== undefined)
  @IsIn(PRODUCT_STATUSES, {
    message: `status must be one of: ${PRODUCT_STATUSES.join(', ')}`,
  })
  status?: ProductStatusInput;

  @ValidateIf((o: UpdateProductDto) => o.basePrice !== undefined)
  @IsMoneyDecimalString()
  basePrice?: string;

  @ValidateIf((o: UpdateProductDto) => o.displayOrder !== undefined)
  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder?: number;

  @ValidateIf((o: UpdateProductDto) => o.allowCustomerNotes !== undefined)
  @IsBoolean()
  allowCustomerNotes?: boolean;

  @ValidateIf((o: UpdateProductDto) => o.featured !== undefined)
  @IsBoolean()
  featured?: boolean;
}
