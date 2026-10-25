import {
  calculatePrice,
  listPriceFor,
  offerIsActive,
  type BillingCurrency,
  type PackagePrices,
} from '../platform/billing/pricing';
import { formatDateOnly } from '../platform/billing/subscription-dates';

/** Public catalogue prices, not the agreement's locked-in final subscription price. */
export interface CataloguePriceView {
  priceMonthly: string | null;
  priceYearly: string | null;
  discountedMonthly: string | null;
  discountedYearly: string | null;
  offer: { percent: string; label: string | null; endsAt: string | null } | null;
}

/**
 * Use the same Decimal/ROUND_HALF_UP offer logic as subscription billing.
 * Never derive a customer-specific agreed price from catalogue prices.
 */
export function cataloguePricing(
  pkg: PackagePrices,
  currency: BillingCurrency,
  today: Date,
): CataloguePriceView {
  const offer = offerIsActive(pkg, today) && pkg.offerPercent
    ? {
        percent: pkg.offerPercent.toFixed(2),
        label: pkg.offerLabel,
        endsAt: pkg.offerEndsAt ? formatDateOnly(pkg.offerEndsAt) : null,
      }
    : null;
  const get = (period: 'MONTHLY'|'YEARLY') => {
    const list = listPriceFor(pkg, currency, period);
    if (!list) return { list: null, afterOffer: null };
    return {
      list: list.toFixed(2),
      afterOffer: offer && pkg.offerPercent
        ? calculatePrice({
            currencyCode: currency,
            listPrice: list,
            offer: { label: offer.label, percent: pkg.offerPercent },
            discount: null,
          }).finalPrice.toFixed(2)
        : null,
    };
  };
  const month = get('MONTHLY');
  const year = get('YEARLY');
  return {
    priceMonthly: month.list,
    priceYearly: year.list,
    discountedMonthly: month.afterOffer,
    discountedYearly: year.afterOffer,
    offer,
  };
}
