import { createHash } from 'node:crypto';
import type { OrderType } from '../generated/prisma/client';

/**
 * API_CONVENTIONS.md #79-#81: the canonical MATERIAL identity of one public Order request, used
 * to tell a genuine retry of the same `clientRequestId` (replay the original Order) from a reuse
 * of the key with a materially different request (409 IDEMPOTENCY_KEY_REUSED).
 *
 * Every value here is the service's POST-normalization value (resolved Branch and Order type,
 * validated/trimmed customer text, E.164 phone), never the raw body, so cosmetic differences the
 * Backend already normalizes away never cause a false conflict.
 *
 * Deliberately EXCLUDED (a genuine retry may legitimately change them):
 * - prices / totals of any kind and `expectedTotal`: a retry after a catalog price or discount
 *   change, or after a PRICE_CHANGED reconfirmation with a new `expectedTotal`, is the SAME cart;
 * - `locale`: display language only (a retry after an EN/AR switch must replay);
 * - `dryRun` and `clientRequestId` itself.
 */
export interface OrderRequestIdentity {
  qrCodeId: string;
  branchId: string;
  orderType: OrderType;
  channel: 'APP' | 'WHATSAPP';
  items: readonly OrderRequestIdentityItem[];
  customerName: string | null;
  customerPhone: string | null;
  customerNotes: string | null;
  deliveryZoneId: string | null;
  deliveryAddress: string | null;
  deliveryBuilding: string | null;
  deliveryFloor: string | null;
  deliveryApartment: string | null;
  deliveryLandmark: string | null;
}

export interface OrderRequestIdentityItem {
  productId?: string;
  offerId?: string;
  offerChoices?: readonly {
    slotId: string;
    optionId: string;
    quantity: number;
  }[];
  quantity: number;
  modifierOptionIds?: readonly string[];
  variantId?: string;
}

/**
 * Bump (and add a new canonicalizer) only when the material identity changes. Older versions
 * stay in `CANONICALIZERS` so a retry spanning a deploy still matches the stored fingerprint.
 */
export const ORDER_REQUEST_FINGERPRINT_VERSION = 'v1';

/** Plain code-unit ordering: deterministic across runtimes and locales (unlike localeCompare). */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * v1 canonical string. Item order, modifier order and offer-choice order never matter (sorted);
 * duplicates are KEPT, never merged or deduplicated: the service already refuses duplicate lines
 * and duplicate modifier options before this runs, so a payload with duplicates is simply a
 * different request than its merged form. Key order is fixed by construction (arrays/literals).
 */
function canonicalV1(identity: OrderRequestIdentity): string {
  const items = identity.items
    .map((item) =>
      JSON.stringify([
        item.productId ?? null,
        item.offerId ?? null,
        item.variantId ?? null,
        [...(item.modifierOptionIds ?? [])].sort(byCodeUnit),
        (item.offerChoices ?? [])
          .map((choice) =>
            JSON.stringify([choice.slotId, choice.optionId, choice.quantity]),
          )
          .sort(byCodeUnit),
        item.quantity,
      ]),
    )
    .sort(byCodeUnit);
  return `v1:${JSON.stringify([
    identity.qrCodeId,
    identity.branchId,
    identity.orderType,
    identity.channel,
    [identity.customerName, identity.customerPhone, identity.customerNotes],
    [
      identity.deliveryZoneId,
      identity.deliveryAddress,
      identity.deliveryBuilding,
      identity.deliveryFloor,
      identity.deliveryApartment,
      identity.deliveryLandmark,
    ],
    items,
  ])}`;
}

const CANONICALIZERS: Readonly<
  Record<string, (identity: OrderRequestIdentity) => string>
> = {
  v1: canonicalV1,
};

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** The versioned canonical string that is hashed (exported for tests; never stored or logged). */
export function canonicalOrderRequest(
  identity: OrderRequestIdentity,
  version: string = ORDER_REQUEST_FINGERPRINT_VERSION,
): string {
  const canonicalize = CANONICALIZERS[version];
  if (!canonicalize)
    throw new Error(`Unknown order request fingerprint version: ${version}`);
  return canonicalize(identity);
}

/** What is stored on a new Order: 64 lowercase hex chars, the hash only (#81: no raw request data). */
export function orderRequestFingerprint(
  identity: OrderRequestIdentity,
): string {
  return sha256Hex(canonicalOrderRequest(identity));
}

/**
 * True when a stored fingerprint describes this same material request. `null` (an Order created
 * before fingerprints existed) is treated as a match: legacy rows keep the old lenient replay.
 * The hash does not reveal its version, so the request is compared under every known version.
 */
export function matchesStoredOrderRequestFingerprint(
  stored: string | null | undefined,
  identity: OrderRequestIdentity,
): boolean {
  if (stored === null || stored === undefined) return true;
  return Object.keys(CANONICALIZERS).some(
    (version) => sha256Hex(canonicalOrderRequest(identity, version)) === stored,
  );
}
