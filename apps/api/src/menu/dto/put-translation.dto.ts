import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Trims a string value; leaves non-string values untouched for @IsString() to reject. */
function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Trims a string value, then normalizes an empty result to null (mirrors every other Menu/Category/Product DTO's `trimToNull` convention). */
function trimToNull(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * LOC-2B: the ONE shared body DTO for `PUT .../translations/:locale` across
 * Menu, Category, and Product -- each entity's Translation row has the
 * identical `{ locale, name, description }` shape (`locale` itself is a
 * route param, validated separately by `LocaleParamPipe`, never a body
 * field), so one reusable DTO avoids three copy-pasted, drift-prone
 * duplicates. PUT is a full replacement of the Translation resource: `name`
 * is required (mirrors every existing Create DTO's `name` field exactly --
 * trimmed, must not become empty); `description` is optional/nullable
 * (mirrors every existing Create/Update DTO's `description` field exactly --
 * trimmed, blank normalizes to `null`). No `@MaxLength` is applied, matching
 * the existing Create/Update DTOs' own convention of not inventing a limit
 * that MENU_SPEC.md/DATABASE_SPEC.md does not already define.
 */
export class PutTranslationDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  description?: string | null;
}
