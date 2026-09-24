/**
 * FT-5 critical fix: keeps ONE stable `clientRequestId` for one unchanged
 * Cart submission payload across retries -- the previous implementation
 * generated a brand-new id inside every `handlePlaceOrder()` call, so a
 * Guest whose browser lost the response to a network failure and tapped
 * "Place Order" again would submit a genuinely different idempotency key,
 * defeating the Backend's `qrCodeId + clientRequestId` uniqueness entirely
 * and risking a duplicate Order.
 *
 * Persisted to `localStorage` keyed by `publicCode`, deliberately SEPARATE
 * from the Cart identity record (`cart-storage.ts`) -- this is "what did we
 * last attempt to submit", not "what is currently in the Cart"; the two
 * happen to look similar but serve different lifecycles (a pending attempt
 * is cleared on success or on any Cart change, the Cart itself is cleared
 * only on success). Never stores price/name/total -- exactly like
 * `cart-storage.ts`, this is identity only, never authoritative financial
 * state.
 */
export interface PendingOrderItem {
  productId: string;
  quantity: number;
  /** FT-6A: part of the payload identity -- a Cart mutation that only changes selected Options (not productId/quantity) must still count as "changed", generating a fresh id rather than reusing a stale one. */
  modifierOptionIds: string[];
}

/**
 * FT-7/FT-8: the GENERIC-QR checkout state that is part of one submission's
 * identity (always `null` for a TABLE QR, whose behavior stays exactly
 * FT-5). Fulfillment mode, Branch, delivery zone, customer details and every
 * address field are ALL part of identity: changing any of them must never
 * reuse a previous attempt's `clientRequestId`. Values are compared trimmed.
 * Pickup attempts carry empty delivery fields.
 */
export interface PendingOrderCheckout {
  fulfillment: 'PICKUP' | 'DELIVERY';
  branchId: string | null;
  customerName: string;
  customerPhone: string;
  customerNotes: string;
  deliveryZoneId: string | null;
  deliveryAddress: string;
  deliveryBuilding: string;
  deliveryFloor: string;
  deliveryApartment: string;
  deliveryLandmark: string;
}

export interface PendingOrderAttempt {
  clientRequestId: string;
  items: PendingOrderItem[];
  checkout: PendingOrderCheckout | null;
}

const CHECKOUT_STRING_FIELDS = [
  'customerName',
  'customerPhone',
  'customerNotes',
  'deliveryAddress',
  'deliveryBuilding',
  'deliveryFloor',
  'deliveryApartment',
  'deliveryLandmark',
] as const;

function normalizeCheckout(checkout: PendingOrderCheckout | null): PendingOrderCheckout | null {
  if (checkout === null) return null;
  return {
    fulfillment: checkout.fulfillment,
    branchId: checkout.branchId,
    customerName: checkout.customerName.trim(),
    customerPhone: checkout.customerPhone.trim(),
    customerNotes: checkout.customerNotes.trim(),
    deliveryZoneId: checkout.deliveryZoneId,
    deliveryAddress: checkout.deliveryAddress.trim(),
    deliveryBuilding: checkout.deliveryBuilding.trim(),
    deliveryFloor: checkout.deliveryFloor.trim(),
    deliveryApartment: checkout.deliveryApartment.trim(),
    deliveryLandmark: checkout.deliveryLandmark.trim(),
  };
}

/** True when two checkout states describe the SAME submission (normalized). Exported so the identity rule is one shared, testable function. */
export function checkoutsEqual(a: PendingOrderCheckout | null, b: PendingOrderCheckout | null): boolean {
  const left = normalizeCheckout(a);
  const right = normalizeCheckout(b);
  if (left === null || right === null) return left === right;
  return (
    left.fulfillment === right.fulfillment &&
    left.branchId === right.branchId &&
    left.deliveryZoneId === right.deliveryZoneId &&
    CHECKOUT_STRING_FIELDS.every((field) => left[field] === right[field])
  );
}

function isPendingCheckout(value: unknown): value is PendingOrderCheckout {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PendingOrderCheckout>;
  return (
    (candidate.fulfillment === 'PICKUP' || candidate.fulfillment === 'DELIVERY') &&
    (candidate.branchId === null || typeof candidate.branchId === 'string') &&
    (candidate.deliveryZoneId === null || typeof candidate.deliveryZoneId === 'string') &&
    CHECKOUT_STRING_FIELDS.every((field) => typeof candidate[field] === 'string')
  );
}

/** A checkout stored by FT-7 (Pickup only) has no fulfillment/delivery fields: it was a Pickup attempt with empty delivery fields. */
function withCheckoutDefaults(checkout: unknown): unknown {
  if (typeof checkout !== 'object' || checkout === null) return checkout;
  const candidate = checkout as Record<string, unknown>;
  if ('fulfillment' in candidate) return checkout;
  return {
    ...candidate,
    fulfillment: 'PICKUP',
    deliveryZoneId: null,
    deliveryAddress: '',
    deliveryBuilding: '',
    deliveryFloor: '',
    deliveryApartment: '',
    deliveryLandmark: '',
  };
}

