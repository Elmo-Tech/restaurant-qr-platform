'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { GuestIconBag, GuestIconClose, GuestIconMoon, GuestIconPhone, GuestIconReceipt, GuestIconSearch, GuestIconSun } from '../../../../components/guest/icons';
import type { RestaurantContact } from '../../../../lib/contact/types';
import { resolveAssetUrl } from '../../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../../lib/public-menu/copy';
import type { DesignOffers } from '../guest-view-types';
import {
  meatLoversCopy,
  type MeatLoversCopyKey,
  type MeatLoversMenuSettings,
  type MeatLoversView,
} from '../../../../lib/public-menu/meat-lovers-settings';
import type { PublicHours, PublicMenuCategory, PublicMenuProduct } from '../../../../lib/public-menu/types';
import { Badge, LINK_PROPS, buildChannels } from '../GuestContact';
import { hoursLabel } from '../HoursBadge';
import { ShareButton } from '../ShareButton';
import { useExclusiveTheme } from '../useExclusiveTheme';
import { VerdeImage as MeatLoversImage } from '../verde/VerdeImage';
import { MeatLoversKnife, MeatLoversMark } from './MeatLoversArt';
import { MeatLoversCard } from './MeatLoversCard';
import { MEAT_LOVERS_FONT_CLASSES } from './meat-lovers-fonts';
import './meat-lovers.css';

const FAVORITES_KEY = 'meat-lovers-favorites';
const pad = (n: number): string => String(n).padStart(2, '0');

// Favorites live in this browser only (never on the server). `useSyncExternalStore` keeps the server render and the
// first client render empty, then adopts what this browser stored.
let memoryFavorites = '';
const favoriteListeners = new Set<() => void>();
const subscribeFavorites = (listener: () => void) => {
  favoriteListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    favoriteListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};
function readFavorites(): string {
  try {
    return window.localStorage.getItem(FAVORITES_KEY) ?? memoryFavorites;
  } catch {
    return memoryFavorites;
  }
}
function writeFavorites(ids: string[]) {
  memoryFavorites = JSON.stringify(ids);
  try {
    window.localStorage.setItem(FAVORITES_KEY, memoryFavorites);
  } catch {
    /* private mode: favorites last for this visit only */
  }
  favoriteListeners.forEach((listener) => listener());
}
const parseFavorites = (raw: string): Set<string> => {
  try {
    const saved = JSON.parse(raw || '[]') as unknown;
    return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
};

export interface MeatLoversLocation {
  name: string;
  address: string | null;
  phone: string | null;
}

export interface MeatLoversMenuProps {
  settings: MeatLoversMenuSettings;
  /** The guest's saved light / dark pick from the cookie (null = never chose). */
  guestTheme: 'light' | 'dark' | null;
  restaurantName: string;
  logoUrl: string | null;
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
  locations: MeatLoversLocation[];
  hours: PublicHours | null;
  /** Announcements, ordering-mode switch and table / pickup notices, composed by the shared page. */
  notices: ReactNode;
  /** Pickup / delivery switch and ordering notices, shown under the hero. */
  orderingBar: ReactNode;
  /** Offers / Bundles (DEC-069): the shared strip and the first "Offers" chip; null = none to show. */
  offers?: DesignOffers | null;
  poweredBy: ReactNode;
  /** Shared overlays (cart bar, cart, product sheet, tracking) rendered inside the themed root. */
  children?: ReactNode;
}

/** Text with line breaks; the last line (or last word) can be drawn in the red accent. */
function Lines({ text, accent }: { text: string; accent?: 'line' | 'word' | 'stop' }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, index) => {
        const last = index === lines.length - 1;
        if (!accent || !last) {
          return (
            <Fragment key={index}>
              {line}
              {last ? null : <br />}
            </Fragment>
          );
        }
        if (accent === 'line') return <em key={index}>{line}</em>;
        if (accent === 'stop') {
          // The closing full stop of a headline is the brand's red dot.
          const stop = /[.。]$/.test(line.trim());
          return (
            <Fragment key={index}>
              {stop ? line.trim().slice(0, -1) : line}
              {stop ? <span className="ml-stop">.</span> : null}
            </Fragment>
          );
        }
        const words = line.trim().split(/\s+/);
        const tail = words.pop() ?? '';
        return (
          <Fragment key={index}>
            {words.length > 0 ? `${words.join(' ')} ` : null}
            <span>{tail}</span>
          </Fragment>
        );
      })}
    </>
  );
}

