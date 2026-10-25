'use client';

import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { GuestEmptyState } from '../../../components/guest/GuestEmptyState';
import { GuestIconSearch, GuestIconUtensils } from '../../../components/guest/icons';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { PublicMenuCategory, PublicMenuProduct } from '../../../lib/public-menu/types';
import {brewPromoForCategory,type BrewTemplateSettings} from '../../../lib/public-menu/brew-settings';
import {resolveAssetUrl} from '../../../lib/media/asset-url';
import type {EditorialPriceDisplay} from '../../../lib/public-menu/editorial-settings';
import { DEFAULT_MENU_TEMPLATE, layoutOf, type MenuTemplate } from '../../../lib/public-menu/templates';
import { ProductCard } from './ProductCard';
import {
  ProductEditorial,
  ProductEmber,
  ProductBloom,
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
  /** Active category tabs for EMBER's one-category-at-a-time composition. */
  emberCategoryTabs?: { id: string; name: string }[];
  emberActiveCategoryId?: string;
  onEmberCategorySelect?: (id: string) => void;
  bloomCategoryTabs?: { id: string; name: string }[];
  bloomActiveCategoryId?: string;
  onBloomCategorySelect?: (id: string) => void;
  brewCategoryTabs?:{id:string;name:string}[];brewActiveCategoryId?:string;onBrewCategorySelect?:(id:string)=>void;brewSettings?:BrewTemplateSettings;brewLocale?:string;
  bloomSectionEyebrow?: string;
  bloomSectionHeadline?: string;
  /** Editorial-only display option; does not change order or price calculation. */
  editorialPriceDisplay?:EditorialPriceDisplay;
  /** How the menu is laid out (DEC-044). */
  template?: MenuTemplate;
}

