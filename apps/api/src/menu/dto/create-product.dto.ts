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
} from 'class-validator';
import { IsMoneyDecimalString } from '../money-decimal';
import { ProductDiscountDto, ProductDiscountProperty } from './product-discount.dto';

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

/** Day 1 Menu Vertical Slice, Batch D, settled contract: valid `Product.status` DTO values. */
export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ProductStatusInput = (typeof PRODUCT_STATUSES)[number];

/** Day 1 Menu Vertical Slice, Batch D, settled contract: valid `Product.availability` DTO values. Independent from `status` -- never derived from it. */
export const PRODUCT_AVAILABILITIES = ['AVAILABLE', 'SOLD_OUT'] as const;
export type ProductAvailabilityInput = (typeof PRODUCT_AVAILABILITIES)[number];

/**
 * Day 1 Menu Vertical Slice, Batch D: client-writable fields for Product
 * creation are exactly `categoryId`, `name`, `description`, `status`,
 * `availability`, `basePrice`, `displayOrder`, `allowCustomerNotes`,
 * `featured`. Unknown fields (including `id`, `publicId`, `restaurantId`,
 * `locale`, `primaryImageAssetPath`, `createdAt`, `updatedAt`) are silently
 * stripped by the existing global `ValidationPipe({ whitelist: true })`
 * (main.ts) -- this DTO does not change that app-wide policy.
 *
 * `categoryId` is client-selected resource identity, NOT tenant authority
 * (mirrors `CreateCategoryDto.menuId`) -- the service resolves it with both
 * `id = categoryId` AND `restaurantId = authorizedRestaurantId`.
 *
 * No `@MaxLength` is applied to `name`/`description`: no authoritative
 * length limit exists in MENU_SPEC.md/DATABASE_SPEC.md (mirrors
 * `CreateMenuDto`/`CreateCategoryDto`).
 */
export class CreateProductDto {
  @IsUUID('all', { message: 'categoryId must be a well-formed UUID' })
  categoryId!: string;

  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  @IsIn(PRODUCT_STATUSES, {
    message: `status must be one of: ${PRODUCT_STATUSES.join(', ')}`,
  })
  status!: ProductStatusInput;

  @IsIn(PRODUCT_AVAILABILITIES, {
    message: `availability must be one of: ${PRODUCT_AVAILABILITIES.join(', ')}`,
  })
  availability!: ProductAvailabilityInput;

  @IsMoneyDecimalString()
  basePrice!: string;

  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder!: number;

  @IsBoolean()
  allowCustomerNotes!: boolean;

  @IsBoolean()
  featured!: boolean;

  /** Product Discounts V1: optional product-level discount (omitted or null = none). */
  @ProductDiscountProperty()
  discount?: ProductDiscountDto | null;
}
