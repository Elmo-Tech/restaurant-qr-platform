'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { GuestIconBag, GuestIconClose, GuestIconMoon, GuestIconReceipt, GuestIconSearch, GuestIconSun } from '../../../../components/guest/icons';
import { resolveAssetUrl } from '../../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../../lib/public-menu/copy';
import type { PublicMenuCategory, PublicMenuProduct } from '../../../../lib/public-menu/types';
import { verdeCopy, type VerdeCopyKey, type VerdeMenuSettings, type VerdeTheme } from '../../../../lib/public-menu/verde-settings';
import { ShareButton } from '../ShareButton';
import { VerdeBannerArt, VerdeChapterArt, VerdePizzaArt } from './VerdeArt';
import { VERDE_FONT_CLASSES } from './verde-fonts';
import { VerdeImage } from './VerdeImage';
import { VerdeProductCard } from './VerdeProductCard';
import './verde.css';

const THEME_STORAGE_KEY = 'verde-menu-theme';
const pad = (n: number): string => String(n).padStart(2, '0');

// A guest's own light / dark pick lives in this browser only (never on the server); `useSyncExternalStore`
// keeps server and first client render on the Restaurant's default theme, then adopts the stored pick.
let memoryTheme: VerdeTheme | null = null;
const themeListeners = new Set<() => void>();
const subscribeTheme = (listener: () => void) => {
  themeListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    themeListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};
function readStoredTheme(): VerdeTheme | null {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'LIGHT' || saved === 'SIGNATURE') return saved;
  } catch {
    /* storage unavailable: fall back to the in-memory pick */
  }
  return memoryTheme;
}
function storeTheme(next: VerdeTheme) {
  memoryTheme = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* private mode: the pick lasts for this visit only */
  }
  themeListeners.forEach((listener) => listener());
}

export interface VerdeMenuProps {
  settings: VerdeMenuSettings;
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
  /** Announcements, ordering-mode switch and table / pickup notices, composed by the shared page. */
  notices: ReactNode;
  /** Pickup / delivery switch and ordering notices, shown under the hero and the ticker. */
  orderingBar: ReactNode;
  contact: ReactNode;
  poweredBy: ReactNode;
  /** Shared overlays (cart bar, cart, product sheet, tracking) rendered inside the themed root so they match the skin. */
  children?: ReactNode;
}

/** Brand word -> size class so a long Restaurant name never overflows the poster headline. */
function wordSize(word: string): 'xl' | 'lg' | 'md' | 'sm' {
  const length = [...word].length;
  return length <= 6 ? 'xl' : length <= 9 ? 'lg' : length <= 13 ? 'md' : 'sm';
}

function lines(text: string): ReactNode {
  return text.split('\n').flatMap((line, i) => (i === 0 ? [line] : [<br key={i} />, line]));
}

/** Marquee words: the Restaurant's own list when set, else the menu's category names. */
function marqueeWords(text: string, categories: PublicMenuCategory[]): string[] {
  const custom = text.split(/[,،|·\n]/).map((word) => word.trim()).filter(Boolean);
  const words = custom.length > 0 ? custom : categories.map((category) => category.name);
  return words.slice(0, 12);
}