function storageKey(publicCode: string): string {
  return `qr-cart-pending:${publicCode}`;
}

/** Deterministic canonical form for comparison -- sorted by `productId`+selection key so item ORDER never causes a false "changed" result. Two lines sharing a `productId` but with DIFFERENT `modifierOptionIds` are kept as separate entries and sorted by their full line identity (FT-6A: Cart identity includes selections, not only productId). */
function canonicalizeItems(items: PendingOrderItem[]): PendingOrderItem[] {
  return items
    .map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      modifierOptionIds: [...item.modifierOptionIds].sort(),
    }))
    .sort((a, b) =>
      `${a.productId}::${a.modifierOptionIds.join(',')}`.localeCompare(
        `${b.productId}::${b.modifierOptionIds.join(',')}`,
      ),
    );
}

function itemsEqual(a: PendingOrderItem[], b: PendingOrderItem[]): boolean {
  const canonicalA = canonicalizeItems(a);
  const canonicalB = canonicalizeItems(b);
  if (canonicalA.length !== canonicalB.length) return false;
  return canonicalA.every((item, index) => {
    const other = canonicalB[index];
    return (
      item.productId === other.productId &&
      item.quantity === other.quantity &&
      item.modifierOptionIds.length === other.modifierOptionIds.length &&
      item.modifierOptionIds.every((id, i) => id === other.modifierOptionIds[i])
    );
  });
}

function isPendingOrderItem(value: unknown): value is PendingOrderItem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PendingOrderItem>;
  return (
    typeof candidate.productId === 'string' &&
    Number.isInteger(candidate.quantity) &&
    Array.isArray(candidate.modifierOptionIds) &&
    candidate.modifierOptionIds.every((id) => typeof id === 'string')
  );
}

function isPendingOrderAttempt(value: unknown): value is PendingOrderAttempt {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PendingOrderAttempt>;
  return (
    typeof candidate.clientRequestId === 'string' &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isPendingOrderItem) &&
    (candidate.checkout === null || isPendingCheckout(candidate.checkout))
  );
}

/** Never throws -- a private window, cleared storage, or malformed JSON all safely resolve to "no pending attempt" rather than crashing Place Order. */
export function loadPendingAttempt(publicCode: string): PendingOrderAttempt | null {
  try {
    const raw = window.localStorage.getItem(storageKey(publicCode));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !('checkout' in parsed)) {
      // A pre-FT-7 stored attempt has no checkout state: it was a TABLE attempt.
      (parsed as { checkout: null }).checkout = null;
    } else if (typeof parsed === 'object' && parsed !== null) {
      (parsed as { checkout: unknown }).checkout = withCheckoutDefaults(
        (parsed as { checkout: unknown }).checkout,
      );
    }
    return isPendingOrderAttempt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function savePendingAttempt(publicCode: string, attempt: PendingOrderAttempt): void {
  try {
    window.localStorage.setItem(storageKey(publicCode), JSON.stringify(attempt));
  } catch {
    // Per-viewer convenience only -- see module docstring's Cart-storage
    // cross-reference. A failed persist here just means a later retry
    // (after this same failed submit) will generate a fresh id instead of
    // reusing one -- never a duplicate Order, since the Backend's own
    // uniqueness constraint is the actual safety net either way.
  }
}

/** Called on success, or whenever the Cart no longer matches the persisted attempt -- never throws. */
export function clearPendingAttempt(publicCode: string): void {
  try {
    window.localStorage.removeItem(storageKey(publicCode));
  } catch {
    // See `savePendingAttempt`.
  }
}

/** True when a persisted pending attempt exists AND its items AND Pickup checkout state (`null` for TABLE) exactly match -- a pure read, never generates or persists anything. */
export function payloadMatchesPendingAttempt(
  publicCode: string,
  items: PendingOrderItem[],
  checkout: PendingOrderCheckout | null,
): boolean {
  const existing = loadPendingAttempt(publicCode);
  return (
    existing !== null &&
    itemsEqual(existing.items, items) &&
    checkoutsEqual(existing.checkout, checkout)
  );
}

/**
 * The one entry point `handlePlaceOrder` calls: reuses the persisted
 * attempt's `clientRequestId` when its items exactly match the Cart being
 * submitted right now (a genuine retry of the same unchanged payload,
 * including after a refresh or a language-switch navigation -- both are
 * real page (re)loads, so only `localStorage` survives them, never React
 * state); otherwise generates a fresh id via `generateId` and persists it
 * BEFORE the caller sends the request, so a lost response still has
 * something durable to retry against.
 */
export function resolveClientRequestId(
  publicCode: string,
  items: PendingOrderItem[],
  checkout: PendingOrderCheckout | null,
  generateId: () => string,
): string {
  const existing = loadPendingAttempt(publicCode);
  if (existing && itemsEqual(existing.items, items) && checkoutsEqual(existing.checkout, checkout)) {
    return existing.clientRequestId;
  }
  const clientRequestId = generateId();
  savePendingAttempt(publicCode, {
    clientRequestId,
    items: canonicalizeItems(items),
    checkout: normalizeCheckout(checkout),
  });
  return clientRequestId;
}
