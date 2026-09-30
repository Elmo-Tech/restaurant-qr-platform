import type { OrderStatus, OrderType } from '../../../../../lib/orders/types';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../lib/i18n/messages';

/**
 * Design-system-v2, Migration 01: the ONE Order status visual system, shared
 * by the list cards and the detail dialog -- retokenized onto the semantic
 * palette (`warning`/`info`/`success`/`delivery`/`destructive`/`muted`), same
 * status->treatment mapping as before. Preparing and Cancelled keep their own
 * distinct look instead of reusing another status's token: Preparing borrows
 * `accent`/`accent-foreground` (the brief's brighter amber, reserved for soft
 * non-solid-fill tints) so it never reads as either the brand's burnt-orange
 * `primary` or the amber `warning` used for Pending; Cancelled is an
 * attenuated `destructive` so it stays visually distinct from the clear-red
 * Rejected. The text label always accompanies the color, so color is never
 * the only signal (CANCELLED is additionally struck through).
 */
interface StatusStyle {
  /** Pill: background + text + border. */
  badge: string;
  /** Solid dot color. */
  dot: string;
  /** Card accent: left border + (subtle) background. */
  accent: string;
}

const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  PENDING: {
    badge: 'bg-warning-soft text-warning border-warning/30',
    dot: 'bg-warning',
    accent: 'border-s-warning bg-card',
  },
  ACCEPTED: {
    badge: 'bg-info-soft text-info border-info/30',
    dot: 'bg-info',
    accent: 'border-s-info bg-card',
  },
  PREPARING: {
    badge: 'bg-accent text-accent-foreground border-accent-foreground/25',
    dot: 'bg-accent-foreground',
    accent: 'border-s-accent-foreground bg-card',
  },
  READY: {
    badge: 'bg-success-soft text-success border-success/30 font-semibold',
    dot: 'bg-success',
    // The one card treatment that is deliberately louder: Staff must be able
    // to spot Orders waiting to be handed over at a glance.
    accent: 'border-s-[6px] border-s-success bg-success-soft/40 ring-1 ring-success/25',
  },
  OUT_FOR_DELIVERY: {
    badge: 'bg-delivery-soft text-delivery border-delivery/30 font-semibold',
    dot: 'bg-delivery',
    // Active and in motion: teal accent so it reads apart from the blue
    // Accepted and green Ready cards.
    accent: 'border-s-delivery bg-delivery-soft/30',
  },
  SERVED: {
    badge: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-muted-foreground/60',
    accent: 'border-s-border bg-card',
  },
  REJECTED: {
    badge: 'bg-destructive-soft text-destructive border-destructive/30',
    dot: 'bg-destructive',
    accent: 'border-s-destructive bg-destructive-soft/20',
  },
  CANCELLED: {
    badge: 'bg-destructive-soft/50 text-destructive/80 border-destructive/15 line-through decoration-destructive/40',
    dot: 'bg-destructive/50',
    accent: 'border-s-destructive/40 bg-card',
  },
};

/** Card border/background accent classes for a status. */
export function statusAccentClass(status: OrderStatus): string {
  return STATUS_STYLES[status].accent;
}

/**
 * The Staff-facing status wording, in the Staff UI language. The stored terminal
 * status stays SERVED; a Delivery Order simply reads "Delivered". Shared by the
 * badge, the filter and the printed receipt.
 */
export function orderStatusLabel(
  t: (key: MessageKey) => string,
  status: OrderStatus,
  type?: OrderType,
): string {
  return status === 'SERVED' && type === 'DELIVERY'
    ? t('orders.status.DELIVERED')
    : t(`orders.status.${status}` as const);
}

/** The one shared Order status pill -- text label + colored dot, used identically by cards and the detail dialog. */
export function StatusBadge({ status, type }: { status: OrderStatus; type?: OrderType }) {
  const { t } = useStaffI18n();
  const style = STATUS_STYLES[status];
  const label = orderStatusLabel(t, status, type);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${style.badge}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
}
