import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { canManageRoles, canViewStaff } from '../../../../../../lib/staff/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { RolesWorkspace } from './RolesWorkspace';

interface RolesPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/staff/roles` (FT-12B): Roles & Permissions
 * (create / rename / edit / delete). Same session / Membership / operational-status
 * checks as the Users page, then `users.view` (UX only -- the Backend route
 * re-checks it).
 */
export default async function RolesPage({ params }: RolesPageProps) {
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

  if (!canViewStaff(membership)) {
    return <Alert variant="error">{t('staff.guard.noPermission')}</Alert>;
  }

  return (
    <RolesWorkspace
      restaurantId={restaurantId}
      canManage={canManageRoles(membership)}
      editorPermissions={membership.permissions}
    />
  );
}
