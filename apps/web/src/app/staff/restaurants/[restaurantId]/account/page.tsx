import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../lib/i18n/server';
import { Alert } from '../../../../../components/ui/Alert';
import { AccountWorkspace } from './AccountWorkspace';

interface AccountPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/account` (FT-12). Account is a
 * User-level page (change password) -- it needs no Restaurant Permission, only
 * a signed-in session. It lives under a Restaurant route solely so it keeps
 * the workspace shell; it is reached from the top bar, never the sidebar.
 */
export default async function AccountPage({ params }: AccountPageProps) {
  const { restaurantId } = await params;
  const { t } = await getStaffI18n();
  const sessionState = await getAuthSessionState();

  if (sessionState.status === 'unauthenticated') {
    redirect('/login');
  }

  if (sessionState.status === 'error') {
    return <Alert variant="error">{sessionState.message}</Alert>;
  }

  const hasMembership = sessionState.context.memberships.some(
    (candidate) => candidate.restaurant.id === restaurantId,
  );

  if (!hasMembership) {
    return <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>;
  }

  return <AccountWorkspace email={sessionState.context.user.email} />;
}
