import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../lib/i18n/server';
import { canViewRestaurantSettings } from '../../../../../lib/settings/capabilities';
import { canViewBranches } from '../../../../../lib/branches/capabilities';
import { canViewMenu } from '../../../../../lib/menu/capabilities';
import { Alert } from '../../../../../components/ui/Alert';
import { SetupPreviewWorkspace } from './SetupPreviewWorkspace';

/**
 * Explicit, guarded visual preview for product approval.
 * No restaurant data is read beyond the membership/permission context.
 * No actual checklist status, storage, completion, or mutation is exposed.
 */
export default async function RestaurantSetupPreviewPage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const [session, { t }] = await Promise.all([getAuthSessionState(), getStaffI18n()]);
  if (session.status === 'unauthenticated') redirect('/login');
  if (session.status === 'error') return <Alert variant="error">{session.message}</Alert>;
  const member = session.context.memberships.find(item => item.restaurant.id === restaurantId);
  if (!member) return <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>;
  if (member.restaurant.status !== 'ACTIVE') {
    return <Alert variant="error">{t('guard.notOperational', {
      state: t(member.restaurant.status === 'SUSPENDED' ? 'guard.state.suspended' : 'guard.state.inactive'),
    })}</Alert>;
  }
  if (!['OWNER', 'MANAGER'].includes(member.role) || !canViewRestaurantSettings(member)) {
    return <Alert variant="error">{t('guard.noPermission.settings')}</Alert>;
  }

  return (
    <SetupPreviewWorkspace
      restaurantId={restaurantId}
      access={{
        canViewMenu: canViewMenu(member),
        canViewBranches: canViewBranches(member),
        canViewSettings: canViewRestaurantSettings(member),
      }}
    />
  );
}
