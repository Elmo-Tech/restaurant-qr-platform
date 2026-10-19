import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * Creating a Restaurant and its owner from the platform console. The shape and the business rules
 * (name lengths, email, currency, locale, timezone, password policy) are checked by the shared
 * provisioning routine; this only makes sure every field is a bounded string.
 */
export class CreateRestaurantDto {
  @IsString()
  @MaxLength(200)
  restaurantName!: string;

  @IsString()
  @MaxLength(320)
  ownerEmail!: string;

  @IsString()
  @MaxLength(256)
  ownerPassword!: string;

  @IsString()
  @MaxLength(200)
  branchName!: string;

  @IsString()
  @MaxLength(10)
  defaultLocale!: string;

  @IsString()
  @MaxLength(10)
  currencyCode!: string;

  @IsString()
  @MaxLength(100)
  timezone!: string;

  /** The package to start on, or missing / null for none (every feature). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  packageId?: string | null;
}