export function VerdeMenu(props: VerdeMenuProps) {
  const {
    settings, restaurantName, logoUrl, locale, availableLocales, publicCode, designPreview, copy, currency,
    categories, visibleCategories, query, onQueryChange, activeCategoryId, onSelectCategory, canOrder,
    simpleQuantityByProductId, totalQuantityByProductId, onOpenProduct, onQuickAdd, onIncrement, onDecrement,
    cartCount, onOpenCart, onTrack, hasActiveOrder, shareCode, notices, orderingBar, contact, poweredBy, children,
  } = props;

  const brand = settings.brandWord.trim() || restaurantName;
  const text = useCallback((key: VerdeCopyKey) => verdeCopy(settings, key, locale, brand), [settings, locale, brand]);
  const isArabic = locale === 'ar';
  const brandInitial = ([...brand.trim()][0] ?? 'V').toLocaleUpperCase();

  // Theme: the Restaurant's choice first; a guest's own pick (when allowed) wins, except in the staff preview.
  const guestTheme = useSyncExternalStore(subscribeTheme, readStoredTheme, () => null);
  const theme: VerdeTheme = !designPreview && settings.allowThemeSwitch && guestTheme ? guestTheme : settings.theme;
  const toggleTheme = () => storeTheme(theme === 'SIGNATURE' ? 'LIGHT' : 'SIGNATURE');

  const [view, setView] = useState<'photos' | 'quick'>('photos');
  const isSearching = query.trim() !== '';
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? categories[0];
  const activeIndex = Math.max(0, categories.findIndex((category) => category.id === activeCategory?.id));
  const categoryName = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  const shown: { product: PublicMenuProduct; categoryId: string }[] = useMemo(() => {
    const source = isSearching ? visibleCategories : activeCategory ? [visibleCategories.find((c) => c.id === activeCategory.id) ?? activeCategory] : [];
    return source.flatMap((category) => category.products.map((product) => ({ product, categoryId: category.id })));
  }, [isSearching, visibleCategories, activeCategory]);

  const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollToMenu = useCallback(() => {
    document.getElementById('menu')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, []);
  const selectCategory = useCallback(
    (id: string) => {
      onSelectCategory(id);
      window.requestAnimationFrame(scrollToMenu);
    },
    [onSelectCategory, scrollToMenu],
  );

  // Keep the active category chip visible in the mobile rail.
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rail || !chip) return;
    // Scroll the rail itself (never the page); the offset maths works in both text directions.
    const offset = chip.getBoundingClientRect().left - rail.getBoundingClientRect().left - (rail.clientWidth - chip.clientWidth) / 2;
    rail.scrollLeft += offset;
  }, [activeCategoryId]);

  // ---- photos with a fallback chain: Restaurant upload -> menu data -> built-in artwork ----
  const firstPhoto = (category: PublicMenuCategory | undefined): string | null =>
    resolveAssetUrl(category?.imageAssetPath ?? category?.products.find((p) => p.primaryImageAssetPath)?.primaryImageAssetPath ?? null);
  const chapterTargets = [
    categories.find((c) => c.id === settings.chapter1CategoryId) ?? categories[0],
    categories.find((c) => c.id === settings.chapter2CategoryId) ?? (categories.length > 1 ? categories[categories.length - 1] : categories[0]),
  ];
  const chapters = [
    { key: 'chapter1' as const, eyebrow: text('chapter1Eyebrow'), title: text('chapter1Title'), target: chapterTargets[0], image: resolveAssetUrl(settings.chapter1ImageAssetPath) ?? firstPhoto(chapterTargets[0]), tone: 'a' as const },
    { key: 'chapter2' as const, eyebrow: text('chapter2Eyebrow'), title: text('chapter2Title'), target: chapterTargets[1], image: resolveAssetUrl(settings.chapter2ImageAssetPath) ?? firstPhoto(chapterTargets[1]), tone: 'b' as const },
  ];
  const extra = activeCategory ? settings.categoryExtras[activeCategory.id] : undefined;
  const spotlightTitle = (isArabic ? extra?.introAr : extra?.introEn) || activeCategory?.name || '';
  const spotlightDesc = (isArabic ? extra?.descAr : extra?.descEn) || activeCategory?.description || '';
  const spotlightImage = resolveAssetUrl(extra?.imageAssetPath ?? null) ?? firstPhoto(activeCategory);

  const heroImage = resolveAssetUrl(settings.heroImageAssetPath);
  const bannerImage = resolveAssetUrl(settings.bannerImageAssetPath);
  const words = marqueeWords(text('marquee'), categories);
  const word = `${brand}${/[.!?؟]$/.test(brand) ? '' : '.'}`;
  const stampTitle = brand.trim().split(/\s+/)[0] ?? brand;

  const otherLocales = availableLocales.filter((code) => code !== locale);
  const localeHref = (code: string) => `/q/${publicCode}?lang=${code}${designPreview ? '&designPreview=1' : ''}`;
  const localeLabel = (code: string) => (code === 'ar' ? 'عربي' : code.toUpperCase());

  const themeLabel = theme === 'SIGNATURE' ? copy.lightMode : copy.darkMode;
  const hasMenu = categories.length > 0;

  return (
    <div
      className={`verde-experience ${VERDE_FONT_CLASSES}`}
      data-verde-theme={theme.toLowerCase()}
      data-verde-motion={settings.motion === 'OFF' ? 'off' : 'on'}
      data-verde-lang={locale}
    >
      <a className="v-skip" href="#menu">{copy.verdeNavMenu}</a>

      <header className="v-header">
        <div className="v-header-inner v-wrap">
          <a className="v-brand" href="#top" aria-label={`${brand} — ${copy.verdeBrandHome}`}>
            <VerdeImage src={logoUrl} fallback={null} eager />
            <span className="v-brand-copy">
              <b dir="auto"><bdi>{brand}</bdi></b>
              <small dir="auto">{text('tagline')}</small>
            </span>
          </a>
          <nav className="v-main-links" aria-label={copy.verdeMenuSections}>
            <a href="#menu">{copy.verdeNavMenu}</a>
            {settings.showChapters && hasMenu ? <a href="#discover">{copy.verdeNavDiscover}</a> : null}
          </nav>
          <div className="v-header-actions">
            {otherLocales.map((code) => (
              <Link key={code} className="v-lang" href={localeHref(code)} lang={code} hrefLang={code} aria-label={code === 'ar' ? 'العربية' : code === 'en' ? 'English' : code}>
                {localeLabel(code)}
              </Link>
            ))}
            {settings.allowThemeSwitch ? (
              <button type="button" className="v-mini v-theme" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
                {theme === 'SIGNATURE' ? <GuestIconSun className="size-[19px]" /> : <GuestIconMoon className="size-[18px]" />}
              </button>
            ) : null}
            {shareCode ? (
              <span className="v-share">
                <ShareButton shareCode={shareCode} restaurantName={restaurantName} copy={copy} className="v-mini" />
              </span>
            ) : null}
            {onTrack ? (
              <button type="button" className="v-mini" onClick={onTrack} aria-label={copy.trackOrder} title={copy.trackOrder}>
                <GuestIconReceipt className="size-[19px]" />
                {hasActiveOrder ? <span className="v-mini-dot" aria-hidden="true" /> : null}
              </button>
            ) : null}
            {onOpenCart ? (
              <button type="button" className="v-mini v-cart" onClick={onOpenCart} aria-label={`${copy.cart}${cartCount > 0 ? ` (${cartCount})` : ''}`}>
                <GuestIconBag className="size-[19px]" />
                <span className={`v-cart-count${cartCount > 0 ? ' is-visible' : ''}`} aria-hidden="true">{cartCount}</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {notices ? <div className="v-wrap v-notices">{notices}</div> : null}

      <div className="v-hero-frame" id="top">
        <section className="v-hero-stage" aria-labelledby="v-hero-title" data-brand={brand}>
          <div className="v-hero-grid v-wrap">
            <div className="v-hero-copy">
              <p className="v-hero-kicker" dir="ltr">{text('kicker')}</p>
              <h1 className="v-hero-head" id="v-hero-title">
                <span className="the" dir="auto">{text('headlineTop')}</span>
                <span className={`word is-${wordSize(word)}`} dir="auto"><bdi>{word}</bdi></span>
                <span className="line" dir="auto">{text('headlineLine')}</span>
              </h1>
              <p className="v-hero-description" dir="auto">{text('description')}</p>
              <div className="v-hero-cta">
                <a className="v-button-cream" href="#menu">
                  <span>{text('cta')}</span>
                  <span className="arrow" aria-hidden="true">↗</span>
                </a>
              </div>
              <p className="v-hero-small" dir="ltr"><span aria-hidden="true" />{text('heroNote')}</p>
            </div>
            <div className="v-hero-art" aria-hidden={heroImage ? undefined : true}>
              <span className="v-star one" aria-hidden="true">✳</span>
              <span className="v-star two" aria-hidden="true">✦</span>
              <div className="v-hero-disc" />
              <VerdeImage
                src={heroImage}
                className={`v-hero-image is-${settings.heroImageShape.toLowerCase()}`}
                fallback={<VerdePizzaArt className="v-hero-image is-art" />}
                eager
              />
              <div className="v-hero-stamp" aria-hidden="true">
                <div className="stars">★★★</div>
                <b dir="auto">{stampTitle}</b>
                <span dir="auto">{text('stampSub')}</span>
              </div>
              <div className="v-hero-sticker" dir="auto" aria-hidden="true">{text('sticker')}</div>
            </div>
          </div>
        </section>
      </div>

      {settings.showMarquee && words.length > 0 ? (
        <div className="v-marquee" aria-hidden="true">
          <div className="v-marquee-track">
            {[0, 1].map((copyIndex) => (
              <div className="v-marquee-group" key={copyIndex}>
                {words.map((entry, i) => (
                  <span className="v-marquee-item" key={`${entry}-${i}`}>
                    <span dir="auto">{entry}</span>
                    <i>✳</i>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {orderingBar ? <div className="v-wrap v-notices v-ordering">{orderingBar}</div> : null}

      {settings.showChapters && hasMenu ? (
        <section id="discover" className="v-wrap" aria-labelledby="v-intro-title">
          <div className="v-intro">
            <div>
              <p className="v-eyebrow" dir="ltr">{text('introEyebrow')}</p>
              <h2 id="v-intro-title" dir="auto">{lines(text('introTitle'))}</h2>
            </div>
            <p dir="auto">{text('introDescription')}</p>
          </div>
          <div className="v-chapters">
            {chapters.map((chapter, index) => (
              <button
                key={chapter.key}
                type="button"
                className={`v-chapter${index === 1 ? ' is-small' : ''}`}
                aria-label={`${chapter.title} — ${copy.verdeOpenCategory(chapter.target?.name ?? '')}`}
                onClick={() => chapter.target && selectCategory(chapter.target.id)}
              >
                <VerdeImage src={chapter.image} fallback={<VerdeChapterArt tone={chapter.tone} className="v-chapter-art" />} />
                <span className="v-chapter-copy">
                  <span dir="ltr">{chapter.eyebrow}</span>
                  <strong dir="auto">{chapter.title}</strong>
                </span>
                <span className="v-chapter-arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="v-menu-area" id="menu" aria-labelledby="v-menu-title">
        <div className="v-wrap">
          <div className="v-menu-topline">
            <span className="id" dir="ltr">{text('menuTopId')}</span>
            {settings.menuTopNoteAr || settings.menuTopNoteEn ? <span className="note" dir="auto">{text('menuTopNote')}</span> : null}
          </div>

          {hasMenu ? (
            <div className="v-mobile-rail">
              <nav className="v-rail-inner" ref={railRef} aria-label={copy.verdeMenuSections}>
                {categories.map((category) => (
                  <button key={category.id} type="button" aria-pressed={!isSearching && category.id === activeCategory?.id} onClick={() => selectCategory(category.id)}>
                    <bdi>{category.name}</bdi>
                  </button>
                ))}
              </nav>
            </div>
          ) : null}

          <div className="v-menu-layout">
            {hasMenu ? (
              <aside className="v-sidebar">
                <p className="v-sidebar-heading" dir="ltr">{text('sidebarHeading')}</p>
                <nav className="v-category-nav" aria-label={copy.verdeMenuSections}>
                  {categories.map((category, index) => (
                    <button key={category.id} type="button" aria-current={!isSearching && category.id === activeCategory?.id ? 'true' : undefined} className={!isSearching && category.id === activeCategory?.id ? 'is-active' : ''} onClick={() => selectCategory(category.id)}>
                      <span className="number" dir="ltr">{pad(index + 1)}</span>
                      <span className="label"><bdi>{category.name}</bdi></span>
                      <span className="chev" aria-hidden="true">↗</span>
                    </button>
                  ))}
                </nav>
              </aside>
            ) : null}

            <div className="v-menu-content">
              <div className="v-section-heading">
                <div>
                  <p className="v-section-eyebrow" dir="ltr">
                    {isSearching ? `${brand} / ${copy.verdeSearchEyebrow}` : text('sectionEyebrow').replace('{n}', pad(activeIndex + 1))}
                  </p>
                  <h2 id="v-menu-title" dir="auto">{isSearching ? copy.verdeSearchResults : activeCategory?.name}</h2>
                  <p className="v-section-sub" dir="auto">{isSearching ? copy.verdeAcrossMenu : text('tagline')}</p>
                </div>
                <span className="v-section-mark" aria-hidden="true">{isSearching ? '★' : pad(activeIndex + 1)}</span>
              </div>

              {settings.showSpotlight && !isSearching && activeCategory ? (
                <div className="v-spotlight">
                  <div className="v-spotlight-copy">
                    <p className="mini" dir="ltr">{text('spotlightEyebrow')}</p>
                    <h3 dir="auto">{spotlightTitle}</h3>
                    {spotlightDesc ? <p dir="auto">{spotlightDesc}</p> : null}
                  </div>
                  <div className="v-spotlight-art" aria-hidden="true">
                    <VerdeImage src={spotlightImage} fallback={<VerdePizzaArt className="v-spotlight-fallback" />} />
                  </div>
                </div>
              ) : null}

              <div className="v-menu-tools">
                <label className="v-searchbox">
                  <GuestIconSearch className="size-[19px]" aria-hidden="true" />
                  <span className="sr-only">{copy.searchMenu}</span>
                  <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={copy.searchPlaceholder} autoComplete="off" enterKeyHint="search" />
                  {isSearching ? (
                    <button type="button" className="v-clear" onClick={() => onQueryChange('')} aria-label={copy.clearSearch}>
                      <GuestIconClose className="size-4" />
                    </button>
                  ) : null}
                </label>
                <div className="v-view-switch" role="group" aria-label={copy.verdeViewMode}>
                  <button type="button" aria-pressed={view === 'photos'} onClick={() => setView('photos')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m3 16 5-5 4 4 3-3 6 6" /><circle cx="16" cy="8" r="1" /></svg>
                    <span>{copy.verdeViewPhotos}</span>
                  </button>
                  <button type="button" aria-pressed={view === 'quick'} onClick={() => setView('quick')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h12M3 6h2M3 12h2M3 18h2" /></svg>
                    <span>{copy.verdeViewQuick}</span>
                  </button>
                </div>
              </div>

              <div className="v-menu-meta">
                <span>{isSearching ? copy.verdeSearchResults : activeCategory?.name}</span>
                <span className="count" role="status" aria-live="polite">{copy.verdeItemsCount(shown.length)}</span>
              </div>

              {shown.length > 0 ? (
                <div className={`v-product-grid${view === 'quick' ? ' is-quick' : ''}`}>
                  {shown.map(({ product, categoryId }) => (
                    <VerdeProductCard
                      key={product.id}
                      product={product}
                      currency={currency}
                      copy={copy}
                      canOrder={canOrder}
                      categoryLabel={categoryName.get(categoryId) ?? ''}
                      brandInitial={brandInitial}
                      simpleQuantity={simpleQuantityByProductId.get(product.id) ?? 0}
                      totalQuantity={totalQuantityByProductId.get(product.id) ?? 0}
                      onOpen={onOpenProduct}
                      onQuickAdd={onQuickAdd}
                      onIncrement={onIncrement}
                      onDecrement={onDecrement}
                    />
                  ))}
                </div>
              ) : (
                <div className="v-no-results" role="status">
                  <div className="v-empty-mark" aria-hidden="true">{brandInitial}?</div>
                  <strong>{copy.verdeNoMatchTitle}</strong>
                  <span>{copy.verdeNoMatchText}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {settings.showEnding ? (
        <section className="v-ending" aria-labelledby="v-ending-title">
          <div className="v-wrap v-ending-grid">
            <div>
              <p className="v-eyebrow" dir="ltr">{text('endEyebrow')}</p>
              <h2 id="v-ending-title" dir="auto">{lines(text('endHeadline'))}</h2>
              <p dir="auto">{text('endDescription')}</p>
            </div>
            <div className="v-ending-art" aria-hidden="true">
              <VerdeImage src={bannerImage} fallback={<VerdeBannerArt className="v-ending-fallback" />} />
            </div>
          </div>
        </section>
      ) : null}

      <div className="v-contact">{contact}</div>
      <footer className="v-footer">
        <div className="v-footer-rule v-wrap" />
        <div className="v-footer-bottom v-wrap">
          <div><span className="v-footer-logo" dir="auto">{word}</span> <span dir="ltr">{text('tagline')}</span></div>
          <div className="v-powered">{poweredBy}</div>
        </div>
      </footer>
      {children}
    </div>
  );
}
