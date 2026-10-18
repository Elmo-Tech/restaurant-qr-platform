'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as settingsApi from '../../../../../../lib/settings/api';
import { listDeliveryBranches } from '../../../../../../lib/delivery/api';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Card } from '../../../../../../components/ui/Card';
import { Switch } from '../../../../../../components/ui/Switch';
import { IconBag, IconChat, IconTable, IconTruck } from '../../../../../../components/staff/icons';

type OrderType = 'pickup' | 'delivery' | 'table' | 'whatsapp';

/**
 * Restaurant ordering options (DEC-038): where guests may order. Two channels,
 * each with its own switches: Tables (the table QR codes) and Online (Pickup and
 * Delivery from the Restaurant QR). A channel that is off is a view-only menu.
 * Each switch saves immediately (the Backend returns the stored values, which
 * are what this card then shows). There is no confirmation dialog: the switch
 * is undone with one tap and the summary line states the result straight away.
 */
export function OrderingOptionsCard({
  restaurantId,
  initialPickupEnabled,
  initialDeliveryEnabled,
  initialTableOrderingEnabled,
  initialWhatsappOrderingEnabled,
  hasWhatsappNumber,
  canManage,
}: {
  restaurantId: string;
  initialPickupEnabled: boolean;
  initialDeliveryEnabled: boolean;
  initialTableOrderingEnabled: boolean;
  initialWhatsappOrderingEnabled: boolean;
  /** The Restaurant has a WhatsApp number (WhatsApp orders cannot be switched on without one). */
  hasWhatsappNumber: boolean;
  /** `restaurant.manage` with Restaurant-wide Branch scope (UX only; the Backend enforces). */
  canManage: boolean;
}) {
  const { t } = useStaffI18n();
  const [pickupEnabled, setPickupEnabled] = useState(initialPickupEnabled);
  const [deliveryEnabled, setDeliveryEnabled] = useState(initialDeliveryEnabled);
  const [tableOrderingEnabled, setTableOrderingEnabled] = useState(initialTableOrderingEnabled);
  const [whatsappOrderingEnabled, setWhatsappOrderingEnabled] = useState(initialWhatsappOrderingEnabled);
  const [busy, setBusy] = useState<OrderType | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The Guest menu offers delivery only where an ACTIVE zone exists (the zone carries the fee), so a
  // switch that is on without any zone is explained here. `null` = not known (never a false warning).
  const [hasDeliveryZone, setHasDeliveryZone] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDeliveryBranches(restaurantId)
      .then((branches) => {
        if (cancelled) return;
        setHasDeliveryZone(
          branches.some(
            (branch) => branch.status === 'ACTIVE' && branch.zones.some((zone) => zone.status === 'ACTIVE'),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setHasDeliveryZone(null);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const deliveryWithoutZone = deliveryEnabled && hasDeliveryZone === false;

  async function change(type: OrderType, next: boolean) {
    if (busy) return;
    setBusy(type);
    setError(null);
    try {
      const saved = await settingsApi.updateOrderingOptions(
        restaurantId,
        type === 'pickup'
          ? { pickupEnabled: next }
          : type === 'delivery'
            ? { deliveryEnabled: next }
            : type === 'whatsapp'
              ? { whatsappOrderingEnabled: next }
              : { tableOrderingEnabled: next },
      );
      setPickupEnabled(saved.pickupEnabled);
      setDeliveryEnabled(saved.deliveryEnabled);
      setTableOrderingEnabled(saved.tableOrderingEnabled);
      setWhatsappOrderingEnabled(saved.whatsappOrderingEnabled);
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  const summaryKey =
    pickupEnabled && deliveryEnabled
      ? 'settings.ordering.summary.both'
      : pickupEnabled
        ? 'settings.ordering.summary.pickupOnly'
        : deliveryEnabled
          ? 'settings.ordering.summary.deliveryOnly'
          : 'settings.ordering.summary.none';

  type Row = {
    type: OrderType;
    enabled: boolean;
    title: string;
    hint: string;
    icon: ReactNode;
  };

  const tableRows: Row[] = [
    {
      type: 'table',
      enabled: tableOrderingEnabled,
      title: t('settings.ordering.table'),
      hint: t('settings.ordering.tableHint'),
      icon: <IconTable className="h-5 w-5" />,
    },
  ];

  const whatsappRows: Row[] = [
    {
      type: 'whatsapp',
      enabled: whatsappOrderingEnabled,
      title: t('settings.ordering.whatsapp'),
      hint: t('settings.ordering.whatsappHint'),
      icon: <IconChat className="h-5 w-5" />,
    },
  ];

  const rows: Row[] = [
    {
      type: 'pickup',
      enabled: pickupEnabled,
      title: t('settings.ordering.pickup'),
      hint: t('settings.ordering.pickupHint'),
      icon: <IconBag className="h-5 w-5" />,
    },
    {
      type: 'delivery',
      enabled: deliveryEnabled,
      title: t('settings.ordering.delivery'),
      hint: t('settings.ordering.deliveryHint'),
      icon: <IconTruck className="h-5 w-5" />,
    },
  ];

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t('settings.ordering.title')}</h2>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {t('settings.ordering.description')}
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <section className="flex flex-col gap-2" aria-label={t('settings.ordering.group.table')}>
        <h3 className="text-sm font-semibold text-foreground">{t('settings.ordering.group.table')}</h3>
        <OrderingRows rows={tableRows} canManage={canManage} busy={busy} onChange={change} />
        <Alert variant="info">
          {t(
            tableOrderingEnabled
              ? 'settings.ordering.summary.tableOn'
              : 'settings.ordering.summary.tableOff',
          )}
        </Alert>
      </section>

      <section className="flex flex-col gap-2" aria-label={t('settings.ordering.group.online')}>
        <h3 className="text-sm font-semibold text-foreground">{t('settings.ordering.group.online')}</h3>
        <OrderingRows rows={rows} canManage={canManage} busy={busy} onChange={change} />
        <Alert variant={pickupEnabled || deliveryEnabled ? 'info' : 'error'}>
          {t(summaryKey)}
        </Alert>
        {deliveryWithoutZone ? (
          <Alert variant="warning">
            {t('settings.ordering.deliveryNoZones')}{' '}
            <Link
              href={`/staff/restaurants/${restaurantId}/settings/delivery`}
              className="font-semibold underline"
            >
              {t('settings.ordering.deliveryNoZonesLink')}
            </Link>
          </Alert>
        ) : null}
      </section>

      <section className="flex flex-col gap-2" aria-label={t('settings.ordering.group.whatsapp')}>
        <h3 className="text-sm font-semibold text-foreground">{t('settings.ordering.group.whatsapp')}</h3>
        <OrderingRows
          rows={whatsappRows}
          canManage={canManage && (hasWhatsappNumber || whatsappOrderingEnabled)}
          busy={busy}
          onChange={change}
        />
        {!hasWhatsappNumber ? <Alert variant="warning">{t('settings.ordering.whatsappNeedsNumber')}</Alert> : null}
        {whatsappOrderingEnabled ? <Alert variant="info">{t('settings.ordering.summary.whatsappOn')}</Alert> : null}
      </section>

      {!canManage ? (
        <p className="text-xs text-muted-foreground">{t('settings.ordering.needsFullScope')}</p>
      ) : null}
    </Card>
  );
}

function OrderingRows({
  rows,
  canManage,
  busy,
  onChange,
}: {
  rows: {
    type: OrderType;
    enabled: boolean;
    title: string;
    hint: string;
    icon: ReactNode;
  }[];
  canManage: boolean;
  busy: OrderType | null;
  onChange: (type: OrderType, next: boolean) => void | Promise<void>;
}) {
  const { t } = useStaffI18n();
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {rows.map((row) => (
        <li key={row.type} className="flex items-center gap-3 px-4 py-3">
          <span
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
              row.enabled ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {row.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{row.title}</p>
            <p className="text-xs text-muted-foreground">{row.hint}</p>
          </div>
          <span
            className={`text-xs font-medium ${row.enabled ? 'text-success' : 'text-muted-foreground'}`}
          >
            {row.enabled ? t('settings.ordering.on') : t('settings.ordering.off')}
          </span>
          <Switch
            checked={row.enabled}
            label={row.title}
            disabled={!canManage || busy !== null}
            onCheckedChange={(next) => void onChange(row.type, next)}
          />
        </li>
      ))}
    </ul>
  );
}
