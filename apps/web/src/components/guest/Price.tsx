'use client';

import { currencyLabel, formatAmount } from '../../lib/public-menu/price-format';
import { useGuestLocale } from './GuestLocale';

/**
 * A money value as one isolated unit. The number (and any "+" prefix) is its own
 * left-to-right run in Latin digits, so it can never reorder; the unit then follows in
 * the surrounding reading order -- "145 EGP" in English, and in Arabic the number sits
 * first from the right with "ج.م" after it. Whole amounts drop ".00" (see
 * `price-format.ts`); the amount is always the Backend's exact decimal string, never
 * recalculated here.
 */
export function Price({
  amount,
  currency,
  className = '',
  currencyClassName = 'text-[0.62em] font-semibold',
  prefix = '',
}: {
  amount: string;
  currency: string;
  className?: string;
  currencyClassName?: string;
  /** e.g. "+" for a modifier's price adjustment. */
  prefix?: string;
}) {
  const locale = useGuestLocale();
  return (
    <bdi
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className={`whitespace-nowrap tabular-nums ${className}`}
    >
      <span dir="ltr">
        {prefix}
        {formatAmount(amount)}
      </span>
      <span className={`ms-[3px] g-body ${currencyClassName}`}>
        {currencyLabel(currency, locale)}
      </span>
    </bdi>
  );
}
