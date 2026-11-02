'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { RestaurantStatus } from '../../lib/auth/types';
import { RestaurantSidebar, type PackageHides, type StaffSection } from './RestaurantSidebar';
import { StaffTopbar } from './StaffTopbar';
import { DemoBanner } from './DemoBanner';
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
  /** Set only for a temporary demo restaurant (DEC-060): when it ends. */
  demoExpiresAt?: string | null;
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
  demoExpiresAt = null,
  children,
}: StaffShellProps) {
  const pathname = usePathname();
  const { t } = useStaffI18n();
  const section = resolveSection(pathname, restaurantId);

  const base = `/staff/restaurants/${restaurantId}`;
  const hubPath = `${base}/menu/overview`;
  const guestPath = `${base}/menu/guest-experience`;
  const menuRoot = `${base}/menu`;
  const menuSettingPath = (part: string) => `${base}/settings/${part}`;
  const isAtOrUnder = (root: string) => pathname === root || pathname.startsWith(`${root}/`);
  const isGuestSetting = ['announcements', 'suggestions'].some(part => isAtOrUnder(menuSettingPath(part)));
  const isMenuSetting = ['announcements', 'suggestions', 'design', 'guest-qr'].some(part => isAtOrUnder(menuSettingPath(part)));

  const menuCrumbs = [{ label: restaurantName, href: base }, { label: t('menuHub.title'), href: hubPath }];
  const menuContentCrumbs = [...menuCrumbs, { label: t('menuHub.menus'), href: menuRoot }];

  // Match the *actual* route hierarchy, not only the nearest sidebar category:
  // Hub > Menus & Products > Import / Modifier Library / Product editor.
  const breadcrumbItems = pathname === `${base}/setup`
    ? [{ label: restaurantName, href: base }, { label: t('setup.title') }]
    : pathname === `${base}/setup-preview`
      ? [{ label: restaurantName, href: base }, { label: t('setup.preview.pageTitle') }]
      : isMenuSetting
    ? [...menuCrumbs,
        ...(isGuestSetting ? [{ label: t('menuHub.guest'), href: guestPath }] : []),
        { label: isAtOrUnder(menuSettingPath('announcements')) ? t('menuHub.announcements')
          : isAtOrUnder(menuSettingPath('suggestions')) ? t('menuHub.suggestions')
          : isAtOrUnder(menuSettingPath('design')) ? t('menuHub.design') : t('menuHub.share') }]
    : section === 'menu'
      ? pathname === hubPath ? menuCrumbs
        : pathname === guestPath ? [...menuCrumbs, { label: t('menuHub.guest') }]
        : pathname === menuRoot ? [...menuCrumbs, { label: t('menuHub.menus') }]
        : isAtOrUnder(`${menuRoot}/modifier-presets`) ? [...menuContentCrumbs, { label: t('menu.section.library') }]
        : isAtOrUnder(`${menuRoot}/import`) ? [...menuContentCrumbs, { label: t('import.title') }]
        : isAtOrUnder(`${menuRoot}/products`) ? [...menuContentCrumbs,
            { label: pathname.endsWith('/new') ? t('product.createTitle') : t('menuHub.productEditor') }]
        : [...menuContentCrumbs]
      : section === 'settings'
        ? [
            { label: restaurantName, href: base },
            ...(pathname === `${base}/settings/overview` || pathname === `${base}/settings`
              ? [{ label: t('settingsHub.title') }]
              : [
                  { label: t('settingsHub.title'), href: `${base}/settings/overview` },
                  ...(isAtOrUnder(menuSettingPath('hours')) || isAtOrUnder(menuSettingPath('delivery'))
                    ? [{ label: t('settingsHub.branches'), href: `${base}/settings/branches` }]
                    : []),
                  { label: isAtOrUnder(menuSettingPath('ordering')) ? t('settingsHub.ordering')
                    : isAtOrUnder(menuSettingPath('delivery')) ? t('settingsHub.delivery')
                    : isAtOrUnder(menuSettingPath('hours')) ? t('settingsHub.hours')
                    : isAtOrUnder(menuSettingPath('branches')) ? t('settingsHub.branches')
                    : isAtOrUnder(menuSettingPath('languages')) ? t('settingsHub.languages')
                    : t('settingsHub.profile') },
                ]),
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
        {demoExpiresAt ? <DemoBanner expiresAt={demoExpiresAt} /> : null}
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
