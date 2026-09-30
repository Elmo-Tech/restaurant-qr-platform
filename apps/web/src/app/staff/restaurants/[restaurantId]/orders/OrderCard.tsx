import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { OrderListItem } from '../../../../../lib/orders/types';
import { formatOrderTime, isCompletedStatus } from '../../../../../lib/orders/order-views';
import { OrderTypeBadge } from './OrderTypeBadge';
import { StatusBadge, statusAccentClass } from './StatusBadge';

/**
 * FT-7B: one Order in the list, built for fast scanning. Status + type on
 * top; the primary identity is the Table number (Dine in) or the customer
 * name (Pickup); then Branch/time and the item count/total. The left accent
 * is per-status (READY is deliberately the loudest), and Completed Orders
 * are visually quieter than Active ones.
 */
export function OrderCard({ order, onOpen }: { order: OrderListItem; onOpen: () => void }) {
  const { t, tp, formatTime, formatDayMonth } = useStaffI18n();
  const completed = isCompletedStatus(order.status);
  const isReady = order.status === 'READY';
  const identity = order.customer
    ? order.customer.name
    : t('orders.card.table', { number: order.table?.tableNumber ?? '—' });
  const time = formatOrderTime(order.createdAt, {
    t,
    tMinutes: (count) => t('orders.time.minutesAgo', { count }),
    formatTime,
    formatDayMonth,
  });

  return (
    <article
      className={`flex flex-col gap-3 rounded-lg border border-s-4 border-[#E5DED6] p-4 shadow-sm ${statusAccentClass(order.status)} ${
        completed ? 'opacity-80' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={order.status} type={order.type} />
        <OrderTypeBadge type={order.type} />
      </div>

      <div className="min-w-0">
        <h3
          dir="auto"
          className={`truncate text-start text-lg font-semibold ${completed ? 'text-[#655D56]' : 'text-[#1D1A18]'}`}
        >
          {identity}
        </h3>
        {order.customer ? (
          <p dir="ltr" className="truncate text-start text-sm text-[#655D56]">
            {order.customer.phone}
          </p>
        ) : null}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {order.deliveryZoneName ? (
            <>
              <bdi dir="auto">{order.deliveryZoneName}</bdi> ·{' '}
            </>
          ) : null}
          <bdi dir="auto">{order.branch.name}</bdi> · {time}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-[#EDE7DF] pt-3 text-sm">
        <span className="text-[#655D56]">
          {tp('common.items', order.itemCount)}
        </span>
        <span className={`font-semibold ${completed ? 'text-[#655D56]' : 'text-[#1D1A18]'}`}>
          <bdi dir="ltr">
            {order.totalAmount} {order.currencyCode}
          </bdi>
        </span>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className={`w-full rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          isReady
            ? 'bg-[#2E7D32] text-white hover:bg-[#256628]'
            : 'border border-[#E5DED6] bg-white text-[#302C29] hover:bg-[#F8F5F1]'
        }`}
      >
        {t('orders.card.view')}
      </button>
    </article>
  );
}
