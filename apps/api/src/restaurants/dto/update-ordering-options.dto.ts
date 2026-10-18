import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Restaurant ordering options: switch the two Restaurant QR order types and the
 * Table (dine-in) channel on or off. Each field is optional; an omitted one is left unchanged, and an empty
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

  /** Table (dine-in) ordering from the Table QR; off = a view-only table menu (DEC-038). */
  @IsOptional()
  @IsBoolean()
  tableOrderingEnabled?: boolean;

  /** WhatsApp ordering (DEC-042): needs the Restaurant's WhatsApp number. */
  @IsOptional()
  @IsBoolean()
  whatsappOrderingEnabled?: boolean;
}
