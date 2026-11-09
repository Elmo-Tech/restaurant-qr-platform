'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { GuestIconBag, GuestIconClose, GuestIconMoon, GuestIconPhone, GuestIconReceipt, GuestIconSearch, GuestIconSun } from '../../../../components/guest/icons';
import type { RestaurantContact } from '../../../../lib/contact/types';
import { shareMenuUrl } from '../../../../lib/guest-menu/subdomain-host';
import { resolveAssetUrl } from '../../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../../lib/public-menu/copy';
import type { DesignOffers } from '../guest-view-types';
import {
  makkbozCopy,
  type MakkbozCopyKey,
  type MakkbozMenuSettings,
  type MakkbozView,
} from '../../../../lib/public-menu/makkboz-settings';
import type { PublicHours, PublicMenuCategory, PublicMenuProduct } from '../../../../lib/public-menu/types';
import { Badge, LINK_PROPS, buildChannels } from '../GuestContact';
import { hoursLabel } from '../HoursBadge';
import { ShareButton } from '../ShareButton';
import { VerdeImage as MakkbozImage } from '../verde/VerdeImage';
import { MakkbozCard } from './MakkbozCard';
import { MakkbozOrnament, MakkbozPieArt, MakkbozVillage, MakkbozWrapArt } from './MakkbozArt';
import { MAKKBOZ_FONT_CLASSES } from './makkboz-fonts';
import { useExclusiveTheme } from '../useExclusiveTheme';
import './makkboz.css';

const FAVORITES_KEY = 'makkboz-favorites';
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

export interface MakkbozLocation {
  name: string;
  address: string | null;
  phone: string | null;
}

