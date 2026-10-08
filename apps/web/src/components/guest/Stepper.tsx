import { GuestIconMinus, GuestIconPlus, GuestIconTrash } from './icons';

/**
 * FT-13A quantity stepper. 44px targets, the count is announced politely, and
 * the minus button turns into a bin when one more tap would remove the line
 * (`removesAtOne`) so the consequence is visible before the tap.
 */
export function Stepper({
  value,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
  removesAtOne = false,
  incrementDisabled = false,
  tone = 'light',
  size = 'md',
  className = '',
}: {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
  removesAtOne?: boolean;
  incrementDisabled?: boolean;
  /** `solid` is the pine pill used over product photos; `light` is the bordered stepper used in sheets and the cart. */
  tone?: 'light' | 'solid';
  /** `sm` (40px) only where a 44px pair genuinely cannot fit, e.g. beside a full-width CTA on a 360px phone. */
  size?: 'md' | 'sm';
  className?: string;
}) {
  const shell =
    tone === 'solid'
      ? 'bg-guest-pine text-white shadow-md'
      : 'border border-guest-line-strong bg-guest-surface text-guest-pine';
  const button = `flex ${size === 'sm' ? 'size-10' : 'size-11'} shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-guest-pine active:scale-95 disabled:opacity-40`;
  const buttonTone =
    tone === 'solid' ? 'hover:bg-white/15 focus-visible:outline-white' : 'hover:bg-guest-pine-soft';
  return (
    <div className={`inline-flex items-center rounded-full ${shell} ${className}`}>
      <button
        type="button"
        onClick={onDecrement}
        aria-label={decrementLabel}
        className={`${button} ${buttonTone}`}
      >
        {removesAtOne && value <= 1 ? (
          <GuestIconTrash className="size-[18px]" />
        ) : (
          <GuestIconMinus className="size-[18px]" />
        )}
      </button>
      <span
        aria-live="polite"
        className="min-w-7 text-center font-guest-display text-base font-bold tabular-nums"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={incrementDisabled}
        aria-label={incrementLabel}
        className={`${button} ${buttonTone}`}
      >
        <GuestIconPlus className="size-[18px]" />
      </button>
    </div>
  );
}
