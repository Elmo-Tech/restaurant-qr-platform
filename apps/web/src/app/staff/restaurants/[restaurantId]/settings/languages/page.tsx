import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import {
  canManageLanguages,
  canViewRestaurantSettings,
  hasRestaurantManagePermission,
} from '../../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { LanguagesWorkspace } from './LanguagesWorkspace';

interface LanguagesSettingsPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/settings/languages` (LOC-3, Section 3).
 * Mirrors `MenuManagementPage`'s exact session/Membership/operational-status
 * checks, then additionally requires `restaurant.view` (UX only -- the real
 * `GET .../locales` request still goes through its own
 * `PermissionGuard`-protected Backend route independently, Section 5). Safe,
 * server-validated context is passed into the Client Component workspace;
 * the workspace itself never re-derives authorization, only capability UX
 * hints.
 */
export default async function LanguagesSettingsPage({
  params,
}: LanguagesSettingsPageProps) {
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
    return (
      <Alert variant="error">{t('guard.noPermission.settings')}</Alert>
    );
  }

  return (
    <LanguagesWorkspace
      restaurantId={restaurantId}
      canManage={canManageLanguages(membership)}
      hasRestaurantManagePermission={hasRestaurantManagePermission(membership)}
    />
  );
}
