import type { ReactNode } from 'react';
import { LogoutButton } from '../../app/staff/LogoutButton';
import { IconHamburger } from './icons';
import { StaffLanguageSwitcher } from './StaffLanguageSwitcher';
import { useStaffI18n } from '../../lib/i18n/client';

interface StaffTopbarProps {
  onOpenMobileNav: () => void;
  userEmail: string;
  breadcrumb: ReactNode;
}

/**
 * Restrained top bar (UX-1, Section 6): replaces the previous plain
 * email + Log out row. Does not duplicate the sidebar's navigation --
 * only the mobile nav trigger, current-page breadcrumb, and account
 * identity/logout. `LogoutButton` is reused completely unchanged; only its
 * placement moved (CLAUDE.md #21, Section 6: "Do not change authentication
 * logic").
 */
export function StaffTopbar({
  onOpenMobileNav,
  userEmail,
  breadcrumb,
}: StaffTopbarProps) {
  const { t } = useStaffI18n();
  const initial = userEmail.charAt(0).toUpperCase();

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
      <div className="flex flex-shrink-0 items-center gap-3">
        <StaffLanguageSwitcher />
        <div className="hidden items-center gap-2 sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
            {initial}
          </span>
          <span dir="ltr" className="max-w-[160px] truncate text-sm text-muted-foreground">
            {userEmail}
          </span>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
