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
      className={`inline-flex items-center whitespace-nowrap rounded-full bg-g-accent px-2 py-[3px] text-[11px] font-extrabold leading-none text-g-on-accent ${className}`}
    >
      <bdi>{text}</bdi>
    </span>
  );
}

/**
 * The price BEFORE a discount, genuinely struck through.
 *
 * The line is drawn by the element that owns the font size (the `Price` itself),
 * not by a larger wrapper: a line propagated from a wrapper is positioned from the
 * wrapper's font metrics and ends up near the baseline, which reads as an underline.
 * The `<s>` wrapper keeps the semantics ("no longer accurate") and has its own
 * decoration switched off so that only the correctly-sized line is drawn.
 */
export function OriginalPrice({
  amount,
  currency,
  copy,
  className = 'g-num text-[13px] font-semibold text-g-text-3',
}: {
  amount: string;
  currency: string;
  copy: PublicMenuCopy;
  className?: string;
}) {
  return (
    <s className="no-underline">
      <span className="sr-only">{copy.originalPriceAria} </span>
      <Price
        amount={amount}
        currency={currency}
        className={`line-through decoration-[1.5px] ${className}`}
        currencyClassName="text-[0.82em] font-semibold"
      />
    </s>
  );
}

/**
 * A price that may be discounted. The current price comes first and carries the
 * emphasis; the struck original sits right beside it (or under it) and the badge,
 * when given, joins the same group. Without a discount it is exactly the plain
 * `Price`, so a product with no discount renders unchanged.
 */
export function DiscountedPrice({
  original,
  current,
  discounted,
  currency,
  copy,
  className = '',
  currencyClassName,
  originalClassName,
  direction = 'row',
  badge = null,
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
  /** `row`: current + original on one baseline (wraps if tight). `column`: original under current. */
  direction?: 'column' | 'row';
  /** When set, the badge joins the lockup after the original price. */
  badge?: PublicProductDiscount | null;
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
      className={`flex ${
        direction === 'row'
          ? 'flex-wrap items-baseline gap-x-2 gap-y-1'
          : 'flex-col items-start gap-0.5'
      }`}
    >
      <span className="sr-only">{copy.discountedPriceAria} </span>
      <Price
        amount={current}
        currency={currency}
        className={className}
        currencyClassName={currencyClassName}
      />
      <OriginalPrice
        amount={original}
        currency={currency}
        copy={copy}
        className={originalClassName}
      />
      {badge ? <DiscountBadge discount={badge} currency={currency} copy={copy} /> : null}
    </span>
  );
}
