import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { getWebOrigin } from '../../../../../../lib/env/web-origin';
import {
  canManageLanguages,
  canViewRestaurantSettings,
} from '../../../../../../lib/settings/capabilities';
import { canManageGenericQr, canViewTables } from '../../../../../../lib/tables/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { GuestQrWorkspace } from './GuestQrWorkspace';

interface GuestQrSettingsPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/settings/guest-qr`. Same session /
 * Membership / operational-status checks as the sibling Settings pages. The
 * Restaurant QR keeps the permissions it always had: `tables.view` to see it,
 * `tables.manage` with full Restaurant branch scope to change it (UX only; the
 * Backend guards are authoritative).
 */
export default async function GuestQrSettingsPage({ params }: GuestQrSettingsPageProps) {
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

  if (!canViewTables(membership)) {
    return <Alert variant="error">{t('guard.noPermission.tables')}</Alert>;
  }

  return (
    <GuestQrWorkspace
      restaurantId={restaurantId}
      restaurantName={membership.restaurant.name}
      canManage={canManageGenericQr(membership)}
      // Same rule as Languages / Delivery: `restaurant.manage` AND full Branch scope.
      canManageOrderTypes={canManageLanguages(membership)}
      pickupEnabled={membership.restaurant.pickupEnabled}
      deliveryEnabled={membership.restaurant.deliveryEnabled}
      tableOrderingEnabled={membership.restaurant.tableOrderingEnabled}
      qrStyle={membership.restaurant.qrStyle}
      logoAssetPath={membership.restaurant.logoAssetPath}
      webOrigin={getWebOrigin()}
    />
  );
}
