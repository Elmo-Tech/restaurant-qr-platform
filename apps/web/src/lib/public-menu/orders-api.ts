import { apiFetch } from '../api/client';
import { ApiError } from '../api/errors';
import type { GuestOrderView } from './types';

export interface SubmitGuestOrderItem {
  productId: string;
  quantity: number;
}

export type SubmitGuestOrderResult =
  | { outcome: 'success'; data: GuestOrderView }
  | { outcome: 'itemsUnavailable' }
  | { outcome: 'notFound' }
  | { outcome: 'networkError' };

/**
 * FT-5: the one Guest Order-submission request -- a genuine browser
 * `fetch` (via the existing `apiFetch` transport, same as every other
 * client-side mutation in this app), never a Server Component transport,
 * since it only ever runs in response to a Guest tapping "Place Order".
 * `clientRequestId` + `items` (productId/quantity only) is everything sent
 * -- no price, no total, no Restaurant/Branch/Table id (Section 4): the
 * Backend re-resolves all of that from the URL's own `publicCode`.
 */
export async function submitGuestOrder(
  publicCode: string,
  clientRequestId: string,
  items: SubmitGuestOrderItem[],
): Promise<SubmitGuestOrderResult> {
  try {
    const body = await apiFetch<{ data: GuestOrderView }>(
      `/public/qr/${encodeURIComponent(publicCode)}/orders`,
      { method: 'POST', body: { clientRequestId, items } },
    );
    return { outcome: 'success', data: body.data };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === 'ORDER_ITEM_UNAVAILABLE') {
        return { outcome: 'itemsUnavailable' };
      }
      if (error.code === 'QR_NOT_FOUND') {
        return { outcome: 'notFound' };
      }
    }
    // Section 23: any other failure (network failure, unexpected 5xx,
    // validation edge case) is a generic, guest-safe "try again" --
    // the Cart is left completely untouched by the caller either way.
    return { outcome: 'networkError' };
  }
}
