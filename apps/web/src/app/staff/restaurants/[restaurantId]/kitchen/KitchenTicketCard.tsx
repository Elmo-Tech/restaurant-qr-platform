'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { KitchenStatus, KitchenTicket } from '../../../../../lib/kitchen/types';
import { elapsedMinutes, formatElapsedAge } from '../../../../../lib/orders/order-views';
import { Button } from '../../../../../components/ui/Button';
import { OrderTypeBadge } from '../orders/OrderTypeBadge';

/** A ticket still waiting or cooking for this long gets a warning, then an alert tint on its timer (fixed, never configurable in V1). */
const WARN_MINUTES = 10;
const ALERT_MINUTES = 20;

const ACCENT: Record<KitchenStatus, string> = {
  ACCEPTED: 'border-s-info',
  PREPARING: 'border-s-warning',
  READY: 'border-s-success',
};

/**
 * One Kitchen Ticket (STAFF_DASHBOARD_UX_SPEC #104-#108): who it is for, how
 * long it has been in this column, the items large enough to read from a
 * distance (quantity first, the size next to the name, options right under
 * the item), the Guest's note impossible to miss, and one big action.
 * Deliberately shows no prices, no phone number and no product description.
 */
export function KitchenTicketCard({
  ticket,
  now,
  canUpdate,
  busy,
  error,
  onAdvance,
}: {
  ticket: KitchenTicket;
  /** The current time (ms), owned by the board so every timer ticks together. */
  now: number;
  canUpdate: boolean;
  busy: boolean;
  error: string | null;
  onAdvance: (ticket: KitchenTicket) => void;
}) {
  const { t } = useStaffI18n();
  const reference = new Date(now);
  const minutes = elapsedMinutes(ticket.statusSince, reference);
  const age = formatElapsedAge(
    ticket.statusSince,
    {
      t,
      tMinutes: (count) => t('orders.time.minutes', { count }),
      tHoursMinutes: (hours, mins) =>
        t('orders.time.hoursMinutes', { hours, minutes: String(mins).padStart(2, '0') }),
    },
    reference,
  );
  const overdue = ticket.status !== 'READY';
  const ageClass =
    overdue && minutes >= ALERT_MINUTES
      ? 'bg-destructive-soft text-destructive'
      : overdue && minutes >= WARN_MINUTES
        ? 'bg-warning-soft text-warning'
        : 'bg-muted text-muted-foreground';

  const identity = ticket.table
    ? t('orders.card.table', { number: ticket.table.tableNumber })
    : (ticket.customerName ?? t(`orders.type.${ticket.type}` as const));

  return (
    <article
      className={`flex flex-col gap-4 rounded-xl border border-s-8 border-border bg-card p-4 shadow-sm ${ACCENT[ticket.status]}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-2xl font-extrabold leading-tight text-foreground">
            <bdi>{identity}</bdi>
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <OrderTypeBadge type={ticket.type} />
            {ticket.roundNumber !== null && ticket.roundNumber > 1 ? (
              <span className="rounded-md bg-foreground px-2 py-1 text-xs font-bold text-background">
                {t('kitchen.round', { number: ticket.roundNumber })}
              </span>
            ) : null}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-lg px-3 py-1.5 text-lg font-bold tabular-nums ${ageClass}`}
          title={new Date(ticket.statusSince).toLocaleTimeString()}
        >
          {age}
        </span>
      </header>

      {ticket.notes ? (
        <div className="rounded-lg border-2 border-warning bg-warning-soft px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-warning">{t('kitchen.note')}</p>
          <p dir="auto" className="mt-0.5 text-lg font-bold leading-snug text-foreground">
            {ticket.notes}
          </p>
        </div>
      ) : null}

      <ul className="flex flex-col divide-y divide-border">
        {ticket.items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-foreground px-2 text-2xl font-extrabold tabular-nums text-background">
              {item.quantity}
            </span>
            <div className="min-w-0 flex-1">
              <p dir="auto" className="text-xl font-bold leading-snug text-foreground">
                <bdi>{item.name}</bdi>
                {item.variantName ? (
                  <span className="ms-2 inline-block rounded-md bg-accent px-2 py-0.5 align-middle text-base font-bold text-accent-foreground">
                    <bdi>{item.variantName}</bdi>
                  </span>
                ) : null}
              </p>
              {item.modifiers.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {item.modifiers.map((modifier, modifierIndex) => (
                    <li
                      key={`${modifier.optionName}-${modifierIndex}`}
                      dir="auto"
                      className="text-base font-medium text-secondary-foreground"
                    >
                      + <bdi>{modifier.optionName}</bdi>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {ticket.status === 'READY' ? (
        <p className="rounded-lg bg-success-soft px-3 py-2.5 text-center text-base font-bold text-success">
          {t('kitchen.waitingService')}
        </p>
      ) : (
        <Button
          type="button"
          size="lg"
                    disabled={busy || !canUpdate}
          onClick={() => onAdvance(ticket)}
          className="min-h-14 w-full text-lg font-extrabold"
        >
          {ticket.status === 'ACCEPTED'
            ? t('orders.action.startPreparing')
            : t('orders.action.markReady')}
        </Button>
      )}
    </article>
  );
}
