import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * FT-12: the Restaurant Profile's only client-writable field for V1 --
 * `name`. `currencyCode`/`defaultLocale` stay read-only in V1 (CLAUDE.md #7
 * of this batch: "If existing fields such as currency are intentionally
 * immutable in V1, show them read-only rather than changing domain rules") --
 * no route accepts them. `logoAssetPath` is never accepted here; it is set
 * only via the dedicated multipart logo upload/remove routes, mirroring
 * Product's own image-vs-fields separation.
 */
export class UpdateRestaurantProfileDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  @MaxLength(200)
  name!: string;
}
