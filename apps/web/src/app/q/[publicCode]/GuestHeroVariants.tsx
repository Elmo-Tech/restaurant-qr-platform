'use client';

import { useState, type ReactNode } from 'react';
import { GuestIconDish, GuestIconMapPin } from '../../../components/guest/icons';
import { HERO_BUTTON_KEYS, HeroContactButtons, HeroContactIcons } from './GuestContact';
import {
  ARABIC_SCRIPT,
  HeroActions,
  LanguageSwitch,
  LogoTile,
  type GuestHeroProps,
} from './GuestHero';
import { HoursBadge } from './HoursBadge';

/**
 * The headers of the `floating`, `centered` and `compact` templates (DEC-044). They show exactly
 * what the classic hero shows -- logo, name, table / branch line, opening hours, contact, language,
 * share, track and theme -- and only arrange it differently. The classic hero stays in `GuestHero`.
 */

/** What every hero shows (the ref that marks the hero for scroll tracking is handled by each hero itself). */
type HeroData = Omit<GuestHeroProps, 'sentinelRef'>;

/** Cover photo under a scrim, or the branded saffron glow when the restaurant has no cover. */
function HeroCover({ coverUrl, scrim }: { coverUrl: string | null; scrim: string }): ReactNode {
  const [failed, setFailed] = useState(false);
  if (coverUrl !== null && !failed) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image. */}
        <img
          src={coverUrl}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: scrim }} />
      </>
    );
  }
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 120% at 12% 0%, rgb(245 165 36 / 0.28), transparent 62%), radial-gradient(55% 90% at 92% 100%, rgb(232 87 58 / 0.16), transparent 66%)',
        }}
      />
      <GuestIconDish
        aria-hidden="true"
        strokeWidth={0.5}
        className="pointer-events-none absolute -bottom-10 -end-8 size-[220px] text-g-accent opacity-[0.1] lg:size-[340px]"
      />
    </>
  );
}

const SCRIM_TOP = 'linear-gradient(to bottom, rgb(0 0 0 / 0.42) 0%, rgb(0 0 0 / 0.06) 60%, transparent 100%)';
const SCRIM_FADE =
  'linear-gradient(to top, var(--g-bg) 0%, color-mix(in srgb, var(--g-bg) 80%, transparent) 36%, color-mix(in srgb, var(--g-bg) 22%, transparent) 100%)';

/** Language switch at the start, track / share / theme at the end, floating over the cover. */
function TopRow(p: HeroData) {
  return (
    <div className="relative mx-auto flex max-w-[1280px] items-center justify-between px-4 pt-4 lg:px-8 lg:pt-6">
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
  );
}

function RestaurantName({ p, className }: { p: HeroData; className: string }) {
  const arabic = ARABIC_SCRIPT.test(p.restaurantName);
  return (
    <h1
      dir="auto"
      className={`${arabic ? 'g-display leading-[1.2]' : 'g-brand leading-none tracking-[-0.5px]'} text-g-text ${className}`}
    >
      {p.restaurantName}
    </h1>
  );
}

/** The table line (TABLE QR) and the single-branch line, as in the classic hero. */
function Lines({ p, center = false }: { p: HeroData; center?: boolean }) {
  return (
    <>
      {p.tableNumber ? (
        <p dir="auto" className="mt-1.5 text-[14px] font-semibold text-g-accent-text lg:text-[17px]">
          {p.copy.tableDineIn(p.tableNumber)}
        </p>
      ) : null}
      {p.branchLine ? (
        <p
          className={`mt-1 flex items-center gap-1.5 text-[12.5px] text-g-text-2 lg:text-[14px] ${center ? 'justify-center' : ''}`}
        >
          <GuestIconMapPin className="size-[13px] shrink-0 lg:size-[15px]" />
          <span dir="auto" className="min-w-0 truncate">
            {p.branchLine}
          </span>
        </p>
      ) : null}
    </>
  );
}

