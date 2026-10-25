'use client';

import { useEffect, useState } from 'react';
import { GuestIconDish } from '../../../components/guest/icons';
import { HeroContactIcons } from './GuestContact';
import { HeroActions, LanguageSwitch, LogoTile, type GuestHeroProps } from './GuestHero';
import { HoursBadge } from './HoursBadge';

/**
 * EMBER V2: faithful adaptation of the accepted Cinematic Food Experience prototype.
 * The main hero is a two-column poster (oversized campaign headline + featured real
 * food photo), followed by a diagonal animated marquee. All restaurant identity,
 * menu content, sharing, tracking and ordering are still real Wayta data.
 */
export function GuestHeroEmber({ sentinelRef, ...p }: GuestHeroProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const photos = [...new Set([p.emberPhotoUrl, p.emberPhotoFallbackUrl, p.coverUrl])].filter(
    (url): url is string => typeof url === 'string' && url.length > 0,
  );
  const photo = photos[imageIndex] ?? null;
  useEffect(() => { setImageIndex(0); }, [p.emberPhotoUrl, p.emberPhotoFallbackUrl, p.coverUrl]);
  const arabic = p.locale.resolved === 'ar';
  const headline = p.emberHeadline?.trim() || 'FIRE FIRST.';
  const segments = headline.split(/\s+/);
  const headlineTop = segments.shift() || headline;
  const headlineBottom = segments.join(' ');
  const subtitle = p.emberSubtitle || (arabic
    ? 'مذاق مختلف. أطباق تتحضّر بعناية، وتجربة تستحقها كل مرة.'
    : 'Bold flavors. Freshly crafted. Every bite worth remembering.');

  return (
    <>
      <header ref={sentinelRef} data-ember-hero className="ember-v2-header">
        <div className="ember-v2-nav">
          <div className="ember-v2-brand">
            <LogoTile
              name={p.restaurantName}
              logoUrl={p.logoUrl}
              className="ember-v2-brand-logo size-11 rounded-lg sm:size-12"
            />
            <span className="ember-v2-brand-name" dir="auto"><bdi>{p.restaurantName}</bdi><span className="ember-v2-brand-dot">.</span></span>
          </div>
          <span className="ember-v2-nav-note" aria-hidden="true">
            {p.emberNavTagline || (arabic ? 'نكهة مختلفة · طعم لا يُنسى' : 'BOLD FLAVORS · MADE FRESH')}
          </span>
          <button
            type="button"
            className="ember-v2-cart-button"
            aria-label={p.copy.viewCart}
            onClick={p.onEmberCartOpen}
            disabled={!p.onEmberCartOpen}
          >
            <span>{p.copy.cart}</span>
            <span className="ember-v2-cart-count">{p.emberCartCount ?? 0}</span>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M5 8h14l-1.2 12H6.2L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" />
            </svg>
          </button>
        </div>

        <div className="ember-v2-campaign">
          <div className="ember-v2-campaign-copy">
            <p className="ember-v2-eyebrow" dir="ltr">
              {p.emberEyebrow || 'THE ART OF THE PERFECT BITE — 01'}
            </p>
            <h1 className="ember-v2-headline" dir={arabic ? 'rtl' : 'ltr'}>
              <span>{headlineTop}</span>
              {headlineBottom ? <span className="ember-v2-headline-accent">{headlineBottom}</span> : null}
            </h1>
            <p className="ember-v2-subtitle" dir="auto">{subtitle}</p>
            <div className="ember-v2-signature">
              <span>{p.emberSignature || (arabic ? 'طازج. مميز. معمول بحب.' : 'FRESH. BOLD. UNFORGETTABLE.')}</span>
              <span aria-hidden="true" />
            </div>
            {p.tableNumber || p.branchLine || p.hours ? (
              <div className="ember-v2-restaurant-details">
                {p.tableNumber ? <span>{p.copy.tableDineIn(p.tableNumber)}</span> : null}
                {p.branchLine ? <span dir="auto">{p.branchLine}</span> : null}
                {p.hours ? <HoursBadge hours={p.hours} copy={p.copy} locale={p.locale.resolved} /> : null}
              </div>
            ) : null}
            <HeroContactIcons contact={p.contact} copy={p.copy} />
          </div>

          <div className="ember-v2-visual" aria-hidden="true">
            <div className="ember-v2-visual-glow" />
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- Staff-owned images are served by the configured API.
              <img
                key={photo}
                src={photo}
                alt=""
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onError={() => setImageIndex((index) => index + 1)}
                className="ember-v2-photo"
              />
            ) : (
              <div className="ember-v2-photo-fallback">
                <GuestIconDish className="size-36 opacity-50 sm:size-48" />
                <span className="ember-v2-fallback-label">MADE FRESH</span>
              </div>
            )}
          </div>
        </div>

        <div className="ember-v2-tools-nav">
          <LanguageSwitch available={p.locale.available} resolved={p.locale.resolved} publicCode={p.publicCode} label={p.copy.language} designPreview={p.emberDesignPreview} />
          <HeroActions
            copy={p.copy}
            restaurantName={p.restaurantName}
            shareCode={p.shareCode}
            onTrack={p.onTrack}
            hasActiveOrder={p.hasActiveOrder}
          />
        </div>
      </header>

      <div className="ember-v2-marquee" aria-hidden="true">
        <div className="ember-v2-marquee-track" dir="ltr">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index}>{p.emberMarquee || '✳ FRESH FOOD ✳ MADE WITH FIRE ✳ THE REAL DEAL'} &nbsp;&nbsp;&nbsp;</span>
          ))}
        </div>
      </div>
    </>
  );
}
