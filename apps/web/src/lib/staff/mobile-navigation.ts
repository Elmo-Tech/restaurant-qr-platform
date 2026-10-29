import type { MessageKey } from '../i18n/messages';

/**
 * Navigation is presentation ONLY. StaffShell passes capabilities computed
 * from /auth/me membership, including both package features and user permissions.
 * No role-name guesses, hardcoded package tiers or new authorization rules.
 * Page guards and API guards remain authoritative.
 */
export type MobileSection =
  | 'dashboard' | 'orders' | 'menu' | 'tables' | 'kitchen'
  | 'staff' | 'settings' | 'subscription' | 'account';

export interface MobileNavigationAccess {
  canViewOrders: boolean;
  canViewMenu: boolean;
  canViewTables: boolean;
  canViewKitchen: boolean;
  canViewStaff: boolean;
  canViewRestaurantSettings: boolean;
  canViewSubscription: boolean;
  packageHides?: { orders: boolean; tables: boolean };
}

export interface MobileNavigationItem {
  key: MobileSection;
  label: MessageKey;
  shortLabel: MessageKey;
  href: string;
}

export interface MobileNavigationModel {
  /** Maximum four destinations + the More button makes five bottom tabs. */
  dock: MobileNavigationItem[];
  /** All additional authorized modules; account is always present. */
  more: MobileNavigationItem[];
}

const definitions: Record<MobileSection, { label: MessageKey; shortLabel: MessageKey; path: string }> = {
  dashboard: { label: 'nav.dashboard', shortLabel: 'mobileNav.home', path: '' },
  orders: { label: 'nav.orders', shortLabel: 'mobileNav.orders', path: '/orders' },
  menu: { label: 'menuHub.title', shortLabel: 'mobileNav.menu', path: '/menu/overview' },
  tables: { label: 'nav.tables', shortLabel: 'mobileNav.tables', path: '/tables' },
  kitchen: { label: 'nav.kitchen', shortLabel: 'mobileNav.kitchen', path: '/kitchen' },
  staff: { label: 'nav.staff', shortLabel: 'mobileNav.staff', path: '/staff' },
  settings: { label: 'nav.settings', shortLabel: 'mobileNav.settings', path: '/settings/profile' },
  subscription: { label: 'nav.subscription', shortLabel: 'mobileNav.subscription', path: '/subscription' },
  account: { label: 'account.link', shortLabel: 'account.link', path: '/account' },
};

const defaultOrder: readonly MobileSection[] = [
  'dashboard', 'orders', 'menu', 'tables', 'kitchen', 'staff', 'settings', 'subscription',
];

/**
 * If a person is kitchen-focused (no access to orders or menu), promote the
 * kitchen instead of wasting a prime tab on a management module they cannot use.
 * Otherwise order by everyday restaurant tasks, never by subscription price.
 */
function priorityFor(access: MobileNavigationAccess): readonly MobileSection[] {
  if (access.canViewKitchen && (!access.canViewOrders || !access.canViewMenu)) {
    return ['dashboard', 'kitchen', 'orders', 'menu', 'tables', 'staff', 'settings', 'subscription'];
  }
  return defaultOrder;
}

export function buildMobileNavigation(
  restaurantId: string,
  access: MobileNavigationAccess,
): MobileNavigationModel {
  const allowed: Record<MobileSection, boolean> = {
    dashboard: true,
    orders: access.canViewOrders && !access.packageHides?.orders,
    menu: access.canViewMenu,
    tables: access.canViewTables && !access.packageHides?.tables,
    kitchen: access.canViewKitchen,
    staff: access.canViewStaff,
    settings: access.canViewRestaurantSettings,
    subscription: access.canViewSubscription,
    account: true,
  };
  const base = '/staff/restaurants/' + encodeURIComponent(restaurantId);
  const toItem = (key: MobileSection): MobileNavigationItem => ({
    key,
    label: definitions[key].label,
    shortLabel: definitions[key].shortLabel,
    href: base + definitions[key].path,
  });
  const destinations = priorityFor(access).filter(key => allowed[key]);
  const dock = destinations.slice(0, 4).map(toItem);
  const more = [...destinations.slice(4), 'account' as const].map(toItem);
  return { dock, more };
}

/** Exact dashboard path; nested routes count as the same section. */
export function isMobileNavActive(pathname: string, item: MobileNavigationItem): boolean {
  if (item.key === 'dashboard' || item.key === 'account' || item.key === 'subscription') {
    return pathname === item.href;
  }
  const base = item.href.slice(0, item.href.lastIndexOf('/'));
  const menuSettings = ['design', 'announcements', 'suggestions', 'guest-qr'].some((part) => {
    const url = `${base}/settings/${part}`;
    return pathname === url || pathname.startsWith(url + '/');
  });
  if (item.key === 'settings') {
    const root = item.href.slice(0, -('/profile'.length));
    return !menuSettings && (pathname === root || pathname.startsWith(root + '/'));
  }
  if (item.key === 'menu') {
    const root = item.href.slice(0, -('/overview'.length));
    return menuSettings || pathname === root || pathname.startsWith(root + '/');
  }
  return pathname === item.href || pathname.startsWith(item.href + '/');
}
