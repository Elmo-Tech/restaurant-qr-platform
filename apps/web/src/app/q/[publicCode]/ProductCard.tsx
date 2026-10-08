'use client';

import { memo, useState } from 'react';
import { GuestIconPlus, GuestIconSliders, GuestIconStar } from '../../../components/guest/icons';
import { MonogramTile } from '../../../components/guest/MonogramTile';
import { Price } from '../../../components/guest/Price';
import { Stepper } from '../../../components/guest/Stepper';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { PublicMenuProduct } from '../../../lib/public-menu/types';

/**
 * FT-13A product card -- one component, two layouts:
 *
 * - Phone: a compact restaurant-style row (text on the start side, a square
 *   photo on the end side with the add control overlapping its corner).
 * - `sm` and up: a vertical card with a 4:3 photo on top.
 *
 * The whole card opens the product sheet through a stretched button on the
 * name (one real, labelled control -- not a clickable div); the add control sits
 * above it. A product with no photo gets a tinted monogram tile, never a
 * "missing image" icon. A sold-out product is visibly unavailable and offers no
 * control at all, so it cannot be ordered by accident.
 */
function ProductCardImpl({
  product,
  categoryId,
  currency,
  copy,
  canOrder,
  simpleQuantity,
  totalQuantity,
  onOpen,
  onQuickAdd,
  onIncrement,
  onDecrement,
}: {
  product: PublicMenuProduct;
  categoryId: string;
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
  const imageUrl = resolveAssetUrl(product.primaryImageAssetPath);
  const [imageFailed, setImageFailed] = useState(false);
  const isSoldOut = product.availability === 'SOLD_OUT';
  const hasModifiers = product.modifierGroups.length > 0;
  const interactive = canOrder && !isSoldOut;
  const showStepper = interactive && !hasModifiers && simpleQuantity > 0;
  const showPhoto = imageUrl !== null && !imageFailed;

  return (
    <article
      className={`guest-anim-rise group relative flex gap-3.5 p-3.5 sm:flex-col sm:gap-0 sm:rounded-2xl sm:border sm:border-guest-line sm:bg-guest-surface sm:p-0 sm:transition-[transform,box-shadow,border-color] sm:duration-300 has-[[data-open]:focus-visible]:outline-2 has-[[data-open]:focus-visible]:outline-offset-2 has-[[data-open]:focus-visible]:outline-guest-pine ${
        interactive
          ? 'sm:hover:-translate-y-0.5 sm:hover:border-guest-line-strong sm:hover:shadow-lg'
          : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col sm:order-2 sm:p-4">
        {product.featured && !isSoldOut ? (
          <span className="mb-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-guest-saffron-soft px-2 py-0.5 text-[11px] font-bold text-guest-warning-ink">
            <GuestIconStar className="size-3 text-guest-saffron" />
            {copy.featured}
          </span>
        ) : null}

        <h3
          dir="auto"
          className={`font-guest-display text-[1.15rem] font-bold leading-snug ${
            isSoldOut ? 'text-guest-muted' : 'text-guest-ink'
          }`}
        >
          {interactive ? (
            <button
              type="button"
              data-open
              onClick={() => onOpen(product)}
              className="text-start outline-none after:absolute after:inset-0 after:content-['']"
            >
              {product.name}
            </button>
          ) : (
            product.name
          )}
        </h3>

        {product.description ? (
          <p dir="auto" className="mt-1 line-clamp-2 text-[0.9rem] leading-snug text-guest-muted">
            {product.description}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">
          <Price
            amount={product.basePrice}
            currency={currency}
            className={`font-guest-display text-lg font-bold ${
              isSoldOut ? 'text-guest-muted' : 'text-guest-ink'
            }`}
          />
          {isSoldOut ? (
            <span className="inline-flex items-center rounded-full bg-guest-danger-soft px-2.5 py-0.5 text-xs font-bold text-guest-danger">
              {copy.soldOut}
            </span>
          ) : hasModifiers && canOrder ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-guest-muted">
              <GuestIconSliders className="size-3.5" />
              {copy.customizable}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className={`pointer-events-none relative size-[104px] shrink-0 sm:order-1 sm:size-auto sm:w-full ${showPhoto ? 'sm:aspect-[4/3]' : 'sm:aspect-[16/10]'}`}
      >
        <div className="size-full overflow-hidden rounded-2xl sm:rounded-none sm:rounded-t-2xl">
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              className={`size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] ${
                isSoldOut ? 'opacity-60 grayscale' : ''
              }`}
            />
          ) : (
            <MonogramTile
              name={product.name}
              seed={categoryId}
              className={`size-full ${isSoldOut ? 'opacity-60 grayscale' : ''}`}
              letterClassName="text-4xl sm:text-6xl"
            />
          )}
        </div>

        {interactive ? (
          <div className="pointer-events-auto absolute -bottom-2 -end-2 z-10 sm:bottom-3 sm:end-3">
            {showStepper ? (
              <Stepper
                tone="solid"
                value={simpleQuantity}
                removesAtOne
                decrementLabel={copy.decreaseAria(product.name)}
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
                className="relative flex size-11 items-center justify-center rounded-full bg-guest-surface text-guest-pine shadow-md ring-1 ring-guest-ink/10 transition-[background-color,color,transform] hover:bg-guest-pine hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-guest-pine active:scale-90"
              >
                <GuestIconPlus className="size-5" />
                {totalQuantity > 0 ? (
                  <span
                    key={totalQuantity}
                    className="guest-anim-bump absolute -top-1.5 -end-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-guest-pine px-1 text-[11px] font-bold text-white ring-2 ring-guest-surface"
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
    </article>
  );
}

export const ProductCard = memo(ProductCardImpl);
