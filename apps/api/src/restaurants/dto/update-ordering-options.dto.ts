import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Restaurant ordering options: switch the two Restaurant QR order types on or
 * off. Each field is optional; an omitted one is left unchanged, and an empty
 * body is a safe no-op that returns the current values.
 */
export class UpdateOrderingOptionsDto {
  /** Pickup from a Branch (Restaurant QR). */
  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean;

  /** Delivery (Restaurant QR). */
  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean;
}
