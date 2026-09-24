import { apiFetch } from '../api/client';
import { ApiError } from '../api/errors';
import type { GuestOrderView } from './types';

export interface SubmitGuestOrderItem {
  productId: string;
  quantity: number;
  /** Selected Modifier Option IDENTITY only -- never a price/name (CRITICAL MONEY RULE, CLAUDE.md #27). */
  modifierOptionIds: string[];
}

/** FT-7: Pickup-only checkout fields; omitted entirely for a TABLE QR. */
export interface SubmitPickupCheckout {
  fulfillment: 'PICKUP' | 'DELIVERY';
  branchId: string | null;
  customerName: string;
  customerPhone: string;
  customerNotes: string;
  /** FT-8, DELIVERY only: zone IDENTITY and address text -- never a fee/minimum/total (the Backend resolves those). */
  deliveryZoneId: string | null;
  deliveryAddress: string;
  deliveryBuilding: string;
  deliveryFloor: string;
  deliveryApartment: string;
  deliveryLandmark: string;
}

export type SubmitGuestOrderResult =
  | { outcome: 'success'; data: GuestOrderView }
  | { outcome: 'itemsUnavailable' }
  | { outcome: 'notFound' }
  | { outcome: 'pickupDetailsRequired' }
  | { outcome: 'pickupBranchInvalid' }
  | { outcome: 'pickupUnavailable' }
  | { outcome: 'deliveryDetailsRequired' }
  | { outcome: 'deliveryZoneInvalid' }
  | { outcome: 'deliveryUnavailable' }
  | { outcome: 'minimumNotMet'; zoneName: string | null; minimumOrder: string | null }
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
  pickup: SubmitPickupCheckout | null = null,
): Promise<SubmitGuestOrderResult> {
  try {
    const body = await apiFetch<{ data: GuestOrderView }>(
      `/public/qr/${encodeURIComponent(publicCode)}/orders`,
      {
        method: 'POST',
        body: {
          clientRequestId,
          items,
          ...(pickup
            ? {
                fulfillment: pickup.fulfillment,
                ...(pickup.branchId ? { branchId: pickup.branchId } : {}),
                customerName: pickup.customerName.trim(),
                customerPhone: pickup.customerPhone.trim(),
                ...(pickup.customerNotes.trim() ? { customerNotes: pickup.customerNotes.trim() } : {}),
                ...(pickup.fulfillment === 'DELIVERY'
                  ? {
                      ...(pickup.deliveryZoneId ? { deliveryZoneId: pickup.deliveryZoneId } : {}),
                      deliveryAddress: pickup.deliveryAddress.trim(),
                      ...(pickup.deliveryBuilding.trim() ? { deliveryBuilding: pickup.deliveryBuilding.trim() } : {}),
                      ...(pickup.deliveryFloor.trim() ? { deliveryFloor: pickup.deliveryFloor.trim() } : {}),
                      ...(pickup.deliveryApartment.trim() ? { deliveryApartment: pickup.deliveryApartment.trim() } : {}),
                      ...(pickup.deliveryLandmark.trim() ? { deliveryLandmark: pickup.deliveryLandmark.trim() } : {}),
                    }
                  : {}),
              }
            : {}),
        },
      },
    );
    return { outcome: 'success', data: body.data };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === 'ORDER_ITEM_UNAVAILABLE') {
        return { outcome: 'itemsUnavailable' };
      }
      if (error.code === 'PICKUP_CUSTOMER_DETAILS_REQUIRED') {
        return { outcome: 'pickupDetailsRequired' };
      }
      if (error.code === 'PICKUP_BRANCH_REQUIRED' || error.code === 'PICKUP_BRANCH_INVALID') {
        return { outcome: 'pickupBranchInvalid' };
      }
      if (error.code === 'DELIVERY_DETAILS_REQUIRED') {
        return { outcome: 'deliveryDetailsRequired' };
      }
      if (error.code === 'DELIVERY_ZONE_INVALID') {
        return { outcome: 'deliveryZoneInvalid' };
      }
      if (error.code === 'DELIVERY_UNAVAILABLE') {
        return { outcome: 'deliveryUnavailable' };
      }
      if (error.code === 'DELIVERY_MINIMUM_NOT_MET') {
        const details = (error.details ?? {}) as { zoneName?: unknown; minimumOrder?: unknown };
        return {
          outcome: 'minimumNotMet',
          zoneName: typeof details.zoneName === 'string' ? details.zoneName : null,
          minimumOrder: typeof details.minimumOrder === 'string' ? details.minimumOrder : null,
        };
      }
      if (error.code === 'PICKUP_UNAVAILABLE') {
        return { outcome: 'pickupUnavailable' };
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
