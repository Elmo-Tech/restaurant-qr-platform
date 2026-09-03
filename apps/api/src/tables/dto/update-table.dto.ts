import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateIf } from 'class-validator';

/** Trims a string value; leaves non-string values (including undefined/null) untouched. */
function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Business Foundation Q: the only client-writable field for Table basic-info
 * update is `tableNumber`, and it is optional -- this is a partial update.
 * Unknown fields (including `id`, `restaurantId`, `branchId`, `status`,
 * `publicCode`, `type`, `createdAt`, `updatedAt`) are silently stripped by
 * the existing global `ValidationPipe({ whitelist: true })` (main.ts) --
 * this DTO does not change that app-wide policy, and `status` is
 * deliberately never declared here at all (Table lifecycle mutation is not
 * part of this contract).
 *
 * Uses `@ValidateIf((o) => o.tableNumber !== undefined)` rather than
 * `@IsOptional()`, mirroring `UpdateBranchDto`'s `name`/`timezone`
 * convention: an OMITTED field must be silently accepted (meaning "leave
 * unchanged"), but an explicit `null` must still fail validation as invalid
 * -- `@IsOptional()` would incorrectly treat both `undefined` and `null` as
 * "skip validation".
 */
export class UpdateTableDto {
  @ValidateIf((o: UpdateTableDto) => o.tableNumber !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'tableNumber should not be empty' })
  tableNumber?: string;
}
