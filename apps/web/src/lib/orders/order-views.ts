import type { OrderListItem, OrderStatus } from './types';

/** FT-7B: the top-level Orders workspace tabs. Pure client-side grouping of the already-loaded Orders -- no backend concept. */
export type OrdersView = 'active' | 'completed' | 'all';

export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];
export const COMPLETED_STATUSES: readonly OrderStatus[] = ['SERVED', 'REJECTED', 'CANCELLED'];
export const ALL_STATUSES: readonly OrderStatus[] = [...ACTIVE_STATUSES, ...COMPLETED_STATUSES];

export const ORDERS_VIEW_LABELS: Record<OrdersView, string> = {
  active: 'Active',
  completed: 'Completed',
  all: 'All',
};

export function statusesForView(view: OrdersView): readonly OrderStatus[] {
  if (view === 'active') return ACTIVE_STATUSES;
  if (view === 'completed') return COMPLETED_STATUSES;
  return ALL_STATUSES;
}

export function isCompletedStatus(status: OrderStatus): boolean {
  return COMPLETED_STATUSES.includes(status);
}

export interface OrdersFilters {
  view: OrdersView;
  /** `null` = all types. Typed as the list item's own type so a future DELIVERY value needs no change here. */
  type: OrderListItem['type'] | null;
  /** `null` = every status of the current view. */
  status: OrderStatus | null;
  search: string;
}

/** Case-insensitive match on Table number, customer name/phone, and (from 4 characters) the Order id. Phone also matches ignoring spaces/dashes. */
function matchesSearch(order: OrderListItem, rawSearch: string): boolean {
  const term = rawSearch.trim().toLowerCase();
  if (term === '') return true;

  const digitsOnly = (value: string) => value.replace(/[^\d+]/g, '');
  const termDigits = digitsOnly(term);

  if (order.table?.tableNumber.toLowerCase().includes(term)) return true;
  if (order.customer?.name.toLowerCase().includes(term)) return true;
  if (order.customer) {
    const phone = order.customer.phone.toLowerCase();
    if (phone.includes(term)) return true;
    if (termDigits.length >= 3 && digitsOnly(phone).includes(termDigits)) return true;
  }
  if (term.length >= 4 && order.id.toLowerCase().includes(term)) return true;
  return false;
}

export function filterOrders(orders: OrderListItem[], filters: OrdersFilters): OrderListItem[] {
  const viewStatuses = statusesForView(filters.view);
  return orders
    .filter((order) => viewStatuses.includes(order.status))
    .filter((order) => filters.status === null || order.status === filters.status)
    .filter((order) => filters.type === null || order.type === filters.type)
    .filter((order) => matchesSearch(order, filters.search))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function countByView(orders: OrderListItem[]): Record<OrdersView, number> {
  let active = 0;
  let completed = 0;
  for (const order of orders) {
    if (ACTIVE_STATUSES.includes(order.status)) active += 1;
    else completed += 1;
  }
  return { active, completed, all: orders.length };
}

/** Compact, staff-friendly time: "Just now", "12 min ago" within the hour; otherwise the clock time (with the date when not today). */
export function formatOrderTime(isoDate: string, now: Date = new Date()): string {
  const created = new Date(isoDate);
  const diffMinutes = Math.floor((now.getTime() - created.getTime()) / 60_000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const time = created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sameDay = created.toDateString() === now.toDateString();
  return sameDay
    ? time
    : `${created.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
