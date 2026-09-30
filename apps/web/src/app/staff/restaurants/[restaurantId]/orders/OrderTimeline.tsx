import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { OrderStatusEvent, OrderType } from '../../../../../lib/orders/types';
import { orderStatusLabel } from './StatusBadge';

function formatDuration(seconds: number, t: (key: 'orders.time.minutes' | 'orders.time.hoursMinutes', params?: Record<string, string | number>) => string): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return t('orders.time.minutes', { count: totalMinutes });
  return t('orders.time.hoursMinutes', {
    hours: Math.floor(totalMinutes / 60),
    minutes: String(totalMinutes % 60).padStart(2, '0'),
  });
}

/**
 * FT-11 Section 4: a compact vertical log of every recorded status
 * transition -- "Created 12:01 / Accepted 12:03 / Preparing 12:05 / Ready
 * 12:18 / Delivered 12:42" -- with the elapsed duration since the previous
 * step shown where it is genuinely known. Renders exactly what
 * `order.statusHistory` contains, nothing more: a pre-FT-11 historical
 * Order with only its single backfilled creation event shows only that one
 * row, never fabricated intermediate steps.
 */
export function OrderTimeline({ history, type }: { history: OrderStatusEvent[]; type: OrderType }) {
  const { t, formatTime } = useStaffI18n();

  if (history.length === 0) return null;

  return (
    <section aria-labelledby="order-timeline-title">
      <h3
        id="order-timeline-title"
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {t('orders.detail.timeline')}
      </h3>
      <ol className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
        {history.map((event, index) => {
          const previousAt = index > 0 ? new Date(history[index - 1].transitionedAt) : null;
          const at = new Date(event.transitionedAt);
          const durationSeconds = previousAt ? Math.max(0, (at.getTime() - previousAt.getTime()) / 1000) : null;

          return (
            <li key={index} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-foreground">{orderStatusLabel(t, event.newStatus, type)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                {durationSeconds !== null ? (
                  <span className="text-xs">+{formatDuration(durationSeconds, t)}</span>
                ) : null}
                <bdi dir="ltr">{formatTime(at)}</bdi>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
