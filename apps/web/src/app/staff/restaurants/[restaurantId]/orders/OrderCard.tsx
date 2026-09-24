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
  const completed = isCompletedStatus(order.status);
  const isReady = order.status === 'READY';
  const identity = order.customer ? order.customer.name : `Table ${order.table?.tableNumber ?? '—'}`;

  return (
    <article
      className={`flex flex-col gap-3 rounded-lg border border-l-4 border-[#E5DED6] p-4 shadow-sm ${statusAccentClass(order.status)} ${
        completed ? 'opacity-80' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={order.status} type={order.type} />
        <OrderTypeBadge type={order.type} />
      </div>

      <div className="min-w-0">
        <h3
          className={`truncate text-lg font-semibold ${completed ? 'text-[#655D56]' : 'text-[#1D1A18]'}`}
        >
          {identity}
        </h3>
        {order.customer ? (
          <p dir="ltr" className="truncate text-start text-sm text-[#655D56]">
            {order.customer.phone}
          </p>
        ) : null}
        <p className="mt-0.5 text-xs text-[#8A8177]">
          {order.deliveryZoneName ? `${order.deliveryZoneName} · ` : ''}
          {order.branch.name} · {formatOrderTime(order.createdAt)}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-[#EDE7DF] pt-3 text-sm">
        <span className="text-[#655D56]">
          {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
        </span>
        <span className={`font-semibold ${completed ? 'text-[#655D56]' : 'text-[#1D1A18]'}`}>
          {order.totalAmount} {order.currencyCode}
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
        View order
      </button>
    </article>
  );
}
