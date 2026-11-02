import { Type } from 'class-transformer';
import {
  IsIn,
  IsUUID,
  ValidateNested,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import {
  ACQUISITION_SOURCE_TYPES,
  type AcquisitionSourceType,
} from '../restaurant-acquisition';

export class RestaurantAcquisitionDto {
  @IsIn(ACQUISITION_SOURCE_TYPES)
  sourceType!: AcquisitionSourceType;

  @IsOptional()
  @IsUUID()
  referringRestaurantId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourcePlatform?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourceDetail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  campaign?: string | null;
}

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

  /** The billing country (2 letters); missing = Egypt (billed in EGP, DEC-049). */
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/, { message: 'countryCode must be 2 letters' })
  countryCode?: string;

  /** The package to start on, or missing / null for none (every feature). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  packageId?: string | null;

  /** ElmoTech-only attribution. Optional for backwards-compatible API/CLI clients. */
  @IsOptional()
  @ValidateNested()
  @Type(() => RestaurantAcquisitionDto)
  acquisition?: RestaurantAcquisitionDto | null;
}
