'use client';

import { GuestIconBag } from '../../../components/guest/icons';
import { Price } from '../../../components/guest/Price';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';

/**
 * The persistent entry to the order: a pine bar pinned to the bottom with the
 * item count (it bumps when the count changes), a plain "View order" label and
 * the running total. Full width on phones, a compact floating bar at the end
 * edge on larger screens. Respects the home-indicator inset; the page reserves
 * matching bottom padding so it never covers content.
 */
export function CartBar({
  count,
  totalDisplay,
  currency,
  copy,
  onOpen,
}: {
  count: number;
  totalDisplay: string;
  currency: string;
  copy: PublicMenuCopy;
  onOpen: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[1180px] justify-center sm:justify-end">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${copy.viewOrder}, ${copy.itemsCount(count)}, ${totalDisplay} ${currency}`}
          className="guest-anim-rise pointer-events-auto flex h-16 w-full items-center gap-3.5 rounded-full bg-guest-pine ps-3 pe-6 text-white shadow-xl ring-1 ring-guest-pine-deep/40 transition-[background-color,transform] hover:bg-guest-pine-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-guest-pine active:scale-[0.99] sm:w-auto sm:min-w-[360px]"
        >
          <span
            key={count}
            className="guest-anim-bump relative flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15"
          >
            <GuestIconBag className="size-5" />
            <span className="absolute -top-1 -end-1 grid h-5 min-w-5 place-items-center rounded-full bg-guest-saffron px-1 font-guest-display text-[11px] font-extrabold text-guest-ink">
              {count}
            </span>
          </span>
          <span className="min-w-0 flex-1 text-start">
            <span className="block truncate text-[1.02rem] font-semibold leading-tight">
              {copy.viewOrder}
            </span>
            <span className="block truncate text-sm leading-tight text-white/75">
              {copy.itemsCount(count)}
            </span>
          </span>
          <Price
            amount={totalDisplay}
            currency={currency}
            className="font-guest-display text-lg font-bold"
            currencyClassName="text-[0.78em] font-medium opacity-80"
          />
        </button>
      </div>
    </div>
  );
}
