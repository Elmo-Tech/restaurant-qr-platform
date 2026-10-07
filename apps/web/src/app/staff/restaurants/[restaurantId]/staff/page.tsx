import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../lib/i18n/server';
import { canManageStaff, canViewStaff } from '../../../../../lib/staff/capabilities';
import { Alert } from '../../../../../components/ui/Alert';
import { StaffWorkspace } from './StaffWorkspace';

interface StaffAccessPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/staff` (FT-12). Mirrors the sibling
 * pages' session / Membership / operational-status checks, then requires
 * `users.view` (UX only -- every Backend route re-checks its own Permission
 * and the Owner-safety rules independently). The Client workspace gets only
 * safe, server-validated context.
 */
export default async function StaffAccessPage({ params }: StaffAccessPageProps) {
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
    <StaffWorkspace
      restaurantId={restaurantId}
      currentMembershipId={membership.id}
      canManage={canManageStaff(membership)}
      ownAllBranches={membership.allBranches}
      editorPermissions={membership.permissions}
    />
  );
}
