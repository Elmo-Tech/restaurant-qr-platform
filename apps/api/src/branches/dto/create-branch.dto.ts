import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsTimeZone } from 'class-validator';
import { NameTranslationDto, NameTranslationsProperty } from '../../common/name-translations';

/** Trims a string value; leaves non-string values untouched for @IsString() to reject. */
function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Trims a string value, then normalizes an empty result to null (Business Foundation K, approved contract). */
function trimToNull(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Business Foundation K: client-writable fields for Branch creation are
 * exactly `name`, `timezone`, `phone`, `address`. Unknown fields (including
 * `id`, `publicId`, `restaurantId`, `status`, `createdAt`, `updatedAt`,
 * `membershipId`, `allBranches`, `role`, `permission`) are silently
 * stripped by the existing global `ValidationPipe({ whitelist: true })`
 * (main.ts) -- this DTO does not change that app-wide policy.
 *
 * `timezone` uses class-validator's built-in `@IsTimeZone()` (backed by the
 * JS runtime's own `Intl` timezone database) -- no new dependency.
 */
export class CreateBranchDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  /** Optional per-locale names (Bilingual Branch names). `name` stays the default-locale name. */
  @NameTranslationsProperty()
  translations?: NameTranslationDto[];

  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'timezone should not be empty' })
  @IsTimeZone({ message: 'timezone must be a valid IANA timezone' })
  timezone!: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  phone?: string | null;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  address?: string | null;
}
