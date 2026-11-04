'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { GuestIconBag, GuestIconClose, GuestIconMoon, GuestIconPhone, GuestIconReceipt, GuestIconSearch, GuestIconSun } from '../../../../components/guest/icons';
import { Price } from '../../../../components/guest/Price';
import { resolveAssetUrl } from '../../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../../lib/public-menu/copy';
import { toMinorUnits } from '../../../../lib/public-menu/money';
import {
  sherbinyCopy,
  type SherbinyCopyKey,
  type SherbinyMenuSettings,
  type SherbinyTheme,
} from '../../../../lib/public-menu/sherbiny-settings';
import type { PublicHours, PublicMenuCategory, PublicMenuProduct } from '../../../../lib/public-menu/types';
import type { RestaurantContact } from '../../../../lib/contact/types';
import { Badge, LINK_PROPS, buildChannels } from '../GuestContact';
import { hoursLabel } from '../HoursBadge';
import { ShareButton } from '../ShareButton';
import { VerdeImage as SherbinyImage } from '../verde/VerdeImage';
import { SherbinyDishArt, SherbinyFlame, SherbinyHat, SherbinyPizzaArt, SherbinyWrapArt } from './SherbinyArt';
import { SherbinyDishRow } from './SherbinyDishRow';
import { SHERBINY_FONT_CLASSES } from './sherbiny-fonts';
import './sherbiny.css';

const THEME_STORAGE_KEY = 'sherbiny-menu-theme';
const pad = (n: number): string => String(n).padStart(2, '0');

// A guest's own night / paper pick lives in this browser only (never on the server); `useSyncExternalStore`
// keeps server and first client render on the Restaurant's default theme, then adopts the stored pick.
let memoryTheme: SherbinyTheme | null = null;
const themeListeners = new Set<() => void>();
const subscribeTheme = (listener: () => void) => {
  themeListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    themeListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};
function readStoredTheme(): SherbinyTheme | null {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'NIGHT' || saved === 'PAPER') return saved;
  } catch {
    /* storage unavailable: fall back to the in-memory pick */
  }
  return memoryTheme;
}
function storeTheme(next: SherbinyTheme) {
  memoryTheme = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* private mode: the pick lasts for this visit only */
  }
  themeListeners.forEach((listener) => listener());
}

export interface SherbinyLocation {
  name: string;
  address: string | null;
  phone: string | null;
}

export interface SherbinyMenuProps {
  settings: SherbinyMenuSettings;
  restaurantName: string;
  logoUrl: string | null;
  coverUrl: string | null;
  locale: string;
  availableLocales: string[];
  publicCode: string;
  designPreview: boolean;
  copy: PublicMenuCopy;
  currency: string;
  categories: PublicMenuCategory[];
  /** Categories after the shared search filter (all of them while not searching). */
  visibleCategories: PublicMenuCategory[];
  query: string;
  onQueryChange: (query: string) => void;
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
  canOrder: boolean;
  simpleQuantityByProductId: Map<string, number>;
  totalQuantityByProductId: Map<string, number>;
  onOpenProduct: (product: PublicMenuProduct) => void;
  onQuickAdd: (product: PublicMenuProduct) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  cartCount: number;
  onOpenCart: (() => void) | null;
  onTrack: (() => void) | null;
  hasActiveOrder: boolean;
  shareCode: string | null;
  contact: RestaurantContact;
  locations: SherbinyLocation[];
  hours: PublicHours | null;
  /** Announcements, ordering-mode switch and table / pickup notices, composed by the shared page. */
  notices: ReactNode;
  /** Pickup / delivery switch and ordering notices, shown under the hero and the ticker. */
  orderingBar: ReactNode;
  poweredBy: ReactNode;
  /** Shared overlays (cart bar, cart, product sheet, tracking) rendered inside the themed root so they match the skin. */
  children?: ReactNode;
}

/** Heading text: line breaks are kept and the last word of the last line is drawn in the accent colour. */
function AccentText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, index) => {
        if (index < lines.length - 1) {
          return (
            <Fragment key={index}>
              {line}
              <br />
            </Fragment>
          );
        }
        const words = line.trim().split(/\s+/);
        const last = words.pop() ?? '';
        return (
          <Fragment key={index}>
            {words.length > 0 ? `${words.join(' ')} ` : null}
            <span className="s-accent">{last}</span>
          </Fragment>
        );
      })}
    </>
  );
}

