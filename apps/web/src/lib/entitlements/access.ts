import type { AuthContextMembership } from '../auth/types';

/**
 * What the PLATFORM's package gives a Restaurant (DEC-043 / DEC-046), as the staff dashboard needs it:
 * pages and controls for something the package does not include are not shown. UX only: the Backend
 * refuses the actions itself (`403 FEATURE_NOT_AVAILABLE`, refused orders). A missing feature map
 * (an older response) means everything is available.
 */
const featureOn = (
  membership: AuthContextMembership,
  key: keyof AuthContextMembership['restaurant']['features'],
): boolean => membership.restaurant.features?.[key] ?? true;

/** Orders reach the dashboard (and the kitchen) only through dashboard ordering or table ordering. */
export function receivesDashboardOrders(membership: AuthContextMembership): boolean {
  return featureOn(membership, 'DASHBOARD_ORDERING') || featureOn(membership, 'TABLE_ORDERING');
}

/** The kitchen screen: a package feature (DEC-054), and it only has tickets when orders reach the dashboard. */
export function usesKitchen(membership: AuthContextMembership): boolean {
  return featureOn(membership, 'KITCHEN') && receivesDashboardOrders(membership);
}

/** Table ordering: the tables board, table sessions and table orders. */
export function usesTableOrdering(membership: AuthContextMembership): boolean {
  return featureOn(membership, 'TABLE_ORDERING');
}

/** Pickup and delivery are offered through the dashboard or through WhatsApp. */
export function offersPickupAndDelivery(membership: AuthContextMembership): boolean {
  return featureOn(membership, 'DASHBOARD_ORDERING') || featureOn(membership, 'WHATSAPP_ORDERING');
}
