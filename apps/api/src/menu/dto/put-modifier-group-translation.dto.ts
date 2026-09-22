import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Trims a string value; leaves non-string values untouched for @IsString() to reject. */
function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Trims a string value, then normalizes an empty result to null (mirrors `PutTranslationDto`'s `trimToNull` convention). */
function trimToNull(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * FT-6A closeout: the body DTO for `PUT .../modifier-groups/:groupId/
 * translations/:locale` -- mirrors `PutTranslationDto` exactly, except the
 * second field is `helperText` (ModifierGroupTranslation's own schema field
 * name, DATABASE_SPEC.md #75), not `description`. `locale` itself is a
 * route param, validated separately by `LocaleParamPipe`, never a body
 * field.
 */
export class PutModifierGroupTranslationDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  helperText?: string | null;
}
