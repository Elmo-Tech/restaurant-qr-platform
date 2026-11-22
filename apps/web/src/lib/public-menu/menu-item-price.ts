import { toMinorUnits } from './money.ts';
import type { PublicMenuProduct, PublicMenuVariant } from './types';

/** Menu presentation only. Never use this to price a cart line or submit an expected total. */
export function menuItemPrice(
  product: PublicMenuProduct,
  size: Pick<PublicMenuVariant, 'price' | 'discountedPrice' | 'itemPromotion'> | null = null,
  allowPreviewPrice = true,
) {
  const original = size ? size.price : product.basePrice;
  const soldOut = product.availability === 'SOLD_OUT';
  const usesPromotions = product.itemPromotion !== undefined;
  if (usesPromotions) {
    const promotion = soldOut ? null : (size ? size.itemPromotion : product.itemPromotion) ?? null;
    const previewPrice = allowPreviewPrice && promotion?.scope === 'PRODUCT' ? promotion.previewPrice : null;
    return {
      original,
      current: previewPrice ?? original,
      discounted: previewPrice !== null,
      preview: previewPrice !== null,
      badge: null,
      promotion,
    };
  }

  const legacyPrice = size ? size.discountedPrice : product.discount?.discountedPrice;
  const discounted = !soldOut && legacyPrice != null;
  return {
    original,
    current: legacyPrice ?? original,
    discounted,
    preview: false,
    badge: discounted ? product.discount : null,
    promotion: null,
  };
}

/** Unified promos keep "From" anchored to the lowest list price, not the greatest potential saving. */
export function cheapestMenuSize(product: PublicMenuProduct): PublicMenuVariant | null {
  const sizes = product.variants ?? [];
  if (sizes.length === 0) return null;
  const priceOf = (size: PublicMenuVariant) => toMinorUnits(menuItemPrice(product, size, false).current);
  return sizes.reduce((best, size) => priceOf(size) < priceOf(best) ? size : best);
}
