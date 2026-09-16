/**
 * FT-5, Section 21: Cart IDENTITY only -- `productId` + `quantity`, never
 * price/name/security state -- persisted to `localStorage` keyed by
 * `publicCode` so it survives a language switch (a real navigation to
 * `?lang=`) and a normal page refresh. Every render re-resolves each stored
 * id against the CURRENT `PublicMenuData` the page just loaded (see
 * `PublicMenuView`'s `cartLines` computation) -- this file never caches a
 * name or price itself.
 */
export interface StoredCartItem {
  productId: string;
  quantity: number;
}

function storageKey(publicCode: string): string {
  return `qr-cart:${publicCode}`;
}

function isStoredCartItem(value: unknown): value is StoredCartItem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredCartItem>;
  return (
    typeof candidate.productId === 'string' &&
    Number.isInteger(candidate.quantity) &&
    (candidate.quantity as number) > 0
  );
}

/** Never throws -- a private window, cleared storage, or malformed JSON all safely resolve to an empty Cart rather than crashing the page. */
export function loadCart(publicCode: string): StoredCartItem[] {
  try {
    const raw = window.localStorage.getItem(storageKey(publicCode));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStoredCartItem) : [];
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
