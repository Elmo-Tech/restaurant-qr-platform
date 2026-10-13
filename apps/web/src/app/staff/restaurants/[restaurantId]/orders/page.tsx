import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../lib/i18n/server';
import { canViewOrders } from '../../../../../lib/orders/capabilities';
import { Alert } from '../../../../../components/ui/Alert';
import { OrdersWorkspace, type OrdersInitialFilters } from './OrdersWorkspace';
import { ACTIVE_STATUSES, COMPLETED_STATUSES } from '../../../../../lib/orders/order-views';
import type { OrderStatus } from '../../../../../lib/orders/types';
import { resolveAssetUrl } from '../../../../../lib/media/asset-url';

interface OrdersPageProps {
  params: Promise<{ restaurantId: string }>;
  /** `?order=` opens that Order's detail (Dashboard deep link). */
  searchParams: Promise<{
    order?: string | string[];
    status?: string | string[];
    sort?: string | string[];
  }>;
}

const single = (value: string | string[] | undefined): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/**
 * Deep-link filters (`?status=PENDING&sort=oldest`):
 * every value is checked against its allow-list here, so a hand-edited URL
 * can only ever fall back to the default view, never put the workspace in an
 * impossible state.
 */
function parseInitialFilters(raw: Awaited<OrdersPageProps['searchParams']>): OrdersInitialFilters {
  const filters: OrdersInitialFilters = {};
  const status = single(raw.status);
  if (status !== null) {
    if ((ACTIVE_STATUSES as readonly string[]).includes(status)) {
      filters.status = status as OrderStatus;
      filters.view = 'active';
    } else if ((COMPLETED_STATUSES as readonly string[]).includes(status)) {
      filters.status = status as OrderStatus;
      filters.view = 'completed';
    }
  }
  const sort = single(raw.sort);
  if (sort === 'newest' || sort === 'oldest') filters.sort = sort;
  return filters;
}

/**
 * FT-5: `/staff/restaurants/[restaurantId]/orders`. Mirrors
 * `TablesPage`/`MenuManagementPage`'s exact session/Membership/operational-
 * status/capability checks. `membership.branches` and `permissions` (both
 * already returned by `/auth/me`) are passed straight through -- there is
 * no separate Branch List fetch, and the per-transition action buttons
 * `OrdersWorkspace` shows are derived from `permissions` client-side purely
 * for UX (Section 25/26), never as the actual authorization boundary.
 */
export default async function OrdersPage({ params, searchParams }: OrdersPageProps) {
  const { restaurantId } = await params;
  const rawSearch = await searchParams;
  const initialOrderId = single(rawSearch.order);
  const initialFilters = parseInitialFilters(rawSearch);
  const { t } = await getStaffI18n();
  const sessionState = await getAuthSessionState();

  if (sessionState.status === 'unauthenticated') {
    redirect('/login');
  }

  if (sessionState.status === 'error') {
    return <Alert variant="error">{sessionState.message}</Alert>;
  }

  const membership = sessionState.context.memberships.find(
    (candidate) => candidate.restaurant.id === restaurantId,
  );

  if (!membership) {
    return <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>;
  }

  if (membership.restaurant.status !== 'ACTIVE') {
    return (
      <Alert variant="error">
        {t('guard.notOperational', {
          state: t(
            membership.restaurant.status === 'SUSPENDED' ? 'guard.state.suspended' : 'guard.state.inactive',
          ),
        })}
      </Alert>
    );
  }

  if (!canViewOrders(membership)) {
    return (
      <Alert variant="error">{t('guard.noPermission.orders')}</Alert>
    );
  }

  return (
    <OrdersWorkspace
      restaurantId={restaurantId}
      branches={membership.branches}
      permissions={membership.permissions}
      restaurantLogoUrl={resolveAssetUrl(membership.restaurant.logoAssetPath)}
      initialOrderId={initialOrderId}
      initialFilters={initialFilters}
    />
  );
}
