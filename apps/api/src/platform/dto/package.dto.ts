import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { FEATURE_KEYS, type FeatureKey } from '../../entitlements/features';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const emptyToNull = ({ value }: { value: unknown }): unknown => {
  const next = trimmed({ value });
  return next === '' ? null : next;
};

/** Money as a decimal string with at most two decimals ("149", "149.5", "149.50"). */
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

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
const CurrencyCode = () =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) => {
      const next = emptyToNull({ value });
      return typeof next === 'string' ? next.toUpperCase() : next;
    }),
    Matches(/^[A-Z]{3}$/, { message: 'currencyCode must be a 3-letter code' }),
  );
const Features = () =>
  applyDecorators(
    IsArray(),
    ArrayUnique(),
    IsIn(FEATURE_KEYS as readonly string[], { each: true }),
  );
const Status = () =>
  applyDecorators(IsOptional(), IsIn(['ACTIVE', 'ARCHIVED']));

export class CreatePackageDto {
  @Name()
  name!: string;

  @Description()
  description?: string | null;

  @Price('monthlyPrice')
  monthlyPrice?: string | null;

  @Price('yearlyPrice')
  yearlyPrice?: string | null;

  @CurrencyCode()
  currencyCode?: string | null;

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

  @Price('monthlyPrice')
  monthlyPrice?: string | null;

  @Price('yearlyPrice')
  yearlyPrice?: string | null;

  @CurrencyCode()
  currencyCode?: string | null;

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
