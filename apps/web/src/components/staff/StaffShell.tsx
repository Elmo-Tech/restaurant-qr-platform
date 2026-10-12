'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { RestaurantStatus } from '../../lib/auth/types';
import { RestaurantSidebar, type StaffSection } from './RestaurantSidebar';
import { StaffTopbar } from './StaffTopbar';
import { Breadcrumbs } from './Breadcrumbs';
import { useStaffI18n } from '../../lib/i18n/client';

interface StaffShellProps {
  restaurantId: string;
  restaurantName: string;
  restaurantStatus: RestaurantStatus;
  restaurantLogoUrl: string | null;
  userEmail: string;
  canViewMenu: boolean;
  canViewTables: boolean;
  canViewOrders: boolean;
  canViewStaff: boolean;
  canViewRestaurantSettings: boolean;
  children: ReactNode;
}

function resolveSection(pathname: string, restaurantId: string): StaffSection {
  const dashboardPath = `/staff/restaurants/${restaurantId}`;
  const menuPath = `${dashboardPath}/menu`;
  const tablesPath = `${dashboardPath}/tables`;
  const ordersPath = `${dashboardPath}/orders`;
  const staffPath = `${dashboardPath}/staff`;
  const accountPath = `${dashboardPath}/account`;
  const settingsPath = `${dashboardPath}/settings`;

  if (pathname === menuPath || pathname.startsWith(`${menuPath}/`)) {
    return 'menu';
  }
  if (pathname === tablesPath || pathname.startsWith(`${tablesPath}/`)) {
    return 'tables';
  }
  if (pathname === ordersPath || pathname.startsWith(`${ordersPath}/`)) {
    return 'orders';
  }
  if (pathname === staffPath || pathname.startsWith(`${staffPath}/`)) {
    return 'staff';
  }
  if (pathname === accountPath) {
    return 'account';
  }
  if (pathname === settingsPath || pathname.startsWith(`${settingsPath}/`)) {
    return 'settings';
  }
  if (pathname === dashboardPath) {
    return 'dashboard';
  }
  return null;
}

/**
 * Restaurant workspace shell (UX-1, Section 3): sidebar + top bar + content
 * geometry shared by every `/staff/restaurants/[restaurantId]/...` page.
 * The one Client Component boundary needed for pathname-aware active
 * navigation/breadcrumbs and the mobile drawer's open/close state (Section
 * 16 permits this narrowly) -- `children` is whatever Server Component page
 * the route already renders, completely unmodified.
 */
export function StaffShell({
  restaurantId,
  restaurantName,
  restaurantStatus,
  restaurantLogoUrl,
  userEmail,
  canViewMenu,
  canViewTables,
  canViewOrders,
  canViewStaff,
  canViewRestaurantSettings,
  children,
}: StaffShellProps) {
  const pathname = usePathname();
  const { t } = useStaffI18n();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const section = resolveSection(pathname, restaurantId);

  const breadcrumbItems =
    section === 'settings'
      ? [
          { label: restaurantName, href: `/staff/restaurants/${restaurantId}` },
          {
            label: t('nav.settingsShort'),
            href: `/staff/restaurants/${restaurantId}/settings/profile`,
          },
          {
            label: pathname.includes('/settings/delivery')
              ? t('settings.tab.delivery')
              : pathname.includes('/settings/guest-qr')
                ? t('settings.tab.guestQr')
                : pathname.includes('/settings/branches')
                ? t('settings.tab.branches')
                : pathname.includes('/settings/languages')
                  ? t('settings.tab.languages')
                  : t('settings.tab.profile'),
          },
        ]
      : [
          { label: restaurantName, href: `/staff/restaurants/${restaurantId}` },
          {
            label:
              section === 'menu'
                ? t('nav.menu')
                : section === 'tables'
                  ? t('nav.tables')
                  : section === 'orders'
                    ? t('nav.orders')
                    : section === 'staff'
                      ? t('nav.staff')
                      : section === 'account'
                        ? t('account.title')
                        : t('nav.dashboard'),
          },
        ];

  return (
    // `overflow-x-clip`: nothing inside the shell (a wide row, an off-screen element) may ever
    // make the page scroll sideways. The content column itself is `min-w-0 flex-1`, so it can
    // only ever take the width left beside the sidebar.
    <div className="flex min-h-screen w-full max-w-full overflow-x-clip bg-background">
      <RestaurantSidebar
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        restaurantStatus={restaurantStatus}
        restaurantLogoUrl={restaurantLogoUrl}
        currentSection={section}
        canViewMenu={canViewMenu}
        canViewTables={canViewTables}
        canViewOrders={canViewOrders}
        canViewStaff={canViewStaff}
        canViewRestaurantSettings={canViewRestaurantSettings}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />

      <div className="flex min-w-0 max-w-full flex-1 flex-col">
        <StaffTopbar
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          userEmail={userEmail}
          accountHref={`/staff/restaurants/${restaurantId}/account`}
          isAccountActive={section === 'account'}
          breadcrumb={<Breadcrumbs items={breadcrumbItems} />}
        />
        {/* UX-2 geometry fix: no `mx-auto` -- centering a capped max-width
            inside the space that already sits to the right of a persistent
            Sidebar pushes content away from the Sidebar into a large empty
            left gutter on wide viewports. Left-anchored with a generous
            (not huge) max-width instead: content starts right after the
            page gutter, and only stops growing on very large monitors. */}
        <main className="w-full min-w-0 max-w-[1600px] flex-1 px-4 py-6 sm:px-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
