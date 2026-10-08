'use client';

import { GuestIconBag, GuestIconMoped } from '../../../components/guest/icons';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { Fulfillment } from './guest-view-types';

const ICON: Record<Fulfillment, React.ReactNode> = {
  PICKUP: <GuestIconBag className="size-[18px]" />,
  DELIVERY: <GuestIconMoped className="size-[18px]" />,
};

/**
 * The ordering-mode switch (GENERIC QR only): "Pickup | Delivery" with icons, the active
 * segment filled saffron with dark text. It is the same state as the checkout's switch --
 * one source of truth in `PublicMenuView` -- and only offers what the Backend says is
 * available. With a single available mode it renders a static chip instead of a switch.
 *
 * `hero` sits in the floating card that overlaps the hero; `cart` is the slightly larger
 * variant at the top of the checkout.
 */
export function ModeSwitch({
  value,
  pickupAvailable,
  deliveryAvailable,
  onChange,
  copy,
  variant,
  disabled = false,
}: {
  value: Fulfillment;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  onChange: (next: Fulfillment) => void;
  copy: PublicMenuCopy;
  variant: 'hero' | 'cart';
  disabled?: boolean;
}) {
  const modes: { mode: Fulfillment; label: string }[] = [];
  if (pickupAvailable) modes.push({ mode: 'PICKUP', label: copy.pickup });
  if (deliveryAvailable) modes.push({ mode: 'DELIVERY', label: copy.delivery });
  if (modes.length === 0) return null;

  const segment =
    variant === 'hero'
      ? 'h-12 rounded-3xl text-[15px] lg:px-[22px]'
      : 'h-[50px] rounded-2xl text-[14.5px]';

  if (modes.length === 1) {
    const only = modes[0];
    return (
      <div
        className={`flex flex-1 items-center justify-center gap-2 bg-g-accent px-5 font-bold text-g-on-accent ${segment}`}
      >
        {ICON[only.mode]}
        {only.label}
      </div>
    );
  }

  return (
    <div role="group" aria-label={copy.orderingMode} className="flex flex-1 gap-1">
      {modes.map(({ mode, label }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(mode)}
            className={`flex flex-1 items-center justify-center gap-2 px-3 transition-colors disabled:cursor-not-allowed ${segment} ${
              active
                ? 'bg-g-accent font-bold text-g-on-accent shadow-[0_6px_16px_rgb(245_165_36/0.35)]'
                : 'font-semibold text-g-text-2 hover:text-g-text'
            }`}
          >
            {ICON[mode]}
            {label}
          </button>
        );
      })}
    </div>
  );
}
