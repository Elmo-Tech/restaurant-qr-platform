import { apiFetch } from '../api/client';
import { ApiError } from '../api/errors';
import type { GuestOrderView } from './types';

export interface SubmitGuestOrderItem {
  productId: string;
  quantity: number;
  /** Selected Modifier Option IDENTITY only -- never a price/name (CRITICAL MONEY RULE, CLAUDE.md #27). */
  modifierOptionIds: string[];
  /** The chosen size IDENTITY (DEC-041) -- never a price or name; omitted for a product without sizes. */
  variantId?: string | null;
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
  /** Table Sessions: staff closed ordering for this table (409 TABLE_ORDERING_UNAVAILABLE). Nothing was created. */
  | { outcome: 'tableOrderingUnavailable' }
  /** DEC-038: the Restaurant switched ordering off for this channel (409 ORDERING_DISABLED). Nothing was created. */
  | { outcome: 'orderingDisabled' }
  | { outcome: 'deliveryDetailsRequired' }
  | { outcome: 'deliveryZoneInvalid' }
  | { outcome: 'deliveryUnavailable' }
  | { outcome: 'minimumNotMet'; zoneName: string | null; minimumOrder: string | null }
  /**
   * Product Discounts V1: a discount started, ended or changed since the Guest
   * saw the total (422 PRICE_CHANGED, API_CONVENTIONS.md #75). Nothing was created; `total` is the
   * Backend's current total payable (display hint only -- the menu is refetched).
   */
  | { outcome: 'priceChanged'; total: string | null }
  | { outcome: 'networkError' };

/**
 * Table Sessions: the advisory Table QR ordering availability behind the Guest
 * "Check again" action. `unknown` for any failure (offline, 404): the caller
 * must never treat that as "open" or as "closed" -- the order endpoint remains
 * the authority and re-checks on every submission.
 */
export async function getTableOrdering(
  publicCode: string,
): Promise<'AVAILABLE' | 'CLOSED' | 'DISABLED' | 'unknown'> {
  try {
    const body = await apiFetch<{
      data: { tableOrdering: 'AVAILABLE' | 'CLOSED' | 'DISABLED' };
    }>(`/public/qr/${encodeURIComponent(publicCode)}/table-ordering`);
    if (body.data.tableOrdering === 'DISABLED') return 'DISABLED';
    return body.data.tableOrdering === 'CLOSED' ? 'CLOSED' : 'AVAILABLE';
  } catch {
    return 'unknown';
  }
}

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
  /** The menu content language the Guest is browsing in; the Backend localizes Branch and zone names in the confirmation with it. Display only. */
  locale: string | null = null,
  /** The total payable the Guest was shown (a staleness check only -- the Backend recomputes every amount). */
  expectedTotal: string | null = null,
): Promise<SubmitGuestOrderResult> {
  try {
    const body = await apiFetch<{ data: GuestOrderView }>(
      `/public/qr/${encodeURIComponent(publicCode)}/orders`,
      {
        method: 'POST',
        body: {
          clientRequestId,
          ...(locale ? { locale } : {}),
          ...(expectedTotal ? { expectedTotal } : {}),
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
      if (error.code === 'TABLE_ORDERING_UNAVAILABLE') {
        return { outcome: 'tableOrderingUnavailable' };
      }
      if (error.code === 'ORDERING_DISABLED') {
        return { outcome: 'orderingDisabled' };
      }
      if (error.code === 'PRICE_CHANGED') {
        const details = (error.details ?? {}) as { pricing?: { total?: unknown } };
        const total = details.pricing?.total;
        return { outcome: 'priceChanged', total: typeof total === 'string' ? total : null };
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
