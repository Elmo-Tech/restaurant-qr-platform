'use client';

import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { GuestEmptyState } from '../../../components/guest/GuestEmptyState';
import { GuestIconSearch, GuestIconUtensils } from '../../../components/guest/icons';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { PublicMenuCategory, PublicMenuProduct } from '../../../lib/public-menu/types';
import { ProductCard } from './ProductCard';
import { categoryDomId } from './useMenuNavigation';

const MIN_CARD_PX = 250;
const GRID_GAP_PX = 20;

/**
 * Columns for a section on a wide screen: normally as many 250px+ columns as fit (so card
 * widths stay consistent from section to section). The one exception is an orphan -- a last
 * row holding a single card (5 items in 4 columns) -- which is rebalanced to fewer columns
 * (3 + 2) so the row never looks like a mistake.
 */
export function balancedColumns(count: number, maxColumns: number): number {
  if (maxColumns <= 2 || count <= maxColumns || count % maxColumns !== 1) return maxColumns;
  for (let columns = maxColumns - 1; columns >= 2; columns -= 1) {
    if (count % columns === 0) return columns;
  }
  for (let columns = maxColumns - 1; columns >= 2; columns -= 1) {
    if (count % columns !== 1) return columns;
  }
  return maxColumns;
}

/** The product grid: one column of rows on a phone; from 768px an auto-fill grid with orphan-free rows. */
function ProductGrid({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const max = Math.max(
        1,
        Math.floor((entry.contentRect.width + GRID_GAP_PX) / (MIN_CARD_PX + GRID_GAP_PX)),
      );
      setColumns(balancedColumns(count, max));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [count]);

  return (
    <div
      ref={ref}
      style={
        columns
          ? ({ '--grid-cols': 'repeat(' + columns + ', minmax(0, 1fr))' } as CSSProperties)
          : undefined
      }
      className="grid grid-cols-1 gap-3 md:gap-5 md:[grid-template-columns:var(--grid-cols,repeat(auto-fill,minmax(250px,1fr)))]"
    >
      {children}
    </div>
  );
}

/** A section title: a saffron bar, the Lalezar title (27px phone / 34px desktop) and a quiet item count. */
export function SectionHeading({ id, title, count }: { id: string; title: string; count: string }) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-3 lg:mb-[18px]">
      <h2
        id={id}
        className="g-display flex items-center gap-2.5 text-[27px] leading-[1.3] text-g-text lg:gap-3 lg:text-[34px]"
      >
        <span
          aria-hidden="true"
          className="h-6 w-1.5 shrink-0 rounded-[3px] bg-g-accent lg:h-[30px] lg:w-[7px]"
        />
        <bdi>{title}</bdi>
      </h2>
      <span className="shrink-0 text-[13px] text-g-text-3 lg:text-sm">{count}</span>
    </div>
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
            className="h-11 rounded-full bg-g-accent px-5 text-sm font-bold text-g-on-accent transition-transform active:scale-95"
          >
            {copy.clearSearch}
          </button>
        }
      />
    );
  }

  return (
    <>
      {categories.map((category) => {
        const headingId = `${categoryDomId(category.id)}-title`;
        return (
          <section
            key={category.id}
            id={categoryDomId(category.id)}
            aria-labelledby={headingId}
            className="scroll-mt-24"
          >
            <SectionHeading
              id={headingId}
              title={category.name}
              count={copy.itemsCount(category.products.length)}
            />
            {category.description ? (
              <p
                dir="auto"
                className="-mt-1.5 mb-3.5 text-[13px] leading-[1.65] text-g-text-2 lg:text-sm"
              >
                {category.description}
              </p>
            ) : null}

            {category.products.length === 0 ? (
              <p className="rounded-[22px] border border-dashed border-g-line px-4 py-8 text-center text-sm text-g-text-2">
                {copy.noItemsInCategory}
              </p>
            ) : (
              <ProductGrid count={category.products.length}>
                {category.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
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
              </ProductGrid>
            )}
          </section>
        );
      })}
    </>
  );
}

export const MenuSections = memo(MenuSectionsImpl);
