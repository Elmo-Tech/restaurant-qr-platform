'use client';

import { useEffect, useState } from 'react';
import { HeroActions, LanguageSwitch, type GuestHeroProps } from './GuestHero';

/**
 * Reference-faithful BLOOM hero:
 * - original Cormorant Garamond (including italic middle line) + Tajawal
 * - rose ribbon and circular strawberry-cake art from the user's approved HTML
 * - real restaurant name/logo; a custom uploaded photo can replace ONLY the art
 * - shared cart, share, theme toggle, order tracking and language controls
 */
export function GuestHeroBloom({ sentinelRef, ...p }: GuestHeroProps) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [p.bloomHeroImageUrl]);
  const showImage = Boolean(p.bloomHeroImageUrl && !imageFailed);

  return (
    <>
      <div className="bloom-v2-ribbon" dir="auto">
        {p.bloomRibbon || '✳ BAKED WITH LOVE, SERVED WITH JOY ✳'}
      </div>
      <header ref={sentinelRef} className="bloom-v2-header">
        <nav className="bloom-v2-nav" aria-label={p.restaurantName}>
          <div className="bloom-v2-brand">
            {p.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Real restaurant logo served by the API.
              <img src={p.logoUrl} alt="" className="bloom-v2-brand-seal" />
            ) : (
              <span className="bloom-v2-brand-seal bloom-v2-brand-flower" aria-hidden="true">✿</span>
            )}
            <span className="bloom-v2-brand-name bloom-v2-display" dir="auto">
              <bdi>{p.restaurantName}</bdi>
            </span>
          </div>
          <span className="bloom-v2-nav-note" dir="auto">
            {p.bloomNavTagline || 'THE LITTLE SWEET THINGS'}
          </span>
          <button
            type="button"
            className="bloom-v2-cart-button"
            onClick={p.onBloomCartOpen}
            disabled={!p.onBloomCartOpen}
            aria-label={p.copy.viewCart}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M5 8h14l-1.2 12H6.2L5 8Z" />
              <path d="M9 9V6a3 3 0 0 1 6 0v3" />
            </svg>
            <span>{p.copy.cart}</span>
            <b>{p.bloomCartCount ?? 0}</b>
          </button>
        </nav>

        <div className="bloom-v2-hero">
          <div className="bloom-v2-hero-copy">
            <div className="bloom-v2-eyebrow">
              {p.bloomEyebrow || '✳ A LITTLE HAPPINESS IN EVERY BITE'}
            </div>
            <h1 className="bloom-v2-display bloom-v2-headline">
              <span>{p.bloomHeadlineTop || 'sweet'}</span>
              <i>{p.bloomHeadlineMiddle || 'little'}</i>
              <span>{p.bloomHeadlineBottom || 'things.'}</span>
            </h1>
            <p className="bloom-v2-subtitle" dir="auto">
              {p.bloomSubtitle || 'كل قطعة حلوى حكاية صغيرة، وكل لحظة تستحق حاجة حلوة.'}
            </p>
            <button
              type="button"
              className="bloom-v2-cta"
              onClick={() => document.getElementById('bloom-menu-start')?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'start',
              })}
            >
              <span>{p.bloomCta || 'استكشف الحلويات'}</span>
              <span aria-hidden="true">↙</span>
            </button>
            <div className="bloom-v2-tools">
              <LanguageSwitch
                available={p.locale.available}
                resolved={p.locale.resolved}
                publicCode={p.publicCode}
                label={p.copy.language}
                designPreview={p.emberDesignPreview}
                previewTemplate="bloom"
              />
              <HeroActions
                copy={p.copy}
                restaurantName={p.restaurantName}
                shareCode={p.shareCode}
                onTrack={p.onTrack}
                hasActiveOrder={p.hasActiveOrder}
              />
            </div>
          </div>
          <div className="bloom-v2-art-wrap">
            <div className="bloom-v2-art-backdrop" aria-hidden="true" />
            <span className="bloom-v2-sparkle bloom-v2-sparkle-one" aria-hidden="true">✳</span>
            <span className="bloom-v2-sparkle bloom-v2-sparkle-two" aria-hidden="true">✳</span>
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- Authorized staff-owned hero photo.
              <img
                key={p.bloomHeroImageUrl}
                src={p.bloomHeroImageUrl ?? undefined}
                alt=""
                className="bloom-v2-art bloom-v2-hero-photo"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <BloomCakeIllustration />
            )}
          </div>
        </div>
      </header>
    </>
  );
}

function BloomCakeIllustration() {
  return (
    <svg className="bloom-v2-art bloom-v2-cake-svg" viewBox="0 0 570 525"
      xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Strawberry cake illustration">
      <defs>
        <linearGradient id="bloomCakeFill" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff9e8" /><stop offset="1" stopColor="#e9b293" />
        </linearGradient>
        <linearGradient id="bloomCakeCream" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#fff9f8" /><stop offset="1" stopColor="#f4c3c2" />
        </linearGradient>
      </defs>
      <ellipse cx="288" cy="435" rx="218" ry="41" fill="#d8a3a9" opacity=".35" />
      <ellipse cx="280" cy="413" rx="216" ry="48" fill="#fff8ef" stroke="#e7b5b5" strokeWidth="9" />
      <path d="M139 241 L423 241 L423 398 Q282 437 140 397Z"
        fill="url(#bloomCakeFill)" stroke="#ce9d88" strokeWidth="3" />
      <path d="M141 304 Q282 330 424 304 L422 337 Q281 367 140 337Z" fill="#e6a5ae" />
      <path d="M140 355 Q285 382 423 352 L422 386 Q280 416 140 384Z" fill="#efb6bd" />
      <path d="M133 238 Q280 271 427 237 L432 284 Q412 305 395 283 Q371 303 353 286 Q319 318 300 286 Q267 310 239 288 Q210 310 189 281 Q164 304 129 282Z"
        fill="url(#bloomCakeCream)" />
      <ellipse cx="279" cy="227" rx="151" ry="49" fill="#fff4f3" stroke="#efcad0" strokeWidth="8" />
      <path d="M226 196 Q198 153 227 124 Q264 112 283 158 Q299 110 335 125 Q354 151 325 194"
        fill="#d84157" stroke="#9e2741" strokeWidth="6" />
      <path d="M271 149 Q287 121 295 113" stroke="#4e845b" strokeWidth="12" strokeLinecap="round" />
      <path d="M288 128 Q254 99 229 113 Q248 135 288 128" fill="#629c63" />
      <path d="M288 129 Q312 99 339 107 Q317 134 288 129" fill="#5c985f" />
      <circle cx="215" cy="208" r="24" fill="#f4d0d7" />
      <circle cx="344" cy="218" r="21" fill="#f4d0d7" />
      <g fill="#ffeedc">
        <ellipse cx="232" cy="164" rx="4" ry="8" transform="rotate(-20 232 164)" />
        <ellipse cx="322" cy="166" rx="4" ry="8" transform="rotate(30 322 166)" />
        <ellipse cx="264" cy="184" rx="4" ry="8" />
      </g>
      <g fill="#f8eae4" opacity=".8">
        <circle cx="104" cy="155" r="13" />
        <circle cx="449" cy="174" r="8" />
        <circle cx="482" cy="292" r="11" />
      </g>
    </svg>
  );
}
