'use client';

import type { PublicMenuCopy } from '../../lib/public-menu/copy';
import { currencyLabel, formatAmount } from '../../lib/public-menu/price-format';
import type { PublicProductDiscount } from '../../lib/public-menu/types';
import { useGuestLocale } from './GuestLocale';
import { Price } from './Price';

/**
 * The "discount badge": "20% OFF" for a percentage, "Save 30 EGP" for a fixed
 * amount. Text only -- every number comes from the Backend's resolved discount.
 */
export function DiscountBadge({
  discount,
  currency,
  copy,
  className = '',
}: {
  discount: PublicProductDiscount;
  currency: string;
  copy: PublicMenuCopy;
  className?: string;
}) {
  const locale = useGuestLocale();
  const text =
    discount.type === 'PERCENTAGE'
      ? copy.discountPercentOff(formatAmount(discount.value))
      : copy.discountAmountOff(formatAmount(discount.amountOff), currencyLabel(currency, locale));
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full bg-g-accent px-2 py-[3px] text-[11.5px] font-extrabold leading-none text-g-on-accent ${className}`}
    >
      <bdi>{text}</bdi>
    </span>
  );
}

/**
 * A price that may be discounted: the original struck through (and announced as
 * such to assistive tech) next to the current price. Without a discount it is
 * exactly the plain `Price`, so a product with no discount renders unchanged.
 */
export function DiscountedPrice({
  original,
  current,
  discounted,
  currency,
  copy,
  className = '',
  currencyClassName,
  originalClassName = 'g-num text-[12.5px] font-semibold text-g-text-3',
  direction = 'column',
}: {
  /** The price before any discount. */
  original: string;
  /** The price Guests pay (equal to `original` when not discounted). */
  current: string;
  discounted: boolean;
  currency: string;
  copy: PublicMenuCopy;
  className?: string;
  currencyClassName?: string;
  originalClassName?: string;
  direction?: 'column' | 'row';
}) {
  if (!discounted) {
    return (
      <Price
        amount={current}
        currency={currency}
        className={className}
        currencyClassName={currencyClassName}
      />
    );
  }
  return (
    <span
      className={`inline-flex ${
        direction === 'row' ? 'flex-row items-baseline gap-2' : 'flex-col items-start leading-tight'
      }`}
    >
      <span className="sr-only">{copy.originalPriceAria}</span>
      <s aria-hidden="false" className="decoration-g-text-3">
        <Price
          amount={original}
          currency={currency}
          className={originalClassName}
          currencyClassName="text-[0.78em] font-semibold"
        />
      </s>
      <span className="sr-only">{copy.discountedPriceAria}</span>
      <Price
        amount={current}
        currency={currency}
        className={className}
        currencyClassName={currencyClassName}
      />
    </span>
  );
}
