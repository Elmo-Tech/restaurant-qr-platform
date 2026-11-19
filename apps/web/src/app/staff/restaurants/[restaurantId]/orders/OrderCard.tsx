import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { OrderListItem } from '../../../../../lib/orders/types';
import type { OrderNextStep } from '../../../../../lib/orders/transitions';
import { elapsedMinutes, formatElapsedAge, isCompletedStatus } from '../../../../../lib/orders/order-views';
import { OrderTypeBadge } from './OrderTypeBadge';
import { StatusBadge, statusAccentClass } from './StatusBadge';

/** FT-11 Section 5: a fixed (never configurable) attention threshold -- a PENDING Order sitting unaccepted this long gets a restrained warning tint on its age. */
const STALE_PENDING_MINUTES = 10;

/**
 * FT-7B: one Order in the list, built for fast scanning. Status + type on
 * top; the primary identity is the Table number (Dine in) or the customer
 * name (Pickup); then Branch/time and the item count/total. The left accent
 * is per-status (READY is deliberately the loudest), and Completed Orders
 * are visually quieter than Active ones.
 */
export function OrderCard({
  order,
  nextStep = null,
  onOpen,
}: {
  order: OrderListItem;
  /** Phase 1: informational hint only (see `nextStepFor`) -- never rendered as a control. */
  nextStep?: OrderNextStep | null;
  /** Receives the button that opened the detail, so focus can return to it on close. */
  onOpen: (trigger: HTMLButtonElement) => void;
}) {
  const { t, tp } = useStaffI18n();
  const completed = isCompletedStatus(order.status);
  const isReady = order.status === 'READY';
  const identity = order.customer
    ? order.customer.name
    : t('orders.card.table', { number: order.table?.tableNumber ?? '—' });
  const age = formatElapsedAge(order.createdAt, {
    t,
    tMinutes: (count) => t('orders.time.minutes', { count }),
    tHoursMinutes: (hours, minutes) =>
      t('orders.time.hoursMinutes', { hours, minutes: String(minutes).padStart(2, '0') }),
  });
  const isStalePending = order.status === 'PENDING' && elapsedMinutes(order.createdAt) >= STALE_PENDING_MINUTES;

  return (
    <article
      className={`flex flex-col gap-3 rounded-lg border border-s-4 border-border p-4 shadow-sm ${statusAccentClass(order.status)} ${
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
          className={`truncate text-start text-lg font-semibold ${completed ? 'text-muted-foreground' : 'text-foreground'}`}
        >
          {identity}
        </h3>
        {order.customer ? (
          <p dir="ltr" className="truncate text-start text-sm text-muted-foreground">
            {order.customer.phone}
          </p>
        ) : null}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {order.deliveryZoneName ? (
            <>
              <bdi dir="auto">{order.deliveryZoneName}</bdi> ·{' '}
            </>
          ) : null}
          <bdi dir="auto">{order.branch.name}</bdi> ·{' '}
          <span className={isStalePending ? 'font-semibold text-warning' : undefined}>{age}</span>
        </p>
        {nextStep ? (
          <p
            className={`mt-1.5 text-sm ${
              nextStep.kind === 'action' ? 'font-medium text-foreground' : 'text-muted-foreground'
            }`}
          >
            {nextStep.kind === 'action'
              ? t('orders.card.nextStep', { action: t(nextStep.labelKey) })
              : t(nextStep.labelKey)}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">
          {tp('common.items', order.itemCount)}
        </span>
        <span className={`font-semibold ${completed ? 'text-muted-foreground' : 'text-foreground'}`}>
          <bdi dir="ltr">
            {order.totalAmount} {order.currencyCode}
          </bdi>
        </span>
      </div>

      <button
        type="button"
        onClick={(event) => onOpen(event.currentTarget)}
        className={`w-full rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          isReady
            ? 'bg-success text-success-foreground hover:bg-success/90'
            : 'border border-border bg-card text-foreground hover:bg-muted'
        }`}
      >
        {t('orders.card.view')}
      </button>
    </article>
  );
}
