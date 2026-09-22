import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * FT-6A closeout: the body DTO for `PUT .../modifier-groups/:groupId/
 * options/:optionId/translations/:locale`. `ModifierOptionTranslation` has
 * no second content field at all (DATABASE_SPEC.md #77) -- `name` only,
 * unlike `PutTranslationDto`/`PutModifierGroupTranslationDto`.
 */
export class PutModifierOptionTranslationDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;
}