const displayPhone = (number: string): string => number.replace(/^\+20(\d{9,10})$/, '0$1');

export function MeatLoversMenu(props: MeatLoversMenuProps) {
  const {
    settings, guestTheme, restaurantName, logoUrl, locale, availableLocales, designPreview, copy, currency,
    categories, visibleCategories, query, onQueryChange, canOrder, simpleQuantityByProductId, totalQuantityByProductId,
    onOpenProduct, onQuickAdd, onIncrement, onDecrement, cartCount, onOpenCart, onTrack, hasActiveOrder, shareCode,
    contact, locations, hours, notices, orderingBar, offers, poweredBy, children,
  } = props;

  const isArabic = locale === 'ar';
  const brand = meatLoversCopy(settings, 'brand', locale, restaurantName).trim() || restaurantName;
  const text = useCallback((key: MeatLoversCopyKey) => meatLoversCopy(settings, key, locale, brand), [settings, locale, brand]);

  const theme = useExclusiveTheme({
    guestTheme,
    defaultMode: settings.theme === 'LIGHT' ? 'light' : settings.theme === 'SYSTEM' ? 'system' : 'dark',
    designPreview,
  });
  const themeLabel = theme.effective === 'dark' ? copy.lightMode : copy.darkMode;
  // The Restaurant's default view until the guest picks one.
  const [viewChoice, setView] = useState<MeatLoversView | null>(null);
  const view: MeatLoversView = viewChoice ?? settings.defaultView;
  // 'all' | 'favorites' | a category id
  const [selected, setSelected] = useState<string>('all');
  const [navOpen, setNavOpen] = useState(false);
  const favoritesRaw = useSyncExternalStore(subscribeFavorites, readFavorites, () => '');
  const favorites = useMemo(() => parseFavorites(favoritesRaw), [favoritesRaw]);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const productsTop = useRef<HTMLDivElement>(null);

  const say = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2600);
  }, []);
  const toggleFavorite = useCallback(
    (productId: string) => {
      const next = parseFavorites(readFavorites());
      if (next.has(productId)) {
        next.delete(productId);
        say(copy.meatLoversFavoriteRemoved);
      } else {
        next.add(productId);
        say(copy.meatLoversFavoriteAdded);
      }
      writeFavorites([...next]);
    },
    [copy.meatLoversFavoriteAdded, copy.meatLoversFavoriteRemoved, say],
  );

  const isSearching = query.trim() !== '';
  const hasMenu = categories.length > 0;
  const totalProducts = useMemo(() => categories.reduce((sum, c) => sum + c.products.length, 0), [categories]);
  const favoriteCount = useMemo(
    () => categories.reduce((sum, c) => sum + c.products.filter((p) => favorites.has(p.id)).length, 0),
    [categories, favorites],
  );
  // A saved choice that no longer exists (a category switched off, the last favorite removed) falls back to everything.
  const activeSelection =
    selected === 'all' ? 'all' : selected === 'favorites' ? (favoriteCount > 0 ? 'favorites' : 'all') : categories.some((c) => c.id === selected) ? selected : 'all';

  // What the catalog shows: search results (across every section), favorites, one section, or all of them.
  const sections = useMemo(() => {
    if (isSearching) return visibleCategories.filter((c) => c.products.length > 0);
    if (activeSelection === 'favorites') {
      return categories.map((c) => ({ ...c, products: c.products.filter((p) => favorites.has(p.id)) })).filter((c) => c.products.length > 0);
    }
    if (activeSelection !== 'all') return categories.filter((c) => c.id === activeSelection);
    return categories.filter((c) => c.products.length > 0);
  }, [isSearching, visibleCategories, categories, activeSelection, favorites]);
  const shownCount = sections.reduce((sum, c) => sum + c.products.length, 0);
  const mixedSections = isSearching || activeSelection === 'favorites';

  const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollToId = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, []);

  const choose = useCallback(
    (id: string) => {
      setSelected(id);
      onQueryChange('');
      // Bring the start of the list into view only when the page is scrolled past it.
      const top = productsTop.current?.getBoundingClientRect().top ?? 0;
      if (top < 80) window.setTimeout(() => scrollToId('ml-tools'), 0);
    },
    [onQueryChange, scrollToId],
  );

  // Keep the active pill visible in the tab strip (scrolls the strip itself, never the page).
  useEffect(() => {
    const strip = document.querySelector<HTMLElement>('.meat-lovers-experience .ml-tabs');
    const pill = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !pill) return;
    const offset = pill.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - pill.clientWidth) / 2;
    strip.scrollLeft += offset;
  }, [activeSelection]);

  const openSearch = useCallback(() => {
    scrollToId('ml-tools');
    window.setTimeout(() => searchInput.current?.focus({ preventScroll: true }), 250);
  }, [scrollToId]);

  // ---- photos: Restaurant upload -> built-in artwork ----
  const heroImage = resolveAssetUrl(settings.heroImageAssetPath);
  const storyImage = resolveAssetUrl(settings.storyImageAssetPath);

  // ---- contact: only what is filled in ----
  const channels = buildChannels(contact, copy).filter((channel) => channel.key !== 'phone' && channel.key !== 'hotline');
  const phoneNumbers = [...locations.map((l) => l.phone), contact.phone, contact.hotline]
    .filter((n): n is string => Boolean(n))
    .filter((number, index, all) => all.findIndex((other) => displayPhone(other) === displayPhone(number)) === index);
  const addresses = locations.filter((location) => location.address);
  const hasContact = addresses.length > 0 || phoneNumbers.length > 0 || channels.length > 0 || hours !== null;

  const otherLocales = availableLocales.filter((code) => code !== locale);
  const localeHref = (code: string) => `?lang=${code}${designPreview ? '&designPreview=1' : ''}`;
  const localeLabel = (code: string) => (code === 'ar' ? 'عربي' : code.toUpperCase());

  const brandMark = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- Restaurant logo from the runtime API origin.
    <img src={logoUrl} alt="" />
  ) : (
    <span className="ml-brand-text" dir="auto">{brand}</span>
  );

  const eyebrowOf = (category: PublicMenuCategory, index: number): string => {
    const extra = settings.categoryExtras[category.id];
    return (isArabic ? extra?.tagAr : extra?.tagEn) || `${pad(index + 1)} / ${category.name}`;
  };
  const heading =
    isSearching ? copy.verdeSearchResults : activeSelection === 'favorites' ? copy.meatLoversFavorites : activeSelection === 'all' ? copy.meatLoversAll : (categories.find((c) => c.id === activeSelection)?.name ?? copy.meatLoversAll);

  return (
    <div
      className={`meat-lovers-experience ${MEAT_LOVERS_FONT_CLASSES}`}
      dir={isArabic ? 'rtl' : 'ltr'}
      lang={locale}
      data-ml-theme={theme.attr}
      data-ml-motion={settings.motion === 'OFF' ? 'off' : 'on'}
      data-ml-view={view === 'LIST' ? 'list' : 'cards'}
      data-ml-lang={locale}
    >
      <a className="ml-skip" href="#menu">{copy.meatLoversNavMenu}</a>

      {settings.showAnnouncement && (text('stripLabel') || text('announcement')) ? (
        <div className="ml-strip">
          <div className="ml-container ml-strip-inner">
            <span dir="ltr">{text('stripLabel')}</span>
            <span className="ml-strip-note" dir="auto">{text('announcement')}</span>
          </div>
        </div>
      ) : null}

      <header className="ml-header" id="top">
        <div className="ml-container ml-header-inner">
          <a className="ml-brand" href="#top" aria-label={`${brand} — ${copy.verdeBrandHome}`}>{brandMark}</a>
          <nav className="ml-links" aria-label={copy.sherbinyPageLinks}>
            {hasMenu ? <a href="#ml-tools">{copy.meatLoversNavSections}</a> : null}
            {hasMenu ? <a href="#menu">{copy.meatLoversNavMenu}</a> : null}
            {settings.showStory ? <a href="#story">{copy.meatLoversNavStory}</a> : null}
            {hasContact ? <a href="#contact">{copy.meatLoversNavContact}</a> : null}
          </nav>
          <div className="ml-actions">
            {otherLocales.map((code) => (
              <Link key={code} className="ml-icon-btn ml-lang" href={localeHref(code)} lang={code} hrefLang={code} aria-label={code === 'ar' ? 'العربية' : code === 'en' ? 'English' : code}>
                {localeLabel(code)}
              </Link>
            ))}
            {hasMenu ? (
              <button type="button" className="ml-icon-btn" aria-label={copy.searchMenu} onClick={openSearch}>
                <GuestIconSearch className="size-[20px]" />
              </button>
            ) : null}
            {settings.allowThemeSwitch ? (
              <button type="button" className="ml-theme-switch" onClick={theme.toggle} aria-label={themeLabel} title={themeLabel}>
                {theme.effective === 'dark' ? <GuestIconSun className="size-[18px]" /> : <GuestIconMoon className="size-[18px]" />}
                <span>{themeLabel}</span>
              </button>
            ) : null}
            {shareCode ? <ShareButton shareCode={shareCode} restaurantName={restaurantName} copy={copy} className="ml-icon-btn ml-share" /> : null}
            {onTrack ? (
              <button type="button" className="ml-icon-btn" onClick={onTrack} aria-label={copy.trackOrder} title={copy.trackOrder}>
                <GuestIconReceipt className="size-[19px]" />
                {hasActiveOrder ? <span className="ml-dot" aria-hidden="true" /> : null}
              </button>
            ) : null}
            {onOpenCart ? (
              <button type="button" className="ml-icon-btn ml-cart-btn" onClick={onOpenCart} aria-label={`${copy.cart}${cartCount > 0 ? ` (${cartCount})` : ''}`}>
                <GuestIconBag className="size-[21px]" />
                {cartCount > 0 ? <span className="ml-cart-count" aria-hidden="true">{cartCount}</span> : null}
              </button>
            ) : null}
            <button type="button" className="ml-icon-btn ml-burger" aria-expanded={navOpen} aria-controls="ml-mobile-nav" aria-label={copy.sherbinyOpenLinks} onClick={() => setNavOpen((open) => !open)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={navOpen ? 'M5 5 19 19M19 5 5 19' : 'M3 6h18M3 12h18M3 18h14'} /></svg>
            </button>
          </div>
        </div>
        <nav className={`ml-mobile-nav${navOpen ? ' is-open' : ''}`} id="ml-mobile-nav" aria-label={copy.sherbinyPageLinks} onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setNavOpen(false); }}>
          {hasMenu ? <a href="#ml-tools">{copy.meatLoversNavSections}</a> : null}
          {hasMenu ? <a href="#menu">{copy.meatLoversNavMenu}</a> : null}
          {settings.showStory ? <a href="#story">{copy.meatLoversNavStory}</a> : null}
          {hasContact ? <a href="#contact">{copy.meatLoversNavContact}</a> : null}
        </nav>
      </header>

      {notices ? <div className="ml-notices"><div className="ml-container">{notices}</div></div> : null}

      <section className="ml-hero" aria-labelledby="ml-hero-title">
        <div className="ml-hero-texture" aria-hidden="true" />
        <div className="ml-container ml-hero-grid">
          <div className="ml-hero-copy">
            <span className="ml-micro" dir="ltr"><span className="ml-tiny-line" /> {text('heroEyebrow')} <span className="ml-micro-index">— 001</span></span>
            <h1 id="ml-hero-title" dir="auto"><Lines text={text('heroTitle')} accent="stop" /></h1>
            <p className="ml-hero-desc" dir="auto">{text('heroDesc')}</p>
            <div className="ml-hero-ctas">
              {hasMenu ? (
                <a className="ml-button" href="#menu">
                  <span>{text('ctaPrimary')}</span>
                  <svg className="ml-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m18 12-13 0m6-6-6 6 6 6" /></svg>
                </a>
              ) : null}
              {hasMenu && text('ctaSecondary') ? (
                <a className="ml-button-link" href="#ml-tools"><span>{text('ctaSecondary')}</span><span className="ml-down" aria-hidden="true">↙</span></a>
              ) : null}
            </div>
            {text('heroUnder') || text('heroUnderTag') ? (
              <div className="ml-hero-under">
                <span className="ml-under-rule" aria-hidden="true" />
                <span dir="auto">{text('heroUnder')}</span>
                <b dir="ltr">{text('heroUnderTag')}</b>
              </div>
            ) : null}
          </div>
          <div className="ml-hero-art" aria-hidden="true">
            <div className="ml-hero-frame">
              <MeatLoversImage src={heroImage} className="ml-hero-photo" fallback={<span className="ml-hero-fallback"><MeatLoversMark className="ml-hero-mark" /></span>} eager />
              <div className="ml-hero-shade" />
            </div>
            <div className="ml-stamp"><span dir="ltr">{text('stampTop')}</span><MeatLoversMark /><span dir="ltr">{text('stampBottom')}</span></div>
            <span className="ml-hero-index"><bdi dir="ltr">{text('heroIndex')}</bdi></span>
          </div>
        </div>
        <svg className="ml-hero-wave" viewBox="0 0 1440 125" preserveAspectRatio="none" aria-hidden="true"><path d="M0 47 C160 102 337 121 518 84 C768 23 870 28 1074 70 C1212 97 1320 80 1440 41 L1440 125 L0 125Z" /></svg>
      </section>

      {orderingBar ? <div className="ml-ordering"><div className="ml-container">{orderingBar}</div></div> : null}

      {offers ? <div className="ml-offers"><div className="ml-container">{offers.strip}</div></div> : null}

      <section className="ml-menu" id="menu" aria-labelledby="ml-menu-title">
        <div className="ml-container">
          <div className="ml-menu-title">
            <div>
              <span className="ml-section-id" dir="ltr">01 <span className="ml-red-dash" /> {text('menuEyebrow')}</span>
              <h2 id="ml-menu-title" dir="auto"><Lines text={text('menuTitle')} accent="word" /></h2>
            </div>
            <p dir="auto">{text('menuNote')}</p>
          </div>

          {hasMenu ? (
            <div className="ml-tools" id="ml-tools">
              <div className="ml-tabs-wrap">
                <div className="ml-tabs" role="group" aria-label={copy.verdeMenuSections}>
                  {offers ? (
                    <button type="button" className="ml-tab" data-offers-chip onClick={offers.onJump}>
                      <bdi>🎁 {offers.chipLabel}</bdi>
                    </button>
                  ) : null}
                  <button type="button" className="ml-tab" aria-pressed={activeSelection === 'all' && !isSearching} onClick={() => choose('all')}>
                    {copy.meatLoversAll}<span dir="ltr">{pad(totalProducts)}</span>
                  </button>
                  {categories.map((category) => (
                    <button key={category.id} type="button" className="ml-tab" aria-pressed={activeSelection === category.id && !isSearching} onClick={() => choose(category.id)}>
                      <bdi>{category.name}</bdi><span dir="ltr">{pad(category.products.length)}</span>
                    </button>
                  ))}
                  {favoriteCount > 0 ? (
                    <button type="button" className="ml-tab ml-tab-fav" aria-pressed={activeSelection === 'favorites' && !isSearching} onClick={() => choose('favorites')}>
                      {copy.meatLoversFavorites}<span dir="ltr">{pad(favoriteCount)}</span>
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="ml-tool-actions">
                <label className="ml-search">
                  <GuestIconSearch className="size-[19px]" aria-hidden="true" />
                  <input ref={searchInput} type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.searchMenu} autoComplete="off" enterKeyHint="search" />
                  {isSearching ? (
                    <button type="button" className="ml-search-clear" onClick={() => onQueryChange('')} aria-label={copy.clearSearch}>
                      <GuestIconClose className="size-[16px]" />
                    </button>
                  ) : null}
                </label>
                <div className="ml-view-switch" role="group" aria-label={copy.meatLoversViewMode}>
                  <button type="button" aria-pressed={view === 'CARDS'} aria-label={copy.meatLoversViewCards} title={copy.meatLoversViewCards} onClick={() => setView('CARDS')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                  </button>
                  <button type="button" aria-pressed={view === 'LIST'} aria-label={copy.meatLoversViewList} title={copy.meatLoversViewList} onClick={() => setView('LIST')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h12M9 12h12M9 19h12M3 5h2M3 12h2M3 19h2" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="ml-content">
            {hasMenu ? (
              <aside className="ml-index" aria-label={copy.verdeMenuSections}>
                <span className="ml-index-title" dir="ltr">NAVIGATION / {pad(categories.length)}</span>
                <div>
                  {offers ? (
                    <button type="button" className="ml-index-item" data-offers-chip onClick={offers.onJump}>
                      <small dir="ltr" aria-hidden="true">🎁</small>
                      <span><bdi>{offers.chipLabel}</bdi></span>
                    </button>
                  ) : null}
                  {categories.map((category, index) => (
                    <button key={category.id} type="button" className="ml-index-item" aria-pressed={activeSelection === category.id && !isSearching} onClick={() => choose(category.id)}>
                      <small dir="ltr">{pad(index + 1)}</small>
                      <span><bdi>{category.name}</bdi></span>
                    </button>
                  ))}
                </div>
                {text('indexNote') ? (
                  <div className="ml-index-bottom" dir="ltr"><MeatLoversKnife /><span>{text('indexNote')}</span></div>
                ) : null}
              </aside>
            ) : null}

            <main className="ml-products" aria-label={copy.verdeMenuSections} ref={productsTop}>
              <div className="ml-products-head">
                <h3 dir="auto">{heading}</h3>
                <span role="status" aria-live="polite">{copy.meatLoversResultCount(shownCount)}</span>
              </div>

              {sections.map((category) => {
                const sectionIndex = Math.max(0, categories.findIndex((c) => c.id === category.id));
                const extra = settings.categoryExtras[category.id];
                const eyebrow = eyebrowOf(category, sectionIndex);
                const intro = (isArabic ? extra?.introAr : extra?.introEn) || category.description || '';
                const photo = resolveAssetUrl(extra?.imageAssetPath ?? null) ?? resolveAssetUrl(category.imageAssetPath);
                // One section on screen needs no repeated heading; a list of several (or search results) does.
                const showHeading = sections.length > 1 || mixedSections;
                return (
                  <section className="ml-section" key={category.id} aria-labelledby={`ml-heading-${category.id}`}>
                    {showHeading || photo || intro ? (
                      <div className="ml-category-heading">
                        {photo ? <span className="ml-category-photo" aria-hidden="true"><MeatLoversImage src={photo} fallback={null} /></span> : null}
                        <div>
                          <span dir="ltr">{eyebrow}</span>
                          <h4 id={`ml-heading-${category.id}`} dir="auto">{category.name}</h4>
                          {intro ? <p dir="auto">{intro}</p> : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="ml-grid">
                      {category.products.map((product, productIndex) => (
                        <MeatLoversCard
                          key={product.id}
                          product={product}
                          index={productIndex + 1}
                          sectionLabel={eyebrow}
                          categoryName={category.name}
                          currency={currency}
                          locale={locale}
                          copy={copy}
                          canOrder={canOrder}
                          isFavorite={favorites.has(product.id)}
                          simpleQuantity={simpleQuantityByProductId.get(product.id) ?? 0}
                          totalQuantity={totalQuantityByProductId.get(product.id) ?? 0}
                          onToggleFavorite={toggleFavorite}
                          onOpen={onOpenProduct}
                          onQuickAdd={onQuickAdd}
                          onIncrement={onIncrement}
                          onDecrement={onDecrement}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}

              {hasMenu && sections.length === 0 ? (
                <div className="ml-empty" role="status">
                  <MeatLoversMark className="ml-empty-mark" />
                  <h3>{copy.verdeNoMatchTitle}</h3>
                  <p>{copy.verdeNoMatchText}</p>
                  <button type="button" className="ml-button" onClick={() => { onQueryChange(''); setSelected('all'); }}>{copy.meatLoversShowAll}</button>
                </div>
              ) : null}
            </main>
          </div>
        </div>
      </section>

      {settings.showStory ? (
        <section className="ml-story" id="story" aria-labelledby="ml-story-title">
          <div className="ml-container ml-story-grid">
            <div className="ml-story-visual" aria-hidden="true">
              <MeatLoversImage src={storyImage} fallback={<span className="ml-story-fallback"><MeatLoversMark className="ml-hero-mark" /></span>} />
              <span className="ml-story-caption" dir="ltr">{text('storyCaption')}</span>
            </div>
            <div className="ml-story-words">
              <span className="ml-section-id" dir="ltr">02 <span className="ml-red-dash" /> {text('storyKicker')}</span>
              <h2 id="ml-story-title" dir="auto"><Lines text={text('storyTitle')} accent="line" /></h2>
              <p dir="auto">{text('storyText')}</p>
              {hasMenu && text('storyLink') ? (
                <a href="#menu" className="ml-story-link"><span>{text('storyLink')}</span><svg className="ml-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m18 12-13 0m6-6-6 6 6 6" /></svg></a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <footer className="ml-footer" id="contact">
        <div className="ml-container ml-footer-grid">
          <div className="ml-footer-brand">
            <a href="#top" className="ml-footer-logo" aria-label={`${brand} — ${copy.verdeBrandHome}`}>{brandMark}</a>
            <p dir="auto">{text('footerTagline')}</p>
          </div>
          {hasContact ? (
            <div className="ml-footer-contact">
              <small dir="auto">{text('contactTitle')}</small>
              {addresses.map((location, index) => (
                <p className="ml-contact-line" key={`a${index}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></svg>
                  <span dir="auto">{location.address}</span>
                </p>
              ))}
              {phoneNumbers.map((number) => (
                <a className="ml-contact-line" key={number} href={`tel:${number}`}>
                  <GuestIconPhone className="size-[17px]" />
                  <span dir="ltr">{displayPhone(number)}</span>
                </a>
              ))}
              {hours ? <p className={`ml-hours${hours.open ? ' is-open' : ''}`}><span aria-hidden="true" />{hoursLabel(hours, copy, locale)}</p> : null}
              {channels.length > 0 ? (
                <ul className="ml-channels" aria-label={copy.findUs}>
                  {channels.map((channel) => (
                    <li key={channel.key}>
                      <a href={channel.href} {...(channel.external ? LINK_PROPS : {})}>
                        <Badge channel={channel} size={30} />
                        <span>{channel.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <a className="ml-back-top" href="#top">{copy.meatLoversBackTop} ↑</a>
        </div>
        <div className="ml-container ml-footer-bottom">
          <span dir="auto">© {brand}</span>
          <span className="ml-powered">{poweredBy}</span>
        </div>
      </footer>

      <div className={`ml-toast${notice ? ' is-visible' : ''}`} role="status" aria-live="polite">{notice}</div>
      {children}
    </div>
  );
}
