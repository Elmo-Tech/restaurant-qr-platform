import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Restaurant contact details (DEC-042). Every field is optional: an omitted one is
 * left unchanged, `null` or an empty string clears it. Phones and links are
 * validated and normalized by the Backend (`restaurant-contact.ts`).
 */
export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  whatsapp?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  hotline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  facebookUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  instagramUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  tiktokUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  telegramUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  youtubeUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  xUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  snapchatUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  mapsUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  websiteUrl?: string | null;
}
