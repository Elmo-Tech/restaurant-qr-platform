'use client';

import Link from 'next/link';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { OrderListItem } from '../../../../../lib/orders/types';
import { EmptyState } from '../../../../../components/ui/EmptyState';
import { IconOrders } from '../../../../../components/staff/icons';
import { OrderTypeBadge } from '../orders/OrderTypeBadge';
import { StatusBadge } from '../orders/StatusBadge';
import { Money } from '../tables/SessionBadges';
import { useAgeLabel } from './use-age-label';

const MAX_ORDERS = 6;

/** Newest first. */
export function latestOrders(orders: OrderListItem[]): OrderListItem[] {
  return [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_ORDERS);
}

/**
 * The last few orders as one-line rows: how long ago, where it is for, its
 * status, and (for roles that handle money) the total. A row opens that order
 * in the Orders workspace.
 */
export function RecentOrders({
  orders,
  loading,
  now,
  ordersHref,
  showMoney,
}: {
  /** Already limited by `latestOrders`. */
  orders: OrderListItem[];
  loading: boolean;
  now: number;
  ordersHref: string;
  showMoney: boolean;
}) {
  const { t } = useStaffI18n();
  const age = useAgeLabel(now);

  return (
    <section aria-labelledby="ops-recent-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ops-recent-title" className="text-base font-semibold text-foreground">
          {t('ops.recent.title')}
        </h2>
        <Link
          href={ordersHref}
          className="rounded-md px-2 py-1 text-sm font-semibold text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('ops.recent.viewAll')}
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-[60px] animate-pulse rounded-xl border border-border bg-muted/50" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          compact
          icon={<IconOrders />}
          title={t('ops.recent.empty')}
          description={t('ops.recent.emptyHint')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => {
            const where = order.table
              ? t('orders.card.table', { number: order.table.tableNumber })
              : (order.customer?.name ?? order.deliveryZoneName ?? t('orders.card.pickup'));
            return (
              <li key={order.id}>
                <Link
                  href={`${ordersHref}?order=${encodeURIComponent(order.id)}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-card px-4 py-3 shadow-sm outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-16 flex-shrink-0 text-sm font-medium text-muted-foreground" dir="auto">
                    {age(order.createdAt)}
                  </span>
                  <OrderTypeBadge type={order.type} />
                  <span className="min-w-0 flex-1 basis-24 truncate text-base font-semibold text-foreground" dir="auto">
                    {where}
                  </span>
                  <StatusBadge status={order.status} type={order.type} />
                  {showMoney ? (
                    <span className="flex-shrink-0 text-end text-sm font-bold text-foreground">
                      <Money amount={order.totalAmount} currency={order.currencyCode} />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
