'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { OrderListItem } from '../../../../../lib/orders/types';
import { groupOrdersByPriority } from '../../../../../lib/orders/order-views';
import { nextStepFor } from '../../../../../lib/orders/transitions';
import { OrderCard } from './OrderCard';

const GRID_CLASS = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';

export interface OrdersQueueProps {
  /** Already filtered and sorted by the workspace. */
  orders: OrderListItem[];
  /** Active view + Priority sort: render the priority groups with headings; otherwise one flat list in the given order. */
  grouped: boolean;
  /** The Membership's own permissions -- used only for the cards' informational next-step hint. */
  permissions: string[];
  onOpen: (order: OrderListItem, trigger: HTMLButtonElement) => void;
}

/**
 * Phase 1: the Orders list. In the Active view with Priority sort it shows
 * the priority groups (Needs decision, Ready for handoff, In progress, In
 * delivery), each a labelled section, oldest first. Every other view/sort is
 * the same flat card grid as before. Cards stay read-only: the only control
 * is "View order", which opens the existing detail dialog.
 */
export function OrdersQueue({ orders, grouped, permissions, onOpen }: OrdersQueueProps) {
  const { t } = useStaffI18n();

  function renderList(list: OrderListItem[]) {
    return (
      <ul role="list" className={GRID_CLASS}>
        {list.map((order) => (
          <li key={order.id} className="min-w-0">
            <OrderCard
              order={order}
              nextStep={nextStepFor(order.status, order.type, permissions)}
              onOpen={(trigger) => onOpen(order, trigger)}
            />
          </li>
        ))}
      </ul>
    );
  }

  if (!grouped) return renderList(orders);

  return (
    <div role="region" aria-label={t('orders.queue.label')} className="flex flex-col gap-6">
      {groupOrdersByPriority(orders).map((section) => {
        const headingId = `orders-queue-${section.group}`;
        return (
          <section key={section.group} aria-labelledby={headingId} className="flex flex-col gap-3">
            <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span>{t(`orders.queue.group.${section.group}`)}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {section.orders.length}
              </span>
            </h2>
            {renderList(section.orders)}
          </section>
        );
      })}
    </div>
  );
}
