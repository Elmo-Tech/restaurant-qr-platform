import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import { HEX_COLOR_PATTERN } from '../qr-style';

function upper(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

/**
 * Restaurant QR appearance: module color, background color, centered logo and
 * the restaurant name. Every field is optional (omitted = unchanged). Whether
 * the resulting style is scannable is a business rule checked by the service.
 */
export class UpdateQrStyleDto {
  @IsOptional()
  @Transform(({ value }) => upper(value))
  @Matches(HEX_COLOR_PATTERN, { message: 'foregroundColor must be a #RRGGBB color' })
  foregroundColor?: string;

  @IsOptional()
  @Transform(({ value }) => upper(value))
  @Matches(HEX_COLOR_PATTERN, { message: 'backgroundColor must be a #RRGGBB color' })
  backgroundColor?: string;

  @IsOptional()
  @IsBoolean()
  showLogo?: boolean;

  @IsOptional()
  @IsBoolean()
  showName?: boolean;
}
