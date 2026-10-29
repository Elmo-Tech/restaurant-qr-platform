'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { RestaurantStatus } from '../../lib/auth/types';
import { RestaurantSidebar, type PackageHides, type StaffSection } from './RestaurantSidebar';
import { StaffTopbar } from './StaffTopbar';
import { MobileNavigation } from './MobileNavigation';
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
  packageHides?: PackageHides;
  canViewKitchen: boolean;
  canViewStaff: boolean;
  canViewRestaurantSettings: boolean;
  canViewSubscription?: boolean;
  children: ReactNode;
}

function resolveSection(pathname: string, restaurantId: string): StaffSection {
  const dashboardPath = `/staff/restaurants/${restaurantId}`;
  const menuPath = `${dashboardPath}/menu`;
  const tablesPath = `${dashboardPath}/tables`;
  const ordersPath = `${dashboardPath}/orders`;
  const kitchenPath = `${dashboardPath}/kitchen`;
  const staffPath = `${dashboardPath}/staff`;
  const accountPath = `${dashboardPath}/account`;
  const subscriptionPath = `${dashboardPath}/subscription`;
  const settingsPath = `${dashboardPath}/settings`;

  // These existing URLs live under /settings for compatibility, but belong
  // to the Electronic Menu workspace. Sidebar and mobile nav must agree.
  if (['design', 'announcements', 'suggestions', 'guest-qr'].some((part) => {
    const path = `${settingsPath}/${part}`;
    return pathname === path || pathname.startsWith(`${path}/`);
  })) {
    return 'menu';
  }

  if (pathname === menuPath || pathname.startsWith(`${menuPath}/`)) {
    return 'menu';
  }
  if (pathname === tablesPath || pathname.startsWith(`${tablesPath}/`)) {
    return 'tables';
  }
  if (pathname === ordersPath || pathname.startsWith(`${ordersPath}/`)) {
    return 'orders';
  }
  if (pathname === kitchenPath || pathname.startsWith(`${kitchenPath}/`)) {
    return 'kitchen';
  }
  if (pathname === staffPath || pathname.startsWith(`${staffPath}/`)) {
    return 'staff';
  }
  if (pathname === accountPath) {
    return 'account';
  }
  if (pathname === subscriptionPath) {
    return 'subscription';
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
 * navigation/breadcrumbs and the mobile app-style navigation (Section
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
  packageHides,
  canViewKitchen,
  canViewStaff,
  canViewRestaurantSettings,
  canViewSubscription = false,
  children,
}: StaffShellProps) {
  const pathname = usePathname();
  const { t } = useStaffI18n();
  const section = resolveSection(pathname, restaurantId);

  const base = `/staff/restaurants/${restaurantId}`;
  const hubPath = `${base}/menu/overview`;
  const guestPath = `${base}/menu/guest-experience`;
  const isGuestSetting = pathname.includes('/settings/announcements') || pathname.includes('/settings/suggestions');
  const isMenuSetting = isGuestSetting || pathname.includes('/settings/design') || pathname.includes('/settings/guest-qr');
  const menuCrumbs = [{ label: restaurantName, href: base }, { label: t('menuHub.title'), href: hubPath }];
  const breadcrumbItems = isMenuSetting
    ? [...menuCrumbs,
        ...(isGuestSetting ? [{ label: t('menuHub.guest'), href: guestPath }] : []),
        { label: pathname.includes('/announcements') ? t('menuHub.announcements')
          : pathname.includes('/suggestions') ? t('menuHub.suggestions')
          : pathname.includes('/design') ? t('menuHub.design') : t('menuHub.share') }]
    : section === 'menu'
      ? [...menuCrumbs, ...(pathname === hubPath ? [] : [
          ...(pathname === guestPath ? [{ label: t('menuHub.guest') }] :
            [{ label: t('menuHub.menus') }]),
        ])]
      : section === 'settings'
        ? [
            { label: restaurantName, href: base },
            { label: t('nav.settingsShort'), href: `${base}/settings/profile` },
            { label: pathname.includes('/settings/delivery') ? t('settings.tab.delivery')
              : pathname.includes('/settings/branches') ? t('settings.tab.branches')
              : pathname.includes('/settings/languages') ? t('settings.tab.languages')
              : t('settings.tab.profile') },
          ]
        : [
            { label: restaurantName, href: base },
            { label: section === 'tables' ? t('nav.tables') : section === 'orders' ? t('nav.orders')
              : section === 'kitchen' ? t('nav.kitchen') : section === 'staff' ? t('nav.staff')
              : section === 'account' ? t('account.title') : section === 'subscription'
                ? t('nav.subscription') : t('nav.dashboard') },
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
        packageHides={packageHides}
        canViewKitchen={canViewKitchen}
        canViewStaff={canViewStaff}
        canViewRestaurantSettings={canViewRestaurantSettings}
        canViewSubscription={canViewSubscription}
        user={{
          email: userEmail,
          accountHref: `/staff/restaurants/${restaurantId}/account`,
          isAccountActive: section === 'account',
        }}
      />

      <div className="flex min-w-0 max-w-full flex-1 flex-col">
        <StaffTopbar
          restaurantName={restaurantName}
          restaurantLogoUrl={restaurantLogoUrl}
          currentPageLabel={breadcrumbItems[breadcrumbItems.length - 1].label}
          breadcrumb={<Breadcrumbs items={breadcrumbItems} />}
        />
        {/* UX-2 geometry fix: no `mx-auto` -- centering a capped max-width
            inside the space that already sits to the right of a persistent
            Sidebar pushes content away from the Sidebar into a large empty
            left gutter on wide viewports. Left-anchored with a generous
            (not huge) max-width instead: content starts right after the
            page gutter, and only stops growing on very large monitors. */}
        <main className="w-full min-w-0 max-w-[1600px] flex-1 px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-6 lg:px-10 lg:pb-6">
          {children}
        </main>
        <MobileNavigation
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          restaurantLogoUrl={restaurantLogoUrl}
          userEmail={userEmail}
          access={{
            canViewMenu,
            canViewOrders,
            canViewTables,
            canViewKitchen,
            canViewStaff,
            canViewRestaurantSettings,
            canViewSubscription,
            packageHides,
          }}
        />
      </div>
    </div>
  );
}
