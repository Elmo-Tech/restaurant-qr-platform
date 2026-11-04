import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  SHERBINY_COPY_LIMITS,
  SHERBINY_MOTIONS,
  SHERBINY_THEMES,
  type SherbinyCopyField,
  type SherbinyMotion,
  type SherbinyTheme,
} from '../sherbiny-menu-config';

type SherbinyCopyDtoFields = { [K in SherbinyCopyField]?: string };

/**
 * Restricted appearance payload for the exclusive El Sherbiny renderer. Image paths are never accepted:
 * uploads go through the dedicated routes and the Backend keeps the stored paths.
 */
export class SherbinyMenuSettingsDto {
  @IsIn(SHERBINY_THEMES) theme!: SherbinyTheme;
  @IsIn(SHERBINY_MOTIONS) motion!: SherbinyMotion;
  @IsBoolean() allowThemeSwitch!: boolean;
  @IsBoolean() showMarquee!: boolean;
  @IsBoolean() showHeroStats!: boolean;
  @IsBoolean() showFavorites!: boolean;
  @IsBoolean() showStory!: boolean;
  @IsBoolean() showSpotlight!: boolean;
  /** Category UUID -> { tag, title, desc } in both languages; the service normalizes and tenant-filters it. */
  @IsOptional() @IsObject() categoryExtras?: Record<string, unknown>;
}
/** The validated payload: the class fields plus every generated localized copy field. */
export type SherbinyMenuSettingsInput = SherbinyMenuSettingsDto & SherbinyCopyDtoFields;

// One decorated property per localized copy field, generated from the shared limits table.
for (const [field, max] of Object.entries(SHERBINY_COPY_LIMITS)) {
  IsOptional()(SherbinyMenuSettingsDto.prototype, field);
  IsString()(SherbinyMenuSettingsDto.prototype, field);
  MaxLength(max)(SherbinyMenuSettingsDto.prototype, field);
}
