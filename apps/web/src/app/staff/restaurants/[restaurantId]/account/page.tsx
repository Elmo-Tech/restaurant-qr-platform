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

  const membership = sessionState.context.memberships.find(
    (candidate) => candidate.restaurant.id === restaurantId,
  );

  if (!membership) {
    return <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>;
  }

  // A demo owner's address is a throw-away one (DEC-060): the visitor sees a plain label instead.
  return <AccountWorkspace email={membership.restaurant.demoExpiresAt ? t('demo.visitor') : sessionState.context.user.email} />;
}
