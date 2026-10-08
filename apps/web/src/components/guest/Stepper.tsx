import { GuestIconMinus, GuestIconPlus, GuestIconTrash } from './icons';

type StepperVariant = 'accent' | 'sheet' | 'cart';

/**
 * FT-13B quantity stepper, in the three looks the design uses:
 * - `accent`: the saffron pill that replaces "Add" on a product card once it is in the order;
 * - `sheet`: the raised stepper beside the product sheet's CTA;
 * - `cart`: the compact stepper on a cart row.
 * DOM order is `+`, quantity, `-`: it follows the reading direction, so it mirrors in Arabic.
 * When one more tap on `-` would remove the line (`removesAtOne`) the glyph becomes a bin,
 * so the consequence is visible before the tap. Buttons are 44px tall; the count is announced.
 */
const SHELL: Record<StepperVariant, string> = {
  accent: 'h-11 rounded-[22px] bg-g-accent text-g-on-accent',
  sheet: 'h-[54px] rounded-[18px] bg-g-surface-2 px-1 text-g-text',
  cart: 'h-11 rounded-[14px] bg-g-surface-2 text-g-text',
};

const BUTTON: Record<StepperVariant, string> = {
  accent: 'h-11 w-[42px]',
  sheet: 'h-[46px] w-11',
  cart: 'h-11 w-[38px]',
};

const COUNT: Record<StepperVariant, string> = {
  accent: 'min-w-4 text-[15px]',
  sheet: 'min-w-5 text-[17px]',
  cart: 'min-w-3.5 text-[14.5px]',
};

export function Stepper({
  variant,
  value,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
  removesAtOne = false,
  incrementDisabled = false,
  className = '',
}: {
  variant: StepperVariant;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
  removesAtOne?: boolean;
  incrementDisabled?: boolean;
  className?: string;
}) {
  const iconSize = variant === 'sheet' ? 'size-[18px]' : 'size-4';
  const button = `flex shrink-0 items-center justify-center transition-[opacity,transform] active:scale-90 disabled:opacity-40 ${BUTTON[variant]}`;
  return (
    <div className={`inline-flex shrink-0 items-center ${SHELL[variant]} ${className}`}>
      <button
        type="button"
        onClick={onIncrement}
        disabled={incrementDisabled}
        aria-label={incrementLabel}
        className={button}
      >
        <GuestIconPlus className={iconSize} strokeWidth={2.6} />
      </button>
      <span aria-live="polite" className={`g-num text-center ${COUNT[variant]}`}>
        {value}
      </span>
      <button
        type="button"
        onClick={onDecrement}
        aria-label={decrementLabel}
        className={`${button} ${variant === 'sheet' ? 'text-g-text-2' : ''}`}
      >
        {removesAtOne && value <= 1 ? (
          <GuestIconTrash className={iconSize} strokeWidth={2} />
        ) : (
          <GuestIconMinus className={iconSize} strokeWidth={2.6} />
        )}
      </button>
    </div>
  );
}
