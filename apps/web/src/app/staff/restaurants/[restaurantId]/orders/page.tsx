import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../lib/auth/session';
import { canViewOrders } from '../../../../../lib/orders/capabilities';
import { Alert } from '../../../../../components/ui/Alert';
import { OrdersWorkspace } from './OrdersWorkspace';

interface OrdersPageProps {
  params: Promise<{ restaurantId: string }>;
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
export default async function OrdersPage({ params }: OrdersPageProps) {
  const { restaurantId } = await params;
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
    return <Alert variant="error">Restaurant not found.</Alert>;
  }

  if (membership.restaurant.status !== 'ACTIVE') {
    return (
      <Alert variant="error">
        This Restaurant is currently{' '}
        {membership.restaurant.status === 'SUSPENDED' ? 'suspended' : 'inactive'}{' '}
        and not operational. Contact your Restaurant owner for details.
      </Alert>
    );
  }

  if (!canViewOrders(membership)) {
    return (
      <Alert variant="error">
        You do not have permission to view this Restaurant&apos;s Orders.
      </Alert>
    );
  }

  return (
    <OrdersWorkspace
      restaurantId={restaurantId}
      branches={membership.branches}
      permissions={membership.permissions}
    />
  );
}
