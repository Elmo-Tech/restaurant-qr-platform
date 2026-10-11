import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { NameTranslationDto, NameTranslationsProperty } from '../../common/name-translations';
import { IsMoneyDecimalString } from '../../menu/money-decimal';
import { DELIVERY_ZONE_STATUSES, type DeliveryZoneStatusInput } from './create-delivery-zone.dto';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** FT-8: partial Delivery zone update -- every field optional, same rules as create. */
export class UpdateDeliveryZoneDto {
  @ValidateIf((o: UpdateDeliveryZoneDto) => o.name !== undefined)
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  name?: string;

  /** Optional per-locale names; an empty name removes that locale. The default locale cannot be removed. */
  @NameTranslationsProperty()
  translations?: NameTranslationDto[];

  @ValidateIf((o: UpdateDeliveryZoneDto) => o.deliveryFee !== undefined)
  @IsMoneyDecimalString()
  deliveryFee?: string;

  @ValidateIf((o: UpdateDeliveryZoneDto) => o.minimumOrder !== undefined)
  @IsMoneyDecimalString()
  minimumOrder?: string;

  @ValidateIf((o: UpdateDeliveryZoneDto) => o.status !== undefined)
  @IsIn(DELIVERY_ZONE_STATUSES, {
    message: `status must be one of: ${DELIVERY_ZONE_STATUSES.join(', ')}`,
  })
  status?: DeliveryZoneStatusInput;

  @ValidateIf((o: UpdateDeliveryZoneDto) => o.displayOrder !== undefined)
  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder?: number;
}
