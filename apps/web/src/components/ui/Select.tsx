import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Design-system-v2: a native `<select>` (no Radix Select) -- it is already fully accessible and keyboard-correct, and a native picker is what Staff on a tablet expects; only the chrome is restyled, with a drawn-in chevron since `appearance-none` removes the browser's own one. */
export function Select({ className, ...props }: SelectProps) {
  // `className` (e.g. a caller's width override like `sm:w-40`) sizes the
  // wrapper, not the inner <select> directly -- the select always fills it,
  // so the drawn-in chevron below stays pinned to its actual visible edge
  // instead of a fixed `w-full` that could disagree with a narrower caller.
  return (
    <div className={cn('relative w-full', className)}>
      <select
        {...props}
        className="h-10 w-full appearance-none rounded-md border border-input bg-card px-3 py-2 pe-9 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      >
        <path d="M6 9.5l6 6 6-6" />
      </svg>
    </div>
  );
}
