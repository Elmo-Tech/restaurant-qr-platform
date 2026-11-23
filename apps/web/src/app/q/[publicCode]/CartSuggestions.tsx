'use client';

import { useState } from 'react';
import { DishFallback } from '../../../components/guest/DishFallback';
import { GuestIconPlus } from '../../../components/guest/icons';
import { ItemPromotionLabel } from '../../../components/guest/MenuItemPrice';
import { Price } from '../../../components/guest/Price';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { cheapestMenuSize, menuItemPrice } from '../../../lib/public-menu/menu-item-price';
import type { PublicMenuProduct } from '../../../lib/public-menu/types';

function SuggestionCard({
  product,
  currency,
  copy,
  showPhotos,
  onAdd,
}: {
  product: PublicMenuProduct;
  currency: string;
  copy: PublicMenuCopy;
  showPhotos: boolean;
  onAdd: (product: PublicMenuProduct) => void;
}) {
  const imageUrl = resolveAssetUrl(product.primaryImageAssetPath);
  const [imageFailed, setImageFailed] = useState(false);
  const size = cheapestMenuSize(product);
  const { current, promotion } = menuItemPrice(product, size, false);
  return (
    <li className="flex w-[150px] shrink-0 flex-col overflow-hidden rounded-[18px] border border-g-line bg-g-surface">
      {showPhotos ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {imageUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              className="size-full object-cover"
            />
          ) : (
            <DishFallback className="size-full" iconClassName="size-8" />
          )}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="line-clamp-2 min-h-[2.6em] text-[13.5px] font-bold leading-[1.3] text-g-text">
          <bdi>{product.name}</bdi>
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <span className="min-w-0">
            {size ? (
              <span className="block text-[11px] font-semibold text-g-text-3">{copy.fromPrice}</span>
            ) : null}
            <Price
              amount={current}
              currency={currency}
              className="g-num text-[15px] [font-weight:800] text-g-price"
              currencyClassName="text-[10.5px] font-semibold"
            />
          </span>
          <button
            type="button"
            onClick={() => onAdd(product)}
            aria-label={copy.addAria(product.name)}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-g-accent text-g-on-accent transition-transform active:scale-90"
          >
            <GuestIconPlus className="size-[18px]" strokeWidth={2.8} />
          </button>
        </div>
        <ItemPromotionLabel promotion={promotion} currency={currency} copy={copy} />
      </div>
    </li>
  );
}

/**
 * "Complete your meal" (DEC-042): a row of products the Restaurant (or its own order history)
 * suggests for what is in the cart. Each is added like from the menu: a product with sizes or
 * options opens its page first. Shows nothing when there is nothing to suggest.
 */
export function CartSuggestions({
  products,
  currency,
  copy,
  showPhotos,
  onAdd,
}: {
  products: PublicMenuProduct[];
  currency: string;
  copy: PublicMenuCopy;
  showPhotos: boolean;
  onAdd: (product: PublicMenuProduct) => void;
}) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby="cart-suggestions-title">
      <h3 id="cart-suggestions-title" className="mb-3 text-[16px] font-extrabold text-g-text">
        {copy.completeYourMeal}
      </h3>
      <ul className="guest-scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {products.map((product) => (
          <SuggestionCard
            key={product.id}
            product={product}
            currency={currency}
            copy={copy}
            showPhotos={showPhotos}
            onAdd={onAdd}
          />
        ))}
      </ul>
    </section>
  );
}
