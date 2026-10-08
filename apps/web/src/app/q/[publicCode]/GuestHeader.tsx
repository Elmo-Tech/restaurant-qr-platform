'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GuestIconBag, GuestIconTable } from '../../../components/guest/icons';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { OrderingContextView } from './guest-view-types';

/** Platform locales stay exactly `en`/`ar` -- two fixed labels need no locale library. */
const LOCALE_LABELS: Record<string, { short: string; full: string }> = {
  en: { short: 'EN', full: 'English' },
  ar: { short: 'عربي', full: 'العربية' },
};

/** The restaurant's logo, or -- with no logo (or one that fails to load) -- its initial on a pine tile. */
function RestaurantMark({
  name,
  logoUrl,
  className,
  letterClassName,
}: {
  name: string;
  logoUrl: string | null;
  className: string;
  letterClassName: string;
}) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
      <img
        src={logoUrl}
        alt=""
        onError={() => setFailed(true)}
        className={`${className} border border-guest-line bg-guest-surface object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} flex items-center justify-center bg-guest-pine text-white`}
    >
      <span
        className={`font-guest-display font-extrabold leading-none ${letterClassName}`}
        dir="auto"
      >
        {(name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? '•').toLocaleUpperCase()}
      </span>
    </span>
  );
}

export function LanguageSwitcher({
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
  if (available.length <= 1) return null;
  return (
    <nav
      aria-label={label}
      className="flex shrink-0 gap-0.5 rounded-full border border-guest-line bg-guest-surface p-0.5 text-sm"
    >
      {available.map((locale) => {
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
            className={`flex min-h-10 min-w-11 items-center justify-center rounded-full px-3 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-guest-pine ${
              isActive ? 'bg-guest-pine text-white' : 'text-guest-ink-soft hover:bg-guest-pine-soft'
            }`}
          >
            {labels.short}
          </Link>
        );
      })}
    </nav>
  );
}

/** The one-line answer to "what am I ordering into?" -- shared by the ticket, the compact bar and the cart. */
export function contextHeadline(context: OrderingContextView, copy: PublicMenuCopy): string {
  if (context.kind === 'TABLE') return copy.dineIn;
  if (context.pickupAvailable && context.deliveryAvailable) return copy.pickupOrDelivery;
  if (context.pickupAvailable) return copy.pickup;
  if (context.deliveryAvailable) return copy.delivery;
  return copy.browseOnly;
}

/**
 * The signature element: an order docket. A pine stub carries the table number
 * (or the order-type glyph) and is separated from the detail by a perforation
 * with half-moon notches -- the way a kitchen ticket reads. It states the
 * ordering context once, prominently, without becoming a hero banner.
 */
function ContextTicket({ context, copy }: { context: OrderingContextView; copy: PublicMenuCopy }) {
  const isTable = context.kind === 'TABLE';
  const headline = contextHeadline(context, copy);
  const canOrder = isTable || context.pickupAvailable || context.deliveryAvailable;
  const detail = isTable ? context.branchName : canOrder ? copy.chooseAtCheckout : null;
  return (
    <div className="relative flex w-full max-w-sm items-stretch overflow-hidden rounded-2xl border border-guest-line bg-guest-surface shadow-sm md:w-auto md:min-w-[260px]">
      <div className="flex min-w-[76px] flex-col items-center justify-center gap-0.5 bg-guest-pine px-4 py-3 text-white">
        {isTable ? (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
              {copy.table}
            </span>
            <span
              dir="auto"
              className="max-w-[5.5rem] truncate font-guest-display text-3xl font-extrabold leading-none"
            >
              {context.tableNumber}
            </span>
          </>
        ) : (
          <GuestIconBag className="size-7" />
        )}
      </div>
      <div className="relative w-0" aria-hidden="true">
        <span className="absolute inset-y-3 border-s-2 border-dashed border-guest-line-strong" />
        <span className="absolute -top-2 -ms-2 size-4 rounded-full bg-guest-paper" />
        <span className="absolute -bottom-2 -ms-2 size-4 rounded-full bg-guest-paper" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-3">
        <span className="font-guest-display text-lg font-bold leading-tight">{headline}</span>
        {detail ? <span className="truncate text-sm text-guest-muted">{detail}</span> : null}
      </div>
    </div>
  );
}

