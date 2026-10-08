'use client';

import { useEffect, useRef, useState } from 'react';
import { GuestIconPlus, GuestIconStar } from '../../../components/guest/icons';
import { Price } from '../../../components/guest/Price';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { PublicMenuProduct } from '../../../lib/public-menu/types';
import { categoryDomId, FEATURED_SECTION_ID } from './useMenuNavigation';
import { SectionHeading } from './MenuSections';

/** The shared scrim over every photo banner: dark enough at the bottom for white text (AA). */
const SCRIM =
  'linear-gradient(to top, rgba(14,12,10,.95) 0%, rgba(14,12,10,.55) 45%, rgba(14,12,10,.2) 100%)';

function Banner({
  product,
  imageUrl,
  single,
  currency,
  copy,
  canOrder,
  onOpen,
  onQuickAdd,
}: {
  product: PublicMenuProduct;
  imageUrl: string;
  /** One banner on a wide screen gets the large layout, text block on the inline-end side. */
  single: boolean;
  currency: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
  onOpen: (product: PublicMenuProduct) => void;
  onQuickAdd: (product: PublicMenuProduct) => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <article
      className={`g-shadow relative h-[210px] shrink-0 basis-full snap-center overflow-hidden rounded-[24px] bg-g-surface-2 has-[[data-open]:focus-visible]:outline-2 has-[[data-open]:focus-visible]:outline-offset-2 has-[[data-open]:focus-visible]:outline-g-accent-text lg:h-[300px] ${
        single ? '' : 'lg:basis-[calc(50%-8px)]'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image. */}
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="absolute inset-0 size-full object-cover"
      />
      <div
        aria-hidden="true"
        className={`absolute inset-0 ${single ? 'lg:hidden' : ''}`}
        style={{ background: SCRIM }}
      />
      {single ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 hidden lg:block ltr:[background:linear-gradient(to_right,rgba(12,10,8,0)_30%,rgba(12,10,8,.9)_100%)] rtl:[background:linear-gradient(to_left,rgba(12,10,8,0)_30%,rgba(12,10,8,.9)_100%)]"
        />
      ) : null}

      <span className="absolute start-3.5 top-3.5 flex items-center gap-[5px] rounded-full bg-g-accent px-[11px] py-[5px] text-xs font-bold text-g-on-accent">
        <GuestIconStar className="size-3" />
        {copy.featured}
      </span>

      <div
        className={`absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 text-white ${
          single
            ? 'lg:inset-x-auto lg:inset-y-0 lg:end-0 lg:w-[46%] lg:flex-col lg:items-start lg:justify-end lg:gap-3 lg:p-9'
            : 'lg:inset-x-5 lg:bottom-5'
        }`}
      >
        <div className="min-w-0">
          <h3
            className={`g-display text-[25px] leading-[1.2] ${single ? 'lg:text-[40px] lg:leading-[1.15]' : 'lg:text-[28px]'}`}
          >
            {canOrder ? (
              <button
                type="button"
                data-open
                onClick={() => onOpen(product)}
                className="text-start outline-none after:absolute after:inset-0 after:content-['']"
              >
                <bdi>{product.name}</bdi>
              </button>
            ) : (
              <bdi>{product.name}</bdi>
            )}
          </h3>
          {product.description ? (
            <p
              dir="auto"
              className={`mt-[3px] line-clamp-1 text-[13px] text-white/80 ${single ? 'lg:line-clamp-2 lg:text-[15px] lg:leading-[1.6]' : ''}`}
            >
              {product.description}
            </p>
          ) : null}
        </div>
        {canOrder ? (
          <button
            type="button"
            onClick={() => onQuickAdd(product)}
            aria-label={copy.addAria(product.name)}
            className={`relative z-10 flex h-[46px] shrink-0 items-center gap-1.5 rounded-[23px] bg-g-accent px-4 font-extrabold text-[#1c1205] transition-transform active:scale-95 ${
              single ? 'lg:mt-1.5 lg:h-[52px] lg:gap-2.5 lg:rounded-[26px] lg:px-[22px]' : ''
            }`}
          >
            {single ? <span className="hidden text-[15.5px] lg:inline">{copy.add} ·</span> : null}
            <Price
              amount={product.basePrice}
              currency={currency}
              className="g-num text-lg"
              currencyClassName="text-xs font-bold"
            />
            <GuestIconPlus className="size-[18px]" strokeWidth={2.6} />
          </button>
        ) : null}
      </div>
    </article>
  );
}

/**
 * "Our picks": the products flagged featured that have a photo, as scroll-snap banners
 * (one full-width banner at a time on a phone, two across on a wide screen, a single large
 * banner when there is only one). Dots show the position. A featured product without a
 * photo is not shown here -- it still appears in its own category. The section is hidden
 * entirely when there is nothing to show.
 */
export function FeaturedBanners({
  products,
  currency,
  copy,
  canOrder,
  onOpen,
  onQuickAdd,
}: {
  products: PublicMenuProduct[];
  currency: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
  onOpen: (product: PublicMenuProduct) => void;
  onQuickAdd: (product: PublicMenuProduct) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    function update() {
      frame = 0;
      const first = track!.children[0] as HTMLElement | undefined;
      const second = track!.children[1] as HTMLElement | undefined;
      const stride =
        first && second ? Math.abs(second.offsetLeft - first.offsetLeft) : track!.clientWidth;
      if (stride > 0) setIndex(Math.round(Math.abs(track!.scrollLeft) / stride));
    }
    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const withPhoto = products
    .map((product) => ({ product, imageUrl: resolveAssetUrl(product.primaryImageAssetPath) }))
    .filter(
      (entry): entry is { product: PublicMenuProduct; imageUrl: string } => entry.imageUrl !== null,
    );
  if (withPhoto.length === 0) return null;
  const single = withPhoto.length === 1;

  return (
    <section
      id={categoryDomId(FEATURED_SECTION_ID)}
      aria-labelledby={`${categoryDomId(FEATURED_SECTION_ID)}-title`}
      className="scroll-mt-24"
    >
      <SectionHeading
        id={`${categoryDomId(FEATURED_SECTION_ID)}-title`}
        title={copy.ourPicks}
        count={copy.itemsCount(withPhoto.length)}
      />
      <div
        ref={trackRef}
        tabIndex={0}
        role="region"
        aria-label={copy.ourPicks}
        className="guest-scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-[24px] outline-offset-4"
      >
        {withPhoto.map(({ product, imageUrl }) => (
          <Banner
            key={product.id}
            product={product}
            imageUrl={imageUrl}
            single={single}
            currency={currency}
            copy={copy}
            canOrder={canOrder}
            onOpen={onOpen}
            onQuickAdd={onQuickAdd}
          />
        ))}
      </div>
      {withPhoto.length > 1 ? (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {withPhoto.map(({ product }, position) => (
            <span
              key={product.id}
              className={`h-1.5 rounded-[3px] transition-all duration-300 ${
                position === index ? 'w-[22px] bg-g-accent' : 'w-1.5 bg-g-line'
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