const CARD_CONTAINER = {
  row: 'grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3',
  tile: 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6',
  'tile-dense': 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5',
  line: 'mx-auto flex w-full max-w-[760px] flex-col',
  editorial: 'flex flex-col',
  ember: 'ember-v2-grid grid grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-3',
  bloom: 'bloom-v2-grid',
  brew:'brew-v2-rows',
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
  emberCategoryTabs,
  emberActiveCategoryId,
  onEmberCategorySelect,
  bloomCategoryTabs,
  bloomActiveCategoryId,
  onBloomCategorySelect,
  bloomSectionEyebrow,bloomSectionHeadline,
  brewCategoryTabs,brewActiveCategoryId,onBrewCategorySelect,brewSettings,brewLocale,
  editorialPriceDisplay='FROM',
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
    if(layout.cards==='brew'&&brewSettings){
      const promo=brewPromoForCategory(brewSettings,category.id);
      const en=brewLocale!=='ar';
      return <section className="brew-v2-menu-section" key={category.id} id={categoryDomId(category.id)}>
        <div className="brew-v2-sectionhead"><h2 className="brew-v2-display">{en?brewSettings.menuHeadingEn:brewSettings.menuHeadingAr}</h2>
         <p>{en?brewSettings.menuSubtitleEn:brewSettings.menuSubtitleAr}</p></div>
        {brewCategoryTabs&&onBrewCategorySelect?<nav className="brew-v2-tabs" aria-label={copy.categories}>
         {brewCategoryTabs.map(t=><button type="button" key={t.id} aria-pressed={t.id===brewActiveCategoryId}
          className={t.id===brewActiveCategoryId?'active':''} onClick={()=>onBrewCategorySelect(t.id)}>{t.name}</button>)}</nav>:null}
        <div className="brew-v2-list"><div className="brew-v2-rows">
         {category.products.map(product=><ProductLine key={product.id} product={product} currency={currency} copy={copy}
           canOrder={canOrder} simpleQuantity={simpleQuantityByProductId.get(product.id)??0}
           totalQuantity={totalQuantityByProductId.get(product.id)??0} onOpen={onOpen} onQuickAdd={onQuickAdd}
           onIncrement={onIncrement} onDecrement={onDecrement}/>)}
         {category.products.length===0?<p>{copy.noItemsInCategory}</p>:null}
        </div>{brewSettings.promoEnabled?<aside className="brew-v2-promo">
         <small>{en?promo.promoLabelEn:promo.promoLabelAr}</small>
         <h3 className="brew-v2-display" dir="auto">{en?promo.promoHeadlineEn:promo.promoHeadlineAr}</h3>
         <p dir="auto">{en?promo.promoDescriptionEn:promo.promoDescriptionAr}</p>
         {brewSettings.promoImageMode==='CUSTOM'&&brewSettings.promoImageAssetPath
          ?<img alt="" className="brew-v2-promo-photo" src={resolveAssetUrl(brewSettings.promoImageAssetPath)??undefined}/>
          :<span className="brew-v2-promo-icon" aria-hidden="true">☕</span>}
        </aside>:null}</div></section>;
    }
    const headingId = `${categoryDomId(category.id)}-title`;
    return (
      <section
        key={category.id}
        id={categoryDomId(category.id)}
        aria-labelledby={headingId}
        className={
          layout.cards === 'bloom'
            ? 'bloom-v2-section scroll-mt-24'
            : layout.cards === 'ember'
            ? 'ember-v2-section scroll-mt-24'
            : layout.cards === 'editorial'
              ? 'scroll-mt-24 rounded-[22px] border border-g-line bg-g-surface px-4 py-4 shadow-[var(--g-shadow)] sm:px-5'
              : 'scroll-mt-24'
        }
      >
        {layout.cards === 'bloom' ? (
          <div className="bloom-v2-section-head">
            <div className="min-w-0">
              <div className="bloom-v2-section-eyebrow">
                {bloomSectionEyebrow || 'OUR LITTLE PLEASURES'}
              </div>
              <h2 id={headingId} className="bloom-v2-section-title bloom-v2-display">
                {bloomSectionHeadline || 'The sweet selection.'}
              </h2>
            </div>
            <span className="bloom-v2-section-flower" aria-hidden="true">✿</span>
          </div>
        ) : layout.cards === 'ember' ? (
          <div className="ember-v2-section-heading">
            <div>
              <div className="ember-v2-section-kicker" dir="ltr">THE MENU / WHAT ARE YOU CRAVING?</div>
              <h2 id={headingId} className="ember-v2-section-title" dir="auto">
                <bdi>{category.name}</bdi>
              </h2>
            </div>
            <span className="ember-v2-section-count">{copy.itemsCount(category.products.length)}</span>
          </div>
        ) : (
          <SectionHeading
            id={headingId}
            title={category.name}
            count={copy.itemsCount(category.products.length)}
            variant={layout.headings}
          />
        )}
        {layout.cards === 'ember' && emberCategoryTabs?.length && onEmberCategorySelect ? (
          <nav aria-label={copy.categories} className="ember-v2-tabs">
            {emberCategoryTabs.map((tab) => (
              <button
                type="button"
                key={tab.id}
                aria-pressed={tab.id === emberActiveCategoryId}
                className={`ember-v2-tab ${tab.id === emberActiveCategoryId ? 'ember-v2-tab-active' : ''}`}
                onClick={() => onEmberCategorySelect(tab.id)}
              >
                <bdi>{tab.name}</bdi>
              </button>
            ))}
          </nav>
        ) : null}

        {layout.cards === 'bloom' && bloomCategoryTabs?.length && onBloomCategorySelect ? (
          <nav aria-label={copy.categories} className="bloom-v2-tabs">
            {bloomCategoryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={tab.id === bloomActiveCategoryId}
                className={`bloom-v2-tab ${tab.id === bloomActiveCategoryId ? 'bloom-v2-tab-active' : ''}`}
                onClick={() => onBloomCategorySelect(tab.id)}
              >
                <bdi>{tab.name}</bdi>
              </button>
            ))}
          </nav>
        ) : null}

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
                layout.cards === 'bloom'
                  ? ProductBloom
                  : layout.cards === 'ember'
                  ? ProductEmber
                  : layout.cards === 'row'
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
                  editorialPriceDisplay={layout.cards==='editorial'?editorialPriceDisplay:undefined}
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
