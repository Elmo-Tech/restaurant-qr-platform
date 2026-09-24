import type { OrderStatus, OrderType } from '../../../../../lib/orders/types';

/**
 * FT-7B: the ONE Order status visual system, shared by the list cards and the
 * detail dialog. Each status has a distinct semantic treatment (amber /
 * blue / orange / green / neutral / red / muted-red) inside the warm Staff
 * palette -- and the text label always accompanies the color, so color is
 * never the only signal (CANCELLED is additionally struck through).
 */
interface StatusStyle {
  label: string;
  /** Pill: background + text + border. */
  badge: string;
  /** Solid dot color. */
  dot: string;
  /** Card accent: left border + (subtle) background. */
  accent: string;
}

const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  PENDING: {
    label: 'Pending',
    badge: 'bg-[#FFF3D1] text-[#7A5600] border-[#F0D48A]',
    dot: 'bg-[#E0A100]',
    accent: 'border-l-[#E0A100] bg-white',
  },
  ACCEPTED: {
    label: 'Accepted',
    badge: 'bg-[#E4EEFC] text-[#1A4F99] border-[#B9D0F2]',
    dot: 'bg-[#2F6FD0]',
    accent: 'border-l-[#2F6FD0] bg-white',
  },
  PREPARING: {
    label: 'Preparing',
    badge: 'bg-[#FFE6D0] text-[#8F3F00] border-[#F2BE94]',
    dot: 'bg-[#E0701A]',
    accent: 'border-l-[#E0701A] bg-white',
  },
  READY: {
    label: 'Ready',
    badge: 'bg-[#DDF1DF] text-[#1E6B25] border-[#9FD3A5] font-semibold',
    dot: 'bg-[#2E9D3A]',
    // The one card treatment that is deliberately louder: Staff must be able
    // to spot Orders waiting to be handed over at a glance.
    accent: 'border-l-[6px] border-l-[#2E9D3A] bg-[#F3FAF4] ring-1 ring-[#BFE2C4]',
  },
  OUT_FOR_DELIVERY: {
    label: 'Out for delivery',
    badge: 'bg-[#E3F1F0] text-[#1D5F5A] border-[#A9D2CE] font-semibold',
    dot: 'bg-[#2A8C84]',
    // Active and in motion: teal accent + a light ring so it reads apart from
    // the blue Accepted and green Ready cards.
    accent: 'border-l-[#2A8C84] bg-[#F4FAF9]',
  },
  SERVED: {
    label: 'Served',
    badge: 'bg-[#F1EDE7] text-[#6F665E] border-[#DDD5CB]',
    dot: 'bg-[#AFA397]',
    accent: 'border-l-[#CFC7BD] bg-[#FBFAF8]',
  },
  REJECTED: {
    label: 'Rejected',
    badge: 'bg-[#FBE0DC] text-[#A4231B] border-[#EDB0A8]',
    dot: 'bg-[#C43A2F]',
    accent: 'border-l-[#C43A2F] bg-[#FDF7F6]',
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'bg-[#F3E9E7] text-[#7D544E] border-[#DFC6C1] line-through decoration-[#B08A85]/60',
    dot: 'bg-[#B08A85]',
    accent: 'border-l-[#D5B9B4] bg-[#FBF8F7]',
  },
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: STATUS_STYLES.PENDING.label,
  ACCEPTED: STATUS_STYLES.ACCEPTED.label,
  PREPARING: STATUS_STYLES.PREPARING.label,
  READY: STATUS_STYLES.READY.label,
  OUT_FOR_DELIVERY: STATUS_STYLES.OUT_FOR_DELIVERY.label,
  SERVED: STATUS_STYLES.SERVED.label,
  REJECTED: STATUS_STYLES.REJECTED.label,
  CANCELLED: STATUS_STYLES.CANCELLED.label,
};

/** Card border/background accent classes for a status. */
export function statusAccentClass(status: OrderStatus): string {
  return STATUS_STYLES[status].accent;
}

/** The Staff-facing status wording. The stored terminal status stays SERVED; a Delivery Order simply reads "Delivered". Shared by the badge and the printed receipt. */
export function orderStatusLabel(status: OrderStatus, type?: OrderType): string {
  return status === 'SERVED' && type === 'DELIVERY' ? 'Delivered' : STATUS_STYLES[status].label;
}

/** The one shared Order status pill -- text label + colored dot, used identically by cards and the detail dialog. */
export function StatusBadge({ status, type }: { status: OrderStatus; type?: OrderType }) {
  const style = STATUS_STYLES[status];
  const label = orderStatusLabel(status, type);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${style.badge}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
}