export interface MakkbozMenuProps {
  settings: MakkbozMenuSettings;
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
  locations: MakkbozLocation[];
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

/** Text with line breaks; when `accent` is set the last line (or last word) is drawn in the gold accent. */
function Lines({ text, accent }: { text: string; accent?: 'line' | 'word' }) {
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

const splitWords = (text: string): string[] => text.split('|').map((word) => word.trim()).filter(Boolean).slice(0, 6);

const displayPhone = (number: string): string => number.replace(/^\+20(\d{9,10})$/, '0$1');

const firstPhoto = (category: PublicMenuCategory | undefined): string | null =>
  resolveAssetUrl(category?.imageAssetPath ?? category?.products.find((p) => p.primaryImageAssetPath)?.primaryImageAssetPath ?? null);

export function MakkbozMenu(props: MakkbozMenuProps) {
  const {
    settings, guestTheme, restaurantName, logoUrl, locale, availableLocales, designPreview, copy, currency,
    categories, visibleCategories, query, onQueryChange, canOrder, simpleQuantityByProductId, totalQuantityByProductId,
    onOpenProduct, onQuickAdd, onIncrement, onDecrement, cartCount, onOpenCart, onTrack, hasActiveOrder, shareCode,
    contact, locations, hours, notices, orderingBar, offers, poweredBy, children,
  } = props;

  const isArabic = locale === 'ar';
  const brand = makkbozCopy(settings, 'brand', locale, restaurantName).trim() || restaurantName;
  const text = useCallback((key: MakkbozCopyKey) => makkbozCopy(settings, key, locale, brand), [settings, locale, brand]);

  const theme = useExclusiveTheme({
    guestTheme,
    defaultMode: settings.theme === 'DARK' ? 'dark' : settings.theme === 'SYSTEM' ? 'system' : 'light',
    designPreview,
  });
  const themeLabel = theme.effective === 'dark' ? copy.lightMode : copy.darkMode;
  // The Restaurant's default view until the guest picks one.
  const [viewChoice, setView] = useState<MakkbozView | null>(null);
  const view: MakkbozView = viewChoice ?? settings.defaultView;
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favoritesRaw = useSyncExternalStore(subscribeFavorites, readFavorites, () => '');
  const favorites = useMemo(() => parseFavorites(favoritesRaw), [favoritesRaw]);
  const [notice, setNotice] = useState('');
  const [activeId, setActiveId] = useState<string>('all');
  const noticeTimer = useRef<number | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

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
        say(copy.makkbozFavoriteRemoved);
      } else {
        next.add(productId);
        say(copy.makkbozFavoriteAdded);
      }
      writeFavorites([...next]);
    },
    [copy.makkbozFavoriteAdded, copy.makkbozFavoriteRemoved, say],
  );

  const isSearching = query.trim() !== '';
  const hasMenu = categories.length > 0;
  const totalProducts = useMemo(() => categories.reduce((sum, c) => sum + c.products.length, 0), [categories]);

  // What the catalog shows: search results, favorites, or every section.
  const sections = useMemo(() => {
    const source = isSearching ? visibleCategories : categories;
    return source
      .map((category) => ({ ...category, products: favoritesOnly ? category.products.filter((p) => favorites.has(p.id)) : category.products }))
      .filter((category) => category.products.length > 0);
  }, [isSearching, visibleCategories, categories, favoritesOnly, favorites]);
  const shownCount = sections.reduce((sum, c) => sum + c.products.length, 0);
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, []);

  // Scroll spy: the section under the sticky rail is the active one.
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.makkboz-experience .m-section'));
    if (nodes.length === 0) return undefined;
    const update = () => {
      const line = window.innerWidth <= 740 ? 150 : 175;
      let current = 'all';
      for (const node of nodes) if (node.getBoundingClientRect().top <= line + 48) current = node.dataset.section ?? current;
      const menu = document.getElementById('menu');
      if (menu && window.scrollY < menu.offsetTop - 110) current = 'all';
      setActiveId(current);
    };
    update();
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(() => {
        update();
        pending = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [sections]);

  // Keep the active pill visible in the rail (scrolls the rail itself, never the page).
  useEffect(() => {
    const rail = document.querySelector<HTMLElement>('.makkboz-experience .m-rail');
    const pill = rail?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!rail || !pill) return;
    rail.scrollLeft += pill.getBoundingClientRect().left - rail.getBoundingClientRect().left - (rail.clientWidth - pill.clientWidth) / 2;
  }, [activeId]);

  const shareMenu = useCallback(async () => {
    if (!shareCode) return;
    const url = shareMenuUrl(window.location.origin, shareCode);
    try {
      if (navigator.share) {
        await navigator.share({ title: brand, url });
      } else {
        await navigator.clipboard.writeText(url);
        say(copy.makkbozLinkCopied);
      }
    } catch {
      /* cancelled */
    }
  }, [brand, copy.makkbozLinkCopied, say, shareCode]);

  // ---- photos: Restaurant upload -> menu data -> built-in artwork ----
  const heroImage = resolveAssetUrl(settings.heroImageAssetPath);
  const heroSmall = resolveAssetUrl(settings.heroSmallImageAssetPath);
  const fineWords = splitWords(text('heroFine'));

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

  const summary = favoritesOnly
    ? copy.makkbozSummaryFavorites(shownCount)
    : isSearching
      ? copy.makkbozSummarySearch(shownCount)
      : copy.makkbozSummaryAll(totalProducts);

  const brandMark = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- Restaurant logo from the runtime API origin.
    <img src={logoUrl} alt="" />
  ) : (
    <span className="m-brand-text" dir="auto">{brand}</span>
  );

  return (
    <div
      className={`makkboz-experience ${MAKKBOZ_FONT_CLASSES}`}
      dir={isArabic ? 'rtl' : 'ltr'}
      lang={locale}
      data-m-theme={theme.attr}
      data-m-motion={settings.motion === 'OFF' ? 'off' : 'on'}
      data-m-view={view === 'LIST' ? 'list' : 'cards'}
      data-m-lang={locale}
    >
      <a className="m-skip" href="#menu">{copy.makkbozNavMenu}</a>

      {settings.showAnnouncement && text('announcement') ? (
        <div className="m-announcement"><span aria-hidden="true">✦</span> {text('announcement')} <span aria-hidden="true">✦</span></div>
      ) : null}

      <header className="m-header" id="top">
        <div className="m-container m-header-inner">
          <a className="m-brand" href="#top" aria-label={`${brand} — ${copy.verdeBrandHome}`}>{brandMark}</a>
          <nav className="m-links" aria-label={copy.sherbinyPageLinks}>
            {hasMenu ? <a href="#menu" className="is-active">{copy.makkbozNavMenu}</a> : null}
            {settings.showStory ? <a href="#our-story">{copy.makkbozNavStory}</a> : null}
            {hasContact ? <a href="#contact">{copy.makkbozNavContact}</a> : null}
          </nav>
          <div className="m-actions">
            {otherLocales.map((code) => (
              <Link key={code} className="m-icon-btn m-lang" href={localeHref(code)} lang={code} hrefLang={code} aria-label={code === 'ar' ? 'العربية' : code === 'en' ? 'English' : code}>
                {localeLabel(code)}
              </Link>
            ))}
            {settings.allowThemeSwitch ? (
              <button type="button" className="m-icon-btn m-theme" onClick={theme.toggle} aria-label={themeLabel} title={themeLabel}>
                {theme.effective === 'dark' ? <GuestIconSun className="size-[20px]" /> : <GuestIconMoon className="size-[19px]" />}
              </button>
            ) : null}
            {hasMenu ? (
              <button
                type="button"
                className={`m-icon-btn${searchOpen ? ' is-active' : ''}`}
                aria-label={copy.searchMenu}
                aria-expanded={searchOpen}
                aria-controls="m-search-row"
                onClick={() => {
                  setSearchOpen((open) => !open);
                  window.setTimeout(() => searchInput.current?.focus(), 120);
                  scrollTo('m-tools');
                }}
              >
                <GuestIconSearch className="size-[20px]" />
              </button>
            ) : null}
            {hasMenu ? (
              <button
                type="button"
                className={`m-icon-btn m-heart${favoritesOnly ? ' is-active' : ''}`}
                aria-pressed={favoritesOnly}
                aria-label={favoritesOnly ? copy.makkbozFavoritesHide : copy.makkbozFavoritesShow}
                onClick={() => {
                  setFavoritesOnly((on) => !on);
                  scrollTo('menu');
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.5c0 5.6-8.8 11.2-8.8 11.2S3.2 14.1 3.2 8.5A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.8 1.9Z" /></svg>
              </button>
            ) : null}
            {shareCode ? <ShareButton shareCode={shareCode} restaurantName={restaurantName} copy={copy} className="m-icon-btn m-share" /> : null}
            {onTrack ? (
              <button type="button" className="m-icon-btn" onClick={onTrack} aria-label={copy.trackOrder} title={copy.trackOrder}>
                <GuestIconReceipt className="size-[19px]" />
                {hasActiveOrder ? <span className="m-dot" aria-hidden="true" /> : null}
              </button>
            ) : null}
            {onOpenCart ? (
              <button type="button" className="m-cart-btn" onClick={onOpenCart} aria-label={`${copy.cart}${cartCount > 0 ? ` (${cartCount})` : ''}`}>
                <GuestIconBag className="size-[19px]" />
                <span className="m-cart-count" aria-hidden="true">{cartCount}</span>
              </button>
            ) : null}
            <button type="button" className="m-icon-btn m-burger" aria-expanded={navOpen} aria-controls="m-mobile-nav" aria-label={copy.sherbinyOpenLinks} onClick={() => setNavOpen((open) => !open)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={navOpen ? 'M5 5 19 19M19 5 5 19' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
            </button>
          </div>
        </div>
        <nav className={`m-mobile-nav${navOpen ? ' is-open' : ''}`} id="m-mobile-nav" aria-label={copy.sherbinyPageLinks} onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setNavOpen(false); }}>
          {hasMenu ? <a href="#menu">{copy.makkbozNavMenu}</a> : null}
          {settings.showStory ? <a href="#our-story">{copy.makkbozNavStory}</a> : null}
          {hasContact ? <a href="#contact">{copy.makkbozNavContact}</a> : null}
        </nav>
      </header>

      {notices ? <div className="m-notices"><div className="m-container">{notices}</div></div> : null}

      <section className="m-hero m-paper" aria-labelledby="m-hero-title">
        <div className="m-container m-hero-grid">
          <div className="m-hero-copy">
            <p className="m-hero-eyebrow"><span aria-hidden="true">✧</span> {text('heroEyebrow')} <span aria-hidden="true">✧</span></p>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Restaurant logo from the runtime API origin.
              <img className="m-hero-logo" src={logoUrl} alt={brand} />
            ) : (
              <p className="m-hero-brand" dir="auto">{brand}</p>
            )}
            <h1 id="m-hero-title" dir="auto"><Lines text={text('heroTitle')} accent="line" /></h1>
            <p className="m-hero-desc" dir="auto">{text('heroDesc')}</p>
            <div className="m-hero-cta">
              {hasMenu ? (
                <a className="m-btn" href="#menu">
                  <span>{text('ctaPrimary')}</span>
                  <svg className="m-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
                </a>
              ) : null}
              {shareCode ? (
                <button type="button" className="m-text-action" onClick={() => void shareMenu()}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-5 5 5-5 5 5" /><path d="M5 13v7h14v-7" /></svg>
                  {text('ctaShare')}
                </button>
              ) : null}
            </div>
            {fineWords.length > 0 ? (
              <p className="m-hero-fine" dir="auto">
                <span className="m-fine-icon" aria-hidden="true">✳</span>
                {fineWords.map((word, index) => (
                  <Fragment key={`${word}-${index}`}>
                    {index > 0 ? <span className="m-fine-dot" aria-hidden="true" /> : null}
                    {word}
                  </Fragment>
                ))}
              </p>
            ) : null}
          </div>
          <div className="m-hero-showcase" aria-hidden="true">
            <div className="m-hero-arch">
              <div className="m-arch-texture" />
              <span className="m-arch-label" dir="ltr">{text('archLabel')}</span>
              <div className="m-photo-ring">
                <MakkbozImage src={heroImage} fallback={<MakkbozPieArt className="m-ring-art" />} eager />
              </div>
              <span className="m-arch-caption" dir="auto">{text('archCaption')}</span>
            </div>
            <div className="m-stamp"><span>{text('stampTop')}</span><strong>{text('stampMain')}</strong><small>✦</small></div>
            <div className="m-small-photo"><MakkbozImage src={heroSmall} fallback={<MakkbozWrapArt />} eager /></div>
            <span className="m-scribble">✳</span>
          </div>
        </div>
        <div className="m-hero-edge" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i}>✣</span>)}</div>
      </section>

      {settings.showValues ? (
        <section className="m-values" aria-label={text('menuEyebrow')}>
          <div className="m-container m-values-inner">
            {([1, 2, 3] as const).map((n, index) => (
              <Fragment key={n}>
                {index > 0 ? <span className="m-value-divider" aria-hidden="true" /> : null}
                <div className="m-value">
                  <span className="m-value-mark" aria-hidden="true">{['✳', '✶', '❋'][index]}</span>
                  <div>
                    <strong dir="auto">{text(`value${n}Title` as MakkbozCopyKey)}</strong>
                    <small dir="auto">{text(`value${n}Sub` as MakkbozCopyKey)}</small>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
      ) : null}

      {orderingBar ? <div className="m-ordering"><div className="m-container">{orderingBar}</div></div> : null}

      {offers ? <div className="m-offers"><div className="m-container">{offers.strip}</div></div> : null}

      <section className="m-intro m-paper" id="menu" aria-labelledby="m-menu-title">
        <div className="m-container">
          <p className="m-intro-eyebrow"><span className="m-rule" aria-hidden="true" /> {text('menuEyebrow')} <span className="m-rule" aria-hidden="true" /></p>
          <h2 id="m-menu-title" dir="auto"><Lines text={text('menuTitle')} accent="word" /></h2>
          <p className="m-intro-note" dir="auto">{text('menuNote')}</p>
          <div className="m-intro-deco" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span></div>
        </div>
      </section>

      {hasMenu ? (
        <div className="m-tools" id="m-tools">
          <div className="m-container">
            <nav className="m-rail" aria-label={copy.verdeMenuSections}>
              {offers ? (
                <button type="button" className="m-pill" data-offers-chip onClick={offers.onJump}>
                  <bdi>🎁 {offers.chipLabel}</bdi>
                </button>
              ) : null}
              <button type="button" className={`m-pill${activeId === 'all' ? ' is-active' : ''}`} aria-current={activeId === 'all' ? 'true' : undefined} onClick={() => scrollTo('menu')}>
                {copy.makkbozAll} <span className="m-pill-count">{totalProducts}</span>
              </button>
              {sections.map((category) => (
                <button key={category.id} type="button" className={`m-pill${activeId === category.id ? ' is-active' : ''}`} aria-current={activeId === category.id ? 'true' : undefined} onClick={() => scrollTo(`section-${category.id}`)}>
                  <bdi>{category.name}</bdi>
                </button>
              ))}
            </nav>
            <div className="m-search-row" id="m-search-row" hidden={!searchOpen && !isSearching}>
              <GuestIconSearch className="size-[19px]" aria-hidden="true" />
              <input ref={searchInput} type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.searchMenu} autoComplete="off" enterKeyHint="search" />
              <button type="button" className="m-search-close" onClick={() => { onQueryChange(''); setSearchOpen(false); }} aria-label={copy.clearSearch}>
                <GuestIconClose className="size-[18px]" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="m-catalog m-paper" aria-label={copy.verdeMenuSections}>
        <div className="m-container">
          <div className="m-toolbar">
            <p role="status" aria-live="polite">{summary}</p>
            <div className="m-view-switch" role="group" aria-label={copy.makkbozViewMode}>
              <button type="button" aria-pressed={view === 'CARDS'} onClick={() => setView('CARDS')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                <span>{copy.makkbozViewCards}</span>
              </button>
              <button type="button" aria-pressed={view === 'LIST'} onClick={() => setView('LIST')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6h11M10 12h11M10 18h11M4 6h2M4 12h2M4 18h2" /></svg>
                <span>{copy.makkbozViewList}</span>
              </button>
            </div>
          </div>

          {sections.map((category) => {
            const index = Math.max(0, categories.findIndex((c) => c.id === category.id));
            const extra = settings.categoryExtras[category.id];
            const tag = (isArabic ? extra?.tagAr : extra?.tagEn) || `${pad(index + 1)} / ${category.name}`;
            const intro = (isArabic ? extra?.introAr : extra?.introEn) || category.description || '';
            const photo = resolveAssetUrl(extra?.imageAssetPath ?? null) ?? firstPhoto(category);
            return (
              <section className="m-section" id={`section-${category.id}`} data-section={category.id} key={category.id} aria-labelledby={`m-heading-${category.id}`}>
                <div className="m-chapter">
                  <span className="m-chapter-number" aria-hidden="true">{pad(index + 1)}</span>
                  <div className="m-chapter-name">
                    <small dir="ltr">{tag}</small>
                    <h3 id={`m-heading-${category.id}`} dir="auto">{category.name}</h3>
                    {intro ? <p dir="auto">{intro}</p> : null}
                  </div>
                  {photo ? (
                    <span className="m-chapter-photo" aria-hidden="true"><MakkbozImage src={photo} fallback={null} /></span>
                  ) : (
                    <span className="m-chapter-flower" aria-hidden="true">✳</span>
                  )}
                </div>
                <div className="m-grid">
                  {category.products.map((product) => (
                    <MakkbozCard
                      key={product.id}
                      product={product}
                      currency={currency}
                      copy={copy}
                      canOrder={canOrder}
                      categoryLabel={isSearching || favoritesOnly ? (categoryName.get(category.id) ?? category.name) : null}
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

          {sections.length === 0 ? (
            <div className="m-empty" role="status">
              <MakkbozOrnament className="m-empty-mark" />
              <h3>{favoritesOnly && !isSearching ? copy.makkbozNoFavoritesTitle : copy.verdeNoMatchTitle}</h3>
              <p>{favoritesOnly && !isSearching ? copy.makkbozNoFavoritesText : copy.verdeNoMatchText}</p>
              <button type="button" className="m-btn" onClick={() => { onQueryChange(''); setFavoritesOnly(false); }}>{copy.makkbozShowAll}</button>
            </div>
          ) : null}
        </div>
      </main>

      {settings.showStory ? (
        <section className="m-story" id="our-story" aria-labelledby="m-story-title">
          <div className="m-container m-story-grid">
            <div className="m-story-content">
              <p className="m-story-kicker" dir="auto">{text('storyKicker')}</p>
              <h2 id="m-story-title" dir="auto"><Lines text={text('storyTitle')} accent="line" /></h2>
              <p dir="auto">{text('storyText')}</p>
              <p className="m-story-signature" dir="auto">{text('storySignature')}</p>
            </div>
            <div className="m-story-art" aria-hidden="true">
              <MakkbozVillage />
              <span className="m-story-star one">✧</span>
              <span className="m-story-star two">✳</span>
            </div>
          </div>
        </section>
      ) : null}

      <footer className="m-footer" id="contact">
        <div className="m-container m-footer-grid">
          <div className="m-footer-brand">
            <strong dir="auto">{brand}</strong>
            <p dir="auto">{text('footerTagline')}</p>
          </div>
          {hasContact ? (
            <div className="m-footer-contact">
              <small>{text('contactTitle')}</small>
              {addresses.map((location, index) => (
                <p className="m-contact-line" key={`a${index}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></svg>
                  <span dir="auto">{location.address}</span>
                </p>
              ))}
              {phoneNumbers.map((number) => (
                <a className="m-contact-line" key={number} href={`tel:${number}`}>
                  <GuestIconPhone className="size-[17px]" />
                  <span dir="ltr">{displayPhone(number)}</span>
                </a>
              ))}
              {hours ? <p className={`m-hours${hours.open ? ' is-open' : ''}`}><span aria-hidden="true" />{hoursLabel(hours, copy, locale)}</p> : null}
              {channels.length > 0 ? (
                <ul className="m-channels" aria-label={copy.findUs}>
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
        </div>
        <div className="m-container m-footer-bottom">
          <span dir="auto">© {brand}</span>
          <span className="m-powered">{poweredBy}</span>
        </div>
      </footer>

      <div className={`m-toast${notice ? ' is-visible' : ''}`} role="status" aria-live="polite">{notice}</div>
      {children}
    </div>
  );
}
