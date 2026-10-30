'use client';

import Link from 'next/link';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { MenuHubBackLink } from '../../../../../../components/staff/MenuHubBackLink';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import type { QrStyle } from '../../../../../../lib/qr/style';
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

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl leading-6 text-muted-foreground">{t('settingsHub.qrLinkHint')}</p>
        <Link href={`/staff/restaurants/${encodeURIComponent(restaurantId)}/settings/ordering`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 font-semibold text-primary hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary">
          {t('settingsHub.qrLink')}
        </Link>
      </div>

    </div>
  );
}
