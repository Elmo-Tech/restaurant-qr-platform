'use client';

import Link from 'next/link';
import { useStaffI18n } from '../../lib/i18n/client';

/** Back to the logical parent, including when opened directly from a bookmark. */
export function MenuHubBackLink({
  restaurantId,
  parent,
}: {
  restaurantId: string;
  parent: 'hub' | 'guest';
}) {
  const { t } = useStaffI18n();
  const base = `/staff/restaurants/${encodeURIComponent(restaurantId)}`;
  return (
    <Link
      href={parent === 'guest' ? `${base}/menu/guest-experience` : `${base}/menu/overview`}
      className="group inline-flex min-h-11 w-fit max-w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:border-primary/30 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-transform group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-4 rtl:rotate-180">
          <path d="M19 12H5m7 7-7-7 7-7" />
        </svg>
      </span>
      <span>{t(parent === 'guest' ? 'menuHub.backGuest' : 'menuHub.back')}</span>
    </Link>
  );
}
