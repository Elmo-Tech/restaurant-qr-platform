import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

/** Trims a string value; leaves non-string values untouched for @IsString() to reject. */
function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Business Foundation L3: the only client-writable field for Table creation
 * is `tableNumber`. Unknown fields (including `id`, `restaurantId`,
 * `branchId`, `status`, `publicCode`, `type`, `createdAt`, `updatedAt`) are
 * silently stripped by the existing global `ValidationPipe({ whitelist:
 * true })` (main.ts) -- this DTO does not change that app-wide policy.
 *
 * `tableNumber` is a free-form Staff-chosen label ("12", "A1", "VIP-2") --
 * no maximum length, numeric-only restriction, or case folding is invented
 * beyond the settled contract of trim + non-empty.
 */
export class CreateTableDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'tableNumber should not be empty' })
  tableNumber!: string;
}
