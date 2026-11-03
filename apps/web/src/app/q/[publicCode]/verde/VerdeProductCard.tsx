'use client';

import { memo } from 'react';
import { DiscountedPrice } from '../../../../components/guest/DiscountedPrice';
import { Price } from '../../../../components/guest/Price';
import { VerdeImage } from './VerdeImage';
import { resolveAssetUrl } from '../../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../../lib/public-menu/copy';
import { toMinorUnits } from '../../../../lib/public-menu/money';
import { formatAmount } from '../../../../lib/public-menu/price-format';
import type { PublicMenuProduct } from '../../../../lib/public-menu/types';

const MAX_SIZE_CHIPS = 4;

/**
 * One dish of the VERDE menu: photo (or a brand-initial tile), category label, name, two-line description,
 * size chips, a "from" price and the add control. Pricing, sizes, discounts and availability come straight
 * from the shared Guest menu data; the "+" opens the product sheet whenever a choice is needed (sizes or
 * modifiers) and adds directly otherwise, exactly like the stock cards.
 */
function VerdeProductCardImpl({
  product,
  currency,
  copy,
  canOrder,
  categoryLabel,
  brandInitial,
  simpleQuantity,
  totalQuantity,
  onOpen,
  onQuickAdd,
  onIncrement,
  onDecrement,
}: {
  product: PublicMenuProduct;
  currency: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
  categoryLabel: string;
  brandInitial: string;
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
  const discounted =
    !isSoldOut && (cheapest ? cheapest.discountedPrice !== null : product.discount !== null);

  return (
    <article className={`v-dish${isSoldOut ? ' is-soldout' : ''}`}>
      <div className="v-dish-photo">
        <VerdeImage
          src={imageUrl}
          fallback={
            <span aria-hidden="true" className="v-dish-initial" dir="auto">
              {brandInitial}
            </span>
          }
        />
        {isSoldOut ? <span className="v-dish-tag">{copy.soldOut}</span> : product.featured ? <span className="v-dish-tag is-featured">{copy.featured}</span> : null}
      </div>

      <div className="v-dish-body">
        <span className="v-dish-category" dir="auto">
          <bdi>{categoryLabel}</bdi>
        </span>
        <h3 className="v-dish-name">
          {interactive ? (
            <button type="button" data-open className="v-dish-open" onClick={() => onOpen(product)}>
              <bdi>{product.name}</bdi>
            </button>
          ) : (
            <bdi>{product.name}</bdi>
          )}
        </h3>
        {product.description ? (
          <p className="v-dish-desc" dir="auto">
            {product.description}
          </p>
        ) : null}

        {hasSizes && sizes.length >= 2 ? (
          <ul className="v-dish-sizes">
            {sizes.slice(0, MAX_SIZE_CHIPS).map((size) => (
              <li key={size.id}>
                <bdi>{size.name}</bdi>
                <span aria-hidden="true"> · </span>
                <bdi dir="ltr" className="v-size-price">
                  {formatAmount(size.discountedPrice ?? size.price)}
                </bdi>
              </li>
            ))}
            {sizes.length > MAX_SIZE_CHIPS ? <li className="is-more">{copy.moreSizes(sizes.length - MAX_SIZE_CHIPS)}</li> : null}
          </ul>
        ) : null}

        <div className="v-dish-bottom">
          <div className="v-dish-price">
            {isSoldOut ? (
              <span className="v-dish-unavailable">{copy.unavailableNow}</span>
            ) : (
              <>
                <small>{cheapest ? copy.fromPrice : ' '}</small>
                {discounted ? (
                  <DiscountedPrice
                    original={cheapest ? cheapest.price : product.basePrice}
                    current={cheapest ? (cheapest.discountedPrice ?? cheapest.price) : (product.discount?.discountedPrice ?? product.basePrice)}
                    discounted
                    badge={product.discount}
                    currency={currency}
                    copy={copy}
                    className="v-price-now"
                    currencyClassName="v-price-unit"
                    originalClassName="v-price-was"
                  />
                ) : (
                  <Price
                    amount={cheapest ? (cheapest.discountedPrice ?? cheapest.price) : product.basePrice}
                    currency={currency}
                    className="v-price-now"
                    currencyClassName="v-price-unit"
                  />
                )}
              </>
            )}
          </div>

          {interactive ? (
            showStepper ? (
              <div className="v-stepper" role="group" aria-label={product.name}>
                <button
                  type="button"
                  onClick={() => onDecrement(product.id)}
                  aria-label={simpleQuantity <= 1 ? copy.removeAria(product.name) : copy.decreaseAria(product.name)}
                >
                  −
                </button>
                <span aria-live="polite">{simpleQuantity}</span>
                <button type="button" onClick={() => onIncrement(product.id)} aria-label={copy.increaseAria(product.name)}>
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="v-add"
                onClick={() => (needsChoice ? onOpen(product) : onQuickAdd(product))}
                aria-label={copy.addAria(product.name)}
              >
                <span aria-hidden="true">+</span>
                {totalQuantity > 0 ? (
                  <span className="v-add-count">
                    {totalQuantity}
                    <span className="sr-only"> · {copy.inOrderCount(totalQuantity)}</span>
                  </span>
                ) : null}
              </button>
            )
          ) : null}
        </div>
      </div>
    </article>
  );
}

export const VerdeProductCard = memo(VerdeProductCardImpl);
