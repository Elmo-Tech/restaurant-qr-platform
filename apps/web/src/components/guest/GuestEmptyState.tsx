import type { ReactNode } from 'react';

/**
 * FT-13A: an intentional empty/notice state for the Guest surfaces -- a calm
 * pine-tinted glyph, a plain-language title and one line of direction. Used for
 * "no matching items", "menu not ready yet" and the status pages; never raw
 * API text.
 */
export function GuestEmptyState({
  icon,
  title,
  message,
  action,
  className = '',
}: {
  icon: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-3xl border border-dashed border-guest-line-strong bg-guest-surface/60 px-6 py-12 text-center ${className}`}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-guest-pine-soft text-guest-pine [&>svg]:size-7">
        {icon}
      </span>
      <h2 className="font-guest-display text-xl font-bold text-guest-ink">{title}</h2>
      {message ? (
        <p className="max-w-sm text-[0.95rem] leading-relaxed text-guest-muted">{message}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
