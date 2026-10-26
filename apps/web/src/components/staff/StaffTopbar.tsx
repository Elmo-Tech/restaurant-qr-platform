import type { ReactNode } from 'react';

interface StaffTopbarProps {
  breadcrumb: ReactNode;
  restaurantName: string;
  restaurantLogoUrl: string | null;
  currentPageLabel: string;
}

/**
 * On desktop preserve the existing breadcrumbs and sidebar. On phones show
 * only a compact restaurant identity and the current context: navigation
 * belongs to the always-available bottom dock, not a hidden hamburger.
 */
export function StaffTopbar({
  breadcrumb, restaurantName, restaurantLogoUrl, currentPageLabel,
}: StaffTopbarProps) {
  return (
    <header className="flex min-h-14 min-w-0 items-center justify-between gap-4 border-b border-border bg-card px-4 py-2.5 sm:px-6 lg:px-8 lg:py-3">
      <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
        {restaurantLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded logo served from configured API.
          <img src={restaurantLogoUrl} alt="" className="size-9 shrink-0 rounded-lg border border-border bg-background object-contain" />
        ) : (
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-base font-bold text-primary">
            {restaurantName.charAt(0)}
          </span>
        )}
        <div className="min-w-0 text-start">
          <p dir="auto" className="truncate text-sm font-bold leading-tight text-foreground">{restaurantName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{currentPageLabel}</p>
        </div>
      </div>
      <div className="hidden min-w-0 lg:block">{breadcrumb}</div>
    </header>
  );
}
