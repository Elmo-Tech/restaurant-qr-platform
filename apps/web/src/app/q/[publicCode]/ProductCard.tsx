'use client';

import { memo, useState } from 'react';
import { DishFallback } from '../../../components/guest/DishFallback';
import { GuestIconPlus } from '../../../components/guest/icons';
import { DiscountedPrice } from '../../../components/guest/DiscountedPrice';
import { Stepper } from '../../../components/guest/Stepper';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { toMinorUnits } from '../../../lib/public-menu/money';
import type { PublicMenuProduct } from '../../../lib/public-menu/types';

/**
 * FT-13B product card -- one component, two layouts:
 *
 * - Phone: a horizontal card, 118px media on the start side, name, a two-line description,
 *   the price and an "Add" pill.
 * - `md` and up: a vertical card with a 200px media block on top; it lifts and the photo
 *   zooms slightly on hover (both disabled under reduced motion).
 *
 * The whole card opens the product sheet through a stretched button on the name (one real,
 * labelled control -- not a clickable div); the add pill/stepper sits above it. In the
 * order: a simple product swaps the pill for a saffron stepper; a product with modifiers
 * keeps the pill, shows a quantity badge, and always opens the sheet (one product can have
 * several cart lines). No photo -> the shared dish fallback tile. Sold out -> a black tag,
 * greyed media, "Unavailable now" and no control at all.
 */
