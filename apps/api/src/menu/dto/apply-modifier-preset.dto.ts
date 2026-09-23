import { IsUUID } from 'class-validator';

/**
 * FT-6B: body DTO for `POST .../products/:productId/modifier-groups/
 * apply-preset` -- the ONE field a Staff "Use Preset" action submits. The
 * Product-local Group/Options this creates are copies (Section 3); nothing
 * about the Preset's own row is ever mutated by this call.
 */
export class ApplyModifierPresetDto {
  @IsUUID('all', { message: 'presetId must be a well-formed UUID' })
  presetId!: string;
}
