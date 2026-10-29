'use client';

import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { MenuHubBackLink } from '../../../../../../components/staff/MenuHubBackLink';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import type { FeatureMap } from '../../../../../../lib/auth/types';
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
  features,
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
  features: FeatureMap;
  qrStyle: QrStyle;
  logoAssetPath: string | null;
  webOrigin: string;
}) {
  const { t } = useStaffI18n();
  return (
    <div className="flex flex-col gap-6">
      <MenuHubBackLink restaurantId={restaurantId} parent="hub" />
      <PageHeader title={t('menuHub.share')} description={t('menuHub.share.description')} />

      <RestaurantQrPanel
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        logoAssetPath={logoAssetPath}
        canManageQr={canManage}
        canStyle={canManageOrderTypes}
        initialStyle={qrStyle}
        webOrigin={webOrigin}
      />

      {/* The channel switches stay here until the separately scoped Settings
          redesign. Present them clearly without altering routing behavior. */}
      <div className="rounded-xl border border-[#efd9b7] bg-[#fff8ed] px-4 py-3 text-xs leading-6 text-[#80511d] sm:text-sm">
        {t('menuHub.orderingLegacyNote')}
      </div>
      <OrderingOptionsCard
        restaurantId={restaurantId}
        initialPickupEnabled={pickupEnabled}
        initialDeliveryEnabled={deliveryEnabled}
        initialTableOrderingEnabled={tableOrderingEnabled}
        initialWhatsappOrderingEnabled={whatsappOrderingEnabled}
        hasWhatsappNumber={hasWhatsappNumber}
        features={features}
        canManage={canManageOrderTypes}
      />

    </div>
  );
}
