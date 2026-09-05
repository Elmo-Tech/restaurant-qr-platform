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

/** Trims a string value, then normalizes an empty result to null (mirrors Business Foundation K's `trimToNull` convention for optional free text). */
function trimToNull(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Day 1 Menu Vertical Slice, Batch C, settled contract: valid `Menu.status`
 * DTO values. Mirrors `INVITABLE_ROLES`'s pattern of a single canonical
 * array driving both `@IsIn` and the exported type, rather than duplicating
 * the Prisma enum's literal values by hand.
 */
export const MENU_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type MenuStatusInput = (typeof MENU_STATUSES)[number];

/**
 * Day 1 Menu Vertical Slice, Batch C: client-writable fields for Menu
 * creation are exactly `nameInternal`, `name`, `description`, `status`,
 * `displayOrder`. Unknown fields (including `restaurantId`, `locale`,
 * `isPrimary`, `createdAt`, `updatedAt`) are silently stripped by the
 * existing global `ValidationPipe({ whitelist: true })` (main.ts) -- this
 * DTO does not change that app-wide policy.
 *
 * No `@MaxLength` is applied to `nameInternal`/`name`/`description`: no
 * authoritative length limit exists in MENU_SPEC.md/DATABASE_SPEC.md, and
 * this repository's established convention (e.g. `CreateBranchDto.name`) is
 * to not invent one.
 */
export class CreateMenuDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'nameInternal should not be empty' })
  nameInternal!: string;

  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  @IsIn(MENU_STATUSES, {
    message: `status must be one of: ${MENU_STATUSES.join(', ')}`,
  })
  status!: MenuStatusInput;

  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder!: number;
}
