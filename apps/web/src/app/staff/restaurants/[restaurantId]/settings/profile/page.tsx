import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import {
  canViewRestaurantSettings,
  hasRestaurantManagePermission,
} from '../../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { ProfileWorkspace } from './ProfileWorkspace';

interface ProfileSettingsPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/settings/profile` (FT-12). Same session /
 * Membership / operational-status checks as the sibling Settings pages, then
 * `restaurant.view` (UX only). The current name and logo come straight from
 * the authenticated `/auth/me` context, so a refresh after saving always
 * shows the persisted values.
 */
export default async function ProfileSettingsPage({ params }: ProfileSettingsPageProps) {
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

  if (!canViewRestaurantSettings(membership)) {
    return <Alert variant="error">{t('guard.noPermission.settings')}</Alert>;
  }

  return (
    <ProfileWorkspace
      restaurantId={restaurantId}
      initialName={membership.restaurant.name}
      initialLogoAssetPath={membership.restaurant.logoAssetPath}
      currencyCode={membership.restaurant.currencyCode}
      canManage={hasRestaurantManagePermission(membership) && membership.allBranches === true}
      hasRestaurantManagePermission={hasRestaurantManagePermission(membership)}
    />
  );
}
