'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { KitchenFocus, FocusNotice } from '../../../../../lib/kitchen/focus';
import { kitchenDelayLevel } from '../../../../../lib/kitchen/ticket-view';
import type { KitchenStatus, KitchenTicket } from '../../../../../lib/kitchen/types';
import { Button } from '../../../../../components/ui/Button';
import { OrderTypeBadge } from '../orders/OrderTypeBadge';
import { DelayIcon, kitchenTicketAge, kitchenTicketLabel } from './KitchenTicketCard';
import {
  KITCHEN_TABPANEL_ID,
  KitchenStageTabs,
  kitchenTabId,
  type KitchenStageTab,
} from './KitchenStageTabs';

/** What the board tells the person about a focused ticket that left its stage. `covered`: K1's board notice already says so. */
export interface FocusNoticeView {
  notice: FocusNotice;
  covered: boolean;
}

function Chevron({ direction }: { direction: 'previous' | 'next' }) {
  // Drawn for LTR; `rtl:-scale-x-100` mirrors it so "next" always points the way the page reads on.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`size-5 shrink-0 ${direction === 'previous' ? 'rtl:-scale-x-100' : '-scale-x-100 rtl:scale-x-100'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

/**
 * Kitchen K3: Three Stage Tabs + One Ticket Focus, below the large breakpoint.
 * The three stages are tabs with live counts; under them exactly one ticket is
 * shown in full -- the focused one -- with a compact list of the stage's other
 * tickets (identity, type, how long, a delay word and icon) to jump to. The
 * focus is the board's, held by the ticket's stable id (see `lib/kitchen/focus`);
 * this view only draws it and reports what the person chose. The ticket and its
 * action are rendered by the same `renderCard` the desktop columns use, so
 * every K1 safeguard and K2 detail is the same code.
 */
export function KitchenFocusView({
  tabs,
  focus,
  tickets,
  emptyLabel,
  now,
  notice,
  renderCard,
  onSelectStage,
  onSelectTicket,
  onStep,
  onAcknowledge,
  onShowMoved,
  onDismissNotice,
}: {
  tabs: readonly KitchenStageTab[];
  focus: KitchenFocus;
  /** The current stage's tickets in K2 time-priority order. */
  tickets: readonly KitchenTicket[];
  emptyLabel: string;
  now: number;
  notice: FocusNoticeView | null;
  renderCard: (ticket: KitchenTicket, extra: { held: boolean; stickyAction: boolean }) => ReactNode;
  onSelectStage: (stage: KitchenStatus) => void;
  onSelectTicket: (ticketId: string) => void;
  onStep: (delta: -1 | 1) => void;
  onAcknowledge: () => void;
  onShowMoved: (ticketId: string, stage: KitchenStatus) => void;
  onDismissNotice: () => void;
}) {
  const { t } = useStaffI18n();
  const regionRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<string | null>(focus.ticketId);
  const columnLabel = tabs.find((tab) => tab.stage === focus.stage)?.label ?? '';

  const focused = tickets.find((ticket) => ticket.id === focus.ticketId) ?? null;
  const index = focused ? tickets.indexOf(focused) : -1;
  const others = tickets.filter((ticket) => ticket.id !== focus.ticketId);
  const awaitingConfirmation = focus.guard.kind === 'confirm' && focus.guard.ticketId === focus.ticketId;
  const held = focus.guard.kind !== 'none' && focus.guard.ticketId === focus.ticketId;
  const movedTo = notice?.notice.kind === 'moved' ? notice.notice.to : null;

  // Focus recovery: when the focused ticket changes and the element the person was on went away with it
  // (the finished ticket's button, or the row they tapped), keyboard and screen-reader focus lands on the
  // ticket now in focus instead of falling back to the top of the page. A control that is still on screen
  // (Previous / Next, a tab) keeps its focus.
  useEffect(() => {
    if (shownRef.current === focus.ticketId) return;
    shownRef.current = focus.ticketId;
    const active = document.activeElement;
    if (focus.ticketId !== null && (active === null || active === document.body)) regionRef.current?.focus();
  }, [focus.ticketId]);

  return (
    <div className="flex flex-col gap-4">
      <KitchenStageTabs
        tabs={tabs}
        value={focus.stage}
        onChange={onSelectStage}
        ariaLabel={t('kitchen.columns')}
        countLabel={(tab) => t('kitchen.tab.count', { column: tab.label, count: tab.count })}
      />

      <div
        role="tabpanel"
        id={KITCHEN_TABPANEL_ID}
        aria-labelledby={kitchenTabId(focus.stage)}
        className="flex flex-col gap-4"
      >
        {notice || awaitingConfirmation ? (
          <div className="flex flex-col gap-3 rounded-xl border-2 border-info bg-info-soft p-3">
            {notice && !notice.covered ? (
              <p dir="auto" className="text-base font-bold text-foreground">
                {movedTo
                  ? t('kitchen.focus.moved', {
                      label: notice.notice.label,
                      column: tabs.find((tab) => tab.stage === movedTo)?.label ?? '',
                    })
                  : t('kitchen.focus.removed', { label: notice.notice.label })}
              </p>
            ) : null}
            {awaitingConfirmation && focus.label ? (
              <p dir="auto" className="text-base font-medium text-foreground">
                {t('kitchen.focus.nowShowing', { label: focus.label })}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {notice && movedTo ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => onShowMoved(notice.notice.ticketId, movedTo)}
                >
                  {t('kitchen.focus.showIt')}
                </Button>
              ) : null}
              {awaitingConfirmation ? (
                <Button type="button" className="min-h-11" onClick={onAcknowledge}>
                  {t('kitchen.focus.continue')}
                </Button>
              ) : (
                <Button type="button" variant="secondary" className="min-h-11" onClick={onDismissNotice}>
                  {t('kitchen.dismiss')}
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {focused ? (
          <>
            {tickets.length > 1 ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  aria-disabled={index <= 0 || undefined}
                  onClick={() => {
                    if (index > 0) onStep(-1);
                  }}
                  className="min-h-11 justify-self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                >
                  <Chevron direction="previous" />
                  {t('kitchen.focus.previous')}
                </Button>
                <p className="text-sm font-bold tabular-nums text-foreground">
                  {t('kitchen.focus.position', { position: String(index + 1), total: String(tickets.length) })}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  aria-disabled={index >= tickets.length - 1 || undefined}
                  onClick={() => {
                    if (index < tickets.length - 1) onStep(1);
                  }}
                  className="min-h-11 justify-self-end aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                >
                  {t('kitchen.focus.next')}
                  <Chevron direction="next" />
                </Button>
              </div>
            ) : null}

            {/* The ticket in focus. Keyed by id: a different ticket is a different element, never a re-labelled one. */}
            <div
              key={focused.id}
              ref={regionRef}
              tabIndex={-1}
              role="group"
              aria-label={`${focus.label ?? ''} · ${t('kitchen.focus.position', {
                position: String(index + 1),
                total: String(tickets.length),
              })}`}
              className="rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-ring"
            >
              {renderCard(focused, { held, stickyAction: true })}
            </div>

            {others.length > 0 ? (
              <section aria-label={t('kitchen.focus.others', { column: columnLabel })} className="flex flex-col gap-2">
                <h2 className="px-1 text-sm font-bold text-muted-foreground">
                  {t('kitchen.focus.others', { column: columnLabel })}
                </h2>
                <ol className="flex flex-col gap-2">
                  {others.map((ticket) => {
                    const label = kitchenTicketLabel(ticket, t);
                    const { minutes, age } = kitchenTicketAge(ticket, now, t);
                    const delay = kitchenDelayLevel(ticket.status, minutes);
                    return (
                      <li key={ticket.id}>
                        <button
                          type="button"
                          aria-label={`${t('kitchen.focus.showTicket', { label })}, ${age}${
                            delay === 'none' ? '' : `, ${t(delay === 'alert' ? 'kitchen.delay.alert' : 'kitchen.delay.warn')}`
                          }`}
                          onClick={() => onSelectTicket(ticket.id)}
                          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2 text-start outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="flex min-w-0 flex-col items-start gap-1">
                            <span className="max-w-full break-words text-lg font-extrabold leading-tight text-foreground">
                              <bdi>{label}</bdi>
                            </span>
                            <OrderTypeBadge type={ticket.type} />
                          </span>
                          <span
                            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-extrabold tabular-nums ${
                              delay === 'alert'
                                ? 'bg-destructive-soft text-destructive'
                                : delay === 'warn'
                                  ? 'bg-warning-soft text-warning'
                                  : 'bg-muted text-foreground'
                            }`}
                          >
                            {delay !== 'none' ? (
                              <>
                                <DelayIcon />
                                <span>{t(delay === 'alert' ? 'kitchen.delay.alert' : 'kitchen.delay.warn')}</span>
                                <span aria-hidden="true">·</span>
                              </>
                            ) : null}
                            {age}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm font-medium text-muted-foreground">
            {emptyLabel}
          </p>
        )}
      </div>
    </div>
  );
}
