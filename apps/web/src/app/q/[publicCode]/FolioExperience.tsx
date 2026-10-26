'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Price } from '../../../components/guest/Price';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import { toMinorUnits } from '../../../lib/public-menu/money';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { FolioTemplateSettings } from '../../../lib/public-menu/folio-settings';
import type { PublicMenuCategory, PublicMenuProduct } from '../../../lib/public-menu/types';
import { HeroActions, LanguageSwitch } from './GuestHero';

const PRODUCTS_PER_PAGE = 4;

/**
 * FOLIO is paginated by actual products, not hard-coded demo "chapters".
 * Splitting at four prevents overflow in large restaurant menus and provides
 * stable chapter positions at every responsive breakpoint.
 */
export interface FolioSpread {
  category: PublicMenuCategory;
  products: PublicMenuProduct[];
  pageInCategory: number;
  pagesInCategory: number;
}
export function paginateFolio(categories: PublicMenuCategory[]): FolioSpread[] {
  return categories.flatMap(category => {
    const total = Math.max(1, Math.ceil(category.products.length / PRODUCTS_PER_PAGE));
    return Array.from({ length: total }, (_, pageInCategory) => ({
      category,
      products: category.products.slice(pageInCategory * PRODUCTS_PER_PAGE, (pageInCategory + 1) * PRODUCTS_PER_PAGE),
      pageInCategory,
      pagesInCategory: total,
    }));
  });
}

function formatPage(n: number) { return String(n).padStart(2, '0'); }

function FolioPrices({ product, currency, copy }: {
  product: PublicMenuProduct; currency: string; copy: PublicMenuCopy;
}) {
  const sizes = product.variants ?? [];
  if (sizes.length) {
    const ordered = [...sizes].sort((a, b) =>
      toMinorUnits(a.discountedPrice ?? a.price) < toMinorUnits(b.discountedPrice ?? b.price) ? -1 :
      toMinorUnits(a.discountedPrice ?? a.price) > toMinorUnits(b.discountedPrice ?? b.price) ? 1 : 0,
    );
    return <span className="folio-v2-item-price-list">
      {ordered.slice(0, 2).map(size => (
        <span className="folio-v2-item-size" key={size.id}>
          <span dir="auto">{size.name}</span>
          <span className="folio-v2-item-money">
            {size.discountedPrice ? <s><Price amount={size.price} currency={currency} /></s> : null}
            <Price amount={size.discountedPrice ?? size.price} currency={currency} />
          </span>
        </span>
      ))}
      {ordered.length > 2 ? <small>{copy.moreSizes(ordered.length - 2)}</small> : null}
    </span>;
  }
  return <span className="folio-v2-item-money">
    {product.discount ? <s><Price amount={product.basePrice} currency={currency} /></s> : null}
    <Price amount={product.discount?.discountedPrice ?? product.basePrice} currency={currency} />
  </span>;
}

function FolioItem({ product, currency, copy, canOrder, onOpen, onQuickAdd }: {
  product: PublicMenuProduct; currency: string; copy: PublicMenuCopy; canOrder: boolean;
  onOpen: (product: PublicMenuProduct) => void; onQuickAdd: (product: PublicMenuProduct) => void;
}) {
  const available = product.availability !== 'SOLD_OUT';
  return (
    <li className={'folio-v2-item' + (!available ? ' folio-v2-item-soldout' : '')}>
      <button className="folio-v2-item-detail" type="button" onClick={() => onOpen(product)}>
        <span className="folio-v2-item-copy">
          <strong dir="auto">{product.name}</strong>
          {product.description ? <span className="folio-v2-item-description" dir="auto">{product.description}</span> : null}
          {!available ? <em className="folio-v2-soldout">{copy.soldOut}</em> : null}
        </span>
        <FolioPrices product={product} currency={currency} copy={copy} />
      </button>
      {canOrder && available ? (
        <button
          type="button"
          className="folio-v2-item-add"
          onClick={() => onQuickAdd(product)}
          aria-label={copy.addAria(product.name)}
        >
          <span aria-hidden="true">＋</span><span>{copy.add}</span>
        </button>
      ) : null}
    </li>
  );
}

