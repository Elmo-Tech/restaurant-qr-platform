'use client';

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
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../lib/i18n/messages';
import type { DashboardMetrics } from '../../../../../lib/dashboard/types';
import type { OrderStatus, OrderType } from '../../../../../lib/orders/types';
import { Card } from '../../../../../components/ui/Card';
import { orderStatusLabel } from '../orders/StatusBadge';

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

/** A single-day chart never shows fewer hourly buckets than this once trimmed to the active hours. */
const MIN_HOURLY_BUCKETS = 6;

/**
 * The reading part of the Dashboard, below the live operations: best sellers,
 * the order mix, how value and volume move through the period, and how long
 * service takes. Only for roles with `analytics.view`; every figure comes from
 * the Backend's Dashboard endpoint.
 */
export function Analysis({
  metrics,
  currencyCode,
}: {
  metrics: DashboardMetrics;
  currencyCode: string;
}) {
  const { t, locale } = useStaffI18n();
  const topQuantity = metrics.topProducts.reduce((max, row) => Math.max(max, row.quantity), 0);
  const typeTotal = ORDER_TYPES.reduce((sum, type) => sum + metrics.byType[type].count, 0);
  const statusRows = ORDER_STATUSES.filter((status) => metrics.byStatus[status] > 0);
  const statusTotal = statusRows.reduce((sum, status) => sum + metrics.byStatus[status], 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-4 text-base font-semibold text-foreground">
            {t('ops.analysis.topProducts')}
          </h3>
          {metrics.topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('ops.analysis.topProductsEmpty')}
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {metrics.topProducts.map((row, index) => (
                <li key={row.productId} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                      {index + 1}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                      dir="auto"
                    >
                      {row.name}
                    </span>
                    <span
                      className="flex-shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold text-foreground"
                      title={t('ops.analysis.sold', { count: row.quantity })}
                      dir="ltr"
                    >
                      ×{row.quantity}
                    </span>
                    <bdi
                      dir="ltr"
                      className="w-24 flex-shrink-0 text-end text-sm font-semibold text-foreground"
                    >
                      {row.amount} {currencyCode}
                    </bdi>
                  </div>
                  <ShareBar percent={topQuantity > 0 ? (row.quantity / topQuantity) * 100 : 0} />
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-base font-semibold text-foreground">
            {t('analytics.section.ordersByType')}
          </h3>
          <ul className="flex flex-col gap-4">
            {ORDER_TYPES.map((type) => (
              <ShareRow
                key={type}
                label={t(`analytics.orderType.${type}`)}
                value={metrics.byType[type].count}
                detail={`${metrics.byType[type].revenue} ${currencyCode}`}
                percent={typeTotal > 0 ? (metrics.byType[type].count / typeTotal) * 100 : 0}
              />
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-base font-semibold text-foreground">
            {t('analytics.section.statusDistribution')}
          </h3>
          {statusRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('analytics.empty.noData')}
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {statusRows.map((status) => (
                <ShareRow
                  key={status}
                  label={orderStatusLabel(t, status)}
                  value={metrics.byStatus[status]}
                  percent={statusTotal > 0 ? (metrics.byStatus[status] / statusTotal) * 100 : 0}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-base font-semibold text-foreground">
            {t('ops.analysis.valueTrend')}
          </h3>
          <TrendChart
            metrics={metrics}
            metric="value"
            currencyCode={currencyCode}
            locale={locale}
            emptyLabel={t('analytics.empty.noOrders')}
          />
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-base font-semibold text-foreground">
            {t('analytics.section.orderVolume')}
          </h3>
          <TrendChart
            metrics={metrics}
            metric="orders"
            currencyCode={currencyCode}
            locale={locale}
            emptyLabel={t('analytics.empty.noOrders')}
          />
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-4 text-base font-semibold text-foreground">{t('analytics.section.timing')}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TIMING_ROWS.map((row) => (
            <div key={row.key} className="rounded-lg bg-muted/50 px-4 py-3">
              <p className="text-sm text-muted-foreground">{t(row.labelKey)}</p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {formatDurationOrDash(metrics.timing[row.key], t)}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** A thin proportional bar (relative to the largest / the total); never empty when there is a value. */
function ShareBar({ percent }: { percent: number }) {
  const width = percent > 0 ? Math.max(3, Math.min(100, percent)) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

function ShareRow({
  label,
  value,
  detail,
  percent,
}: {
  label: string;
  value: number;
  detail?: string;
  percent: number;
}) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="flex items-baseline gap-3">
          <span className="text-base font-bold text-foreground">{value}</span>
          {detail ? (
            <bdi dir="ltr" className="w-24 text-end text-sm text-muted-foreground">
              {detail}
            </bdi>
          ) : null}
        </span>
      </div>
      <ShareBar percent={percent} />
    </li>
  );
}

function formatDurationOrDash(
  seconds: number | null,
  t: (
    key: 'orders.time.minutes' | 'orders.time.hoursMinutes' | 'analytics.empty.unavailable',
    params?: Record<string, string | number>,
  ) => string,
): string {
  if (seconds === null) return t('analytics.empty.unavailable');
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return t('orders.time.minutes', { count: totalMinutes });
  return t('orders.time.hoursMinutes', {
    hours: Math.floor(totalMinutes / 60),
    minutes: String(totalMinutes % 60).padStart(2, '0'),
  });
}

interface TrendPoint {
  bucketStart: string;
  orders: number;
  value: number;
}

/**
 * A single day arrives as 24 hourly buckets; most of them are empty overnight,
 * which turns the chart into a lone spike. Trim to the active hours (one empty
 * hour either side, never fewer than `MIN_HOURLY_BUCKETS`). Multi-day ranges
 * keep every day.
 */
function trimToActiveHours(points: TrendPoint[], singleDay: boolean): TrendPoint[] {
  if (!singleDay) return points;
  const active = (point: TrendPoint) => point.orders > 0 || point.value > 0;
  const first = points.findIndex(active);
  if (first === -1) return points;
  let last = points.length - 1;
  while (last > first && !active(points[last])) last -= 1;
  let start = Math.max(0, first - 1);
  let end = Math.min(points.length - 1, last + 1);
  while (end - start + 1 < MIN_HOURLY_BUCKETS && (start > 0 || end < points.length - 1)) {
    if (end < points.length - 1) end += 1;
    else start -= 1;
  }
  return points.slice(start, end + 1);
}

function bucketLabel(iso: string, singleDay: boolean, locale: string): string {
  const date = new Date(iso);
  return singleDay
    ? date.toLocaleTimeString(locale, { hour: 'numeric' })
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/**
 * One chart for both value and volume. A single day is a bar per active hour
 * (clearer than a spiky area over mostly-empty hours); several days are an
 * area for value and bars for volume. Axis labels are thinned so they never
 * collide, and the plot stays left-to-right so time reads the same in both
 * languages.
 */
function TrendChart({
  metrics,
  metric,
  currencyCode,
  locale,
  emptyLabel,
}: {
  metrics: DashboardMetrics;
  metric: 'value' | 'orders';
  currencyCode: string;
  locale: string;
  emptyLabel: string;
}) {
  const singleDay = metrics.timeSeries.length <= 24;
  const all: TrendPoint[] = metrics.timeSeries.map((point) => ({
    bucketStart: point.bucketStart,
    orders: point.orderCount,
    value: Number(point.revenue),
  }));
  if (!all.some((point) => point.orders > 0 || point.value > 0)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const data = trimToActiveHours(all, singleDay).map((point) => ({
    label: bucketLabel(point.bucketStart, singleDay, locale),
    amount: metric === 'value' ? point.value : point.orders,
  }));

  const axisTick = { fontSize: 12, fill: 'var(--color-muted-foreground)' };
  const tooltipStyle = { borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 12 };
  const useArea = metric === 'value' && !singleDay;

  return (
    <div className="h-60 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        {useArea ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(2)} ${currencyCode}`, '']}
              contentStyle={tooltipStyle}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="url(#valueFill)"
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={44}
              allowDecimals={metric === 'value'}
            />
            <Tooltip
              formatter={(value) => [
                metric === 'value' ? `${Number(value).toFixed(2)} ${currencyCode}` : String(value),
                '',
              ]}
              contentStyle={tooltipStyle}
              cursor={{ fill: 'var(--color-muted)', opacity: 0.5 }}
            />
            <Bar
              dataKey="amount"
              fill={metric === 'value' ? 'var(--color-primary)' : 'var(--color-accent-foreground)'}
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
