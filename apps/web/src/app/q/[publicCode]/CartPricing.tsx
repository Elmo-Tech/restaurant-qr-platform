import { Price } from '../../../components/guest/Price';
import { orderDisplayPricing } from '../../../lib/orders/display-pricing';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { getOffersCopy } from '../../../lib/public-menu/offers-copy';
import { currencyLabel, formatAmount } from '../../../lib/public-menu/price-format';
import type { PromotionProgress } from '../../../lib/public-menu/quote-api';
import type { GuestOrderView } from '../../../lib/public-menu/types';
import { SummaryRow } from './CheckoutSections';
import type { CartQuoteState } from './useCartQuote';

export function OrderPriceSummary({ order, copy, live = false }: {
  order: Pick<GuestOrderView, 'type' | 'currencyCode' | 'subtotal' | 'discountTotal' | 'deliveryFee' |
    'deliveryFeeOriginal' | 'deliveryDiscount' | 'promotions' | 'total'>;
  copy: PublicMenuCopy;
  live?: boolean;
}) {
  const currency = order.currencyCode;
  const pricing = orderDisplayPricing({ ...order, subtotalAmount: order.subtotal });
  return (
    <>
      <SummaryRow label={copy.itemsSubtotal} amount={pricing.grossSubtotal} currency={currency} />
      {pricing.hasDiscount ? (
        <div className="flex flex-col gap-2.5" data-testid={live ? 'cart-quote-savings' : undefined}>
          {live ? (
            <p className="flex items-baseline justify-between gap-2 border-t border-g-line pt-2 text-sm font-bold text-g-accent-text">
              {copy.cartSavings} <Price amount={order.discountTotal} currency={currency} />
            </p>
          ) : null}
          {pricing.legacyDiscount !== '0.00' ? (
            <SummaryRow label={copy.productSavings} amount={pricing.legacyDiscount} currency={currency} negative />
          ) : null}
          {pricing.merchandisePromotions.map((promotion, index) => (
            <SummaryRow key={index} label={promotion.title ?? copy.promotionLabel} amount={promotion.amount} currency={currency} negative />
          ))}
          <SummaryRow label={copy.itemsSubtotalNet} amount={order.subtotal} currency={currency} />
        </div>
      ) : null}
      {order.type === 'DELIVERY' ? (
        <>
          {pricing.deliveryDiscount ? (
            <>
              <SummaryRow label={copy.deliveryFeeOriginal} amount={pricing.deliveryFee} currency={currency} />
              <SummaryRow label={pricing.deliveryDiscount.title ?? copy.deliveryDiscount} amount={pricing.deliveryDiscount.amount} currency={currency} negative />
            </>
          ) : null}
          <SummaryRow label={copy.deliveryFee} amount={order.deliveryFee} currency={currency} />
        </>
      ) : null}
      <div className="my-1 h-px bg-g-line" />
      <div data-testid={live ? 'cart-quote-total' : 'confirmed-order-total'}>
        <SummaryRow strong label={copy.total} amount={order.total} currency={currency} />
      </div>
    </>
  );
}

export function CartQuoteSummary({ state, copy, locale, idleHint, onRefresh, disabled }: {
  state: CartQuoteState;
  copy: PublicMenuCopy;
  locale: string;
  idleHint: string | null;
  onRefresh: () => void;
  disabled: boolean;
}) {
  const quote = state.kind === 'ready' || state.kind === 'minimum' ? state.quote : null;
  const message = state.kind === 'idle' ? idleHint
    : state.kind === 'stale' ? copy.quoteStale
    : state.kind === 'loading' ? copy.quoteLoading
    : state.kind === 'unavailable' ? (state.code === 'ORDER_ITEM_UNAVAILABLE' ? copy.itemsUnavailableError
      : state.code === 'OFFER_CHANGED' ? getOffersCopy(locale).changedError
      : state.code === 'OFFER_UNAVAILABLE' ? getOffersCopy(locale).unavailableError
      : state.code === 'BRANCH_CLOSED' ? copy.branchClosedHint
      : state.code === 'DELIVERY_ZONE_INVALID' ? copy.deliveryAreaError
      : copy.quoteUnavailable)
    : quote && quote.discountTotal === '0.00' && quote.deliveryDiscount === '0.00'
      ? copy.noApplicablePromotion : null;
  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] border border-g-line bg-g-surface p-4">
      {quote ? <OrderPriceSummary order={quote} copy={copy} live /> : null}
      <div data-testid="cart-quote-status" data-state={state.kind} role="status" className="text-[13px] leading-relaxed text-g-text-2 empty:hidden">
        {message}
      </div>
      {quote?.promotionProgress?.length ? (
        <ThresholdProgress entries={quote.promotionProgress} currency={quote.currencyCode} copy={copy} locale={locale} />
      ) : null}
      {state.kind === 'unavailable' ? (
        <button type="button" disabled={disabled} onClick={onRefresh} className="min-h-11 self-start font-bold text-g-accent-text underline disabled:opacity-50">
          {copy.quoteRetry}
        </button>
      ) : null}
    </div>
  );
}

function ThresholdProgress({ entries, copy, locale, currency }: {
  entries: PromotionProgress[];
  copy: PublicMenuCopy;
  locale: string;
  currency: string;
}) {
  return (
    <aside data-testid="promotion-progress" className="rounded-xl bg-g-surface-2 p-3 text-[13px] leading-relaxed text-g-text-2">
      <p className="font-bold text-g-text">{copy.promotionProgress}</p>
      <ul className="mt-1 space-y-2">
        {entries.map(({ title, subtotal, quantity }, index) => (
          <li key={index}>
            <p className="font-semibold"><bdi>{title ?? copy.promotionLabel}</bdi></p>
            {subtotal ? (
              <p>{copy.promotionSpendProgress(formatAmount(subtotal.current), formatAmount(subtotal.required),
                formatAmount(subtotal.remaining), currencyLabel(currency, locale), subtotal.basis === 'MERCHANDISE_SUBTOTAL')}</p>
            ) : null}
            {quantity ? (
              <p>{copy.promotionQuantityProgress(quantity.current, quantity.required, quantity.remaining,
                quantity.basis === 'DISTINCT_PRODUCTS')}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