/** Exact plate composition adapted from the approved FOLIO demo SVG. */
function FolioPlate() {
  return (
    <svg className="folio-v2-plate" viewBox="0 0 470 320" xmlns="http://www.w3.org/2000/svg"
      role="img" aria-label="Fine dining plate illustration">
      <defs>
        <radialGradient id="folioPlateSurface">
          <stop stopColor="#faf3d7"/><stop offset=".72" stopColor="#e6ddc5"/>
          <stop offset=".82" stopColor="#fff9e4"/><stop offset=".95" stopColor="#aa9a78"/>
        </radialGradient>
        <linearGradient id="folioPlateMeat" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#994d2c"/><stop offset=".5" stopColor="#59291d"/><stop offset="1" stopColor="#bf6f37"/>
        </linearGradient>
      </defs>
      <ellipse cx="244" cy="171" rx="168" ry="124" fill="#7a694c" opacity=".18"/>
      <ellipse cx="240" cy="163" rx="166" ry="119" fill="url(#folioPlateSurface)"/>
      <ellipse cx="240" cy="164" rx="124" ry="86" fill="none" stroke="#b9a784" opacity=".65" strokeWidth="2"/>
      <path d="M158 166 Q152 122 207 115 Q280 111 319 157 Q346 204 293 223 Q241 241 188 215 Q155 197 158 166Z"
        fill="url(#folioPlateMeat)" stroke="#512a18" strokeWidth="5"/>
      <path d="M179 149 Q245 126 313 168" stroke="#e4ac75" strokeWidth="8" opacity=".5" fill="none" strokeLinecap="round"/>
      <path d="M175 182 Q239 161 308 192" stroke="#472315" strokeWidth="7" fill="none" opacity=".6"/>
      <g stroke="#418047" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M145 129l24 26-27 12"/><path d="M318 114l-20 30 28 2"/><path d="M311 224l25-15-5-22"/>
      </g>
      <g fill="#c43e30"><circle cx="153" cy="218" r="11"/><circle cx="322" cy="145" r="10"/><circle cx="214" cy="93" r="9"/></g>
    </svg>
  );
}

export interface FolioExperienceProps {
  sentinelRef: React.RefObject<HTMLElement | null>;
  restaurantName: string; logoUrl: string | null; settings: FolioTemplateSettings;
  locale: { resolved: string; available: string[] };
  publicCode: string; designPreview: boolean; shareCode: string | null;
  onTrack: (() => void) | null; hasActiveOrder: boolean;
  canOrder: boolean; cartCount: number; onCartOpen: () => void;
  categories: PublicMenuCategory[]; menuCategoryCount: number;
  currency: string; copy: PublicMenuCopy;
  query: string; onQueryChange: (value: string) => void; onClearSearch: () => void;
  onOpenProduct: (product: PublicMenuProduct) => void;
  onQuickAdd: (product: PublicMenuProduct) => void;
  modeSwitch: ReactNode; announcements: ReactNode; warning: ReactNode;
}

/**
 * Desktop: a real two-page volume. Phones: single readable parchment page,
 * never a squeezed desktop book. Navigation, search and chapters stay sticky.
 * Shared ProductSheet, cart, checkout and pricing remain in PublicMenuView.
 */
