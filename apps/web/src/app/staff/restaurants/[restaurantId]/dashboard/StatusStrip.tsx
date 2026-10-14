'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { GenericQr } from '../../../../../lib/qr/api';
import { Switch } from '../../../../../components/ui/Switch';
import { IconBag, IconQr, IconTable, IconTruck } from '../../../../../components/staff/icons';

type OrderType = 'pickup' | 'delivery' | 'table';

const TILE = 'flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm';

/** A status tile; with `href` the whole tile is the link (no cramped "Manage" text beside the label). */
function Tile({ children, href }: { children: ReactNode; href?: string | null }) {
  if (href) {
    return (
      <Link
        href={href}
        className={`${TILE} outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring`}
      >
        {children}
        <span aria-hidden="true" className="flex-shrink-0 text-muted-foreground rtl:rotate-180">
          →
        </span>
      </Link>
    );
  }
  return <div className={TILE}>{children}</div>;
}

function Medallion({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5 ${
        on ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
      }`}
    >
      {children}
    </span>
  );
}

/**
 * The first thing a restaurateur wants to know: am I taking orders right now?
 * Pickup and Delivery are switchable in place (with `restaurant.manage` and
 * full branch scope), the Restaurant QR shows its state, and the live table
 * count says how busy the floor is. Everything here is read from data the
 * Backend already returned; the switches call the same ordering-options
 * endpoint as Settings.
 */
export function StatusStrip({
  pickupEnabled,
  deliveryEnabled,
  tableOrderingEnabled,
  canManage,
  busy,
  onToggle,
  qr,
  qrSettingsHref,
  openSessions,
  tableCount,
  tablesHref,
}: {
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  tableOrderingEnabled: boolean;
  /** `restaurant.manage` with Restaurant-wide scope: the switches are live. */
  canManage: boolean;
  busy: OrderType | null;
  onToggle: (type: OrderType, next: boolean) => void;
  /** `undefined` while unknown / not visible to this member. */
  qr: GenericQr | null | undefined;
  qrSettingsHref: string | null;
  /** `null` when this member cannot see sessions. */
  openSessions: number | null;
  tableCount: number | null;
  tablesHref: string | null;
}) {
  const { t } = useStaffI18n();
  const enabledChannels = [tableOrderingEnabled, pickupEnabled, deliveryEnabled].filter(Boolean).length;
  const overall = enabledChannels === 3 ? 'open' : enabledChannels > 0 ? 'partial' : 'paused';
  const overallTone =
    overall === 'open'
      ? 'bg-success-soft text-success'
      : overall === 'partial'
        ? 'bg-warning-soft text-warning'
        : 'bg-destructive-soft text-destructive';
  const overallDot =
    overall === 'open' ? 'bg-success' : overall === 'partial' ? 'bg-warning' : 'bg-destructive';

  const switches: { type: OrderType; enabled: boolean; label: string; icon: ReactNode }[] = [
    { type: 'table', enabled: tableOrderingEnabled, label: t('ops.status.tables'), icon: <IconTable /> },
    { type: 'pickup', enabled: pickupEnabled, label: t('ops.status.pickup'), icon: <IconBag /> },
    { type: 'delivery', enabled: deliveryEnabled, label: t('ops.status.delivery'), icon: <IconTruck /> },
  ];

  const qrState = qr === undefined ? null : qr === null ? 'none' : qr.status === 'ACTIVE' ? 'active' : 'inactive';

  return (
    <section aria-label={t('ops.status.title')} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{t('ops.status.title')}</h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${overallTone}`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${overallDot}`} />
          {t(`ops.status.ordering.${overall}` as const)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {switches.map((entry) => (
          <Tile key={entry.type}>
            <Medallion on={entry.enabled}>{entry.icon}</Medallion>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground">{entry.label}</p>
              <p
                className={`text-sm font-medium ${entry.enabled ? 'text-success' : 'text-muted-foreground'}`}
              >
                {entry.enabled ? t('ops.status.on') : t('ops.status.off')}
              </p>
            </div>
            <Switch
              checked={entry.enabled}
              label={entry.label}
              disabled={!canManage || busy !== null}
              onCheckedChange={(next) => onToggle(entry.type, next)}
            />
          </Tile>
        ))}

        <Tile href={qrSettingsHref}>
          <Medallion on={qrState === 'active'}>
            <IconQr />
          </Medallion>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">{t('ops.status.qr')}</p>
            <p
              className={`text-sm font-medium ${
                qrState === 'active'
                  ? 'text-success'
                  : qrState === null
                    ? 'text-muted-foreground'
                    : 'text-warning'
              }`}
            >
              {qrState === null ? '—' : t(`ops.status.qr.${qrState}` as const)}
            </p>
          </div>
        </Tile>

        {openSessions !== null ? (
          <Tile href={tablesHref}>
            <Medallion on={openSessions > 0}>
              <IconTable />
            </Medallion>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground">
                {t('ops.status.sessions')}
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="text-lg font-bold text-foreground">{openSessions}</span>
                {tableCount !== null ? (
                  <>
                    {' '}
                    {t('ops.status.sessionsOf', { total: tableCount })}
                  </>
                ) : null}
              </p>
            </div>
          </Tile>
        ) : null}
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">{t('ops.status.viewOnly')}</p>
      ) : null}
    </section>
  );
}
