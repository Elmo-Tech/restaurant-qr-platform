import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { NameTranslationDto, NameTranslationsProperty } from '../../common/name-translations';
import { IsMoneyDecimalString } from '../../menu/money-decimal';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export const DELIVERY_ZONE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type DeliveryZoneStatusInput = (typeof DELIVERY_ZONE_STATUSES)[number];

/**
 * FT-8: client-writable fields for Delivery zone creation. `restaurantId`/
 * `branchId` are never here -- the Restaurant comes from the authenticated
 * context and the Branch from the route, verified against that Restaurant by
 * `DeliveryZonesService`. Money reuses the exact non-negative decimal-string
 * contract Product.basePrice already uses (fee >= 0, minimum >= 0).
 */
export class CreateDeliveryZoneDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  name!: string;

  /** Optional per-locale names (Bilingual zone names). `name` stays the default-locale name. */
  @NameTranslationsProperty()
  translations?: NameTranslationDto[];

  @IsMoneyDecimalString()
  deliveryFee!: string;

  @IsMoneyDecimalString()
  minimumOrder!: string;

  @IsOptional()
  @IsIn(DELIVERY_ZONE_STATUSES, {
    message: `status must be one of: ${DELIVERY_ZONE_STATUSES.join(', ')}`,
  })
  status?: DeliveryZoneStatusInput;

  @IsOptional()
  @IsInt({ message: 'displayOrder must be an integer' })
  @Min(0, { message: 'displayOrder must not be negative' })
  displayOrder?: number;
}
