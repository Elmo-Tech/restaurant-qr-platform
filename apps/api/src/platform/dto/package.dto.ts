import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FEATURE_KEYS, type FeatureKey } from '../../entitlements/features';
import { MENU_TEMPLATE_KEYS } from '../../entitlements/templates';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const emptyToNull = ({ value }: { value: unknown }): unknown => {
  const next = trimmed({ value });
  return next === '' ? null : next;
};

/** Money as a decimal string with at most two decimals ("149", "149.5", "149.50"). */
export const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
/** A percentage from 0.01 to 100 with at most two decimals. */
export const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;
/** A calendar date, YYYY-MM-DD (whether it is a real date is checked by the service). */
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "149" and "149.5" are stored and shown as "149.00" and "149.50". */
export function normalizeMoney(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined) return value;
  const [whole, fraction = ''] = value.split('.');
  return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
}

// `IsOptional` lets both a missing field (leave it) and `null` (clear it) through.
const Name = () =>
  applyDecorators(Transform(trimmed), IsString(), Length(1, 80));
const Description = () =>
  applyDecorators(
    IsOptional(),
    Transform(emptyToNull),
    IsString(),
    MaxLength(500),
  );
const Price = (field: string) =>
  applyDecorators(
    IsOptional(),
    Transform(emptyToNull),
    Matches(MONEY, { message: `${field} must be a decimal string` }),
  );
const Features = () =>
  applyDecorators(
    IsArray(),
    ArrayUnique(),
    IsIn(FEATURE_KEYS as readonly string[], { each: true }),
  );
const Status = () =>
  applyDecorators(IsOptional(), IsIn(['ACTIVE', 'ARCHIVED']));

/** List prices per billing currency and period (DEC-049). Missing = leave, null = not offered. */
export class PackagePricesDto {
  @Price('egpMonthly')
  egpMonthly?: string | null;

  @Price('egpYearly')
  egpYearly?: string | null;

  @Price('usdMonthly')
  usdMonthly?: string | null;

  @Price('usdYearly')
  usdYearly?: string | null;
}

/** An offer on a package: a percentage off the list price, optionally ending on a date (inclusive). */
export class PackageOfferDto {
  @Transform(trimmed)
  @Matches(PERCENT, { message: 'percent must be a decimal string' })
  percent!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(60)
  label?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @Matches(DATE_ONLY, { message: 'endsAt must be YYYY-MM-DD' })
  endsAt?: string | null;
}

/** The Guest menu templates a package allows (DEC-051). Classic is always allowed and is not listed. */
export class PackageTemplatesDto {
  @IsBoolean()
  all!: boolean;

  @IsArray()
  @ArrayUnique()
  @IsIn(MENU_TEMPLATE_KEYS.filter((key) => key !== 'CLASSIC'), { each: true })
  selected!: string[];
}

const Templates = () =>
  applyDecorators(
    IsOptional(),
    ValidateNested(),
    Type(() => PackageTemplatesDto),
  );

const Prices = () =>
  applyDecorators(
    IsOptional(),
    ValidateNested(),
    Type(() => PackagePricesDto),
  );

// `null` removes the offer; a missing field leaves it as it is.
const Offer = () =>
  applyDecorators(
    ValidateIf((_, value) => value !== null && value !== undefined),
    ValidateNested(),
    Type(() => PackageOfferDto),
  );

export class CreatePackageDto {
  @Name()
  name!: string;

  @Description()
  description?: string | null;

  @Prices()
  prices?: PackagePricesDto;

  @Offer()
  offer?: PackageOfferDto | null;

  @Templates()
  templates?: PackageTemplatesDto;

  @Features()
  features!: FeatureKey[];

  @Status()
  status?: 'ACTIVE' | 'ARCHIVED';
}

/** Editing sends only what changes; `null` clears an optional field. */
export class UpdatePackageDto {
  @IsOptional()
  @Name()
  name?: string;

  @Description()
  description?: string | null;

  @Prices()
  prices?: PackagePricesDto;

  @Offer()
  offer?: PackageOfferDto | null;

  @Templates()
  templates?: PackageTemplatesDto;

  @IsOptional()
  @Features()
  features?: FeatureKey[];

  @Status()
  status?: 'ACTIVE' | 'ARCHIVED';
}

export class AssignPackageDto {
  /** The package id, or null to take the Restaurant off any package (every feature). */
  @ValidateIf((_, value) => value !== null)
  @IsString()
  packageId!: string | null;
}
