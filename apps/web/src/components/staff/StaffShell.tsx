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
  userEmail: string;
  canViewMenu: boolean;
  canViewTables: boolean;
  canViewOrders: boolean;
  canViewRestaurantSettings: boolean;
  children: ReactNode;
}

function resolveSection(pathname: string, restaurantId: string): StaffSection {
  const dashboardPath = `/staff/restaurants/${restaurantId}`;
  const menuPath = `${dashboardPath}/menu`;
  const tablesPath = `${dashboardPath}/tables`;
  const ordersPath = `${dashboardPath}/orders`;
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
  userEmail,
  canViewMenu,
  canViewTables,
  canViewOrders,
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
            href: `/staff/restaurants/${restaurantId}/settings/languages`,
          },
          {
            label: pathname.includes('/settings/delivery')
              ? t('settings.tab.delivery')
              : t('settings.tab.languages'),
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
                    : t('nav.dashboard'),
          },
        ];

  return (
    <div className="flex min-h-screen bg-[#F8F5F1]">
      <RestaurantSidebar
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        restaurantStatus={restaurantStatus}
        currentSection={section}
        canViewMenu={canViewMenu}
        canViewTables={canViewTables}
        canViewOrders={canViewOrders}
        canViewRestaurantSettings={canViewRestaurantSettings}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <StaffTopbar
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          userEmail={userEmail}
          breadcrumb={<Breadcrumbs items={breadcrumbItems} />}
        />
        {/* UX-2 geometry fix: no `mx-auto` -- centering a capped max-width
            inside the space that already sits to the right of a persistent
            Sidebar pushes content away from the Sidebar into a large empty
            left gutter on wide viewports. Left-anchored with a generous
            (not huge) max-width instead: content starts right after the
            page gutter, and only stops growing on very large monitors. */}
        <main className="w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
