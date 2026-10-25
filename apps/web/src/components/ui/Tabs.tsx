'use client';

import Link from 'next/link';
import { cn } from '../../lib/utils';

export interface NavTabItem {
  key: string;
  label: string;
  href: string;
}

/**
 * Design-system-v2: a link-based tab strip for switching between real routes
 * (Menu & Products / Modifier Library; later Restaurant Settings' own tabs).
 * Deliberately NOT the Radix `Tabs` primitive: Radix Tabs models a single
 * page's content switching between in-DOM panels via `role="tabpanel"` --
 * here each "tab" is its own route with its own data, so a plain `<nav>` of
 * links with `aria-current="page"` is the semantically correct pattern (and
 * makes browser back/forward and middle-click work for free).
 */
export function NavTabs({
  items,
  activeKey,
  ariaLabel,
  scrollable = false,
}: {
  items: readonly NavTabItem[];
  activeKey: string;
  ariaLabel: string;
  /** Compact phone navigation, without wrapping route tabs into multiple rows. */
  scrollable?: boolean;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn('flex min-w-0 gap-1 border-b border-border', scrollable ? 'flex-nowrap overflow-x-auto overscroll-x-contain pb-px [scrollbar-width:thin]' : 'flex-wrap')}>
      {items.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex h-10 items-center whitespace-nowrap border-b-2 px-4 text-sm font-medium outline-none transition-colors focus-visible:bg-muted',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
