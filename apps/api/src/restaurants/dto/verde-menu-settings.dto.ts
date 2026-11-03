import { IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  VERDE_BRAND_WORD_MAX,
  VERDE_COPY_LIMITS,
  VERDE_HERO_SHAPES,
  VERDE_MOTIONS,
  VERDE_THEMES,
  type VerdeCopyField,
  type VerdeHeroShape,
  type VerdeMotion,
  type VerdeTheme,
} from '../verde-menu-config';

type VerdeCopyDtoFields = { [K in VerdeCopyField]?: string };

/**
 * Restricted appearance payload for the exclusive VERDE renderer. Image paths are never accepted:
 * uploads go through the dedicated routes and the Backend keeps the stored paths.
 */
export class VerdeMenuSettingsDto {
  @IsOptional() @IsString() @MaxLength(VERDE_BRAND_WORD_MAX) brandWord?: string;
  @IsIn(VERDE_THEMES) theme!: VerdeTheme;
  @IsIn(VERDE_MOTIONS) motion!: VerdeMotion;
  @IsIn(VERDE_HERO_SHAPES) heroImageShape!: VerdeHeroShape;
  @IsBoolean() allowThemeSwitch!: boolean;
  @IsBoolean() showMarquee!: boolean;
  @IsBoolean() showChapters!: boolean;
  @IsBoolean() showSpotlight!: boolean;
  @IsBoolean() showEnding!: boolean;
  @IsOptional() @IsUUID() chapter1CategoryId?: string | null;
  @IsOptional() @IsUUID() chapter2CategoryId?: string | null;
  /** Category UUID -> { introAr, introEn, descAr, descEn }; the service normalizes and tenant-filters it. */
  @IsOptional() @IsObject() categoryExtras?: Record<string, unknown>;
}
/** The validated payload: the class fields plus every generated localized copy field. */
export type VerdeMenuSettingsInput = VerdeMenuSettingsDto & VerdeCopyDtoFields;

// One decorated property per localized copy field, generated from the shared limits table.
for (const [field, max] of Object.entries(VERDE_COPY_LIMITS)) {
  IsOptional()(VerdeMenuSettingsDto.prototype, field);
  IsString()(VerdeMenuSettingsDto.prototype, field);
  MaxLength(max)(VerdeMenuSettingsDto.prototype, field);
}
