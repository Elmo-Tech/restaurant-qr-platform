import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  MEAT_LOVERS_COPY_LIMITS,
  MEAT_LOVERS_MOTIONS,
  MEAT_LOVERS_THEMES,
  MEAT_LOVERS_VIEWS,
  type MeatLoversCopyField,
  type MeatLoversMotion,
  type MeatLoversTheme,
  type MeatLoversView,
} from '../meat-lovers-menu-config';

type MeatLoversCopyDtoFields = { [K in MeatLoversCopyField]?: string };

/**
 * Restricted appearance payload for the exclusive MeatLovers renderer. Image paths are never accepted:
 * uploads go through the dedicated routes and the Backend keeps the stored paths.
 */
export class MeatLoversMenuSettingsDto {
  @IsIn(MEAT_LOVERS_THEMES) theme!: MeatLoversTheme;
  @IsBoolean() allowThemeSwitch!: boolean;
  @IsIn(MEAT_LOVERS_MOTIONS) motion!: MeatLoversMotion;
  @IsIn(MEAT_LOVERS_VIEWS) defaultView!: MeatLoversView;
  @IsBoolean() showAnnouncement!: boolean;
  @IsBoolean() showStory!: boolean;
  /** Category UUID -> { tag, intro } in both languages; the service normalizes and tenant-filters it. */
  @IsOptional() @IsObject() categoryExtras?: Record<string, unknown>;
}
/** The validated payload: the class fields plus every generated localized copy field. */
export type MeatLoversMenuSettingsInput = MeatLoversMenuSettingsDto & MeatLoversCopyDtoFields;

// One decorated property per localized copy field, generated from the shared limits table.
for (const [field, max] of Object.entries(MEAT_LOVERS_COPY_LIMITS)) {
  IsOptional()(MeatLoversMenuSettingsDto.prototype, field);
  IsString()(MeatLoversMenuSettingsDto.prototype, field);
  MaxLength(max)(MeatLoversMenuSettingsDto.prototype, field);
}
