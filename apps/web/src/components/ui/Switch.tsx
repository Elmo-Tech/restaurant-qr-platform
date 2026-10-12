'use client';

import { cn } from '../../lib/utils';

/**
 * Design-system-v2: an on/off switch -- a real `<button role="switch">` with
 * `aria-checked`, so a screen reader announces it as a switch and the keyboard
 * toggles it with Space or Enter. State is never colour-only: callers show the
 * state as text next to it. The knob moves with logical properties, so it
 * mirrors correctly in RTL. At least 44px wide to stay a comfortable target.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /** The accessible name (e.g. "Delivery"). */
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border border-transparent outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted-foreground/40',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-card shadow transition-[margin] duration-150',
          checked ? 'ms-[1.625rem]' : 'ms-1',
        )}
      />
    </button>
  );
}
