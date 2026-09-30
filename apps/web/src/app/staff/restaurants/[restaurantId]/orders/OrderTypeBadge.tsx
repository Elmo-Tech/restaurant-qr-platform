import type { ReactNode } from 'react';
import { IconBag, IconTable, IconTruck } from '../../../../../components/staff/icons';
import type { OrderType } from '../../../../../lib/orders/types';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../lib/i18n/messages';

interface OrderTypeStyle {
  icon: (className: string) => ReactNode;
  /** Rounded-rectangle (not a pill) so a type never reads as a status. */
  badge: string;
}

/**
 * Design-system-v2, Migration 01: the ONE Order type visual system --
 * retokenized. Deliberately a different shape (squared, outlined, with an
 * icon) from the status pills, so type and status are never confused even
 * when they happen to share a hue (DELIVERY type and Out-for-delivery status
 * both use the `delivery` teal token, which reinforces rather than
 * conflicts, since the two badges never look alike). PICKUP reuses `info`
 * (blue) -- the design system has no separate purple token, and introducing
 * one for a single badge would violate "tokens only."
 */
const TYPE_STYLES: Record<OrderType, OrderTypeStyle> = {
  DINE_IN: {
    icon: (className) => <IconTable className={className} />,
    badge: 'border-border bg-muted text-muted-foreground',
  },
  PICKUP: {
    icon: (className) => <IconBag className={className} />,
    badge: 'border-info/30 bg-info-soft text-info',
  },
  DELIVERY: {
    icon: (className) => <IconTruck className={className} />,
    badge: 'border-delivery/30 bg-delivery-soft text-delivery',
  },
};

export function orderTypeLabel(t: (key: MessageKey) => string, type: OrderType): string {
  return t(`orders.type.${type}` as const);
}

export function OrderTypeBadge({ type }: { type: OrderType }) {
  const { t } = useStaffI18n();
  const style = TYPE_STYLES[type];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${style.badge}`}
    >
      {style.icon('h-3.5 w-3.5')}
      {orderTypeLabel(t, type)}
    </span>
  );
}