/** Ticker words: the Restaurant's own list (separated by `|`, `,` or new lines), at most twelve. */
function marqueeWords(text: string): string[] {
  return text.split(/[|,،\n]/).map((word) => word.trim()).filter(Boolean).slice(0, 12);
}

/** Egyptian numbers are read locally (0127...), the tel: link keeps the international form. */
const displayPhone = (number: string): string => number.replace(/^\+20(\d{9,10})$/, '0$1');

const firstPhoto = (category: PublicMenuCategory | undefined): string | null =>
  resolveAssetUrl(category?.imageAssetPath ?? category?.products.find((p) => p.primaryImageAssetPath)?.primaryImageAssetPath ?? null);

export function SherbinyMenu(props: SherbinyMenuProps) {
  const {
    settings, restaurantName, logoUrl, coverUrl, locale, availableLocales, designPreview, copy, currency,
    categories, visibleCategories, query, onQueryChange, activeCategoryId, onSelectCategory, canOrder,
    simpleQuantityByProductId, totalQuantityByProductId, onOpenProduct, onQuickAdd, onIncrement, onDecrement,
    cartCount, onOpenCart, onTrack, hasActiveOrder, shareCode, contact, locations, hours, notices, orderingBar,
    poweredBy, children,
  } = props;

  const isArabic = locale === 'ar';
  const brand = (isArabic ? settings.brandAr : settings.brandEn).trim() || restaurantName;
  const text = useCallback((key: SherbinyCopyKey) => sherbinyCopy(settings, key, locale, brand), [settings, locale, brand]);

  // Theme: the Restaurant's choice first; a guest's own pick (when allowed) wins, except in the staff preview.
  const guestTheme = useSyncExternalStore(subscribeTheme, readStoredTheme, () => null);
  const theme: SherbinyTheme = !designPreview && settings.allowThemeSwitch && guestTheme ? guestTheme : settings.theme;
  const toggleTheme = () => storeTheme(theme === 'NIGHT' ? 'PAPER' : 'NIGHT');

  const [showAll, setShowAll] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const isSearching = query.trim() !== '';
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? categories[0];
  const hasMenu = categories.length > 0;
  const totalProducts = useMemo(() => categories.reduce((sum, category) => sum + category.products.length, 0), [categories]);
  const categoryName = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollToMenu = useCallback(() => {
    document.getElementById('menu')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, []);
  const selectCategory = useCallback(
    (id: string) => {
      setShowAll(false);
      onSelectCategory(id);
      window.requestAnimationFrame(scrollToMenu);
    },
    [onSelectCategory, scrollToMenu],
  );
  const selectAll = useCallback(() => {
    setShowAll(true);
    onQueryChange('');
    window.requestAnimationFrame(scrollToMenu);
  }, [onQueryChange, scrollToMenu]);

  // Keep the active category chip visible in the mobile rail (scrolls the rail itself, never the page).
  useEffect(() => {
    const rail = document.querySelector<HTMLElement>('.sherbiny-experience .s-rail');
    const chip = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rail || !chip) return;
    rail.scrollLeft += chip.getBoundingClientRect().left - rail.getBoundingClientRect().left - (rail.clientWidth - chip.clientWidth) / 2;
  }, [activeCategoryId, showAll, theme]);

  // ---- favorites: the Restaurant's featured, still available dishes (padded from the menu when fewer than 3) ----
  const favorites = useMemo(() => {
    const entries = categories.flatMap((category) => category.products.map((product) => ({ product, category })));
    const available = entries.filter((entry) => entry.product.availability !== 'SOLD_OUT');
    const picked = available.filter((entry) => entry.product.featured).slice(0, 3);
    for (const entry of available) {
      if (picked.length >= 3) break;
      if (picked.some((p) => p.product.id === entry.product.id)) continue;
      if (picked.some((p) => p.category.id === entry.category.id)) continue;
      picked.push(entry);
    }
    return picked.slice(0, 3);
  }, [categories]);
  const favoriteImages = [settings.favorite1ImageAssetPath, settings.favorite2ImageAssetPath, settings.favorite3ImageAssetPath];
  const favoriteTags = [text('favoriteTag1'), text('favoriteTag2'), text('favoriteTag3')];
  const showFavorites = settings.showFavorites && favorites.length > 0;

  // ---- contact band: only what the Restaurant has filled in ----
  const channels = buildChannels(contact, copy).filter((channel) => channel.key !== 'phone' && channel.key !== 'hotline');
  const phoneNumbers = [...locations.map((l) => l.phone), contact.phone, contact.hotline]
    .filter((n): n is string => Boolean(n))
    .filter((number, index, all) => all.findIndex((other) => displayPhone(other) === displayPhone(number)) === index);
  const addresses = locations.filter((location) => location.address);
  const hasContact = addresses.length > 0 || phoneNumbers.length > 0 || channels.length > 0 || hours !== null;

  const heroImage = resolveAssetUrl(settings.heroImageAssetPath) ?? coverUrl;
  const plateImage = resolveAssetUrl(settings.heroPlateImageAssetPath);
  const storyImage = resolveAssetUrl(settings.storyImageAssetPath);
  const words = marqueeWords(text('marquee'));
  const heroLines = text('heroTitle').split('\n');
  const heroLead = heroLines.slice(0, -1);
  const heroAccent = heroLines[heroLines.length - 1] ?? '';

  const otherLocales = availableLocales.filter((code) => code !== locale);
  const localeHref = (code: string) => `?lang=${code}${designPreview ? '&designPreview=1' : ''}`;
  const localeLabel = (code: string) => (code === 'ar' ? 'عربي' : code.toUpperCase());
  const themeLabel = theme === 'NIGHT' ? copy.lightMode : copy.darkMode;

  // ---- which sections / dishes the board shows ----
  const board: PublicMenuCategory[] = isSearching
    ? visibleCategories
    : showAll
      ? categories
      : activeCategory
        ? [activeCategory]
        : [];
  const boardCount = board.reduce((sum, category) => sum + category.products.length, 0);

  const renderRows = (category: PublicMenuCategory, withCategory: boolean) =>
    category.products.map((product, index) => (
      <SherbinyDishRow
        key={product.id}
        product={product}
        number={index + 1}
        currency={currency}
        copy={copy}
        canOrder={canOrder}
        categoryLabel={withCategory ? (categoryName.get(category.id) ?? null) : null}
        simpleQuantity={simpleQuantityByProductId.get(product.id) ?? 0}
        totalQuantity={totalQuantityByProductId.get(product.id) ?? 0}
        onOpen={onOpenProduct}
        onQuickAdd={onQuickAdd}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
      />
    ));

  const sectionIntro = (category: PublicMenuCategory, index: number) => {
    const extra = settings.categoryExtras[category.id];
    const tag = (isArabic ? extra?.tagAr : extra?.tagEn) || `SECTION ${pad(index + 1)}`;
    const blurb = (isArabic ? extra?.descAr : extra?.descEn) || category.description || '';
    const spotTitle = (isArabic ? extra?.titleAr : extra?.titleEn) || category.name;
    const spotImage = resolveAssetUrl(extra?.imageAssetPath ?? null) ?? firstPhoto(category);
    return { tag, blurb, spotTitle, spotImage };
  };

  return (
    <div
      className={`sherbiny-experience ${SHERBINY_FONT_CLASSES}`}
      dir={isArabic ? 'rtl' : 'ltr'}
      lang={locale}
      data-s-theme={theme.toLowerCase()}
      data-s-motion={settings.motion === 'OFF' ? 'off' : 'on'}
      data-s-lang={locale}
    >
      <a className="s-skip" href="#menu">{copy.verdeNavMenu}</a>

      <header className="s-header" id="top">
        <div className="s-header-inner">
          <a className="s-brand" href="#top" aria-label={`${brand} — ${copy.verdeBrandHome}`}>
            <span className="s-brand-mark">
              <SherbinyImage src={logoUrl} fallback={<SherbinyHat />} eager />
            </span>
            <span className="s-brand-name">
              <b dir="auto"><bdi>{brand}</bdi></b>
              <small dir="ltr">{text('tagline')}</small>
            </span>
          </a>
          <nav className="s-links" aria-label={copy.sherbinyPageLinks}>
            <a href="#top">{copy.sherbinyNavHome}</a>
            {showFavorites ? <a href="#favorites">{copy.sherbinyNavFavorites}</a> : null}
            {hasMenu ? <a href="#menu">{copy.sherbinyNavMenu}</a> : null}
            {hasContact ? <a href="#contact">{copy.sherbinyNavContact}</a> : null}
          </nav>
          <div className="s-actions">
            {otherLocales.map((code) => (
              <Link key={code} className="s-lang" href={localeHref(code)} lang={code} hrefLang={code} aria-label={code === 'ar' ? 'العربية' : code === 'en' ? 'English' : code}>
                {localeLabel(code)}
              </Link>
            ))}
            {settings.allowThemeSwitch ? (
              <button type="button" className="s-round" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
                {theme === 'NIGHT' ? <GuestIconSun className="size-[19px]" /> : <GuestIconMoon className="size-[18px]" />}
              </button>
            ) : null}
            {shareCode ? <ShareButton shareCode={shareCode} restaurantName={restaurantName} copy={copy} className="s-round s-share" /> : null}
            {onTrack ? (
              <button type="button" className="s-round" onClick={onTrack} aria-label={copy.trackOrder} title={copy.trackOrder}>
                <GuestIconReceipt className="size-[19px]" />
                {hasActiveOrder ? <span className="s-dot" aria-hidden="true" /> : null}
              </button>
            ) : null}
            {onOpenCart ? (
              <button type="button" className="s-round" onClick={onOpenCart} aria-label={`${copy.cart}${cartCount > 0 ? ` (${cartCount})` : ''}`}>
                <GuestIconBag className="size-[19px]" />
                <span className={`s-cart-count${cartCount > 0 ? ' is-visible' : ''}`} aria-hidden="true">{cartCount}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="s-round s-burger"
              aria-expanded={navOpen}
              aria-controls="s-mobile-nav"
              aria-label={copy.sherbinyOpenLinks}
              onClick={() => setNavOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={navOpen ? 'M5 5 19 19M19 5 5 19' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
            </button>
          </div>
        </div>
        <nav className={`s-mobile-nav${navOpen ? ' is-open' : ''}`} id="s-mobile-nav" aria-label={copy.sherbinyPageLinks} onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setNavOpen(false); }}>
          <a href="#top">{copy.sherbinyNavHome}</a>
          {showFavorites ? <a href="#favorites">{copy.sherbinyNavFavorites}</a> : null}
          {hasMenu ? <a href="#menu">{copy.sherbinyNavMenu}</a> : null}
          {hasContact ? <a href="#contact">{copy.sherbinyNavContact}</a> : null}
        </nav>
      </header>

      {notices ? <div className="s-notices">{notices}</div> : null}

      <div className="s-hero-wrap">
        <section className="s-hero" aria-labelledby="s-hero-title">
          <span className="s-side-lettering" aria-hidden="true" dir="ltr">{text('sideLettering')}</span>
          <div className="s-container s-hero-grid">
            <div className="s-hero-copy">
              <p className="s-eyebrow" dir="ltr">{text('heroEyebrow')}</p>
              <p className="s-hero-kicker" dir="auto">{text('heroKicker')}</p>
              <h1 className="s-hero-name" id="s-hero-title" dir="auto">
                {heroLead.map((line, index) => (
                  <Fragment key={index}>{line}<br /></Fragment>
                ))}
                <em>{heroAccent}</em>
              </h1>
              <p className="s-hero-lede" dir="auto">{text('heroLede')}</p>
              <div className="s-hero-actions">
                {hasMenu ? (
                  <a className="s-btn-primary" href="#menu">
                    <span>{text('ctaPrimary')}</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18 19 5M7 5h12v12" /></svg>
                  </a>
                ) : null}
                {showFavorites ? (
                  <a className="s-btn-ghost" href="#favorites">
                    <span>{text('ctaSecondary')}</span>
                    <span aria-hidden="true">✳</span>
                  </a>
                ) : null}
              </div>
              {settings.showHeroStats && hasMenu ? (
                <div className="s-hero-stats">
                  <div><strong dir="ltr">{pad(categories.length)}</strong> {text('statSections')}</div>
                  <i aria-hidden="true" />
                  <div><strong dir="ltr">{totalProducts}</strong> {text('statItems')}</div>
                </div>
              ) : null}
            </div>
            <div className="s-hero-art" aria-hidden="true">
              <div className="s-hero-ring" />
              <SherbinyImage
                src={heroImage}
                className="s-hero-photo"
                fallback={<SherbinyPizzaArt className="s-hero-photo is-art" />}
                eager
              />
              <SherbinyImage
                src={plateImage}
                className="s-hero-plate"
                fallback={<SherbinyWrapArt className="s-hero-plate is-art" />}
                eager
              />
              <div className="s-stamp">
                <SherbinyFlame className="s-flame" />
                <span>{text('stampTitle')}</span>
                <small dir="ltr">{text('stampSub')}</small>
              </div>
            </div>
          </div>
          <div className="s-hero-floor" />
        </section>
      </div>

      {settings.showMarquee && words.length > 0 ? (
        <div className="s-marquee" aria-hidden="true">
          <div className="s-marquee-track">
            {[0, 1].map((copyIndex) => (
              <div className="s-marquee-group" key={copyIndex}>
                {words.map((word, i) => (
                  <span className="s-marquee-item" key={`${word}-${i}`}>
                    <span dir="auto">{word}</span>
                    <i>✳</i>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {orderingBar ? <div className="s-container s-ordering">{orderingBar}</div> : null}

      <main className="s-main">
        {showFavorites ? (
          <section className="s-section s-favorites" id="favorites" aria-labelledby="s-fav-title">
            <div className="s-container">
              <div className="s-section-head">
                <div>
                  <p className="s-eyebrow s-label" dir="ltr">{text('favoritesEyebrow')}</p>
                  <h2 className="s-heading" id="s-fav-title" dir="auto"><AccentText text={text('favoritesTitle')} /></h2>
                </div>
                <p className="s-deck" dir="auto">{text('favoritesNote')}</p>
              </div>
              <div className={`s-fav-grid is-n${favorites.length}`}>
                {favorites.map(({ product, category }, index) => {
                  const photo = resolveAssetUrl(favoriteImages[index] ?? null) ?? resolveAssetUrl(product.primaryImageAssetPath) ?? firstPhoto(category);
                  const sizes = product.variants ?? [];
                  const cheapest = sizes.length
                    ? sizes.reduce((best, size) => (toMinorUnits(size.discountedPrice ?? size.price) < toMinorUnits(best.discountedPrice ?? best.price) ? size : best))
                    : null;
                  return (
                    <article key={product.id} className={`s-fav s-reveal${index === 0 ? ' is-primary' : ''}`}>
                      <span className="s-fav-index" dir="ltr" aria-hidden="true">{`/${pad(index + 1)}`}</span>
                      <div className="s-fav-art" aria-hidden="true">
                        <SherbinyImage src={photo} fallback={index === 1 ? <SherbinyPizzaArt /> : <SherbinyWrapArt />} />
                      </div>
                      <div className="s-fav-caption">
                        <div>
                          <small dir="ltr">{favoriteTags[index]}</small>
                          <h3 dir="auto"><bdi>{product.name}</bdi></h3>
                          <p>
                            {cheapest ? <>{copy.fromPrice} </> : null}
                            <Price
                              amount={cheapest ? (cheapest.discountedPrice ?? cheapest.price) : (product.discount?.discountedPrice ?? product.basePrice)}
                              currency={currency}
                              currencyClassName="s-price-unit"
                            />
                          </p>
                        </div>
                        <button type="button" onClick={() => onOpenProduct(product)} aria-label={copy.sherbinyDetails(product.name)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18 19 5M7 5h12v12" /></svg>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        <section className="s-menu-area" id="menu" aria-labelledby="s-menu-title">
          <div className="s-container">
            <div className="s-menu-header">
              <div>
                <p className="s-eyebrow s-label" dir="ltr">{text('menuEyebrow')}</p>
                <h2 className="s-heading" id="s-menu-title" dir="auto"><AccentText text={text('menuTitle')} /></h2>
                <p className="s-menu-note" dir="auto">{text('menuNote')}</p>
              </div>
              <div className="s-menu-tools">
                <label className="s-search">
                  <GuestIconSearch className="size-[17px]" aria-hidden="true" />
                  <span className="sr-only">{copy.searchMenu}</span>
                  <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={copy.searchPlaceholder} autoComplete="off" enterKeyHint="search" />
                  {isSearching ? (
                    <button type="button" className="s-search-clear" onClick={() => onQueryChange('')} aria-label={copy.clearSearch}>
                      <GuestIconClose className="size-4" />
                    </button>
                  ) : null}
                </label>
              </div>
            </div>

            {hasMenu ? (
              <div className="s-rail-wrap">
                <nav className="s-rail" aria-label={copy.verdeMenuSections}>
                  <button type="button" aria-pressed={!isSearching && showAll} onClick={selectAll}>{copy.sherbinyAllSections}</button>
                  {categories.map((category) => (
                    <button key={category.id} type="button" aria-pressed={!isSearching && !showAll && category.id === activeCategory?.id} onClick={() => selectCategory(category.id)}>
                      <bdi>{category.name}</bdi>
                    </button>
                  ))}
                </nav>
              </div>
            ) : null}

            <div className="s-menu-layout">
              {hasMenu ? (
                <aside className="s-index" aria-label={text('indexTitle')}>
                  <div className="s-index-head">
                    <small dir="ltr">{text('indexKicker')}</small>
                    <strong dir="auto">{text('indexTitle')}</strong>
                  </div>
                  <nav className="s-index-scroll" aria-label={copy.verdeMenuSections}>
                    <button type="button" className="s-index-btn" aria-pressed={!isSearching && showAll} onClick={selectAll}>
                      <span className="s-index-num" dir="ltr">00</span>
                      <span className="s-index-label">{copy.sherbinyAllSections}</span>
                      <span className="s-index-count" dir="ltr">{totalProducts}</span>
                    </button>
                    {categories.map((category, index) => (
                      <button key={category.id} type="button" className="s-index-btn" aria-pressed={!isSearching && !showAll && category.id === activeCategory?.id} onClick={() => selectCategory(category.id)}>
                        <span className="s-index-num" dir="ltr">{pad(index + 1)}</span>
                        <span className="s-index-label"><bdi>{category.name}</bdi></span>
                        <span className="s-index-count" dir="ltr">{category.products.length}</span>
                      </button>
                    ))}
                  </nav>
                  <p className="s-index-foot" dir="auto"><SherbinyFlame className="s-flame-sm" />{text('indexNote')}</p>
                </aside>
              ) : null}

              <div className="s-board" aria-live="polite">
                {isSearching ? (
                  <div className="s-board-top">
                    <div>
                      <small dir="ltr">SEARCH RESULTS</small>
                      <h3 dir="auto">{copy.verdeSearchResults}</h3>
                      <p dir="auto">{copy.verdeAcrossMenu}</p>
                    </div>
                    <span className="s-chip" dir="ltr">{boardCount} ITEMS</span>
                  </div>
                ) : showAll ? (
                  <div className="s-board-top">
                    <div>
                      <small dir="ltr">ALL MENU SECTIONS</small>
                      <h3 dir="auto">{copy.sherbinyAllSections}</h3>
                    </div>
                    <span className="s-chip" dir="ltr">{totalProducts} ITEMS</span>
                  </div>
                ) : null}

                {board.length === 0 ? (
                  <div className="s-empty" role="status">
                    <GuestIconSearch className="size-9" />
                    <strong>{copy.verdeNoMatchTitle}</strong>
                    <p>{copy.verdeNoMatchText}</p>
                    {isSearching ? <button type="button" onClick={() => onQueryChange('')}>{copy.clearSearch}</button> : null}
                  </div>
                ) : null}

                {board.map((category) => {
                  const index = Math.max(0, categories.findIndex((c) => c.id === category.id));
                  const intro = sectionIntro(category, index);
                  const single = !isSearching && !showAll;
                  return (
                    <section className="s-category" key={category.id} aria-label={category.name}>
                      {!isSearching ? (
                        <div className={`s-board-top${single ? '' : ' is-inner'}`}>
                          <div>
                            <small dir="ltr">{intro.tag}</small>
                            <h3 dir="auto">{category.name}</h3>
                            {intro.blurb ? <p dir="auto">{intro.blurb}</p> : null}
                          </div>
                          <span className="s-chip" dir="ltr">{pad(category.products.length)} ITEMS</span>
                        </div>
                      ) : null}
                      {settings.showSpotlight && single ? (
                        <div className="s-spotlight">
                          <div className="s-spotlight-copy">
                            <p className="s-eyebrow" dir="ltr">{text('spotlightEyebrow')}</p>
                            <h4 dir="auto">{intro.spotTitle}</h4>
                            {intro.blurb ? <p dir="auto">{intro.blurb}</p> : null}
                          </div>
                          <div className="s-spotlight-art" aria-hidden="true">
                            <SherbinyImage src={intro.spotImage} fallback={<SherbinyDishArt />} />
                          </div>
                        </div>
                      ) : null}
                      <div className="s-list">
                        <p className="s-list-eyebrow" dir="auto">
                          {isSearching ? `${category.name} · ` : ''}{copy.sherbinyListHint(category.products.length)}
                        </p>
                        {renderRows(category, isSearching)}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {settings.showStory ? (
          <section className="s-story" aria-labelledby="s-story-title">
            {storyImage ? <SherbinyImage src={storyImage} className="s-story-photo" fallback={null} /> : null}
            <div className="s-container s-story-grid">
              <div>
                <p className="s-eyebrow" dir="ltr">{text('storyEyebrow')}</p>
                <h2 id="s-story-title" dir="auto"><AccentText text={text('storyTitle')} /></h2>
                <p dir="auto">{text('storyText')}</p>
              </div>
              <blockquote className="s-quote">
                <span className="s-quote-mark" aria-hidden="true">”</span>
                <strong dir="auto">{text('storyQuote')}</strong>
                <small dir="ltr">{text('storyQuoteBy')}</small>
              </blockquote>
            </div>
          </section>
        ) : null}

        {hasContact ? (
          <section className="s-contact" id="contact" aria-labelledby="s-contact-title">
            <div className="s-container">
              <div className="s-section-head">
                <div>
                  <p className="s-eyebrow s-label" dir="ltr">{text('contactEyebrow')}</p>
                  <h2 className="s-heading" id="s-contact-title" dir="auto"><AccentText text={text('contactTitle')} /></h2>
                </div>
                {hours ? <p className={`s-hours${hours.open ? ' is-open' : ''}`}><span aria-hidden="true" />{hoursLabel(hours, copy, locale)}</p> : null}
              </div>
              {addresses.length > 0 || phoneNumbers.length > 0 ? (
                <div className="s-contact-grid">
                  {addresses.map((location, index) => (
                    <div className="s-contact-cell" key={`a${index}`}>
                      <span className="s-contact-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg></span>
                      <div>
                        <small>{addresses.length > 1 ? location.name : copy.sherbinyAddressLabel}</small>
                        <strong dir="auto">{location.address}</strong>
                      </div>
                    </div>
                  ))}
                  {phoneNumbers.map((number) => (
                    <a className="s-contact-cell" key={number} href={`tel:${number}`}>
                      <span className="s-contact-icon"><GuestIconPhone className="size-6" /></span>
                      <div>
                        <small>{copy.sherbinyPhoneLabel}</small>
                        <strong dir="ltr" className="s-phone">{displayPhone(number)}</strong>
                      </div>
                    </a>
                  ))}
                </div>
              ) : null}
              {channels.length > 0 ? (
                <ul className="s-channels" aria-label={copy.findUs}>
                  {channels.map((channel) => (
                    <li key={channel.key}>
                      <a href={channel.href} {...(channel.external ? LINK_PROPS : {})}>
                        <Badge channel={channel} size={32} />
                        <span>{channel.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="s-footer">
        <div className="s-container s-footer-inner">
          <div>
            <strong dir="auto">{brand}</strong>
            <span dir="ltr">{text('tagline')}</span>
          </div>
          <div className="s-powered">{poweredBy}</div>
        </div>
      </footer>
      {children}
    </div>
  );
}
