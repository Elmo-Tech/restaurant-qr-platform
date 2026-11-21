import { IsOptional, IsUUID } from 'class-validator';

/**
 * FT-6B: body DTO for `POST .../products/:productId/modifier-groups/
 * apply-preset`. The Product-local Group/Options this creates are copies
 * (Section 3); nothing about the Preset's own row is ever mutated by this
 * call.
 */
export class ApplyModifierPresetDto {
  @IsUUID('all', { message: 'presetId must be a well-formed UUID' })
  presetId!: string;

  /**
   * DEC-074: the size a SIZE Preset is attached to. Must be omitted for a
   * PRODUCT Preset and given for a SIZE Preset (MODIFIER_PRESET_SCOPE_MISMATCH
   * otherwise); the size must belong to this Product.
   */
  @IsOptional()
  @IsUUID('all', { message: 'variantId must be a well-formed UUID' })
  variantId?: string;
}
