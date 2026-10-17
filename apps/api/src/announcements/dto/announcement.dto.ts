import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

/**
 * Create / update body for a Restaurant announcement (DEC-042). On update every field is
 * optional and an omitted one is unchanged; `texts` is merged per language (a null or blank
 * text removes that language). Dates are inclusive "YYYY-MM-DD"; null clears one.
 */
export class AnnouncementDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsIn(['INFO', 'PROMO', 'WARNING'])
  style?: 'INFO' | 'PROMO' | 'WARNING';

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startsOn?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endsOn?: string | null;

  /** `{ <locale>: text | null }`; each value is validated by the service. */
  @IsOptional()
  @IsObject()
  texts?: Record<string, string | null>;
}
