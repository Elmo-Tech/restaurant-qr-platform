'use client';

import Link from 'next/link';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { FeatureMap } from '../../../../../../lib/auth/types';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { Alert } from '../../../../../../components/ui/Alert';
import { SettingsBackLink } from '../../../../../../components/staff/SettingsBackLink';
import { OrderingOptionsCard } from '../guest-qr/OrderingOptionsCard';

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
  const { t, locale } = useStaffI18n();
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
      {features.WHATSAPP_ORDERING && canManage ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-sm leading-6 text-muted-foreground">
            {locale.startsWith('ar')
              ? 'ربط واتساب ومتابعة حالة الاتصال بقوا متاحين مباشرة من لوحة التحكم.'
              : 'WhatsApp pairing and connection status are now available directly on the Dashboard.'}
          </p>
          <Link href={base + '#whatsapp-connection'}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {locale.startsWith('ar') ? 'فتح ربط واتساب' : 'Open WhatsApp connection'}
          </Link>
        </div>
      ) : null}
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
