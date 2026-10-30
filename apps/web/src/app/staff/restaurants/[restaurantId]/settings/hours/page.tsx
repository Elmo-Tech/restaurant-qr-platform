import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { canManageBranches, canViewBranches } from '../../../../../../lib/branches/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { HoursWorkspace } from './HoursWorkspace';

interface HoursSettingsPageProps {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ branchId?: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/settings/hours` (DEC-042). Same session /
 * Membership / operational checks as the other Settings pages; viewing needs
 * `branches.view`, saving `branches.manage` (UX hints only: the Backend guards decide).
 */
export default async function HoursSettingsPage({ params, searchParams }: HoursSettingsPageProps) {
  const [{ restaurantId }, { branchId }] = await Promise.all([params, searchParams]);
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
  if (!canViewBranches(membership)) {
    return <Alert variant="error">{t('branches.guard.noPermission')}</Alert>;
  }

  return <HoursWorkspace restaurantId={restaurantId} canManage={canManageBranches(membership)}
    initialBranchId={branchId} />;
}