export function FolioExperience(p: FolioExperienceProps) {
  const ar = p.locale.resolved === 'ar';
  const settings = p.settings;
  const [opened, setOpened] = useState(false);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [animation, setAnimation] = useState<'next' | 'prev' | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const chapterRefs = useRef(new Map<string, HTMLButtonElement>());
  const spreads = useMemo(() => paginateFolio(p.categories), [p.categories]);
  const index = Math.max(0, Math.min(spreadIndex, spreads.length - 1));
  const spread = spreads[index] ?? null;
  const activeCategoryId = spread?.category.id ?? null;
  const eyebrow = ar ? settings.eyebrowAr : settings.eyebrowEn;
  const headline = ar ? settings.headlineAr : settings.headlineEn;
  const collection = ar ? settings.collectionLabelAr : settings.collectionLabelEn;
  const subtitle = ar ? settings.chapterSubtitleAr : settings.chapterSubtitleEn;
  const coverTagline = ar ? settings.coverTaglineAr : settings.coverTaglineEn;
  const coverCta = ar ? settings.coverCtaAr : settings.coverCtaEn;
  const footer = ar ? settings.pageFooterAr : settings.pageFooterEn;
  const featuredPhoto = p.categories.flatMap(c => c.products)
    .find(item => item.featured && item.primaryImageAssetPath)?.primaryImageAssetPath ??
    p.categories.flatMap(c => c.products).find(item => item.primaryImageAssetPath)?.primaryImageAssetPath;
  const imageUrl = settings.artworkMode === 'CUSTOM'
    ? resolveAssetUrl(settings.artworkAssetPath)
    : settings.artworkMode === 'FEATURED'
      ? resolveAssetUrl(featuredPhoto ?? null) : null;

  useEffect(() => { setPhotoFailed(false); }, [imageUrl]);
  useEffect(() => { setSpreadIndex(0); setAnimation(null); }, [p.query]);
  useEffect(() => {
    if (spreadIndex >= spreads.length) setSpreadIndex(Math.max(0, spreads.length - 1));
  }, [spreadIndex, spreads.length]);
  useEffect(() => {
    if (!opened || !activeCategoryId) return;
    chapterRefs.current.get(activeCategoryId)?.scrollIntoView({
      block: 'nearest', inline: 'nearest', behavior: 'instant',
    });
  }, [opened, activeCategoryId]);

  function navigate(next: number) {
    if (next < 0 || next >= spreads.length || next === index) return;
    setAnimation(next > index ? 'next' : 'prev');
    setSpreadIndex(next);
    if (window.matchMedia('(max-width: 720px)').matches) {
      menuRef.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
  }
  function jumpToCategory(id: string) {
    const first = spreads.findIndex(item => item.category.id === id);
    if (first < 0) return;
    if (!opened) setOpened(true);
    navigate(first);
  }
  const categoryLinks = p.categories.filter(c => c.products.length > 0);
  const isSearching = p.query.trim().length > 0;

  return (
    <div className="folio-v2-wrap" data-has-cart={p.cartCount > 0 && p.canOrder ? 'true' : undefined}>
      <header ref={p.sentinelRef} className="folio-v2-header">
        <nav aria-label={p.restaurantName} className="folio-v2-topnav">
          <div className="folio-v2-brand">
            {p.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Restaurant-controlled image from API.
              <img src={p.logoUrl} alt="" className="folio-v2-brand-logo"/>
            ) : <span className="folio-v2-diamond" aria-hidden="true">✥</span>}
            <span className="folio-v2-display folio-v2-brandname" dir="auto"><bdi>{p.restaurantName}</bdi></span>
          </div>
          <small>{coverTagline}</small>
          <button type="button" className="folio-v2-header-cart"
            disabled={!p.canOrder} onClick={p.onCartOpen} aria-label={p.copy.viewCart}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" width="17" height="17"
              strokeWidth="1.7" strokeLinecap="round"><path d="M5 8h14l-1.2 12H6.2L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
            {p.copy.cart} <b>{p.cartCount}</b>
          </button>
        </nav>
        <div className="folio-v2-intro">
          <span>{eyebrow}</span>
          <h1 className="folio-v2-display" dir="auto">{headline}</h1>
        </div>
        <div className="folio-v2-tools">
          <LanguageSwitch available={p.locale.available} resolved={p.locale.resolved}
            publicCode={p.publicCode} label={p.copy.language} designPreview={p.designPreview} previewTemplate="folio"/>
          <HeroActions copy={p.copy} restaurantName={p.restaurantName} shareCode={p.shareCode}
            onTrack={p.onTrack} hasActiveOrder={p.hasActiveOrder}/>
        </div>
      </header>

      <div className="folio-v2-meta">{p.announcements}{p.warning}</div>
      {p.modeSwitch ? <div className="folio-v2-mode">{p.modeSwitch}</div> : null}

      {(opened || isSearching) && <nav className="folio-v2-sticky" aria-label={p.copy.categories}>
        <div className="folio-v2-navinner">
          <label className="folio-v2-search">
            <span className="sr-only">{p.copy.searchMenu}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17" fill="none"
              stroke="currentColor" strokeWidth="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
            <input type="search" value={p.query} onChange={e => p.onQueryChange(e.target.value)}
              placeholder={p.copy.searchPlaceholder} dir={ar ? 'rtl' : 'ltr'}/>
          </label>
          <div className="folio-v2-chapters">
            {categoryLinks.map(category => <button key={category.id} type="button"
              ref={node => { if (node) chapterRefs.current.set(category.id, node); else chapterRefs.current.delete(category.id); }}
              onClick={() => jumpToCategory(category.id)}
              aria-current={activeCategoryId === category.id ? 'page' : undefined}
              className={activeCategoryId === category.id ? 'active' : ''}>{category.name}</button>)}
          </div>
          {isSearching ? <button className="folio-v2-reset" type="button"
            onClick={p.onClearSearch}>{p.copy.clearSearch}</button> : null}
        </div>
      </nav>}

      <main className="folio-v2-deck" ref={menuRef} id="folio-menu-start">
        <div className={'folio-v2-book' + (opened ? ' is-open' : '')}
          onTouchStart={event => {
            // Don't hijack a tap or product action. Swiping the paper itself turns a page.
            if (!opened || (event.target as HTMLElement).closest('button, input, select, a')) return;
            const point = event.changedTouches[0];
            if (point) swipeStart.current = { x: point.clientX, y: point.clientY };
          }}
          onTouchEnd={event => {
            const initial = swipeStart.current;
            swipeStart.current = null;
            const point = event.changedTouches[0];
            if (!initial || !point || !opened) return;
            const dx = point.clientX - initial.x;
            const dy = point.clientY - initial.y;
            if (Math.abs(dx) >= 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
              navigate(index + (dx < 0 ? 1 : -1));
            }
          }}
        >
          <article className="folio-v2-page folio-v2-artpage" aria-label={footer}>
            <span className="folio-v2-kicker">{p.restaurantName} / SIGNATURE</span>
            <div className="folio-v2-artframe">
              {imageUrl && !photoFailed ? (
                // eslint-disable-next-line @next/next/no-img-element -- Published restaurant image.
                <img src={imageUrl} alt="" onError={() => setPhotoFailed(true)} />
              ) : <FolioPlate />}
            </div>
            <div className="folio-v2-artfooter">{footer}</div>
            <span className="folio-v2-page-no">{formatPage(index * 2 + 1)}</span>
          </article>
          <article key={spread?.category.id + '-' + index} dir={ar ? 'rtl' : 'ltr'}
            className={'folio-v2-page folio-v2-menupage' + (animation ? ' folio-v2-turn-' + animation : '')}
            onAnimationEnd={() => setAnimation(null)}>
            <div className="folio-v2-kicker">{collection} · {formatPage(index + 1)}</div>
            {spread ? (
              <>
                <h2 dir="auto">{spread.category.name}</h2>
                <div className="folio-v2-rule"/>
                <p className="folio-v2-subtitle" dir="auto">{spread.category.description || subtitle}</p>
                <ol className="folio-v2-items">
                  {spread.products.map(product => <FolioItem key={product.id}
                    product={product} currency={p.currency} copy={p.copy} canOrder={p.canOrder}
                    onOpen={p.onOpenProduct} onQuickAdd={p.onQuickAdd}/>)}
                </ol>
                <div className="folio-v2-pagefooter"><span>{p.restaurantName} · MENU</span>
                  {spread.pagesInCategory > 1 ?
                    <span>{formatPage(spread.pageInCategory + 1)} / {formatPage(spread.pagesInCategory)}</span>
                    : <span>{footer}</span>}
                </div>
              </>
            ) : (
              <div className="folio-v2-empty" role="status">{p.menuCategoryCount ? p.copy.noItemsInCategory : p.copy.noItemsInMenu}</div>
            )}
            <span className="folio-v2-page-no">{formatPage(index * 2 + 2)}</span>
          </article>
          <div className="folio-v2-cover" aria-hidden={opened ? 'true' : undefined}>
            <div className="folio-v2-cover-content">
              <div className="folio-v2-cover-ornament" aria-hidden="true">❦</div>
              <span className="folio-v2-cover-kicker">{coverTagline}</span>
              <h2 className="folio-v2-display" dir="auto">{p.restaurantName}</h2>
              <span className="folio-v2-cover-subline">{footer}</span>
              <button type="button" tabIndex={opened ? -1 : 0} onClick={() => setOpened(true)}>
                <span aria-hidden="true">←</span> {coverCta}
              </button>
            </div>
          </div>
        </div>

        <div className="folio-v2-controls" role="navigation" aria-label={p.copy.categories}>
          <button type="button" disabled={!opened || index <= 0}
            onClick={() => navigate(index - 1)} aria-label={ar ? 'الصفحة السابقة' : 'Previous page'}>
            <span aria-hidden="true">→</span> {ar ? 'السابقة' : 'Previous'}
          </button>
          <span className="folio-v2-progress" role="status">
            {formatPage(spreads.length ? index + 1 : 0)} — {formatPage(spreads.length)}
          </span>
          <button type="button" disabled={!opened || index >= spreads.length - 1}
            onClick={() => navigate(index + 1)} aria-label={ar ? 'الصفحة التالية' : 'Next page'}>
            {ar ? 'التالية' : 'Next'} <span aria-hidden="true">←</span>
          </button>
        </div>
        {!opened ? <p className="folio-v2-openhint">{ar ? 'افتح الكتاب لتستكشف الأقسام والأطباق.' : 'Open the book to explore the menu.'}</p> : null}
      </main>
    </div>
  );
}
