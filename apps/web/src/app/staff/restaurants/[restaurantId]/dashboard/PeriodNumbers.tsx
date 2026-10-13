'use client';

import type { ReactNode } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { DashboardMetrics } from '../../../../../lib/dashboard/types';
import { percentChange, type PeriodComparisonLabel } from '../../../../../lib/dashboard/range';
import { ChipGroup, type ChipOption } from '../../../../../components/ui/ChipGroup';
import { IconTrend } from './icons';

export type PeriodRange = 'today' | 'yesterday' | 'last7' | 'last30';

function Delta({
  current,
  previous,
  label,
}: {
  current: number;
  previous: number | null;
  label: PeriodComparisonLabel;
}) {
  const { t } = useStaffI18n();
  if (previous === null) return <p className="h-5" aria-hidden="true" />;
  const labelText = t(`ops.compare.${label}` as const);
  const change = percentChange(current, previous);

  if (change === null) {
    return <p className="text-sm text-muted-foreground">{t('ops.delta.none', { label: labelText })}</p>;
  }
  if (change === 0) {
    return <p className="text-sm text-muted-foreground">{t('ops.delta.flat', { label: labelText })}</p>;
  }
  const up = change > 0;
  return (
    <p
      className={`flex items-center gap-1 text-sm font-medium ${up ? 'text-success' : 'text-destructive'}`}
    >
      <IconTrend down={!up} className="h-3.5 w-3.5 flex-shrink-0 rtl:-scale-x-100" />
      <span>
        {t(up ? 'ops.delta.up' : 'ops.delta.down', {
          percent: Math.abs(change),
          label: labelText,
        })}
      </span>
    </p>
  );
}

function Kpi({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground" title={hint}>
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * The period's headline numbers, each with how it compares to the equivalent
 * previous period. "Order value" is the value of orders that were not
 * rejected or cancelled: it is not money collected, so it is never called
 * revenue. The percentages are display-only; every amount is the Backend's.
 */
export function PeriodNumbers({
  range,
  onRangeChange,
  metrics,
  previous,
  currencyCode,
  comparison,
}: {
  range: PeriodRange;
  onRangeChange: (next: PeriodRange) => void;
  metrics: DashboardMetrics | null;
  previous: DashboardMetrics | null;
  currencyCode: string;
  comparison: PeriodComparisonLabel;
}) {
  const { t } = useStaffI18n();
  const rangeOptions: ChipOption<PeriodRange>[] = (
    ['today', 'yesterday', 'last7', 'last30'] as const
  ).map((option) => ({ value: option, label: t(`analytics.range.${option}`) }));

  return (
    <section aria-labelledby="ops-period-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ops-period-title" className="text-base font-semibold text-foreground">
          {t('ops.analysis.title')}
        </h2>
        <ChipGroup
          variant="segmented"
          ariaLabel={t('analytics.viewsLabel')}
          options={rangeOptions}
          value={range}
          onChange={onRangeChange}
        />
      </div>

      {metrics === null ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-[104px] animate-pulse rounded-xl border border-border bg-muted/50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi label={t('ops.kpi.orders')}>
            <p className="text-3xl font-bold text-foreground">{metrics.kpis.totalOrders}</p>
            <Delta
              current={metrics.kpis.totalOrders}
              previous={previous ? previous.kpis.totalOrders : null}
              label={comparison}
            />
          </Kpi>
          <Kpi label={t('ops.kpi.value')} hint={t('ops.kpi.valueHint')}>
            <p className="text-3xl font-bold text-foreground">
              <bdi dir="ltr" className="whitespace-nowrap">
                {metrics.kpis.revenue}{' '}
                <span className="text-sm font-medium text-muted-foreground">{currencyCode}</span>
              </bdi>
            </p>
            <Delta
              current={Number(metrics.kpis.revenue)}
              previous={previous ? Number(previous.kpis.revenue) : null}
              label={comparison}
            />
          </Kpi>
          <Kpi label={t('ops.kpi.average')}>
            <p className="text-3xl font-bold text-foreground">
              <bdi dir="ltr" className="whitespace-nowrap">
                {metrics.kpis.averageOrderValue}{' '}
                <span className="text-sm font-medium text-muted-foreground">{currencyCode}</span>
              </bdi>
            </p>
            <Delta
              current={Number(metrics.kpis.averageOrderValue)}
              previous={previous ? Number(previous.kpis.averageOrderValue) : null}
              label={comparison}
            />
          </Kpi>
          <Kpi label={t('ops.kpi.active')}>
            <p className="text-3xl font-bold text-foreground">{metrics.kpis.activeOrders}</p>
            <p className="h-5" aria-hidden="true" />
          </Kpi>
        </div>
      )}
    </section>
  );
}
