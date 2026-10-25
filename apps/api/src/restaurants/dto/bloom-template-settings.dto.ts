import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BLOOM_MOTIONS, BLOOM_PALETTES, type BloomMotion, type BloomPalette, type BloomImageMode } from '../bloom-template-config';
export class BloomTemplateSettingsDto {
  @IsIn(BLOOM_PALETTES)
  palette!: BloomPalette;
  @IsIn(BLOOM_MOTIONS)
  motion!: BloomMotion;
  @IsOptional()
  @IsString()
  @MaxLength(180)
  ribbonAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  ribbonEn?: string;

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
  @MaxLength(120)
  eyebrowAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  eyebrowEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  headlineTopAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  headlineTopEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  headlineMiddleAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  headlineMiddleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  headlineBottomAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  headlineBottomEn?: string;

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
  @MaxLength(60)
  ctaAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sectionEyebrowAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sectionEyebrowEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sectionHeadlineAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sectionHeadlineEn?: string;

  /** The uploaded media path is never accepted in a JSON request. */
  @IsIn(['ART', 'CUSTOM'])
  heroImageMode!: BloomImageMode;
}
