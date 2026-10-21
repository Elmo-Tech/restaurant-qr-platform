'use client';

import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { GuestEmptyState } from '../../../components/guest/GuestEmptyState';
import { GuestIconSearch, GuestIconUtensils } from '../../../components/guest/icons';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { PublicMenuCategory, PublicMenuProduct } from '../../../lib/public-menu/types';
import { DEFAULT_MENU_TEMPLATE, layoutOf, type MenuTemplate } from '../../../lib/public-menu/templates';
import { ProductCard } from './ProductCard';
import {
  ProductEditorial,
  ProductLine,
  ProductRow,
  ProductTile,
  ProductTileDense,
} from './ProductVariants';
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

/**
 * A section title: a saffron bar, the Lalezar title (27px phone / 34px desktop) and a quiet item
 * count. With `variant="centered"` it is a centred heading between two thin rules (printed menu).
 */
export function SectionHeading({
  id,
  title,
  count,
  variant = 'bar',
}: {
  id: string;
  title: string;
  count: string;
  variant?: 'bar' | 'centered' | 'editorial';
}) {
  if (variant === 'editorial') {
    return (
      <div className="mb-1 flex items-center gap-3 border-b border-g-line pb-3.5">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-g-accent bg-g-accent-soft text-g-accent-text"
        >
          <GuestIconUtensils className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="g-display text-[24px] leading-[1.25] text-g-text lg:text-[27px]">
            <bdi>{title}</bdi>
          </h2>
          <span className="text-[11.5px] text-g-text-3">{count}</span>
        </div>
      </div>
    );
  }
  if (variant === 'centered') {
    return (
      <div className="mb-2 flex flex-col items-center gap-1.5 text-center">
        <div className="flex w-full items-center gap-4">
          <span aria-hidden="true" className="h-px flex-1 bg-g-line" />
          <h2 id={id} className="g-display text-[28px] leading-[1.3] text-g-text lg:text-[34px]">
            <bdi>{title}</bdi>
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-g-line" />
        </div>
        <span className="text-[12.5px] text-g-text-3">{count}</span>
      </div>
    );
  }
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
  /** How the menu is laid out (DEC-044). */
  template?: MenuTemplate;
}

const CARD_CONTAINER = {
  row: 'grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3',
  tile: 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6',
  'tile-dense': 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5',
  line: 'mx-auto flex w-full max-w-[760px] flex-col',
  editorial: 'flex flex-col',
} as const;

/** Keep desktop columns similar in height while preserving the original category order on mobile. */
function splitEditorialCategories(categories: PublicMenuCategory[]): [PublicMenuCategory[], PublicMenuCategory[]] {
  if (categories.length < 2) return [categories, []];
  const weights = categories.map((category) => Math.max(1, category.products.length) + 2);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let prefix = 0;
  let splitAt = 1;
  let smallestDifference = Number.POSITIVE_INFINITY;
  for (let index = 1; index < categories.length; index += 1) {
    prefix += weights[index - 1];
    const difference = Math.abs(total - prefix * 2);
    if (difference < smallestDifference) {
      smallestDifference = difference;
      splitAt = index;
    }
  }
  return [categories.slice(0, splitAt), categories.slice(splitAt)];
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
  template = DEFAULT_MENU_TEMPLATE,
}: MenuSectionsProps) {
  const layout = layoutOf(template);
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

  const renderCategory = (category: PublicMenuCategory) => {
    const headingId = `${categoryDomId(category.id)}-title`;
    return (
      <section
        key={category.id}
        id={categoryDomId(category.id)}
        aria-labelledby={headingId}
        className={
          layout.cards === 'editorial'
            ? 'scroll-mt-24 rounded-[22px] border border-g-line bg-g-surface px-4 py-4 shadow-[var(--g-shadow)] sm:px-5'
            : 'scroll-mt-24'
        }
      >
        <SectionHeading
          id={headingId}
          title={category.name}
          count={copy.itemsCount(category.products.length)}
          variant={layout.headings}
        />
        {category.description ? (
          <p
            dir="auto"
            className={`text-[13px] leading-[1.65] text-g-text-2 lg:text-sm ${
              layout.headings === 'centered'
                ? 'mx-auto mb-2 max-w-[760px] text-center'
                : layout.headings === 'editorial'
                  ? 'mb-1 mt-3'
                  : '-mt-1.5 mb-3.5'
            }`}
          >
            {category.description}
          </p>
        ) : null}

        {category.products.length === 0 ? (
          <p className="rounded-[22px] border border-dashed border-g-line px-4 py-8 text-center text-sm text-g-text-2">
            {copy.noItemsInCategory}
          </p>
        ) : layout.cards === 'classic' ? (
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
        ) : (
          <div className={CARD_CONTAINER[layout.cards]}>
            {category.products.map((product) => {
              const Card =
                layout.cards === 'row'
                  ? ProductRow
                  : layout.cards === 'line'
                    ? ProductLine
                    : layout.cards === 'editorial'
                      ? ProductEditorial
                      : layout.cards === 'tile-dense'
                        ? ProductTileDense
                        : ProductTile;
              return (
                <Card
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
              );
            })}
          </div>
        )}
      </section>
    );
  };

  if (layout.cards === 'editorial') {
    const columns = splitEditorialCategories(categories);
    return (
      <div
        className={`grid items-start gap-4 lg:gap-5 ${columns[1].length > 0 ? 'lg:grid-cols-2' : 'mx-auto w-full max-w-[760px]'}`}
      >
        {columns.filter((column) => column.length > 0).map((column, index) => (
          <div key={index} className="flex min-w-0 flex-col gap-4 lg:gap-5">
            {column.map(renderCategory)}
          </div>
        ))}
      </div>
    );
  }

  return <>{categories.map(renderCategory)}</>;
}

export const MenuSections = memo(MenuSectionsImpl);
