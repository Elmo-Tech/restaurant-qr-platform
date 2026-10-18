'use client';

import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { SettingsTabs } from '../SettingsTabs';
import type { QrStyle } from '../../../../../../lib/qr/style';
import { OrderingOptionsCard } from './OrderingOptionsCard';
import { RestaurantQrPanel } from './RestaurantQrPanel';

/**
 * The Restaurant-wide QR (Pickup, Delivery and the general guest menu) lives
 * here, with the other Restaurant Settings, so the Tables page can stay about
 * in-restaurant table operations only. The card itself is unchanged: create,
 * view / download / print, open the guest menu, deactivate / reactivate.
 */
export function GuestQrWorkspace({
  restaurantId,
  restaurantName,
  canManage,
  canManageOrderTypes,
  pickupEnabled,
  deliveryEnabled,
  tableOrderingEnabled,
  whatsappOrderingEnabled,
  hasWhatsappNumber,
  qrStyle,
  logoAssetPath,
  webOrigin,
}: {
  restaurantId: string;
  restaurantName: string;
  /** `tables.manage` AND full Restaurant branch scope (the QR is not Branch-scoped). */
  canManage: boolean;
  /** `restaurant.manage` AND full Restaurant branch scope (order types are Restaurant-wide). */
  canManageOrderTypes: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  tableOrderingEnabled: boolean;
  whatsappOrderingEnabled: boolean;
  hasWhatsappNumber: boolean;
  qrStyle: QrStyle;
  logoAssetPath: string | null;
  webOrigin: string;
}) {
  const { t } = useStaffI18n();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />

      <SettingsTabs restaurantId={restaurantId} active="guest-qr" />

      <OrderingOptionsCard
        restaurantId={restaurantId}
        initialPickupEnabled={pickupEnabled}
        initialDeliveryEnabled={deliveryEnabled}
        initialTableOrderingEnabled={tableOrderingEnabled}
        initialWhatsappOrderingEnabled={whatsappOrderingEnabled}
        hasWhatsappNumber={hasWhatsappNumber}
        canManage={canManageOrderTypes}
      />

      <RestaurantQrPanel
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        logoAssetPath={logoAssetPath}
        canManageQr={canManage}
        canStyle={canManageOrderTypes}
        initialStyle={qrStyle}
        webOrigin={webOrigin}
      />
    </div>
  );
}
