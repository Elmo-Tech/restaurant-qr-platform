import type { MessageKey } from '../i18n/messages';
import type { MobileNavigationAccess } from './mobile-navigation.ts';
import type { StaffNavSection } from './staff-sections.ts';

/**
 * Desktop Sidebar grouping (Wayta Phase 0.2). Presentation ONLY: the access
 * flags are the same membership-derived capabilities StaffShell already
 * passes to the Sidebar and Mobile navigation. Page and API guards remain
 * authoritative. Items the user cannot open are omitted (approved decision
 * D2: no disabled "No access" rows); groups with no items are omitted too.
 * My Account is not listed here: it stays in the Sidebar footer.
 */
export type DesktopNavigationAccess = MobileNavigationAccess;

export type DesktopNavSection = Exclude<StaffNavSection, 'account'>;

export type DesktopNavGroupKey = 'daily' | 'management' | 'account';

export interface DesktopNavigationItem {
  key: DesktopNavSection;
  label: MessageKey;
  href: string;
}

export interface DesktopNavigationGroup {
  key: DesktopNavGroupKey;
  heading: MessageKey;
  items: DesktopNavigationItem[];
}

const definitions: Record<DesktopNavSection, { label: MessageKey; path: string }> = {
  dashboard: { label: 'nav.dashboard', path: '' },
  orders: { label: 'nav.orders', path: '/orders' },
  tables: { label: 'nav.tables', path: '/tables' },
  kitchen: { label: 'nav.kitchen', path: '/kitchen' },
  menu: { label: 'menuHub.title', path: '/menu/overview' },
  staff: { label: 'nav.staff', path: '/staff' },
  settings: { label: 'nav.settings', path: '/settings/overview' },
  subscription: { label: 'nav.subscription', path: '/subscription' },
};

const groups: readonly { key: DesktopNavGroupKey; heading: MessageKey; sections: readonly DesktopNavSection[] }[] = [
  { key: 'daily', heading: 'nav.group.daily', sections: ['dashboard', 'orders', 'tables', 'kitchen'] },
  { key: 'management', heading: 'nav.group.management', sections: ['menu', 'staff', 'settings'] },
  { key: 'account', heading: 'nav.group.account', sections: ['subscription'] },
];

export function buildDesktopNavigation(
  restaurantId: string,
  access: DesktopNavigationAccess,
): DesktopNavigationGroup[] {
  const allowed: Record<DesktopNavSection, boolean> = {
    dashboard: true,
    orders: access.canViewOrders && !access.packageHides?.orders,
    tables: access.canViewTables && !access.packageHides?.tables,
    kitchen: access.canViewKitchen,
    menu: access.canViewMenu || access.canViewRestaurantSettings,
    staff: access.canViewStaff,
    settings: access.canViewRestaurantSettings,
    subscription: access.canViewSubscription,
  };
  const base = `/staff/restaurants/${restaurantId}`;
  return groups
    .map(group => ({
      key: group.key,
      heading: group.heading,
      items: group.sections
        .filter(section => allowed[section])
        .map(section => ({
          key: section,
          label: definitions[section].label,
          href: `${base}${definitions[section].path}`,
        })),
    }))
    .filter(group => group.items.length > 0);
}
