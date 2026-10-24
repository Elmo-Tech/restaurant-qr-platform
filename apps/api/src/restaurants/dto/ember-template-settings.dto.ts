import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EMBER_MOTIONS,
  EMBER_PALETTES,
  type EmberMotion,
  type EmberPalette,
} from '../ember-template-config';

/** Fixed allowlist; arbitrary HTML, CSS and media URLs cannot be submitted. */
export class EmberTemplateSettingsDto {
  @IsIn(EMBER_PALETTES)
  palette!: EmberPalette;

  @IsIn(EMBER_MOTIONS)
  motion!: EmberMotion;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  headlineAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  headlineEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subtitleAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subtitleEn?: string;
}
