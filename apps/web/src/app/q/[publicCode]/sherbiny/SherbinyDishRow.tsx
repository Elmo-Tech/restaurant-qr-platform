'use client';

import { memo } from 'react';
import { DiscountedPrice } from '../../../../components/guest/DiscountedPrice';
import { Price } from '../../../../components/guest/Price';
import { resolveAssetUrl } from '../../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../../lib/public-menu/copy';
import { toMinorUnits } from '../../../../lib/public-menu/money';
import { formatAmount } from '../../../../lib/public-menu/price-format';
import type { PublicMenuProduct } from '../../../../lib/public-menu/types';
import { VerdeImage as SherbinyImage } from '../verde/VerdeImage';

const MAX_SIZE_CHIPS = 4;

/**
 * One dish of the El Sherbiny menu list: its number, an optional photo, name, description or sizes, the "from"
 * price and the add control. A dish without a photo is a plain text row (most of this menu), so nothing looks
 * unfinished. Prices, sizes, discounts and availability come straight from the shared Guest menu data; the "+"
 * opens the product sheet whenever a choice is needed (sizes or options) and adds directly otherwise.
 */
function SherbinyDishRowImpl({
  product,
  number,
  currency,
  copy,
  canOrder,
  categoryLabel,
  simpleQuantity,
  totalQuantity,
  onOpen,
  onQuickAdd,
  onIncrement,
  onDecrement,
}: {
  product: PublicMenuProduct;
  number: number;
  currency: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
  /** Shown above the name while searching, so results from different sections stay recognisable. */
  categoryLabel: string | null;
  simpleQuantity: number;
  totalQuantity: number;
  onOpen: (product: PublicMenuProduct) => void;
  onQuickAdd: (product: PublicMenuProduct) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
}) {
  const imageUrl = resolveAssetUrl(product.primaryImageAssetPath);
  const sizes = product.variants ?? [];
  const hasSizes = sizes.length > 0;
  const needsChoice = product.modifierGroups.length > 0 || hasSizes;
  const isSoldOut = product.availability === 'SOLD_OUT';
  const interactive = canOrder && !isSoldOut;
  const showStepper = interactive && !needsChoice && simpleQuantity > 0;
  const cheapest = hasSizes
    ? sizes.reduce((best, size) => {
        const price = (s: typeof size) => toMinorUnits(s.discountedPrice ?? s.price);
        return price(size) < price(best) ? size : best;
      })
    : null;
  const discounted = !isSoldOut && (cheapest ? cheapest.discountedPrice !== null : product.discount !== null);

  return (
    <article className={`s-dish s-reveal${isSoldOut ? ' is-soldout' : ''}`}>
      <span className="s-dish-num" aria-hidden="true" dir="ltr">{String(number).padStart(2, '0')}</span>
      {imageUrl ? (
        <span className="s-dish-thumb" aria-hidden="true">
          <SherbinyImage src={imageUrl} fallback={null} />
        </span>
      ) : null}

      <div className="s-dish-copy">
        {categoryLabel ? <span className="s-dish-category"><bdi>{categoryLabel}</bdi></span> : null}
        <h4 className="s-dish-name">
          {interactive ? (
            <button type="button" data-open className="s-dish-open" onClick={() => onOpen(product)}>
              <bdi>{product.name}</bdi>
            </button>
          ) : (
            <bdi>{product.name}</bdi>
          )}
          {isSoldOut ? (
            <span className="s-dish-tag">{copy.soldOut}</span>
          ) : product.featured ? (
            <span className="s-dish-tag is-featured">{copy.featured}</span>
          ) : null}
        </h4>
        {product.description ? <p className="s-dish-desc" dir="auto">{product.description}</p> : null}
        {hasSizes && sizes.length >= 2 ? (
          <ul className="s-dish-sizes">
            {sizes.slice(0, MAX_SIZE_CHIPS).map((size) => (
              <li key={size.id}>
                <bdi>{size.name}</bdi>
                <span aria-hidden="true"> </span>
                <bdi dir="ltr" className="s-size-price">{formatAmount(size.discountedPrice ?? size.price)}</bdi>
              </li>
            ))}
            {sizes.length > MAX_SIZE_CHIPS ? <li className="is-more">{copy.moreSizes(sizes.length - MAX_SIZE_CHIPS)}</li> : null}
          </ul>
        ) : null}
      </div>

      <div className="s-dish-price">
        {isSoldOut ? (
          <span className="s-dish-unavailable">{copy.unavailableNow}</span>
        ) : (
          <>
            {cheapest ? <small>{copy.fromPrice}</small> : null}
            {discounted ? (
              <DiscountedPrice
                original={cheapest ? cheapest.price : product.basePrice}
                current={cheapest ? (cheapest.discountedPrice ?? cheapest.price) : (product.discount?.discountedPrice ?? product.basePrice)}
                discounted
                badge={product.discount}
                currency={currency}
                copy={copy}
                className="s-price-now"
                currencyClassName="s-price-unit"
                originalClassName="s-price-was"
              />
            ) : (
              <Price
                amount={cheapest ? (cheapest.discountedPrice ?? cheapest.price) : product.basePrice}
                currency={currency}
                className="s-price-now"
                currencyClassName="s-price-unit"
              />
            )}
          </>
        )}
      </div>

      {interactive ? (
        showStepper ? (
          <div className="s-stepper" role="group" aria-label={product.name}>
            <button type="button" onClick={() => onDecrement(product.id)} aria-label={simpleQuantity <= 1 ? copy.removeAria(product.name) : copy.decreaseAria(product.name)}>−</button>
            <span aria-live="polite">{simpleQuantity}</span>
            <button type="button" onClick={() => onIncrement(product.id)} aria-label={copy.increaseAria(product.name)}>+</button>
          </div>
        ) : (
          <button type="button" className="s-add" onClick={() => (needsChoice ? onOpen(product) : onQuickAdd(product))} aria-label={copy.addAria(product.name)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            {totalQuantity > 0 ? (
              <span className="s-add-count">
                {totalQuantity}
                <span className="sr-only"> · {copy.inOrderCount(totalQuantity)}</span>
              </span>
            ) : null}
          </button>
        )
      ) : (
        <span className="s-add-spacer" aria-hidden="true" />
      )}
    </article>
  );
}

export const SherbinyDishRow = memo(SherbinyDishRowImpl);
