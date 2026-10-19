import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }): unknown => {
  const next = typeof value === 'string' ? value.trim() : value;
  return next === '' ? null : next;
};

/** A restaurant's request to upgrade or to renew (DEC-050). The restaurant always comes from the URL's authorization. */
export class SubscriptionRequestDto {
  @IsIn(['UPGRADE', 'RENEWAL'])
  kind!: 'UPGRADE' | 'RENEWAL';

  /** The package to move to (required for an upgrade, optional for a renewal). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  packageId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  message?: string | null;
}
