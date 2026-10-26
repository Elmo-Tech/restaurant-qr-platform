import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { FOLIO_COPY_LIMITS, FOLIO_PALETTES, type FolioArtworkMode, type FolioMotion, type FolioPalette } from '../folio-template-config';

export class FolioTemplateSettingsDto {
  @IsIn(FOLIO_PALETTES) palette!: FolioPalette;
  @IsIn(['SUBTLE', 'OFF']) motion!: FolioMotion;
  @IsIn(['ILLUSTRATION', 'FEATURED', 'CUSTOM']) artworkMode!: FolioArtworkMode;
  @IsOptional() @IsString() @MaxLength(100) eyebrowAr?: string;
  @IsOptional() @IsString() @MaxLength(100) eyebrowEn?: string;
  @IsOptional() @IsString() @MaxLength(120) headlineAr?: string;
  @IsOptional() @IsString() @MaxLength(120) headlineEn?: string;
  @IsOptional() @IsString() @MaxLength(100) coverTaglineAr?: string;
  @IsOptional() @IsString() @MaxLength(100) coverTaglineEn?: string;
  @IsOptional() @IsString() @MaxLength(60) coverCtaAr?: string;
  @IsOptional() @IsString() @MaxLength(60) coverCtaEn?: string;
  @IsOptional() @IsString() @MaxLength(80) collectionLabelAr?: string;
  @IsOptional() @IsString() @MaxLength(80) collectionLabelEn?: string;
  @IsOptional() @IsString() @MaxLength(180) chapterSubtitleAr?: string;
  @IsOptional() @IsString() @MaxLength(180) chapterSubtitleEn?: string;
  @IsOptional() @IsString() @MaxLength(100) pageFooterAr?: string;
  @IsOptional() @IsString() @MaxLength(100) pageFooterEn?: string;
}
void FOLIO_COPY_LIMITS;
