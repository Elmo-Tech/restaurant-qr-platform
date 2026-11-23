import { redirect } from 'next/navigation';
import { Alert } from '../../../../../../components/ui/Alert';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { usesOffers } from '../../../../../../lib/entitlements/access';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { canViewMenu } from '../../../../../../lib/menu/capabilities';
import { canManagePromotions, canViewPromotions, usesPromotions } from '../../../../../../lib/promotions/capabilities';
import { PromotionsWorkspace } from './PromotionsWorkspace';

interface Props {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ zoneId?: string | string[] }>;
}

export default async function PromotionsPage({ params, searchParams }: Props) {
  const [{ restaurantId }, { zoneId }, session, { t }] = await Promise.all([
    params, searchParams, getAuthSessionState(), getStaffI18n(),
  ]);
  if (session.status === 'unauthenticated') redirect('/login');
  if (session.status === 'error') return <Alert variant="error">{session.message}</Alert>;
  const membership = session.context.memberships.find((candidate) => candidate.restaurant.id === restaurantId);
  if (!membership) return <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>;
  if (membership.restaurant.status !== 'ACTIVE') {
    return <Alert variant="error">{t('guard.notOperational', { state: t(membership.restaurant.status === 'SUSPENDED' ? 'guard.state.suspended' : 'guard.state.inactive') })}</Alert>;
  }
  if (!canViewPromotions(membership)) return <Alert variant="error">{t('promotions.noAccess')}</Alert>;
  if (!usesPromotions(membership)) return <Alert variant="info">{t('error.FEATURE_NOT_AVAILABLE')}</Alert>;

  const zone = typeof zoneId === 'string' ? zoneId : undefined;
  const canViewProducts = canViewMenu(membership);
  return (
    <PromotionsWorkspace
      key={JSON.stringify([restaurantId, zone])}
      restaurantId={restaurantId}
      currencyCode={membership.restaurant.currencyCode}
      canManage={canManagePromotions(membership)}
      offersEnabled={canViewProducts && usesOffers(membership)}
      canViewProducts={canViewProducts}
      initialZoneId={zone}
    />
  );
}
