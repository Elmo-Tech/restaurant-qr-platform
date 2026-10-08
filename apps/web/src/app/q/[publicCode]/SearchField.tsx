'use client';

import { GuestIconClose, GuestIconSearch } from '../../../components/guest/icons';

/**
 * Product search over the already-loaded Menu (client-side; see `lib/public-menu/search.ts`).
 * `phone` is the 50px field with its own border; `desktop` is the borderless 52px field that
 * lives inside the floating control bar. A clear button appears with text; Escape clears.
 */
export function SearchField({
  id,
  value,
  onChange,
  placeholder,
  label,
  clearLabel,
  variant,
  className = '',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  clearLabel: string;
  variant: 'phone' | 'desktop';
  className?: string;
}) {
  return (
    <div
      role="search"
      className={`relative flex items-center gap-2.5 text-g-text-3 ${
        variant === 'phone'
          ? 'h-[50px] rounded-2xl border border-g-line bg-g-surface px-4'
          : 'h-[52px] rounded-[26px] bg-g-surface-2 px-[18px]'
      } ${className}`}
    >
      <GuestIconSearch className="size-[19px] shrink-0" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        data-guest-search
        type="search"
        dir="auto"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          }
        }}
        className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-g-text outline-none placeholder:text-g-text-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={clearLabel}
          className="-me-2 flex size-10 shrink-0 items-center justify-center rounded-full text-g-text-2 hover:bg-g-accent-soft"
        >
          <GuestIconClose className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
