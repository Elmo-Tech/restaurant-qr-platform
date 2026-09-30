'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useStaffI18n } from '../../../../lib/i18n/client';
import type { MessageKey } from '../../../../lib/i18n/messages';
import * as dashboardApi from '../../../../lib/dashboard/api';
import type { DashboardMetrics } from '../../../../lib/dashboard/types';
import type { AuthContextBranch } from '../../../../lib/auth/types';
import type { OrderStatus, OrderType } from '../../../../lib/orders/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../lib/menu/error-message';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { ChipGroup, type ChipOption } from '../../../../components/ui/ChipGroup';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { orderStatusLabel } from './orders/StatusBadge';

const ALL_BRANCHES = '__all__';
type RangeOption = 'today' | 'yesterday' | 'last7' | 'last30';

const ORDER_TYPES: readonly OrderType[] = ['DINE_IN', 'PICKUP', 'DELIVERY'];
const ORDER_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'SERVED',
  'REJECTED',
  'CANCELLED',
];

type TimingKey =
  | 'acceptanceSeconds'
  | 'preparationSeconds'
  | 'readyWaitSeconds'
  | 'pickupFulfillmentSeconds'
  | 'deliveryFulfillmentSeconds'
  | 'totalFulfillmentSeconds';

const TIMING_ROWS: { key: TimingKey; labelKey: MessageKey }[] = [
  { key: 'acceptanceSeconds', labelKey: 'analytics.timing.acceptance' },
  { key: 'preparationSeconds', labelKey: 'analytics.timing.preparation' },
  { key: 'readyWaitSeconds', labelKey: 'analytics.timing.readyWait' },
  { key: 'pickupFulfillmentSeconds', labelKey: 'analytics.timing.pickupFulfillment' },
  { key: 'deliveryFulfillmentSeconds', labelKey: 'analytics.timing.deliveryFulfillment' },
  { key: 'totalFulfillmentSeconds', labelKey: 'analytics.timing.totalFulfillment' },
];

export interface DashboardWorkspaceProps {
  restaurantId: string;
  /** Already scoped to this Membership's authorized Branches by `/auth/me`. */
  branches: AuthContextBranch[];
  currencyCode: string;
}

/**
 * FT-11: the real operational Dashboard -- KPIs, a revenue trend chart,
 * Order-type/status breakdowns, busiest-hours volume, and operational
 * timing averages. Only rendered for a Membership with `analytics.view`
 * (`DashboardWorkspacePage`'s server-side gate); CASHIER/KITCHEN/WAITER keep
 * the existing navigation-tile landing screen. All figures come from
 * `GET /restaurants/:restaurantId/dashboard` -- nothing here is computed or
 * guessed client-side.
 */
