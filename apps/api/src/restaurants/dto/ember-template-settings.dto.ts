import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EMBER_MOTIONS,
  EMBER_IMAGE_MODES,
  EMBER_PALETTES,
  type EmberMotion,
  type EmberImageMode,
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
  @MaxLength(100)
  navTaglineAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  navTaglineEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  eyebrowAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  eyebrowEn?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signatureAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signatureEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  marqueeAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  marqueeEn?: string;

  /** The uploaded asset path is intentionally NOT a DTO field. */
  @IsIn(EMBER_IMAGE_MODES)
  heroImageMode!: EmberImageMode;
}
