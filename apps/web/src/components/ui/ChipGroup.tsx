'use client';

export interface ChipOption<V extends string> {
  value: V;
  label: string;
  /** Shown as a small counter when supplied -- always derived from already-loaded data, never a new Backend request. */
  count?: number;
  disabled?: boolean;
}

/**
 * Design-system-v2: a visible single-select filter control, used wherever a
 * hidden `<select>` would slow Staff down under operational pressure (Orders'
 * type/status filters, its Active/Completed/All view). Every option is a
 * real `<button aria-pressed>` at least 36px tall (44px at `size="lg"`, the
 * tablet-friendly size), keyboard focusable, and laid out with only logical
 * properties so it mirrors correctly in RTL.
 *
 * - `chips`: separate rounded pills that wrap; best for several options
 *   (Order type, Status).
 * - `segmented`: one joined track with a raised active segment; best for 2-4
 *   mutually exclusive views (Active / Completed / All).
 */
export function ChipGroup<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = 'chips',
  size = 'md',
  className = '',
}: {
  options: readonly ChipOption<V>[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel: string;
  variant?: 'chips' | 'segmented';
  size?: 'md' | 'lg';
  className?: string;
}) {
  const height = size === 'lg' ? 'min-h-11' : 'min-h-9';

  if (variant === 'segmented') {
    return (
      <div
        role="group"
        aria-label={ariaLabel}
        className={`inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1 ${className}`}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              disabled={option.disabled}
              onClick={() => onChange(option.value)}
              className={`inline-flex ${height} items-center gap-2 rounded-md px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option.label}
              {option.count !== undefined ? (
                <span
                  className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums ${
                    selected ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
                  }`}
                >
                  {option.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="group" aria-label={ariaLabel} className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`inline-flex ${height} items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
              selected
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-card text-secondary-foreground hover:border-muted-foreground/40 hover:bg-muted'
            }`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-xs tabular-nums ${
                  selected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
