import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../lib/i18n/server';
import { hasRestaurantManagePermission } from '../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../components/ui/Alert';
import { SubscriptionWorkspace } from './SubscriptionWorkspace';

interface SubscriptionPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/subscription` (DEC-050): the plan, what it includes, and the upgrade
 * and renewal requests. It shows what the Restaurant pays, so it needs `restaurant.manage`; a request also
 * needs Restaurant-wide Branch scope (UX hints only: the Backend guards decide).
 */
export default async function SubscriptionPage({ params }: SubscriptionPageProps) {
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
  if (!hasRestaurantManagePermission(membership)) {
    return <Alert variant="error">{t('guard.noPermission.subscription')}</Alert>;
  }

  return (
    <SubscriptionWorkspace
      restaurantId={restaurantId}
      canRequest={membership.allBranches === true}
    />
  );
}
