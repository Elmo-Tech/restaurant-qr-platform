import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import {
  canCreateBranch,
  canManageBranches,
  canViewBranches,
} from '../../../../../../lib/branches/capabilities';
import { canViewRestaurantSettings } from '../../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { BranchesWorkspace } from './BranchesWorkspace';

interface BranchesSettingsPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/settings/branches` (FT-12). Same session
 * / Membership / operational-status checks as the sibling Settings pages,
 * then `restaurant.view` (it is a Settings page) and `branches.view` (UX only
 * -- the Backend re-checks each route's own Permission and Branch scope).
 */
export default async function BranchesSettingsPage({ params }: BranchesSettingsPageProps) {
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

  if (!canViewBranches(membership)) {
    return <Alert variant="error">{t('branches.guard.noPermission')}</Alert>;
  }

  return (
    <BranchesWorkspace
      restaurantId={restaurantId}
      canManage={canManageBranches(membership)}
      canCreate={canCreateBranch(membership)}
    />
  );
}
