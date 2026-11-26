'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { Translator } from '../../../../../lib/i18n/translate';
import type { KitchenStatus, KitchenTicket } from '../../../../../lib/kitchen/types';
import { groupKitchenModifiers, kitchenDelayLevel, type KitchenDelayLevel } from '../../../../../lib/kitchen/ticket-view';
import { elapsedMinutes, formatElapsedAge } from '../../../../../lib/orders/order-views';
import { Button } from '../../../../../components/ui/Button';
import { OrderTypeBadge } from '../orders/OrderTypeBadge';

const ACCENT: Record<KitchenStatus, string> = {
  ACCEPTED: 'border-s-info',
  PREPARING: 'border-s-warning',
  READY: 'border-s-success',
};

/** The timer's own caption: what the time counts. */
const TIMER_CAPTION = {
  ACCEPTED: 'kitchen.timer.accepted',
  PREPARING: 'kitchen.timer.preparing',
  READY: 'kitchen.timer.ready',
} as const satisfies Record<KitchenStatus, string>;

/**
 * A delay is never colour alone: the timer block also carries a word and an icon, and the whole card gets a
 * coloured outline so a late ticket stands out in a column of ten. Thresholds live in `lib/kitchen/ticket-view`.
 */
const DELAY_STYLE: Record<KitchenDelayLevel, { card: string; timer: string }> = {
  none: { card: '', timer: 'bg-muted text-foreground' },
  warn: { card: 'ring-2 ring-warning', timer: 'bg-warning-soft text-warning' },
  alert: { card: 'ring-4 ring-destructive', timer: 'bg-destructive-soft text-destructive' },
};

export function DelayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </svg>
  );
}

/** Who a ticket is for: the Table, else the customer name, else the order type. Also names a ticket that left the board. */
export function kitchenTicketLabel(ticket: KitchenTicket, t: Translator['t']): string {
  return ticket.table
    ? t('orders.card.table', { number: ticket.table.tableNumber })
    : (ticket.customerName ?? t(`orders.type.${ticket.type}` as const));
}

/** How long a ticket has been in its current stage, both as minutes and as the localized "26 min" text. */
export function kitchenTicketAge(ticket: KitchenTicket, now: number, t: Translator['t']): { minutes: number; age: string } {
  const reference = new Date(now);
  return {
    minutes: elapsedMinutes(ticket.statusSince, reference),
    age: formatElapsedAge(
      ticket.statusSince,
      {
        t,
        tMinutes: (count) => t('orders.time.minutes', { count }),
        tHoursMinutes: (hours, mins) =>
          t('orders.time.hoursMinutes', { hours, minutes: String(mins).padStart(2, '0') }),
      },
      reference,
    ),
  };
}

/** Feedback shown on the card: `error` for a refused action, `info` for what reconciliation found. */
export interface KitchenCardNotice {
  tone: 'error' | 'info';
  text: string;
}

/**
 * One Kitchen Ticket (STAFF_DASHBOARD_UX_SPEC #104-#108), laid out in reading
 * order: who it is for and what kind of order (identity, type, round), how
 * long it has waited in this stage (a delay adds a word, an icon and an
 * outline, never colour alone), the Guest's note, then each item -- quantity
 * first, the size next to the name, options under their own group name --
 * and one big action. Deliberately shows no prices, no phone number and no
 * product description. The Backend exposes no order number on a Kitchen
 * Ticket, so the Table / customer name is the ticket's identity.
 */
