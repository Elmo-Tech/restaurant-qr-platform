'use client';

import { GuestIconChevron } from '../../../components/guest/icons';
import { Price } from '../../../components/guest/Price';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';

/**
 * The persistent entry to the order, phone and desktop: a 66px saffron bar with a dark count
 * tile (it bumps when the count changes), "View order" with a "mode · N items" sub-line, the
 * running total and a chevron. Inset 14px on a phone; centred and capped at 560px on a wide
 * screen. It respects the home-indicator inset, and the page reserves matching bottom space
 * so it never covers the last product or the checkout CTA.
 */
export function CartBar({
  count,
  totalDisplay,
  currency,
  modeLabel,
  copy,
  onOpen,
}: {
  count: number;
  totalDisplay: string;
  currency: string;
  modeLabel: string;
  copy: PublicMenuCopy;
  onOpen: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3.5 pb-[max(1.375rem,env(safe-area-inset-bottom))] lg:px-8 lg:pb-6">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${copy.viewOrder}, ${modeLabel}, ${copy.itemsCount(count)}`}
        className="guest-anim-rise pointer-events-auto flex h-[66px] w-full max-w-[560px] items-center justify-between rounded-[22px] bg-g-accent ps-3 pe-5 text-g-on-accent shadow-[0_14px_30px_rgb(245_165_36/0.38)] transition-transform active:scale-[0.99]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            key={count}
            className="g-num guest-anim-bump flex size-[42px] shrink-0 items-center justify-center rounded-[14px] bg-[#1c1205] text-[17px] text-[#f5a524] [font-weight:900]"
          >
            {count}
          </span>
          <span className="flex min-w-0 flex-col items-start leading-[1.25]">
            <span className="text-base font-extrabold">{copy.viewOrder}</span>
            <span dir="auto" className="max-w-full truncate text-xs font-semibold opacity-75">
              {modeLabel} · {copy.itemsCount(count)}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Price
            amount={totalDisplay}
            currency={currency}
            className="g-num text-[21px] [font-weight:900]"
            currencyClassName="text-[12.5px] font-bold"
          />
          <GuestIconChevron className="size-[18px] rtl:-scale-x-100" strokeWidth={2.6} />
        </span>
      </button>
    </div>
  );
}
