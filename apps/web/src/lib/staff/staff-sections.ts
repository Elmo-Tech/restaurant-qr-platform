/**
 * Single source of truth for which Staff navigation section owns a pathname.
 * Shared by the desktop shell (sidebar + breadcrumbs) and mobile navigation
 * so the two can never disagree. Presentation only: page and API guards
 * remain the authorization authority.
 */
export type StaffNavSection =
  | 'dashboard' | 'menu' | 'tables' | 'orders' | 'kitchen'
  | 'staff' | 'settings' | 'subscription' | 'account';

/**
 * These existing URLs live under `/settings` for compatibility, but belong to
 * the Electronic Menu workspace, so they are highlighted as Menu.
 */
export const MENU_OWNED_SETTINGS_SLUGS = ['design', 'announcements', 'suggestions', 'guest-qr'] as const;

function isAtOrUnder(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/** `basePath` is the restaurant workspace root, e.g. `/staff/restaurants/<id>`. */
export function isMenuOwnedSettingsPath(pathname: string, basePath: string): boolean {
  return MENU_OWNED_SETTINGS_SLUGS.some(slug => isAtOrUnder(pathname, `${basePath}/settings/${slug}`));
}

/**
 * Dashboard, Account and Subscription match exactly; every other section also
 * owns its nested routes. Returns null for routes without a nav section
 * (e.g. setup, setup-preview) and for paths outside `basePath`.
 */
export function resolveStaffSection(pathname: string, basePath: string): StaffNavSection | null {
  if (isMenuOwnedSettingsPath(pathname, basePath)) return 'menu';
  if (isAtOrUnder(pathname, `${basePath}/menu`)) return 'menu';
  if (isAtOrUnder(pathname, `${basePath}/tables`)) return 'tables';
  if (isAtOrUnder(pathname, `${basePath}/orders`)) return 'orders';
  if (isAtOrUnder(pathname, `${basePath}/kitchen`)) return 'kitchen';
  if (isAtOrUnder(pathname, `${basePath}/staff`)) return 'staff';
  if (pathname === `${basePath}/account`) return 'account';
  if (pathname === `${basePath}/subscription`) return 'subscription';
  if (isAtOrUnder(pathname, `${basePath}/settings`)) return 'settings';
  if (pathname === basePath) return 'dashboard';
  return null;
}
