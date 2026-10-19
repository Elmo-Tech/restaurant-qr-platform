import { Prisma } from '../../generated/prisma/client';

/**
 * Subscription pricing (DEC-049). Pure functions: list price, then the Package offer, then the
 * customer's own discount, always with Decimal arithmetic (never floating point), rounded half-up to
 * two decimals and never below zero. The result is stored on the Subscription as a snapshot.
 */
export type BillingCurrency = 'EGP' | 'USD';
export type BillingPeriodKey = 'MONTHLY' | 'YEARLY';
export type DiscountKind = 'PERCENT' | 'AMOUNT';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** Egypt is billed in EGP, every other country in USD. */
export function currencyForCountry(countryCode: string): BillingCurrency {
  return countryCode.toUpperCase() === 'EG' ? 'EGP' : 'USD';
}

export interface PackagePrices {
  priceEgpMonthly: Decimal | null;
  priceEgpYearly: Decimal | null;
  priceUsdMonthly: Decimal | null;
  priceUsdYearly: Decimal | null;
  offerPercent: Decimal | null;
  offerLabel: string | null;
  /** Last day the offer applies (inclusive); null = no end date. */
  offerEndsAt: Date | null;
}

/** The Package list price for a currency and period, or null when the Package does not offer it. */
export function listPriceFor(
  pkg: PackagePrices,
  currency: BillingCurrency,
  period: BillingPeriodKey,
): Decimal | null {
  if (currency === 'EGP') {
    return period === 'MONTHLY' ? pkg.priceEgpMonthly : pkg.priceEgpYearly;
  }
  return period === 'MONTHLY' ? pkg.priceUsdMonthly : pkg.priceUsdYearly;
}

/** An offer applies from its percentage being set until the end date (inclusive). */
export function offerIsActive(pkg: PackagePrices, onDate: Date): boolean {
  if (pkg.offerPercent === null || pkg.offerPercent.lte(0)) return false;
  return (
    pkg.offerEndsAt === null || pkg.offerEndsAt.getTime() >= onDate.getTime()
  );
}

export interface CustomerDiscount {
  type: DiscountKind;
  /** A percentage (0 to 100) or an amount in the billing currency. */
  value: Decimal;
}

export interface PriceBreakdown {
  currencyCode: BillingCurrency;
  listPrice: Decimal;
  offer: { label: string | null; percent: Decimal; amount: Decimal } | null;
  discount: { type: DiscountKind; value: Decimal; amount: Decimal } | null;
  finalPrice: Decimal;
}

const round2 = (value: Decimal): Decimal =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function calculatePrice(input: {
  currencyCode: BillingCurrency;
  listPrice: Decimal;
  offer: { label: string | null; percent: Decimal } | null;
  discount: CustomerDiscount | null;
}): PriceBreakdown {
  const listPrice = round2(input.listPrice);

  const offerAmount = input.offer
    ? round2(listPrice.mul(input.offer.percent).div(100))
    : new Decimal(0);
  const afterOffer = Decimal.max(listPrice.sub(offerAmount), 0);

  let discountAmount = new Decimal(0);
  if (input.discount) {
    discountAmount =
      input.discount.type === 'PERCENT'
        ? round2(afterOffer.mul(input.discount.value).div(100))
        : round2(input.discount.value);
    // a discount can never push the price below zero
    discountAmount = Decimal.min(discountAmount, afterOffer);
  }

  return {
    currencyCode: input.currencyCode,
    listPrice,
    offer: input.offer
      ? {
          label: input.offer.label,
          percent: input.offer.percent,
          amount: offerAmount,
        }
      : null,
    discount: input.discount
      ? {
          type: input.discount.type,
          value: input.discount.value,
          amount: discountAmount,
        }
      : null,
    finalPrice: afterOffer.sub(discountAmount),
  };
}

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID';

/** Paid, balance and status from the amounts of the payments that are not voided. */
export function paymentSummary(
  finalPrice: Decimal,
  amounts: readonly Decimal[],
): { paid: Decimal; balance: Decimal; status: PaymentStatus } {
  const paid = amounts.reduce((sum, amount) => sum.add(amount), new Decimal(0));
  const balance = finalPrice.sub(paid);
  let status: PaymentStatus;
  if (paid.lte(0)) status = finalPrice.lte(0) ? 'PAID' : 'UNPAID';
  else if (balance.gt(0)) status = 'PARTIAL';
  else if (balance.lt(0)) status = 'OVERPAID';
  else status = 'PAID';
  return { paid, balance, status };
}
