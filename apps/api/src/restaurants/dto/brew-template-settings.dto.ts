import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { BREW_MOTIONS, BREW_PROMO_MODES, type BrewMotion, type BrewPromoMode, type BrewImageMode } from '../brew-template-config';
/** A restricted appearance payload. Server controls media paths and normalizes the category-UUID map. */
export class BrewTemplateSettingsDto {
  @IsIn(BREW_MOTIONS)
  motion!: BrewMotion;
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
  @MaxLength(120)
  storyAr?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  storyEn?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  menuHeadingAr?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  menuHeadingEn?: string;
  @IsOptional()
  @IsString()
  @MaxLength(180)
  menuSubtitleAr?: string;
  @IsOptional()
  @IsString()
  @MaxLength(180)
  menuSubtitleEn?: string;
  @IsOptional()
  @IsString()
  @MaxLength(80)
  promoLabelAr?: string;
  @IsOptional()
  @IsString()
  @MaxLength(80)
  promoLabelEn?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoHeadlineAr?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoHeadlineEn?: string;
  @IsOptional()
  @IsString()
  @MaxLength(180)
  promoDescriptionAr?: string;
  @IsOptional()
  @IsString()
  @MaxLength(180)
  promoDescriptionEn?: string;
  @IsBoolean()
  promoEnabled!: boolean;
  @IsIn(BREW_PROMO_MODES)
  promoMode!: BrewPromoMode;
  @IsIn(['ART', 'CUSTOM'])
  promoImageMode!: BrewImageMode;
  @IsOptional()
  @IsObject()
  categoryPromos?: Record<string, unknown>;
}
