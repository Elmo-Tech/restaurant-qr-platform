'use client';

import { useEffect, useRef, useState } from 'react';
import { GuestIconGift } from '../../../components/guest/icons';
import { Price } from '../../../components/guest/Price';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import { OFFERS_SECTION_ID } from '../../../lib/public-menu/offers';
import type { OffersCopy } from '../../../lib/public-menu/offers-copy';
import type { PublicOffer } from '../../../lib/public-menu/types';

/** The DOM id the "Offers" chip scrolls to (the same `category-{id}` convention the category sections use). */
export const OFFERS_DOM_ID = `category-${OFFERS_SECTION_ID}`;

function OfferCard({
  offer,
  currency,
  offersCopy,
  canOrder,
  showPhotos,
  onOpen,
  previewImageUrl,
}: {
  /** Staff preview only: the photo to show instead of the stored one (a not-yet-uploaded file). */
  previewImageUrl?: string | null;
  offer: PublicOffer;
  currency: string;
  offersCopy: OffersCopy;
  canOrder: boolean;
  showPhotos: boolean;
  onOpen: (offer: PublicOffer) => void;
}) {
  const [failed, setFailed] = useState(false);
  const imageUrl = showPhotos
    ? previewImageUrl !== undefined
      ? previewImageUrl
      : resolveAssetUrl(offer.imageAssetPath)
    : null;
  const available = offer.availableToday && offer.soldOut !== true;
  const unavailableText = offer.soldOut === true ? offersCopy.notAvailableNow : offersCopy.notAvailableToday;
  const interactive = canOrder && available;
  const content = (
    <>
      {showPhotos ? (
        <span data-offer-media className="relative block h-[118px] w-full overflow-hidden bg-g-accent-soft">
          {imageUrl && !failed ? (
            // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-g-accent-text">
              <GuestIconGift className="size-12 opacity-80" strokeWidth={1.6} />
            </span>
          )}
        </span>
      ) : null}
      <span
        data-offer-badge
        className={`absolute start-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-xs font-extrabold ${
          offer.badge === 'GIFT'
            ? 'bg-g-text text-g-bg'
            : 'bg-g-accent text-g-on-accent'
        }`}
      >
        <GuestIconGift className="size-3" />
        {offersCopy.badge[offer.badge]}
      </span>
      <span data-offer-content className="block px-3 pb-3 pt-2.5 text-start">
        <span data-offer-title className="g-display block text-[18px] leading-[1.25] text-g-text">
          <bdi>{offer.name}</bdi>
        </span>
        {offer.description ? (
          <span data-offer-description dir="auto" className="mt-0.5 line-clamp-2 block text-[13px] leading-[1.55] text-g-text-2">
            {offer.description}
          </span>
        ) : null}
        <span data-offer-footer className="mt-2 flex items-end justify-between gap-2">
          <span data-offer-price className="min-w-0">
            <Price
              amount={offer.price}
              currency={currency}
              className="g-num text-[19px] text-g-price [font-weight:900]"
              currencyClassName="text-[0.62em] font-semibold"
            />
            <span data-offer-days className="mt-0.5 block text-[11.5px] leading-snug text-g-text-3">
              {available ? offersCopy.days(offer.daysOfWeek) : `${unavailableText} · ${offersCopy.days(offer.daysOfWeek)}`}
            </span>
          </span>
          {canOrder ? (
            <span
              data-offer-action
              className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-extrabold ${
                available ? 'bg-g-accent text-g-on-accent' : 'bg-g-surface-2 text-g-text-3'
              }`}
            >
              {available ? offersCopy.chooseAndAdd : unavailableText}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );
  const shell =
    'relative block w-[78%] shrink-0 snap-center overflow-hidden rounded-[20px] border border-g-line bg-g-surface p-0 text-start sm:w-[300px] lg:w-[320px]';
  return (
    <li className="contents list-none">
      {interactive ? (
        <button
          type="button"
          onClick={() => onOpen(offer)}
          data-offer-card
          className={`${shell} outline-none transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-g-accent-text active:scale-[0.99]`}
        >
          {content}
        </button>
      ) : (
        <div data-offer-card aria-disabled={canOrder && !available ? 'true' : undefined} className={`${shell} ${available ? '' : 'opacity-60'}`}>
          {content}
        </div>
      )}
    </li>
  );
}

/**
 * The Offers strip (DEC-069, placement "B"): the top strip of the Guest menu, where the featured products show when there
 * are no offers. A horizontal scroll-snap rail of offer cards (photo, badge, name, description, the fixed price, the days it
 * runs on). An offer that is not valid today stays visible but dimmed with "Not available today". Tapping an available offer
 * opens the choice sheet. One component for every template and every exclusive design: colours are the Guest theme tokens
 * (`g-*`), so the design that wraps it dresses it; `titleClassName` lets a design bring its own display font.
 */
export function OffersStrip({
  offers,
  currency,
  offersCopy,
  canOrder,
  showPhotos,
  onOpen,
  titleClassName = 'g-display',
  className = '',
  previewImageUrl,
  showNavigation = false,
}: {
  /** Staff preview only (see `OfferCard`). */
  previewImageUrl?: string | null;
  offers: PublicOffer[];
  currency: string;
  offersCopy: OffersCopy;
  canOrder: boolean;
  showPhotos: boolean;
  onOpen: (offer: PublicOffer) => void;
  titleClassName?: string;
  className?: string;
  showNavigation?: boolean;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [bounds, setBounds] = useState({ overflow: false, previous: false, next: false });
  useEffect(() => {
    const node = track.current;
    if (!node || !showNavigation) return undefined;
    const update = () => {
      const maximum = Math.max(0, node.scrollWidth - node.clientWidth);
      const position = Math.abs(node.scrollLeft);
      setBounds({ overflow: maximum > 2, previous: position > 2, next: position < maximum - 2 });
    };
    const frame = window.requestAnimationFrame(update);
    node.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      node.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [offers.length, showNavigation]);
  const move = (next: boolean) => {
    const node = track.current;
    if (!node) return;
    const card = node.querySelector<HTMLElement>('[data-offer-card]');
    const gap = Number.parseFloat(window.getComputedStyle(node).columnGap) || 0;
    const distance = (card?.getBoundingClientRect().width ?? node.clientWidth) + gap;
    const direction = window.getComputedStyle(node).direction === 'rtl' ? -1 : 1;
    node.scrollBy({ left: distance * direction * (next ? 1 : -1), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  if (offers.length === 0) return null;
  return (
    <section
      id={OFFERS_DOM_ID}
      aria-labelledby={`${OFFERS_DOM_ID}-title`}
      data-offers-strip
      className={`scroll-mt-24 ${className}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2
          id={`${OFFERS_DOM_ID}-title`}
          className={`${titleClassName} flex items-center gap-2 text-[24px] leading-tight text-g-text`}
        >
          <GuestIconGift className="size-[22px] text-g-accent" />
          <span>{offersCopy.sectionTitle}</span>
        </h2>
        {showNavigation && bounds.overflow ? (
          <span className="m-offer-navigation" role="group" aria-label={offersCopy.sectionTitle}>
            <button type="button" onClick={() => move(false)} disabled={!bounds.previous} aria-label={offersCopy.previousOffers}>→</button>
            <button type="button" onClick={() => move(true)} disabled={!bounds.next} aria-label={offersCopy.nextOffers}>←</button>
          </span>
        ) : <span className="text-[12.5px] text-g-text-3">
          {offers.length > 1 && !showNavigation ? offersCopy.sectionHint : offersCopy.offersCount(offers.length)}
        </span>}
      </div>
      <ul
        ref={track}
        tabIndex={0}
        aria-label={offersCopy.sectionTitle}
        className="guest-scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 outline-offset-4 lg:mx-0 lg:px-0"
      >
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            currency={currency}
            offersCopy={offersCopy}
            canOrder={canOrder}
            showPhotos={showPhotos}
            onOpen={onOpen}
            previewImageUrl={previewImageUrl}
          />
        ))}
      </ul>
    </section>
  );
}