export function DashboardWorkspace({ restaurantId, branches, currencyCode }: DashboardWorkspaceProps) {
  const { t, locale } = useStaffI18n();
  const [range, setRange] = useState<RangeOption>('today');
  const [branchId, setBranchId] = useState<string>(ALL_BRANCHES);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      const data = await dashboardApi.getDashboardMetrics(restaurantId, {
        range,
        branchId: branchId === ALL_BRANCHES ? undefined : branchId,
      });
      if (requestRef.current !== requestId) return;
      setMetrics(data);
      setError(null);
    } catch (err) {
      if (requestRef.current !== requestId) return;
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
    }
  }, [restaurantId, range, branchId]);

  useEffect(() => {
    queueMicrotask(() => {
      setMetrics(null);
      void load();
    });
  }, [load]);

  const rangeOptions: ChipOption<RangeOption>[] = (
    ['today', 'yesterday', 'last7', 'last30'] as const
  ).map((option) => ({ value: option, label: t(`analytics.range.${option}`) }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipGroup
          variant="segmented"
          ariaLabel={t('analytics.viewsLabel')}
          options={rangeOptions}
          value={range}
          onChange={setRange}
        />
        {branches.length > 1 ? (
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            aria-label={t('orders.filter.branch')}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring"
          >
            <option value={ALL_BRANCHES}>{t('orders.filter.allBranches')}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {error ? (
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {metrics === null && !error ? <LoadingState label={t('analytics.loading')} /> : null}

      {metrics ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={t('analytics.kpi.revenue')}
              value={`${metrics.kpis.revenue} ${currencyCode}`}
            />
            <KpiCard label={t('analytics.kpi.totalOrders')} value={String(metrics.kpis.totalOrders)} />
            <KpiCard
              label={t('analytics.kpi.averageOrderValue')}
              value={`${metrics.kpis.averageOrderValue} ${currencyCode}`}
            />
            <KpiCard label={t('analytics.kpi.activeOrders')} value={String(metrics.kpis.activeOrders)} />
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              {t('analytics.section.revenueTrend')}
            </h2>
            <RevenueChart metrics={metrics} currencyCode={currencyCode} locale={locale} emptyLabel={t('analytics.empty.noOrders')} />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                {t('analytics.section.ordersByType')}
              </h2>
              <ul className="flex flex-col gap-2">
                {ORDER_TYPES.map((type) => (
                  <li key={type} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t(`analytics.orderType.${type}`)}</span>
                    <span className="font-medium text-foreground">
                      {metrics.byType[type].count}
                      <span className="ms-2 text-xs text-muted-foreground">
                        <bdi dir="ltr">
                          {metrics.byType[type].revenue} {currencyCode}
                        </bdi>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                {t('analytics.section.statusDistribution')}
              </h2>
              <ul className="flex flex-col gap-1.5">
                {ORDER_STATUSES.filter((status) => metrics.byStatus[status] > 0).map((status) => (
                  <li key={status} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{orderStatusLabel(t, status)}</span>
                    <span className="font-medium text-foreground">{metrics.byStatus[status]}</span>
                  </li>
                ))}
                {ORDER_STATUSES.every((status) => metrics.byStatus[status] === 0) ? (
                  <li className="text-sm text-muted-foreground">{t('analytics.empty.noData')}</li>
                ) : null}
              </ul>
            </Card>
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              {t('analytics.section.orderVolume')}
            </h2>
            <VolumeChart metrics={metrics} locale={locale} emptyLabel={t('analytics.empty.noOrders')} />
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-foreground">{t('analytics.section.timing')}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {TIMING_ROWS.map((row) => (
                <div key={row.key}>
                  <p className="text-xs text-muted-foreground">{t(row.labelKey)}</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {formatDurationOrDash(metrics.timing[row.key], t)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">
        <bdi dir="ltr">{value}</bdi>
      </p>
    </Card>
  );
}

function formatDurationOrDash(
  seconds: number | null,
  t: (key: 'orders.time.minutes' | 'orders.time.hoursMinutes' | 'analytics.empty.unavailable', params?: Record<string, string | number>) => string,
): string {
  if (seconds === null) return t('analytics.empty.unavailable');
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return t('orders.time.minutes', { count: totalMinutes });
  return t('orders.time.hoursMinutes', {
    hours: Math.floor(totalMinutes / 60),
    minutes: String(totalMinutes % 60).padStart(2, '0'),
  });
}

function bucketLabel(iso: string, isSingleDay: boolean, locale: string): string {
  const date = new Date(iso);
  return isSingleDay
    ? date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function RevenueChart({
  metrics,
  currencyCode,
  locale,
  emptyLabel,
}: {
  metrics: DashboardMetrics;
  currencyCode: string;
  locale: string;
  emptyLabel: string;
}) {
  const hasData = metrics.timeSeries.some((point) => Number(point.revenue) > 0);
  if (!hasData) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const isSingleDay = metrics.timeSeries.length <= 24;
  const data = metrics.timeSeries.map((point) => ({
    label: bucketLabel(point.bucketStart, isSingleDay, locale),
    revenue: Number(point.revenue),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            formatter={(value) => [`${Number(value).toFixed(2)} ${currencyCode}`, '']}
            contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 12 }}
          />
          <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} fill="url(#revenueFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function VolumeChart({
  metrics,
  locale,
  emptyLabel,
}: {
  metrics: DashboardMetrics;
  locale: string;
  emptyLabel: string;
}) {
  const hasData = metrics.timeSeries.some((point) => point.orderCount > 0);
  if (!hasData) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const isSingleDay = metrics.timeSeries.length <= 24;
  const data = metrics.timeSeries.map((point) => ({
    label: bucketLabel(point.bucketStart, isSingleDay, locale),
    orders: point.orderCount,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            width={32}
            allowDecimals={false}
          />
          <Tooltip contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 12 }} />
          <Bar dataKey="orders" fill="var(--color-accent-foreground)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
