'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  GuestIconDish,
  GuestIconMapPin,
  GuestIconMoon,
  GuestIconSun,
} from '../../../components/guest/icons';
import { useGuestTheme } from '../../../components/guest/GuestTheme';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';

/** Platform locales stay exactly `en`/`ar`; Arabic is listed first, as in the design. */
const LOCALE_LABELS: Record<string, { short: string; full: string }> = {
  ar: { short: 'عربي', full: 'العربية' },
  en: { short: 'EN', full: 'English' },
};

const ARABIC_SCRIPT = /[؀-ۿ]/;

/** Shared glass look for the two controls floating over the hero. */
const GLASS =
  'border border-g-line bg-[color-mix(in_srgb,var(--g-bg)_55%,transparent)] text-g-text backdrop-blur-md';

function LanguageSwitch({
  available,
  resolved,
  publicCode,
  label,
}: {
  available: string[];
  resolved: string;
  publicCode: string;
  label: string;
}) {
  if (available.length <= 1) return <span />;
  const ordered = [...available].sort((a, b) => (a === 'ar' ? -1 : b === 'ar' ? 1 : 0));
  return (
    <nav aria-label={label} className={`flex h-11 items-center rounded-full p-1 ${GLASS}`}>
      {ordered.map((locale) => {
        const isActive = locale === resolved;
        const labels = LOCALE_LABELS[locale] ?? { short: locale.toUpperCase(), full: locale };
        return (
          <Link
            key={locale}
            href={`/q/${publicCode}?lang=${locale}`}
            lang={locale}
            hrefLang={locale}
            aria-current={isActive ? 'true' : undefined}
            aria-label={labels.full}
            className={`flex h-9 min-w-11 items-center justify-center rounded-full px-3.5 text-[13px] font-bold transition-colors ${
              locale === 'en' ? 'g-num' : ''
            } ${isActive ? 'bg-g-accent text-g-on-accent' : 'text-g-text hover:bg-g-accent-soft'}`}
          >
            {labels.short}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle({ copy }: { copy: PublicMenuCopy }) {
  const { theme, toggleTheme } = useGuestTheme();
  const label = theme === 'dark' ? copy.lightMode : copy.darkMode;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`flex size-11 items-center justify-center rounded-full lg:size-[46px] ${GLASS}`}
    >
      {theme === 'dark' ? (
        <GuestIconSun className="size-5" />
      ) : (
        <GuestIconMoon className="size-[19px]" />
      )}
    </button>
  );
}

function LogoTile({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? '•').toLocaleLowerCase();
  return (
    <div className="g-shadow flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-white lg:size-[112px] lg:rounded-[30px]">
      {logoUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
        <img
          src={logoUrl}
          alt=""
          onError={() => setFailed(true)}
          className="size-full object-contain p-1.5"
        />
      ) : (
        <span
          aria-hidden="true"
          className="g-num text-[34px] leading-none text-[#1c1205] [font-variation-settings:'wdth'_80] lg:text-[52px]"
        >
          {initial}
        </span>
      )}
    </div>
  );
}

/**
 * The full-bleed hero (330px phone / 400px desktop). Without a restaurant cover image it is
 * the branded variant: the raised surface with a soft saffron glow and a faint cloche mark
 * -- never a grey placeholder. With a cover image the photo fills the hero (cropped with
 * `object-fit: cover`) under a theme-aware scrim that fades into the page background, so
 * the name and ordering context keep their contrast in both Light and Dark. The language
 * switch and theme toggle float over it as glass pills; the logo tile, the restaurant name
 * and the ordering context sit at the bottom. It shows only what exists in our data: no
 * ratings, hours, "open now" or tagline.
 */
export function GuestHero({
  restaurantName,
  logoUrl,
  coverUrl,
  tableNumber,
  branchLine,
  copy,
  locale,
  publicCode,
  sentinelRef,
}: {
  restaurantName: string;
  logoUrl: string | null;
  /** The restaurant's cover image, or `null` for the default branded hero. */
  coverUrl: string | null;
  /** TABLE QR only. */
  tableNumber: string | null;
  /** The branch name, when exactly one branch applies. */
  branchLine: string | null;
  copy: PublicMenuCopy;
  locale: { available: string[]; resolved: string };
  publicCode: string;
  sentinelRef: React.RefObject<HTMLElement | null>;
}) {
  const hasArabicName = ARABIC_SCRIPT.test(restaurantName);
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = coverUrl !== null && !coverFailed;
  return (
    <header
      ref={sentinelRef}
      className="relative h-[330px] overflow-hidden bg-g-surface lg:h-[400px]"
    >
      {showCover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image. */}
          <img
            src={coverUrl}
            alt=""
            onError={() => setCoverFailed(true)}
            className="absolute inset-0 size-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, var(--g-bg) 0%, color-mix(in srgb, var(--g-bg) 80%, transparent) 36%, color-mix(in srgb, var(--g-bg) 22%, transparent) 100%)',
            }}
          />
        </>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(70% 90% at 12% 8%, rgb(245 165 36 / 0.26), transparent 62%), radial-gradient(55% 70% at 92% 100%, rgb(232 87 58 / 0.15), transparent 66%)',
            }}
          />
          <GuestIconDish
            aria-hidden="true"
            strokeWidth={0.5}
            className="pointer-events-none absolute -bottom-12 -end-12 size-[340px] text-g-accent opacity-[0.1] lg:-bottom-20 lg:-end-16 lg:size-[520px]"
          />
        </>
      )}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-g-bg to-transparent"
      />

      <div className="relative mx-auto flex h-full max-w-[1280px] flex-col justify-between px-4 pt-4 pb-[52px] lg:px-8 lg:pt-6 lg:pb-16">
        <div className="flex items-center justify-between">
          <LanguageSwitch
            available={locale.available}
            resolved={locale.resolved}
            publicCode={publicCode}
            label={copy.language}
          />
          <ThemeToggle copy={copy} />
        </div>

        <div className="flex items-end gap-3.5 lg:gap-[22px]">
          <LogoTile name={restaurantName} logoUrl={logoUrl} />
          <div className="min-w-0 pb-0.5">
            <h1
              dir="auto"
              className={
                hasArabicName
                  ? 'g-display text-[38px] leading-[1.15] text-g-text lg:text-[64px]'
                  : 'g-brand text-[38px] leading-none tracking-[-0.5px] text-g-text lg:text-[72px] lg:tracking-[-1.5px]'
              }
            >
              {restaurantName}
            </h1>
            {tableNumber ? (
              <p
                dir="auto"
                className="mt-2 text-[14px] font-semibold text-g-accent-text lg:text-[18px]"
              >
                {copy.tableDineIn(tableNumber)}
              </p>
            ) : null}
            {branchLine ? (
              <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-g-text-2 lg:text-[14px]">
                <GuestIconMapPin className="size-[13px] shrink-0 lg:size-[15px]" />
                <span dir="auto" className="min-w-0 truncate">
                  {branchLine}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
