'use client';

import { useState } from 'react';
import { GuestIconDish } from '../../../components/guest/icons';
import { HeroContactIcons } from './GuestContact';
import { HeroActions, LanguageSwitch, LogoTile, type GuestHeroProps } from './GuestHero';
import { HoursBadge } from './HoursBadge';

/**
 * EMBER: a cinematic cover based on the restaurant's REAL uploaded cover photo.
 * Reuses all existing language, sharing, tracking, contact and hours controls.
 * No new external photo dependency and no extra ordering/business logic.
 */
export function GuestHeroEmber({ sentinelRef, ...p }: GuestHeroProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasPhoto = p.coverUrl !== null && !imageFailed;
  const arabic = p.locale.resolved === 'ar';

  return (
    <header ref={sentinelRef} data-ember-hero className="ember-hero relative isolate overflow-hidden bg-[#120d0a] text-white">
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- Runtime-configured staff-uploaded API asset.
          <img
            src={p.coverUrl ?? undefined}
            alt=""
            decoding="async"
            fetchPriority="high"
            onError={() => setImageFailed(true)}
            className="ember-hero-image absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_37%,#884121_0%,#392015_40%,#130e0b_82%)]">
            <GuestIconDish className="absolute bottom-[15%] end-[10%] size-48 text-orange-300 opacity-[0.12] sm:size-80" />
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,10,8,0.89)_0%,rgba(18,11,8,0.67)_52%,rgba(15,10,8,0.25)_100%)] rtl:[background:linear-gradient(270deg,rgba(15,10,8,0.89)_0%,rgba(18,11,8,0.67)_52%,rgba(15,10,8,0.25)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#120d0a] to-transparent" />
      </div>
      <div className="relative mx-auto flex min-h-[390px] max-w-[1280px] flex-col px-4 pb-9 pt-4 sm:min-h-[470px] lg:min-h-[510px] lg:px-8 lg:pb-14 lg:pt-6">
        <div className="flex items-center justify-between gap-3">
          <LanguageSwitch
            available={p.locale.available}
            resolved={p.locale.resolved}
            publicCode={p.publicCode}
            label={p.copy.language}
          />
          <HeroActions
            copy={p.copy}
            restaurantName={p.restaurantName}
            shareCode={p.shareCode}
            onTrack={p.onTrack}
            hasActiveOrder={p.hasActiveOrder}
          />
        </div>
        <div className="ember-hero-content mt-auto max-w-[690px]">
          <div className="mb-5 flex items-center gap-3">
            <span aria-hidden="true" className="h-px w-10 bg-[#fba56a]" />
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#ffd1af]">
              {arabic ? 'تجربة طعام مميزة' : 'A cinematic dining experience'}
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <LogoTile
              name={p.restaurantName}
              logoUrl={p.logoUrl}
              className="size-[62px] shrink-0 rounded-2xl border border-white/30 shadow-xl sm:size-[84px]"
            />
            <h1 dir="auto" className="g-display min-w-0 text-[36px] leading-[1.18] text-white sm:text-[56px] lg:text-[72px]">
              <bdi>{p.restaurantName}</bdi>
            </h1>
          </div>
          {p.menuDescription ? (
            <p dir="auto" className="mt-4 max-w-xl text-[14px] leading-[1.8] text-[#f7e1d1] sm:text-base">
              {p.menuDescription}
            </p>
          ) : null}
          {p.tableNumber ? (
            <p className="mt-4 text-[14px] font-bold text-[#ffd1af]">{p.copy.tableDineIn(p.tableNumber)}</p>
          ) : null}
          {p.branchLine ? (
            <p dir="auto" className="mt-2 text-[13px] font-medium text-white/80">{p.branchLine}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {p.hours ? <HoursBadge hours={p.hours} copy={p.copy} locale={p.locale.resolved} /> : null}
            <HeroContactIcons contact={p.contact} copy={p.copy} />
          </div>
        </div>
      </div>
    </header>
  );
}
