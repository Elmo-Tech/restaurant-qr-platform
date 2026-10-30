import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { canViewRestaurantSettings, canManageLanguages } from '../../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { OrderingWorkspace } from './OrderingWorkspace';

/**
 * Independent Ordering Settings page. Does NOT require tables.view just to
 * access WhatsApp/Pickup/Delivery (previously hidden under Restaurant QR).
 * Backend still enforces restaurant.manage + full branch scope and packages.
 */
export default async function RestaurantOrderingSettingsPage({ params }: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const [session, { t }] = await Promise.all([getAuthSessionState(), getStaffI18n()]);
  if (session.status === 'unauthenticated') redirect('/login');
  if (session.status === 'error') return <Alert variant="error">{session.message}</Alert>;
  const member = session.context.memberships.find(m => m.restaurant.id === restaurantId);
  if (!member) return <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>;
  if (member.restaurant.status !== 'ACTIVE') {
    return <Alert variant="error">{t('guard.notOperational', {
      state: t(member.restaurant.status === 'SUSPENDED' ? 'guard.state.suspended' : 'guard.state.inactive'),
    })}</Alert>;
  }
  if (!canViewRestaurantSettings(member)) {
    return <Alert variant="error">{t('guard.noPermission.settings')}</Alert>;
  }

  return (
    <OrderingWorkspace
      restaurantId={restaurantId}
      initialPickupEnabled={member.restaurant.pickupEnabled}
      initialDeliveryEnabled={member.restaurant.deliveryEnabled}
      initialTableOrderingEnabled={member.restaurant.tableOrderingEnabled}
      initialWhatsappOrderingEnabled={member.restaurant.whatsappOrderingEnabled}
      hasWhatsappNumber={Boolean(member.restaurant.contact.whatsapp)}
      features={member.restaurant.features}
      canManage={canManageLanguages(member)}
    />
  );
}
