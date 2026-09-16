import type { OrderStatus } from '../../../../../lib/orders/types';

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: 'bg-[#F1ECE6] text-[#7A5138]',
  ACCEPTED: 'bg-[#E8F0FE] text-[#1A5CB0]',
  PREPARING: 'bg-[#FFF4E0] text-[#8A5A00]',
  READY: 'bg-[#EAF3EA] text-[#2E7D32]',
  SERVED: 'bg-[#F1ECE6] text-[#8A8177]',
  REJECTED: 'bg-[#F6E4DE] text-[#8A3B24]',
  CANCELLED: 'bg-[#F6E4DE] text-[#8A3B24]',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  SERVED: 'Served',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** FT-5: the one shared Order status pill -- used identically by the list cards and the detail panel. */
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