/** `floating`: a slim cover, with the info card floating over its lower edge. */
export function GuestHeroFloating({ sentinelRef, ...p }: GuestHeroProps) {
  return (
    <header ref={sentinelRef} className="relative">
      <div className="relative h-[176px] overflow-hidden bg-g-surface lg:h-[250px]">
        <HeroCover coverUrl={p.coverUrl} scrim={SCRIM_TOP} />
        <TopRow {...p} />
      </div>
      <div className="relative z-10 -mt-12 px-4 lg:-mt-14 lg:px-8">
        <div className="g-shadow mx-auto max-w-[1280px] rounded-[26px] border border-g-line bg-g-surface p-4 lg:flex lg:items-center lg:justify-between lg:gap-8 lg:p-6">
          <div className="flex items-center gap-3.5 lg:gap-5">
            <LogoTile
              name={p.restaurantName}
              logoUrl={p.logoUrl}
              className="size-[64px] rounded-[18px] lg:size-[96px] lg:rounded-[26px]"
            />
            <div className="min-w-0">
              <RestaurantName p={p} className="text-[26px] lg:text-[44px]" />
              <Lines p={p} />
              {p.hours ? (
                <HoursBadge hours={p.hours} copy={p.copy} locale={p.locale.resolved} />
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 lg:mt-0 lg:items-end">
            <HeroContactButtons contact={p.contact} copy={p.copy} />
            <HeroContactIcons
              contact={p.contact}
              copy={p.copy}
              exclude={HERO_BUTTON_KEYS}
              className="!mt-0"
            />
          </div>
        </div>
      </div>
    </header>
  );
}

/** `centered`: a tall cover with the logo and the name in the middle, the details centred below. */
export function GuestHeroCentered({ sentinelRef, ...p }: GuestHeroProps) {
  return (
    <header ref={sentinelRef} className="relative">
      <div className="relative h-[300px] overflow-hidden bg-g-surface lg:h-[400px]">
        <HeroCover coverUrl={p.coverUrl} scrim={SCRIM_FADE} />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-g-bg to-transparent"
        />
        <TopRow {...p} />
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center px-4 text-center lg:bottom-6">
          <LogoTile
            name={p.restaurantName}
            logoUrl={p.logoUrl}
            className="size-[84px] rounded-full border-4 border-g-bg lg:size-[116px]"
          />
          <div className="mt-3 min-w-0 max-w-full">
            <RestaurantName p={p} className="text-[34px] lg:text-[58px]" />
            <Lines p={p} center />
          </div>
        </div>
      </div>
      <div className="relative z-10 flex flex-col items-center px-4 pt-3 lg:px-8">
        {p.hours ? (
          <HoursBadge hours={p.hours} copy={p.copy} locale={p.locale.resolved} />
        ) : null}
        <HeroContactIcons contact={p.contact} copy={p.copy} className="justify-center" />
      </div>
    </header>
  );
}

/** `compact`: a thin cover strip and one info bar, so the menu itself starts immediately. */
export function GuestHeroCompact({ sentinelRef, ...p }: GuestHeroProps) {
  return (
    <header ref={sentinelRef} className="relative">
      <div className="relative h-[92px] overflow-hidden bg-g-surface lg:h-[130px]">
        <HeroCover coverUrl={p.coverUrl} scrim={SCRIM_TOP} />
        <TopRow {...p} />
      </div>
      <div className="border-b border-g-line bg-g-bg">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3 lg:gap-4 lg:px-8 lg:py-4">
          <LogoTile
            name={p.restaurantName}
            logoUrl={p.logoUrl}
            className="size-[48px] rounded-[14px] lg:size-[64px] lg:rounded-[18px]"
          />
          <div className="min-w-0 flex-1">
            <RestaurantName p={p} className="truncate text-[20px] lg:text-[30px]" />
            <Lines p={p} />
            {p.hours ? (
              <HoursBadge hours={p.hours} copy={p.copy} locale={p.locale.resolved} />
            ) : null}
          </div>
          <HeroContactIcons contact={p.contact} copy={p.copy} limit={3} className="!mt-0 shrink-0" />
        </div>
      </div>
    </header>
  );
}
