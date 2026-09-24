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
 * FT-7B: the ONE Order type visual system. Deliberately a different shape
 * (squared, outlined, with an icon) and a cooler hue than the status pills,
 * so type and status are never confused. Adding DELIVERY later is one more
 * entry here (and one more `OrderType` union member) -- nothing else.
 */
const TYPE_STYLES: Record<OrderType, OrderTypeStyle> = {
  DINE_IN: {
    icon: (className) => <IconTable className={className} />,
    badge: 'border-[#D9D2C8] bg-[#F8F5F1] text-[#4A423B]',
  },
  PICKUP: {
    icon: (className) => <IconBag className={className} />,
    badge: 'border-[#CDBFE6] bg-[#F1ECFA] text-[#4B2E86]',
  },
  DELIVERY: {
    icon: (className) => <IconTruck className={className} />,
    badge: 'border-[#B9D9D6] bg-[#E9F5F4] text-[#1D5F5A]',
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