export function KitchenTicketCard({
  ticket,
  now,
  canUpdate,
  busy,
  notice,
  pending,
  checking,
  held = false,
  stickyAction = false,
  onAdvance,
  onCheckAgain,
}: {
  ticket: KitchenTicket;
  /** The current time (ms), owned by the board so every timer ticks together. */
  now: number;
  canUpdate: boolean;
  /** A status change for this ticket is in flight (or being reconciled). */
  busy: boolean;
  notice: KitchenCardNotice | null;
  /** The shown state is out of date or the last action's outcome is unknown: the action stays blocked until a fresh read. */
  pending: string | null;
  /** A read-only re-check is running. */
  checking: boolean;
  /**
   * Kitchen K3 (One Ticket Focus): the board moved the focus onto this ticket by itself, so its action waits
   * until the person has seen the change. It never replaces the K1 `pending` block.
   */
  held?: boolean;
  /** Phone focus view: the action stays reachable above the bottom navigation while a long ticket scrolls. */
  stickyAction?: boolean;
  onAdvance: (ticket: KitchenTicket) => void;
  /** Re-reads the board. Never retries the status change. */
  onCheckAgain: () => void;
}) {
  const { t, formatTime } = useStaffI18n();
  const { minutes, age } = kitchenTicketAge(ticket, now, t);
  const delay = kitchenDelayLevel(ticket.status, minutes);
  const delayStyle = DELAY_STYLE[delay];

  const identity = kitchenTicketLabel(ticket, t);

  return (
    <article
      className={`flex flex-col gap-4 rounded-xl border border-s-8 border-border bg-card p-4 shadow-sm ${ACCENT[ticket.status]} ${delayStyle.card}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-3xl font-extrabold leading-tight text-foreground">
            <bdi>{identity}</bdi>
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OrderTypeBadge type={ticket.type} size="lg" />
            {ticket.roundNumber !== null && ticket.roundNumber > 1 ? (
              <span className="rounded-md bg-foreground px-2.5 py-1 text-sm font-bold text-background">
                {t('kitchen.round', { number: ticket.roundNumber })}
              </span>
            ) : null}
          </div>
        </div>
        <div className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-2 ${delayStyle.timer}`}>
          {delay !== 'none' ? (
            <span className="flex items-center gap-1 text-sm font-extrabold">
              <DelayIcon />
              {t(delay === 'alert' ? 'kitchen.delay.alert' : 'kitchen.delay.warn')}
            </span>
          ) : null}
          <span className="text-xs font-semibold opacity-90">{t(TIMER_CAPTION[ticket.status])}</span>
          <time dateTime={ticket.statusSince} title={formatTime(ticket.statusSince)} className="text-2xl font-extrabold tabular-nums leading-tight">
            {age}
          </time>
        </div>
      </header>

      {ticket.notes ? (
        <div className="rounded-lg border-2 border-warning bg-warning-soft px-3 py-2">
          <p className="text-sm font-bold uppercase tracking-wide text-warning">{t('kitchen.note')}</p>
          <p dir="auto" className="mt-0.5 text-xl font-bold leading-snug text-foreground">
            {ticket.notes}
          </p>
        </div>
      ) : null}

      <ul className="flex flex-col divide-y divide-border">
        {ticket.items.map((item, index) => {
          const groups = groupKitchenModifiers(item.modifiers);
          return (
            <li key={`${item.name}-${index}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-lg bg-foreground px-2 text-3xl font-extrabold tabular-nums text-background">
                <span className="sr-only">{t('kitchen.item.quantity', { count: item.quantity })}</span>
                <span aria-hidden="true">{item.quantity}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p dir="auto" className="text-2xl font-bold leading-snug text-foreground">
                  <bdi>{item.name}</bdi>
                  {item.variantName ? (
                    <span className="ms-2 inline-block rounded-md bg-accent px-2 py-0.5 align-middle text-lg font-bold text-accent-foreground">
                      <span className="sr-only">{t('kitchen.item.size')}: </span>
                      <bdi>{item.variantName}</bdi>
                    </span>
                  ) : null}
                </p>
                {groups.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-2">
                    {groups.map((group, groupIndex) => (
                      <li key={`${group.groupName ?? ''}-${groupIndex}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {group.groupName ? (
                          <span dir="auto" className="text-sm font-semibold text-secondary-foreground">
                            <bdi>{group.groupName}</bdi>:
                          </span>
                        ) : null}
                        <ul aria-label={group.groupName ?? undefined} className="flex flex-wrap gap-1.5">
                          {group.options.map((option, optionIndex) => (
                            <li
                              key={`${option}-${optionIndex}`}
                              dir="auto"
                              className="rounded-md border border-border bg-muted px-2 py-0.5 text-lg font-semibold text-foreground"
                            >
                              <bdi>{option}</bdi>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={
            notice.tone === 'error'
              ? 'text-sm font-medium text-destructive'
              : 'rounded-lg bg-info-soft px-3 py-2 text-sm font-medium text-foreground'
          }
        >
          {notice.text}
        </p>
      ) : null}

      {pending ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning bg-warning-soft px-3 py-2">
          <p role="status" className="min-w-0 flex-1 text-sm font-medium text-foreground">
            {pending}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 aria-disabled:cursor-wait aria-disabled:opacity-60"
            aria-disabled={checking || undefined}
            onClick={() => {
              if (!checking) onCheckAgain();
            }}
          >
            {checking ? t('kitchen.checking') : t('kitchen.checkAgain')}
          </Button>
        </div>
      ) : null}

      {ticket.status === 'READY' ? (
        <p className="rounded-lg bg-success-soft px-3 py-2.5 text-center text-base font-bold text-success">
          {t('kitchen.waitingService')}
        </p>
      ) : (
        <Button
          type="button"
          size="lg"
          disabled={busy || pending !== null || !canUpdate || held}
          aria-busy={busy || undefined}
          onClick={() => onAdvance(ticket)}
          className={`min-h-14 w-full text-lg font-extrabold ${
            stickyAction
              ? 'sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 shadow-[0_0_0_6px_var(--color-card)]'
              : ''
          }`}
        >
          {busy
            ? t('kitchen.action.updating')
            : ticket.status === 'ACCEPTED'
              ? t('orders.action.startPreparing')
              : t('orders.action.markReady')}
        </Button>
      )}
    </article>
  );
}
