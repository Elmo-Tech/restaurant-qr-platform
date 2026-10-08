import type { ReactNode } from 'react';

/**
 * An intentional empty/notice state for the Guest surfaces -- a saffron-tinted glyph, a
 * plain-language title and one line of direction. Used for "no matching items", "menu not
 * ready yet" and the status pages; never raw API text.
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
      className={`flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-g-line bg-g-surface px-6 py-12 text-center ${className}`}
    >
      <span className="g-fallback flex size-16 items-center justify-center rounded-full text-g-accent [&>svg]:size-8">
        {icon}
      </span>
      <h2 className="g-display text-[24px] leading-tight text-g-text">{title}</h2>
      {message ? (
        <p className="max-w-sm text-[14px] leading-[1.7] text-g-text-2">{message}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
