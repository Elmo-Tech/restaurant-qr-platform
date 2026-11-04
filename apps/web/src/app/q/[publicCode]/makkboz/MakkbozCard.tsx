'use client';

import { memo } from 'react';
import { DiscountedPrice } from '../../../../components/guest/DiscountedPrice';
import { Price } from '../../../../components/guest/Price';
import { resolveAssetUrl } from '../../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../../lib/public-menu/copy';
import { toMinorUnits } from '../../../../lib/public-menu/money';
import { formatAmount } from '../../../../lib/public-menu/price-format';
import type { PublicMenuProduct } from '../../../../lib/public-menu/types';
import { VerdeImage as MakkbozImage } from '../verde/VerdeImage';
import { MakkbozOrnament } from './MakkbozArt';

const MAX_SIZE_CHIPS = 4;

/**
 * One dish of the Makkboz menu. A dish with a photo is a photo card; a dish without one (most of this menu) is a
 * clean text card, so nothing looks unfinished and no unrelated photo is borrowed. Prices, sizes, discounts and
 * availability come straight from the shared Guest menu data; the "+" opens the product sheet whenever a choice is
 * needed (sizes or options) and adds directly otherwise.
 */
function MakkbozCardImpl({
  product,
  currency,
  copy,
  canOrder,
  categoryLabel,
  isFavorite,
  simpleQuantity,
  totalQuantity,
  onToggleFavorite,
  onOpen,
  onQuickAdd,
  onIncrement,
  onDecrement,
}: {
  product: PublicMenuProduct;
  currency: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
  /** Shown above the name only when results come from different sections (search, favorites). */
  categoryLabel: string | null;
  isFavorite: boolean;
  simpleQuantity: number;
  totalQuantity: number;
  onToggleFavorite: (productId: string) => void;
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
  const tag = isSoldOut ? copy.soldOut : product.featured ? copy.featured : null;

  return (
    <article className={`m-card${imageUrl ? ' has-photo' : ''}${isSoldOut ? ' is-soldout' : ''}`}>
      <div className="m-card-media">
        {imageUrl ? (
          <button type="button" className="m-card-photo" onClick={() => interactive && onOpen(product)} tabIndex={-1} aria-hidden="true">
            <MakkbozImage src={imageUrl} fallback={<MakkbozOrnament />} />
          </button>
        ) : (
          <span className="m-card-ornament" aria-hidden="true"><MakkbozOrnament /></span>
        )}
        <button
          type="button"
          className={`m-fav${isFavorite ? ' is-favorite' : ''}`}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? copy.makkbozFavoriteRemove(product.name) : copy.makkbozFavoriteAdd(product.name)}
          onClick={() => onToggleFavorite(product.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.5c0 5.6-8.8 11.2-8.8 11.2S3.2 14.1 3.2 8.5A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.8 1.9Z" /></svg>
        </button>
        {tag ? <span className={`m-card-tag${isSoldOut ? ' is-soldout' : ''}`}>{tag}</span> : null}
      </div>

      <div className="m-card-body">
        {categoryLabel ? <span className="m-card-category"><bdi>{categoryLabel}</bdi></span> : null}
        <h4 className="m-card-title">
          {interactive ? (
            <button type="button" data-open className="m-card-open" onClick={() => onOpen(product)}>
              <bdi>{product.name}</bdi>
            </button>
          ) : (
            <bdi>{product.name}</bdi>
          )}
        </h4>
        {product.description ? <p className="m-card-desc" dir="auto">{product.description}</p> : null}
        {hasSizes && sizes.length >= 2 ? (
          <ul className="m-card-sizes">
            {sizes.slice(0, MAX_SIZE_CHIPS).map((size) => (
              <li key={size.id}>
                <bdi>{size.name}</bdi>
                <bdi dir="ltr" className="m-size-price">{formatAmount(size.discountedPrice ?? size.price)}</bdi>
              </li>
            ))}
            {sizes.length > MAX_SIZE_CHIPS ? <li className="is-more">{copy.moreSizes(sizes.length - MAX_SIZE_CHIPS)}</li> : null}
          </ul>
        ) : null}

        <div className="m-card-footer">
          <div className="m-card-price">
            {isSoldOut ? (
              <span className="m-unavailable">{copy.unavailableNow}</span>
            ) : (
              <>
                <span className="m-price-unit-label">{cheapest ? copy.fromPrice : ' '}</span>
                {discounted ? (
                  <DiscountedPrice
                    original={cheapest ? cheapest.price : product.basePrice}
                    current={cheapest ? (cheapest.discountedPrice ?? cheapest.price) : (product.discount?.discountedPrice ?? product.basePrice)}
                    discounted
                    badge={product.discount}
                    currency={currency}
                    copy={copy}
                    className="m-price"
                    currencyClassName="m-price-unit"
                    originalClassName="m-price-was"
                  />
                ) : (
                  <Price amount={cheapest ? (cheapest.discountedPrice ?? cheapest.price) : product.basePrice} currency={currency} className="m-price" currencyClassName="m-price-unit" />
                )}
              </>
            )}
          </div>
          {interactive ? (
            showStepper ? (
              <div className="m-stepper" role="group" aria-label={product.name}>
                <button type="button" onClick={() => onDecrement(product.id)} aria-label={simpleQuantity <= 1 ? copy.removeAria(product.name) : copy.decreaseAria(product.name)}>−</button>
                <span aria-live="polite">{simpleQuantity}</span>
                <button type="button" onClick={() => onIncrement(product.id)} aria-label={copy.increaseAria(product.name)}>+</button>
              </div>
            ) : (
              <button type="button" className="m-add" onClick={() => (needsChoice ? onOpen(product) : onQuickAdd(product))} aria-label={copy.addAria(product.name)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {totalQuantity > 0 ? (
                  <span className="m-add-count">
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

export const MakkbozCard = memo(MakkbozCardImpl);
