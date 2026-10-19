import type { ReactNode } from 'react';
import { IconHamburger } from './icons';
import { useStaffI18n } from '../../lib/i18n/client';

interface StaffTopbarProps {
  onOpenMobileNav: () => void;
  breadcrumb: ReactNode;
}

/**
 * Restrained top bar (UX-1, Section 6): replaces the previous plain
 * email + Log out row. Does not duplicate the sidebar's navigation --
 * only the mobile nav trigger and the current-page breadcrumb. The language
 * switch, the account link and sign-out live at the bottom of the sidebar.
 */
export function StaffTopbar({ onOpenMobileNav, breadcrumb }: StaffTopbarProps) {
  const { t } = useStaffI18n();

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="-ms-1 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
          aria-label={t('shell.openNavigation')}
        >
          <IconHamburger className="h-5 w-5" />
        </button>
        <div className="min-w-0">{breadcrumb}</div>
      </div>
    </header>
  );
}