/** The full brand block at the top of the page. It scrolls away; `CompactBar` takes over. */
export function GuestHeader({
  restaurantName,
  logoUrl,
  menuName,
  menuDescription,
  context,
  copy,
  locale,
  publicCode,
  sentinelRef,
}: {
  restaurantName: string;
  logoUrl: string | null;
  menuName: string;
  menuDescription: string | null;
  context: OrderingContextView;
  copy: PublicMenuCopy;
  locale: { available: string[]; resolved: string };
  publicCode: string;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <header ref={sentinelRef} className="px-4 pt-4 pb-5 sm:px-6 sm:pt-7 sm:pb-7 lg:px-10">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5 sm:gap-5">
            <RestaurantMark
              name={restaurantName}
              logoUrl={logoUrl}
              className="size-14 shrink-0 rounded-2xl sm:size-[72px]"
              letterClassName="text-2xl sm:text-3xl"
            />
            <div className="min-w-0">
              <h1
                dir="auto"
                className="font-guest-display text-[1.7rem] font-extrabold leading-[1.05] text-guest-ink sm:text-5xl"
              >
                {restaurantName}
              </h1>
              <p
                dir="auto"
                className="mt-1 truncate text-sm font-medium text-guest-muted sm:text-base"
              >
                {menuName}
              </p>
            </div>
          </div>
          <LanguageSwitcher
            available={locale.available}
            resolved={locale.resolved}
            publicCode={publicCode}
            label={copy.language}
          />
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
          {menuDescription ? (
            <p dir="auto" className="max-w-2xl text-[0.95rem] leading-relaxed text-guest-ink-soft">
              {menuDescription}
            </p>
          ) : (
            <span />
          )}
          <ContextTicket context={context} copy={copy} />
        </div>
      </div>
    </header>
  );
}

/**
 * Appears once the brand block has scrolled out of view. It is `fixed` (not in
 * the document flow), so showing/hiding it never shifts the page; the category
 * nav simply moves its sticky `top` to sit beneath it.
 */
export function CompactBar({
  visible,
  restaurantName,
  logoUrl,
  context,
  copy,
  locale,
  publicCode,
}: {
  visible: boolean;
  restaurantName: string;
  logoUrl: string | null;
  context: OrderingContextView;
  copy: PublicMenuCopy;
  locale: { available: string[]; resolved: string };
  publicCode: string;
}) {
  const isTable = context.kind === 'TABLE';
  return (
    <div
      inert={!visible}
      aria-hidden={!visible}
      className={`fixed inset-x-0 top-0 z-30 h-[52px] border-b border-guest-line bg-guest-paper/95 backdrop-blur transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="h-full px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full max-w-[1180px] items-center gap-2.5">
          <RestaurantMark
            name={restaurantName}
            logoUrl={logoUrl}
            className="size-8 shrink-0 rounded-lg"
            letterClassName="text-base"
          />
          <span
            dir="auto"
            className="min-w-0 flex-1 truncate font-guest-display text-lg font-bold text-guest-ink"
          >
            {restaurantName}
          </span>
          <span
            className={`shrink-0 items-center gap-1.5 rounded-full bg-guest-pine-soft px-3 py-1.5 text-sm font-semibold text-guest-pine ${
              isTable ? 'flex' : 'hidden sm:flex'
            }`}
          >
            {isTable ? (
              <>
                <GuestIconTable className="size-4" />
                <span dir="auto">
                  {copy.table} {context.tableNumber}
                </span>
              </>
            ) : (
              <>
                <GuestIconBag className="size-4" />
                <span>{contextHeadline(context, copy)}</span>
              </>
            )}
          </span>
          <LanguageSwitcher
            available={locale.available}
            resolved={locale.resolved}
            publicCode={publicCode}
            label={copy.language}
          />
        </div>
      </div>
    </div>
  );
}
