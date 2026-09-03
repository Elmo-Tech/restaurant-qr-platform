import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  ValidateIf,
} from 'class-validator';

/** Trims a string value; leaves non-string values (including undefined/null) untouched. */
function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Trims a string value, then normalizes an empty result to null (mirrors Business Foundation K's convention). */
function trimToNull(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Business Foundation N: client-writable fields for Branch basic-info
 * update are exactly `name`, `timezone`, `phone`, `address` -- all four
 * optional, since this is a partial update. Unknown fields (including `id`,
 * `publicId`, `restaurantId`, `branchId`, `status`, `createdAt`,
 * `updatedAt`) are silently stripped by the existing global
 * `ValidationPipe({ whitelist: true })` (main.ts) -- this DTO does not
 * change that app-wide policy, and `status` is deliberately never declared
 * here at all (Branch lifecycle remains Foundation M's dedicated
 * `/activate` action).
 *
 * `name`/`timezone` use `@ValidateIf((o) => o.<field> !== undefined)`
 * rather than `@IsOptional()`: an OMITTED field must be silently accepted
 * (meaning "leave unchanged"), but an explicit `null` must still fail
 * validation as invalid -- `@IsOptional()` would incorrectly treat both
 * `undefined` and `null` as "skip validation", which is exactly the
 * `phone`/`address` behavior (explicit `null` legitimately clears the
 * field) but is the wrong behavior for `name`/`timezone`.
 *
 * `phone`/`address` reuse Create Branch's exact `@IsOptional()` +
 * `trimToNull` convention: omitted stays omitted (unchanged), an empty or
 * whitespace-only string normalizes to `null` (clears), and an explicit
 * `null` is accepted as-is (also clears).
 */
export class UpdateBranchDto {
  @ValidateIf((o: UpdateBranchDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name?: string;

  @ValidateIf((o: UpdateBranchDto) => o.timezone !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'timezone should not be empty' })
  @IsTimeZone({ message: 'timezone must be a valid IANA timezone' })
  timezone?: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  phone?: string | null;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  address?: string | null;
}
