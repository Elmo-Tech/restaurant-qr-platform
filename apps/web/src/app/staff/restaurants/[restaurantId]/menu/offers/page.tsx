import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { usesOffers } from '../../../../../../lib/entitlements/access';
import { canManageMenu, canViewMenu } from '../../../../../../lib/menu/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { OffersWorkspace } from './OffersWorkspace';

interface OffersPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/menu/offers` (DEC-069). Offers are menu content: the same
 * session / Membership / operational-status / `menu.view` checks as the other Menu pages, plus the
 * package feature. UX hints only; the Backend guards (`menu.view` / `menu.manage`, Restaurant-wide
 * Branch scope, the OFFERS feature) decide.
 */
export default async function OffersPage({ params }: OffersPageProps) {
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
  if (!canViewMenu(membership)) {
    return <Alert variant="error">{t('guard.noPermission.menu')}</Alert>;
  }
  if (!usesOffers(membership)) {
    return <Alert variant="info">{t('offers.featureOff')}</Alert>;
  }

  return (
    <OffersWorkspace
      restaurantId={restaurantId}
      defaultLocale={membership.restaurant.defaultLocale}
      currencyCode={membership.restaurant.currencyCode}
      canManage={canManageMenu(membership)}
    />
  );
}
