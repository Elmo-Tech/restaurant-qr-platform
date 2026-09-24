import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import {
  canManageLanguages,
  canViewRestaurantSettings,
  hasRestaurantManagePermission,
} from '../../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { DeliveryWorkspace } from './DeliveryWorkspace';

interface DeliverySettingsPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/settings/delivery` (FT-8). Mirrors the
 * Languages settings page's exact session/Membership/operational-status
 * checks and reuses the same Restaurant Settings capability rules
 * (`restaurant.view` to see it; `restaurant.manage` + Restaurant-wide Branch
 * scope to change it -- UX hints only, the Backend guards are authoritative).
 */
export default async function DeliverySettingsPage({ params }: DeliverySettingsPageProps) {
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
        This Restaurant is currently{' '}
        {membership.restaurant.status === 'SUSPENDED' ? 'suspended' : 'inactive'} and not
        operational. Contact your Restaurant owner for details.
      </Alert>
    );
  }

  if (!canViewRestaurantSettings(membership)) {
    return (
      <Alert variant="error">{t('guard.noPermission.settings')}</Alert>
    );
  }

  return (
    <DeliveryWorkspace
      restaurantId={restaurantId}
      currencyCode={membership.restaurant.currencyCode}
      // Same rule as Languages: `restaurant.manage` AND full Branch scope.
      canManage={canManageLanguages(membership)}
      hasRestaurantManagePermission={hasRestaurantManagePermission(membership)}
    />
  );
}
