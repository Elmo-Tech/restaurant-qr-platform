'use client';

import { memo } from 'react';
import { DiscountedPrice } from '../../../../components/guest/DiscountedPrice';
import { Price } from '../../../../components/guest/Price';
import { resolveAssetUrl } from '../../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../../lib/public-menu/copy';
import { toMinorUnits } from '../../../../lib/public-menu/money';
import { currencyLabel, formatAmount } from '../../../../lib/public-menu/price-format';
import { perKiloPrice } from '../../../../lib/public-menu/meat-lovers-weight';
import type { PublicMenuProduct } from '../../../../lib/public-menu/types';
import { VerdeImage as MeatLoversImage } from '../verde/VerdeImage';
import { MeatLoversPlaceholder } from './MeatLoversArt';

/**
 * One cut of the Meat Lovers menu. A cut sold by weight shows its per-kilo price (the 1 kg size, as sent by the
 * Backend) and opens the product sheet to pick a weight; any other product shows its normal price. A cut without a
 * photo gets the built-in artwork instead of someone else's picture. Prices, discounts and availability come straight
 * from the shared Guest menu data; no money arithmetic happens here.
 */
function MeatLoversCardImpl({
  product,
  index,
  sectionLabel,
  categoryName,
  currency,
  locale,
  copy,
  canOrder,
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
  /** 1-based position inside its section (the small "CUT 01" label). */
  index: number;
  /** The section's small label (English tag or its name). */
  sectionLabel: string;
  /** The section name, shown as the tag on the photo. */
  categoryName: string;
  currency: string;
  locale: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
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
  const byWeight = perKiloPrice(product);
  const needsChoice = product.modifierGroups.length > 0 || sizes.length > 0;
  const isSoldOut = product.availability === 'SOLD_OUT';
  const interactive = canOrder && !isSoldOut;
  const showStepper = interactive && !needsChoice && simpleQuantity > 0;
  // Without a 1 kg size (a product the Restaurant added later) the cheapest size is shown as "from".
  const cheapest =
    !byWeight && sizes.length > 0
      ? sizes.reduce((best, size) => (toMinorUnits(size.discountedPrice ?? size.price) < toMinorUnits(best.discountedPrice ?? best.price) ? size : best))
      : null;
  const shownOriginal = byWeight ? byWeight.price : cheapest ? cheapest.price : product.basePrice;
  const shownCurrent = byWeight
    ? (byWeight.discountedPrice ?? byWeight.price)
    : cheapest
      ? (cheapest.discountedPrice ?? cheapest.price)
      : (product.discount?.discountedPrice ?? product.basePrice);
  const discounted = !isSoldOut && shownCurrent !== shownOriginal;
  const unit = currencyLabel(currency, locale);
  const tag = isSoldOut ? copy.soldOut : product.featured ? copy.featured : categoryName;

  return (
    <article className={`ml-card${isSoldOut ? ' is-soldout' : ''}`}>
      <div className="ml-frame">
        <button type="button" className="ml-media" onClick={() => interactive && onOpen(product)} tabIndex={-1} aria-hidden="true">
          <MeatLoversImage src={imageUrl} fallback={<MeatLoversPlaceholder />} />
          <span className="ml-shade" />
        </button>
        {tag ? <span className={`ml-tag${isSoldOut ? ' is-soldout' : ''}`}><bdi>{tag}</bdi></span> : null}
        {interactive ? (
          showStepper ? (
            <div className="ml-stepper" role="group" aria-label={product.name}>
              <button type="button" onClick={() => onDecrement(product.id)} aria-label={simpleQuantity <= 1 ? copy.removeAria(product.name) : copy.decreaseAria(product.name)}>−</button>
              <span aria-live="polite">{simpleQuantity}</span>
              <button type="button" onClick={() => onIncrement(product.id)} aria-label={copy.increaseAria(product.name)}>+</button>
            </div>
          ) : (
            <button type="button" className="ml-add" onClick={() => (needsChoice ? onOpen(product) : onQuickAdd(product))} aria-label={byWeight ? copy.meatLoversChooseWeightAria(product.name) : copy.addAria(product.name)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              {totalQuantity > 0 ? (
                <span className="ml-add-count">
                  {totalQuantity}
                  <span className="sr-only"> · {copy.inOrderCount(totalQuantity)}</span>
                </span>
              ) : null}
            </button>
          )
        ) : null}
      </div>
      <button
        type="button"
        className={`ml-fav${isFavorite ? ' is-favorite' : ''}`}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? copy.meatLoversFavoriteRemove(product.name) : copy.meatLoversFavoriteAdd(product.name)}
        onClick={() => onToggleFavorite(product.id)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-9-5.5-9-11.7c0-4.8 5.8-7 9-2.3 3.2-4.7 9-2.5 9 2.3C21 15.5 12 21 12 21Z" /></svg>
      </button>

      <div className="ml-info">
        <div className="ml-no" dir="ltr"><span>CUT {String(index).padStart(2, '0')}</span><span>{sectionLabel}</span></div>
        <h4 className="ml-name">
          {interactive ? (
            <button type="button" data-open onClick={() => onOpen(product)}><bdi>{product.name}</bdi></button>
          ) : (
            <bdi>{product.name}</bdi>
          )}
        </h4>
        {product.description ? <p className="ml-desc" dir="auto">{product.description}</p> : null}
        <div className="ml-bottom">
          <div className="ml-price">
            {isSoldOut ? (
              <span className="ml-unavailable">{copy.unavailableNow}</span>
            ) : (
              <>
                {cheapest ? <span className="ml-from">{copy.fromPrice}</span> : null}
                {discounted ? (
                  <DiscountedPrice
                    original={shownOriginal}
                    current={shownCurrent}
                    discounted
                    badge={byWeight || !cheapest ? product.discount : null}
                    currency={currency}
                    copy={copy}
                    className="ml-amount"
                    currencyClassName="ml-unit"
                    originalClassName="ml-was"
                  />
                ) : byWeight ? (
                  <bdi className="ml-per-kilo"><strong dir="ltr">{formatAmount(shownCurrent)}</strong><span>{copy.meatLoversPerKg(unit)}</span></bdi>
                ) : (
                  <Price amount={shownCurrent} currency={currency} className="ml-amount" currencyClassName="ml-unit" />
                )}
                {discounted && byWeight ? <span className="ml-per-kilo-note">{copy.meatLoversPerKg(unit)}</span> : null}
              </>
            )}
          </div>
          {interactive ? (
            <button type="button" className="ml-quick" onClick={() => (needsChoice ? onOpen(product) : onQuickAdd(product))}>
              {byWeight ? copy.meatLoversChooseWeight : copy.meatLoversChoose}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export const MeatLoversCard = memo(MeatLoversCardImpl);
