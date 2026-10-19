import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DATE_ONLY, MONEY, PERCENT } from './package.dto';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const emptyToNull = ({ value }: { value: unknown }): unknown => {
  const next = trimmed({ value });
  return next === '' ? null : next;
};

const OptionalText = (max: number) =>
  applyDecorators(
    IsOptional(),
    Transform(emptyToNull),
    IsString(),
    MaxLength(max),
  );

/** The customer's own discount on a subscription: a percentage or a fixed amount (DEC-049). */
export class CustomerDiscountDto {
  @IsIn(['PERCENT', 'AMOUNT'])
  type!: 'PERCENT' | 'AMOUNT';

  /** A percentage (0.01 to 100) or an amount; the service checks the range for the chosen type. */
  @Transform(trimmed)
  @Matches(new RegExp(`${PERCENT.source}|${MONEY.source}`), {
    message: 'value must be a decimal string',
  })
  value!: string;
}

/** Used to preview a subscription (no write) and to create it. */
export class SubscriptionBodyDto {
  @IsUUID()
  packageId!: string;

  @IsIn(['MONTHLY', 'YEARLY'])
  period!: 'MONTHLY' | 'YEARLY';

  /** YYYY-MM-DD; missing = today, or the day the last subscription ends. */
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(DATE_ONLY, { message: 'startsAt must be YYYY-MM-DD' })
  startsAt?: string | null;

  /** `null` or missing = no customer discount. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerDiscountDto)
  discount?: CustomerDiscountDto | null;

  @OptionalText(500)
  notes?: string | null;
}

export class PaymentBodyDto {
  @Transform(trimmed)
  @Matches(MONEY, { message: 'amount must be a decimal string' })
  amount!: string;

  @IsIn(['CASH', 'BANK_TRANSFER', 'INSTAPAY', 'MOBILE_WALLET', 'OTHER'])
  method!: 'CASH' | 'BANK_TRANSFER' | 'INSTAPAY' | 'MOBILE_WALLET' | 'OTHER';

  @Transform(trimmed)
  @Matches(DATE_ONLY, { message: 'paidAt must be YYYY-MM-DD' })
  paidAt!: string;

  @OptionalText(120)
  reference?: string | null;

  @OptionalText(500)
  notes?: string | null;
}

export class VoidPaymentBodyDto {
  @Transform(trimmed)
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class CountryBodyDto {
  @Transform(trimmed)
  @Matches(/^[A-Za-z]{2}$/, { message: 'countryCode must be 2 letters' })
  countryCode!: string;
}
