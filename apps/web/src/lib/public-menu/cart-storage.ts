/**
 * FT-5, Section 21 (extended FT-6A): Cart IDENTITY only -- `productId` +
 * `quantity` + selected `modifierOptionIds`, never price/name/security
 * state -- persisted to `localStorage` keyed by `publicCode` so it survives
 * a language switch (a real navigation to `?lang=`) and a normal page
 * refresh. Every render re-resolves each stored id against the CURRENT
 * `PublicMenuData` the page just loaded (see `PublicMenuView`'s
 * `cartLines` computation) -- this file never caches a name or price
 * itself. `modifierOptionIds` makes two lines of the SAME Product with
 * DIFFERENT selections genuinely distinct entries in this array (e.g.
 * "Burger + Cheese" vs. "Burger + Bacon") -- `cartLineKey` is the shared
 * identity `PublicMenuView`/`CartPanel` use to tell lines apart.
 */
export interface StoredCartItem {
  productId: string;
  quantity: number;
  /** Canonical (sorted) order -- see `cartLineKey`. Empty for a Product with no Modifier Groups. */
  modifierOptionIds: string[];
}

function storageKey(publicCode: string): string {
  return `qr-cart:${publicCode}`;
}

/** Stable Cart-line identity: same Product AND the same exact set of selected Options. Sorted so submission order never matters. */
export function cartLineKey(productId: string, modifierOptionIds: string[]): string {
  return `${productId}::${[...modifierOptionIds].sort().join(',')}`;
}

function isStoredCartItem(value: unknown): value is StoredCartItem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredCartItem>;
  return (
    typeof candidate.productId === 'string' &&
    Number.isInteger(candidate.quantity) &&
    (candidate.quantity as number) > 0 &&
    (candidate.modifierOptionIds === undefined ||
      (Array.isArray(candidate.modifierOptionIds) &&
        candidate.modifierOptionIds.every((id) => typeof id === 'string')))
  );
}

/** Normalizes a validated-but-possibly-legacy stored row (from before FT-6A) to always carry a `modifierOptionIds` array. */
function normalizeStoredCartItem(item: StoredCartItem): StoredCartItem {
  return { ...item, modifierOptionIds: item.modifierOptionIds ?? [] };
}

/** Never throws -- a private window, cleared storage, or malformed JSON all safely resolve to an empty Cart rather than crashing the page. */
export function loadCart(publicCode: string): StoredCartItem[] {
  try {
    const raw = window.localStorage.getItem(storageKey(publicCode));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isStoredCartItem).map(normalizeStoredCartItem)
      : [];
  } catch {
    return [];
  }
}

/** Never throws -- a write failure (private window, quota) is a silent no-op, never a crashed Cart interaction. */
export function saveCart(publicCode: string, items: StoredCartItem[]): void {
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(storageKey(publicCode));
      return;
    }
    window.localStorage.setItem(storageKey(publicCode), JSON.stringify(items));
  } catch {
    // Per-viewer convenience only -- see module docstring.
  }
}
