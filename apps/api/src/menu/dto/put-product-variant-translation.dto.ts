import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Body of `PUT .../variants/:variantId/translations/:locale`. A Variant
 * translation has the customer-facing `name` only (MENU_SPEC.md #21A).
 */
export class PutProductVariantTranslationDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  name!: string;
}
