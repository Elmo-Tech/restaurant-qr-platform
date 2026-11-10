import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  MAKKBOZ_COPY_LIMITS,
  MAKKBOZ_MOTIONS,
  MAKKBOZ_PRICE_DISPLAYS,
  MAKKBOZ_THEMES,
  MAKKBOZ_VIEWS,
  type MakkbozCopyField,
  type MakkbozMotion,
  type MakkbozPriceDisplay,
  type MakkbozTheme,
  type MakkbozView,
} from '../makkboz-menu-config';

type MakkbozCopyDtoFields = { [K in MakkbozCopyField]?: string };

/**
 * Restricted appearance payload for the exclusive Makkboz renderer. Image paths are never accepted:
 * uploads go through the dedicated routes and the Backend keeps the stored paths.
 */
export class MakkbozMenuSettingsDto {
  @IsIn(MAKKBOZ_THEMES) theme!: MakkbozTheme;
  @IsBoolean() allowThemeSwitch!: boolean;
  @IsIn(MAKKBOZ_MOTIONS) motion!: MakkbozMotion;
  @IsIn(MAKKBOZ_VIEWS) defaultView!: MakkbozView;
  /** Optional for clients that saved the design before size-price display was added. */
  @IsOptional()
  @IsIn(MAKKBOZ_PRICE_DISPLAYS)
  priceDisplay?: MakkbozPriceDisplay;
  @IsBoolean() showAnnouncement!: boolean;
  @IsBoolean() showValues!: boolean;
  @IsBoolean() showStory!: boolean;
  /** Category UUID -> { tag, intro } in both languages; the service normalizes and tenant-filters it. */
  @IsOptional() @IsObject() categoryExtras?: Record<string, unknown>;
}
/** The validated payload: the class fields plus every generated localized copy field. */
export type MakkbozMenuSettingsInput = MakkbozMenuSettingsDto & MakkbozCopyDtoFields;

// One decorated property per localized copy field, generated from the shared limits table.
for (const [field, max] of Object.entries(MAKKBOZ_COPY_LIMITS)) {
  IsOptional()(MakkbozMenuSettingsDto.prototype, field);
  IsString()(MakkbozMenuSettingsDto.prototype, field);
  MaxLength(max)(MakkbozMenuSettingsDto.prototype, field);
}