function ProductCardImpl({
  product,
  currency,
  copy,
  canOrder,
  simpleQuantity,
  totalQuantity,
  onOpen,
  onQuickAdd,
  onIncrement,
  onDecrement,
  compact = false,
  previewImageUrl = null,
}: {
  /**
   * Staff product preview only: render the phone layout whatever the viewport is
   * (every `md:` variant is dropped), and use a local image URL for an image that
   * is not uploaded yet. Both are inert in the Guest Menu.
   */
  compact?: boolean;
  previewImageUrl?: string | null;
  product: PublicMenuProduct;
  currency: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
  /** Quantity of the no-selection line (only meaningful for a product without Modifier Groups). */
  simpleQuantity: number;
  /** Quantity across every line of this product (different selections are different lines). */
  totalQuantity: number;
  onOpen: (product: PublicMenuProduct) => void;
  onQuickAdd: (product: PublicMenuProduct) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
}) {
  const imageUrl = previewImageUrl ?? resolveAssetUrl(product.primaryImageAssetPath);
  const cx = (classes: string): string =>
    compact
      ? classes
          .split(/\s+/)
          .filter((token) => !token.startsWith('md:'))
          .join(' ')
      : classes;
  const [imageFailed, setImageFailed] = useState(false);
  const isSoldOut = product.availability === 'SOLD_OUT';
  const sizes = product.variants ?? [];
  const hasSizes = sizes.length > 0;
  // A product with sizes always opens its page: the guest must pick a size first.
  const hasModifiers = product.modifierGroups.length > 0 || hasSizes;
  // With sizes the card shows the cheapest final price, marked "From".
  const cheapest = hasSizes
    ? sizes.reduce((best, size) => {
        const price = (s: typeof size) => toMinorUnits(s.discountedPrice ?? s.price);
        return price(size) < price(best) ? size : best;
      })
    : null;
  const interactive = canOrder && !isSoldOut;
  const showStepper = interactive && !hasModifiers && simpleQuantity > 0;
  const showPhoto = imageUrl !== null && !imageFailed;
  const dimmed = isSoldOut ? 'opacity-50 grayscale' : '';
  // A discounted card gives the price lockup its own row and moves the Add control to a row
  // of its own below; a plain card keeps price and Add side by side.
  const discounted = (cheapest ? cheapest.discountedPrice !== null : product.discount !== null) && !isSoldOut;

  return (
    <article
      className={cx(`guest-anim-rise group relative flex gap-3.5 rounded-[22px] border border-g-line bg-g-surface p-3 md:flex-col md:gap-0 md:overflow-hidden md:rounded-[24px] md:p-0 md:transition-[transform,box-shadow] md:duration-300 has-[[data-open]:focus-visible]:outline-2 has-[[data-open]:focus-visible]:outline-offset-2 has-[[data-open]:focus-visible]:outline-g-accent-text ${
        interactive ? 'md:hover:-translate-y-[3px] md:hover:shadow-[var(--g-shadow)]' : ''
      }`)}
    >
      <div className={cx("relative size-[118px] shrink-0 overflow-hidden rounded-2xl md:size-auto md:h-[200px] md:w-full md:rounded-none")}>
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className={cx(`size-full object-cover transition-transform duration-500 ease-out md:group-hover:scale-105 ${dimmed}`)}
          />
        ) : (
          <DishFallback className={`size-full ${dimmed}`} iconClassName={cx("size-10 md:size-14")} />
        )}
        {isSoldOut ? (
          <span className={cx("absolute start-2 top-2 rounded-full bg-[#111] px-[9px] py-[3px] text-[11px] font-bold text-white md:start-3 md:top-3 md:px-[11px] md:py-1 md:text-xs")}>
            {copy.soldOut}
          </span>
        ) : product.featured ? (
          <span className={cx("absolute start-2 top-2 rounded-full bg-g-accent px-[9px] py-[3px] text-[11px] font-bold text-g-on-accent md:start-3 md:top-3 md:px-[11px] md:py-1 md:text-xs")}>
            {copy.featured}
          </span>
        ) : null}
      </div>

      <div className={cx("flex min-w-0 flex-1 flex-col gap-[5px] pt-0.5 md:gap-1.5 md:px-[18px] md:pb-[18px] md:pt-4")}>
        <h3
          className={cx(`text-[16.5px] font-bold leading-[1.4] md:text-[18px] ${
            isSoldOut ? 'text-g-text-2' : 'text-g-text'
          }`)}
        >
          {interactive ? (
            <button
              type="button"
              data-open
              onClick={() => onOpen(product)}
              className="text-start outline-none after:absolute after:inset-0 after:content-['']"
            >
              <bdi>{product.name}</bdi>
            </button>
          ) : (
            <bdi>{product.name}</bdi>
          )}
        </h3>

        {product.description ? (
          <p
            dir="auto"
            className={cx("line-clamp-2 text-[13px] leading-[1.65] text-g-text-2 md:text-sm")}
          >
            {product.description}
          </p>
        ) : null}

        <div
          className={`mt-auto pt-1.5 ${
            discounted ? 'flex flex-col gap-2.5' : 'flex items-center justify-between gap-2'
          }`}
        >
          <div className="min-w-0">
            {cheapest ? (
              <span className="block text-[11.5px] font-semibold text-g-text-3">{copy.fromPrice}</span>
            ) : null}
            <DiscountedPrice
              original={cheapest ? cheapest.price : product.basePrice}
              current={
                cheapest
                  ? (cheapest.discountedPrice ?? cheapest.price)
                  : product.discount
                    ? product.discount.discountedPrice
                    : product.basePrice
              }
              discounted={discounted}
              badge={discounted ? product.discount : null}
              currency={currency}
              copy={copy}
              className={cx(`g-num text-[20px] [font-weight:800] md:text-[22px] ${isSoldOut ? 'text-g-text-3' : 'text-g-price'}`)}
              currencyClassName={cx("text-[12px] font-semibold md:text-[13px]")}
              originalClassName={cx("g-num text-[13px] font-semibold text-g-text-3 md:text-sm")}
            />
          </div>
          {isSoldOut ? (
            <span className="text-[12.5px] font-semibold text-g-text-3">{copy.unavailableNow}</span>
          ) : interactive ? (
            <div className={`relative z-10 ${discounted ? 'self-end' : ''}`}>
              {showStepper ? (
                <Stepper
                  variant="accent"
                  value={simpleQuantity}
                  removesAtOne
                  decrementLabel={
                    simpleQuantity <= 1
                      ? copy.removeAria(product.name)
                      : copy.decreaseAria(product.name)
                  }
                  incrementLabel={copy.increaseAria(product.name)}
                  onDecrement={() => onDecrement(product.id)}
                  onIncrement={() => onIncrement(product.id)}
                  className="guest-anim-bump"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onQuickAdd(product)}
                  aria-label={copy.addAria(product.name)}
                  className={cx("group/add relative flex h-11 items-center gap-1.5 rounded-[22px] border border-g-accent bg-g-accent-soft px-4 text-sm font-bold text-g-text transition-colors hover:bg-g-accent hover:text-g-on-accent active:scale-95 md:px-[18px] md:text-[14.5px]")}
                >
                  <GuestIconPlus
                    className="size-4 text-g-accent group-hover/add:text-g-on-accent"
                    strokeWidth={2.8}
                  />
                  {copy.add}
                  {totalQuantity > 0 ? (
                    <span
                      key={totalQuantity}
                      className="g-num guest-anim-bump absolute -end-1.5 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-g-accent px-1 text-[11px] text-g-on-accent ring-2 ring-g-surface"
                    >
                      {totalQuantity}
                      <span className="sr-only"> · {copy.inOrderCount(totalQuantity)}</span>
                    </span>
                  ) : null}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export const ProductCard = memo(ProductCardImpl);
