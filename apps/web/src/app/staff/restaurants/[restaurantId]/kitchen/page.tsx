import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../lib/i18n/server';
import { canViewKitchen } from '../../../../../lib/kitchen/capabilities';
import { receivesDashboardOrders, usesKitchen } from '../../../../../lib/entitlements/access';
import { Alert } from '../../../../../components/ui/Alert';
import { KitchenBoard } from './KitchenBoard';

interface KitchenPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * Kitchen View V1: `/staff/restaurants/[restaurantId]/kitchen`. Mirrors
 * `OrdersPage`'s session / Membership / operational-status checks; the board
 * receives the Branches and permissions already returned by `/auth/me`.
 * Capability gating here is UX only -- `GET .../kitchen/orders` and the status
 * route remain the authorization authority.
 */
export default async function KitchenPage({ params }: KitchenPageProps) {
  const { restaurantId } = await params;
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
  if (!usesKitchen(membership)) {
    return <Alert variant="info">{t(receivesDashboardOrders(membership) ? 'features.page.kitchen' : 'features.page.orders')}</Alert>;
  }
  if (!canViewKitchen(membership)) {
    return <Alert variant="error">{t('guard.noPermission.kitchen')}</Alert>;
  }

  return (
    <KitchenBoard
      restaurantId={restaurantId}
      branches={membership.branches}
      permissions={membership.permissions}
    />
  );
}
