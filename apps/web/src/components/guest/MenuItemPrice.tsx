'use client';

import type { ComponentProps } from 'react';
import type { PublicMenuCopy } from '../../lib/public-menu/copy';
import { currencyLabel, formatAmount } from '../../lib/public-menu/price-format';
import type { PublicItemPromotion } from '../../lib/public-menu/types';
import { DiscountedPrice } from './DiscountedPrice';
import { useGuestLocale } from './GuestLocale';

export function ItemPromotionLabel({ promotion, currency, copy }: {
  promotion: PublicItemPromotion | null;
  currency: string;
  copy: PublicMenuCopy;
}) {
  const locale = useGuestLocale();
  if (!promotion) return null;
  const text = promotion.type === 'PERCENTAGE'
    ? copy.possiblePromotionPercent(formatAmount(promotion.value))
    : copy.possiblePromotionAmount(formatAmount(promotion.amountOff), currencyLabel(currency, locale));
  return (
    <span className="block w-fit max-w-full rounded-md bg-g-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold leading-tight text-g-accent-text">
      <bdi>{text}</bdi>
    </span>
  );
}

/** Menu-only price lockup; this preview must not be used as a cart-price display. */
export function MenuItemPrice({ promotion, ...price }: ComponentProps<typeof DiscountedPrice> & {
  promotion: PublicItemPromotion | null;
}) {
  return (
    <>
      <DiscountedPrice {...price} />
      <ItemPromotionLabel promotion={promotion} currency={price.currency} copy={price.copy} />
    </>
  );
}
