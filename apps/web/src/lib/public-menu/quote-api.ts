import { apiFetch } from '../api/client';
import { ApiError } from '../api/errors';
import type { SubmitGuestOrderItem } from './orders-api';
import type { GuestOrderItemView, GuestOrderView } from './types';

export interface PromotionProgress {
  title: string | null;
  scope: 'CART' | 'QUANTITY' | 'DELIVERY';
  subtotal: {
    basis: 'ELIGIBLE_PRODUCT_SUBTOTAL' | 'MERCHANDISE_SUBTOTAL';
    current: string;
    required: string;
    remaining: string;
  } | null;
  quantity: {
    basis: 'UNITS' | 'DISTINCT_PRODUCTS';
    current: number;
    required: number;
    remaining: number;
  } | null;
}

export interface CartQuote extends Pick<GuestOrderView,
  'type' | 'currencyCode' | 'subtotal' | 'discountTotal' | 'deliveryFee' | 'total'> {
  deliveryFeeOriginal: string | null;
  deliveryDiscount: string;
  promotions: NonNullable<GuestOrderView['promotions']>;
  promotionProgress?: PromotionProgress[];
  items: GuestOrderItemView[];
}

export interface QuoteCartInput {
  items: SubmitGuestOrderItem[];
  locale: string;
  fulfillment?: 'PICKUP' | 'DELIVERY';
  branchId?: string;
  deliveryZoneId?: string;
}

export type CartQuoteResult =
  | { kind: 'ready'; quote: CartQuote }
  | { kind: 'minimum'; quote: CartQuote | null; zoneName: string; minimumOrder: string; subtotal: string; remainingAmount?: string }
  | { kind: 'unavailable'; code?: string };

export async function fetchCartQuote(
  publicCode: string,
  input: QuoteCartInput,
  signal: AbortSignal,
): Promise<CartQuoteResult> {
  try {
    const { data } = await apiFetch<{ data: CartQuote }>(`/public/qr/${encodeURIComponent(publicCode)}/quote`, {
      method: 'POST', body: input, signal,
    });
    // B2 returns one quote item per submitted line, in request order (including Offers).
    // Refuse incomplete breakdowns rather than displaying prices from different carts.
    if (!matchesItems(data, input.items) || !isMoney(data.total)) return { kind: 'unavailable' };
    return { kind: 'ready', quote: data };
  } catch (error) {
    if (!(error instanceof ApiError)) return { kind: 'unavailable' };
    if (error.code === 'DELIVERY_MINIMUM_NOT_MET') {
      const details = error.details as {
        zoneName?: unknown; minimumOrder?: unknown; subtotal?: unknown; remainingAmount?: unknown; quote?: CartQuote;
      } | undefined;
      if (typeof details?.zoneName === 'string' && isMoney(details.minimumOrder) && isMoney(details.subtotal)) {
        return {
          kind: 'minimum',
          quote: matchesItems(details.quote, input.items) ? details.quote : null,
          zoneName: details.zoneName,
          minimumOrder: details.minimumOrder,
          subtotal: details.subtotal,
          remainingAmount: isMoney(details.remainingAmount) ? details.remainingAmount : undefined,
        };
      }
    }
    return { kind: 'unavailable', code: error.code };
  }
}

function isMoney(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d{2}$/.test(value);
}

function matchesItems(quote: CartQuote | undefined, items: SubmitGuestOrderItem[]): quote is CartQuote {
  return Array.isArray(quote?.items) && quote.items.length === items.length &&
    quote.items.every((line, index) => line.quantity === items[index].quantity &&
      (items[index].offerId ? line.offerId === items[index].offerId : line.productId === items[index].productId));
}
