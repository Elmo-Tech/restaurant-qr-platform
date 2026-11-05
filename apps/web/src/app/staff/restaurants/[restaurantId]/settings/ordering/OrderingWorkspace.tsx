'use client';

import Link from 'next/link';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { FeatureMap } from '../../../../../../lib/auth/types';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { Alert } from '../../../../../../components/ui/Alert';
import { SettingsBackLink } from '../../../../../../components/staff/SettingsBackLink';
import { OrderingOptionsCard } from '../guest-qr/OrderingOptionsCard';
import { WhatsappConnectionCard } from './WhatsappConnectionCard';

/** Only relocation of existing switches; all API writes, states and entitlements remain identical. */
export function OrderingWorkspace({
  restaurantId,
  initialPickupEnabled,
  initialDeliveryEnabled,
  initialTableOrderingEnabled,
  initialWhatsappOrderingEnabled,
  hasWhatsappNumber,
  features,
  canManage,
}: {
  restaurantId: string;
  initialPickupEnabled: boolean;
  initialDeliveryEnabled: boolean;
  initialTableOrderingEnabled: boolean;
  initialWhatsappOrderingEnabled: boolean;
  hasWhatsappNumber: boolean;
  features: FeatureMap;
  canManage: boolean;
}) {
  const { t } = useStaffI18n();
  const base = `/staff/restaurants/${encodeURIComponent(restaurantId)}`;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
      <SettingsBackLink restaurantId={restaurantId}/>
      <PageHeader title={t('settingsHub.ordering')} description={t('settingsHub.orderingSetupDescription')}/>
      {features.WHATSAPP_ORDERING && !hasWhatsappNumber ? (
        <Alert variant="warning">
          {t('settings.ordering.whatsappNeedsNumber')}{' '}
          <Link href={base + '/settings/profile#contact-settings'}
            className="font-semibold underline underline-offset-4">
            {t('settingsHub.whatsappLink')}
          </Link>
        </Alert>
      ) : null}
      {features.WHATSAPP_ORDERING && hasWhatsappNumber ? <WhatsappConnectionCard restaurantId={restaurantId} canManage={canManage} /> : null}
      <OrderingOptionsCard
        restaurantId={restaurantId}
        initialPickupEnabled={initialPickupEnabled}
        initialDeliveryEnabled={initialDeliveryEnabled}
        initialTableOrderingEnabled={initialTableOrderingEnabled}
        initialWhatsappOrderingEnabled={initialWhatsappOrderingEnabled}
        hasWhatsappNumber={hasWhatsappNumber}
        features={features}
        canManage={canManage}
      />
    </div>
  );
}
