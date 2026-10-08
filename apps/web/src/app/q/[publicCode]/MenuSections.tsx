'use client';

import { memo, useState } from 'react';
import { GuestEmptyState } from '../../../components/guest/GuestEmptyState';
import { GuestIconSearch, GuestIconUtensils } from '../../../components/guest/icons';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { PublicMenuCategory, PublicMenuProduct } from '../../../lib/public-menu/types';
import { ProductCard } from './ProductCard';
import { categoryDomId } from './useMenuNavigation';

function CategoryThumb({ imageUrl }: { imageUrl: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
    <img
      src={imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="size-12 shrink-0 rounded-xl border border-guest-line object-cover sm:size-14"
    />
  );
}

interface MenuSectionsProps {
  categories: PublicMenuCategory[];
  /** Total categories in the unfiltered menu -- distinguishes "empty menu" from "search found nothing". */
  menuCategoryCount: number;
  currency: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
  searchQuery: string;
  simpleQuantityByProductId: Map<string, number>;
  totalQuantityByProductId: Map<string, number>;
  onOpen: (product: PublicMenuProduct) => void;
  onQuickAdd: (product: PublicMenuProduct) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onClearSearch: () => void;
}

function MenuSectionsImpl({
  categories,
  menuCategoryCount,
  currency,
  copy,
  canOrder,
  searchQuery,
  simpleQuantityByProductId,
  totalQuantityByProductId,
  onOpen,
  onQuickAdd,
  onIncrement,
  onDecrement,
  onClearSearch,
}: MenuSectionsProps) {
  if (menuCategoryCount === 0) {
    return (
      <GuestEmptyState
        icon={<GuestIconUtensils />}
        title={copy.menuEmptyTitle}
        message={copy.noItemsInMenu}
      />
    );
  }

  const isSearching = searchQuery.trim() !== '';
  if (isSearching && categories.length === 0) {
    return (
      <GuestEmptyState
        icon={<GuestIconSearch />}
        title={copy.noSearchResults}
        action={
          <button
            type="button"
            onClick={onClearSearch}
            className="min-h-11 rounded-full bg-guest-pine px-5 text-sm font-semibold text-white transition-colors hover:bg-guest-pine-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-guest-pine"
          >
            {copy.clearSearch}
          </button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      {categories.map((category) => {
        const imageUrl = resolveAssetUrl(category.imageAssetPath);
        const headingId = `${categoryDomId(category.id)}-title`;
        return (
          <section
            key={category.id}
            id={categoryDomId(category.id)}
            aria-labelledby={headingId}
            className="scroll-mt-[7.5rem]"
          >
            <div className="mb-3.5 flex items-center gap-3.5 sm:mb-5">
              {imageUrl ? <CategoryThumb imageUrl={imageUrl} /> : null}
              <div className="min-w-0">
                <h2
                  id={headingId}
                  dir="auto"
                  className="font-guest-display text-[1.65rem] font-extrabold leading-tight text-guest-ink sm:text-[2rem]"
                >
                  {category.name}
                </h2>
                {category.description ? (
                  <p dir="auto" className="mt-0.5 text-[0.92rem] text-guest-muted">
                    {category.description}
                  </p>
                ) : null}
              </div>
            </div>

            {category.products.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-guest-line-strong px-4 py-8 text-center text-sm text-guest-muted">
                {copy.noItemsInCategory}
              </p>
            ) : (
              <div className="divide-y divide-guest-line rounded-2xl border border-guest-line bg-guest-surface sm:grid sm:grid-cols-2 sm:gap-5 sm:divide-y-0 sm:rounded-none sm:border-0 sm:bg-transparent lg:grid-cols-3">
                {category.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    categoryId={category.id}
                    currency={currency}
                    copy={copy}
                    canOrder={canOrder}
                    simpleQuantity={simpleQuantityByProductId.get(product.id) ?? 0}
                    totalQuantity={totalQuantityByProductId.get(product.id) ?? 0}
                    onOpen={onOpen}
                    onQuickAdd={onQuickAdd}
                    onIncrement={onIncrement}
                    onDecrement={onDecrement}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export const MenuSections = memo(MenuSectionsImpl);
