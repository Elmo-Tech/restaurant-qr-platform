'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { IconClose } from '../../../../../components/staff/icons';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { ApiError } from '../../../../../lib/api/errors';
import * as sessionsApi from '../../../../../lib/table-sessions/api';
import * as ordersApi from '../../../../../lib/orders/api';
import type { OrderStatus } from '../../../../../lib/orders/types';
import { RoundActions } from './RoundActions';
import type { SessionCapabilities } from '../../../../../lib/table-sessions/capabilities';
import type { SessionDetail, SessionRound } from '../../../../../lib/table-sessions/types';
import { minutesBetween, useNow } from '../../../../../lib/table-sessions/use-now';
import { StatusBadge } from '../orders/StatusBadge';
import { BillPrintDialog } from './BillPrintDialog';
import { LifecycleBadge, Money, useDurationLabel } from './SessionBadges';
import { CloseSessionDialog } from './SessionActionDialogs';

export type SessionDrawerIntent = 'close' | 'summary';

type OpenDialog = { kind: 'close' } | { kind: 'summary' } | null;

/**
 * Table Session detail panel (design v3, V1 scope correction). A bespoke
 * right-hand panel (full screen on a phone), like the Order detail: identity,
 * lifecycle badge, the Backend-computed order totals, the rounds with each
 * order's own kitchen status and the audit history. The platform manages no
 * payments, so nothing here records, shows or implies one. Every amount shown
 * is exactly what the Backend returned; staff actions go through the Backend
 * and the panel simply re-renders the answer.
 *
 * `intent` lets a board card jump straight to the close dialog or the order
 * summary; both still run on this panel, so there is one implementation.
 */
export function SessionDrawer({
  restaurantId,
  sessionId,
  caps,
  permissions,
  intent,
  onClose,
  onChanged,
}: {
  restaurantId: string;
  sessionId: string;
  caps: SessionCapabilities;
  /** The Membership's permission keys: only the order actions they allow are offered (the Backend enforces). */
  permissions: string[];
  intent?: SessionDrawerIntent;
  onClose: () => void;
  /** Tell the parent a session changed so its board / history refreshes. */
  onChanged: () => void;
}) {
  const { t, tp, formatDateTime } = useStaffI18n();
  const durationLabel = useDurationLabel();
  const now = useNow();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(
    intent === 'summary' ? { kind: 'summary' } : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Order control: one action at a time, with its error shown on the order it concerns.
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<{ orderId: string; message: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const intentHandledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const fresh = await sessionsApi.getSession(restaurantId, sessionId);
      setDetail(fresh);
      setLoadError(null);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setLoadError(describeError(error));
    }
  }, [restaurantId, sessionId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  // A "Close session" entered from a board card opens the close dialog once the
  // session has loaded -- and only when it is still OPEN and closable.
  useEffect(() => {
    if (intent !== 'close' || intentHandledRef.current || !detail) return;
    intentHandledRef.current = true;
    if (detail.status === 'OPEN' && caps.canClose) {
      queueMicrotask(() => setDialog({ kind: 'close' }));
    }
  }, [intent, detail, caps.canClose]);

  // Escape closes the panel -- but never while a nested dialog (which handles its own
  // Escape) is open. The latest handler is kept in a ref so re-renders never re-bind it.
  const onCloseRef = useRef(onClose);
  const nestedOpenRef = useRef(false);
  useEffect(() => {
    onCloseRef.current = onClose;
    nestedOpenRef.current = dialog !== null;
  });
  useEffect(() => {
    // Remember what opened the panel (a card's action or menu) and hand focus back
    // to it when the panel goes away, so keyboard users keep their place.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !nestedOpenRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (opener && opener.isConnected && opener !== document.body) opener.focus();
    };
  }, []);

  function closeDialog() {
    if (isSubmitting) return;
    setDialog(null);
    setActionError(null);
  }

  /** Runs one staff action; on success re-renders the Backend's answer, on failure shows the stable error. */
  async function run(
    action: () => Promise<SessionDetail>,
    successNotice: string,
    refreshOnCodes: string[] = [],
  ) {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const updated = await action();
      setDetail(updated);
      setDialog(null);
      setNotice(successNotice);
      onChanged();
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setActionError(describeError(error));
      if (error instanceof ApiError && refreshOnCodes.includes(error.code)) {
        // The numbers the staff member saw are stale: show the current ones.
        await load();
        onChanged();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * The same action the Orders page performs: PATCH the order status with the
   * status we saw (`expectedStatus`), then re-read the session so every total,
   * badge and the board reflect what the Backend now says. A stale order is
   * reported the same way the Orders page reports it.
   */
  async function handleOrderTransition(round: SessionRound, to: OrderStatus) {
    if (busyOrderId) return;
    const orderId = round.order.id;
    setBusyOrderId(orderId);
    setOrderError(null);
    try {
      await ordersApi.updateOrderStatus(restaurantId, orderId, {
        expectedStatus: round.order.status,
        status: to,
      });
      await load();
      onChanged();
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      // Whatever went wrong, the order may have moved on (another device, the kitchen):
      // show the stable message AND the real current state, never leave stale buttons.
      setOrderError({
        orderId,
        message:
          error instanceof ApiError && error.code === 'ORDER_STATUS_CHANGED'
            ? t('orders.transitionStale')
            : describeError(error),
      });
      await load();
      onChanged();
    } finally {
      setBusyOrderId(null);
    }
  }

  function handleClose(policy: 'KEEP' | 'REJECT' | undefined) {
    void run(
      () => sessionsApi.closeSession(restaurantId, sessionId, policy ? { pendingOrders: policy } : {}),
      t('sessions.notice.closed'),
      ['SESSION_HAS_PENDING_ORDERS'],
    );
  }

  const showAwaiting =
    detail !== null &&
    (detail.pendingOrderCount > 0 || detail.totals.pendingTotal !== '0.00');
  const endMs = detail?.closedAt ? new Date(detail.closedAt).getTime() : now;
  const minutes = detail ? minutesBetween(detail.openedAt, endMs) : 0;

  return (
    <>
      <div className="fixed inset-0 z-40 print:hidden">
        <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden="true" />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-drawer-title"
          className="absolute inset-y-0 end-0 flex w-full flex-col bg-card shadow-xl sm:max-w-[600px] sm:border-s sm:border-border"
        >
          <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              {detail ? (
                <div className="flex flex-wrap items-center gap-2">
                  <LifecycleBadge status={detail.status} />
                </div>
              ) : null}
              <h2
                id="session-drawer-title"
                dir="auto"
                className="mt-2 truncate text-start text-xl font-semibold text-foreground"
              >
                {detail
                  ? t('sessions.detail.title', { number: detail.table.tableNumber })
                  : t('sessions.detail.loading')}
              </h2>
              {detail ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  <bdi dir="auto">{detail.branch.name}</bdi>
                </p>
              ) : null}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t('sessions.action.closeDrawer')}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconClose className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {notice ? (
              <div className="mb-4">
                <Alert variant="success">{notice}</Alert>
              </div>
            ) : null}
            {loadError ? (
              <Alert variant="error">
                <div className="flex items-center justify-between gap-4">
                  <span>{loadError}</span>
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    {t('common.retry')}
                  </Button>
                </div>
              </Alert>
            ) : null}
            {!detail && !loadError ? <LoadingState label={t('sessions.detail.loading')} /> : null}

            {detail ? (
              <div className="flex flex-col gap-6">
                {/* order totals (all amounts from the Backend): accepted = counted, awaiting = not counted */}
                <section aria-labelledby="session-total-title" className="flex flex-col gap-2">
                  <h3 id="session-total-title" className="sr-only">
                    {t('sessions.summary.title')}
                  </h3>
                  <div
                    className={`grid gap-3 ${showAwaiting ? 'sm:grid-cols-2' : 'grid-cols-1'}`}
                  >
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t('sessions.summary.accepted')}
                      </p>
                      <p className="mt-1 text-2xl font-bold leading-tight text-foreground">
                        <Money amount={detail.totals.acceptedTotal} currency={detail.currencyCode} />
                      </p>
                    </div>
                    {showAwaiting ? (
                      <div className="rounded-xl border border-dashed border-warning/50 bg-warning-soft/60 p-4">
                        <p className="text-xs font-medium text-warning">{t('sessions.summary.awaiting')}</p>
                        <p className="mt-1 text-2xl font-bold leading-tight text-foreground">
                          <Money amount={detail.totals.pendingTotal} currency={detail.currencyCode} />
                        </p>
                        {detail.pendingOrderCount > 0 ? (
                          <p className="mt-1 text-xs font-semibold text-warning">
                            {tp('sessions.card.pending', detail.pendingOrderCount)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{t('sessions.summary.serverNote')}</p>
                </section>

                {/* actions */}
                <div className="flex flex-wrap gap-2">
                  {detail.status === 'OPEN' && caps.canClose ? (
                    <Button
                      variant="danger"
                      onClick={() => {
                        setActionError(null);
                        setDialog({ kind: 'close' });
                      }}
                    >
                      {t('sessions.action.close')}
                    </Button>
                  ) : null}
                  {caps.canView ? (
                    <Button variant="secondary" onClick={() => setDialog({ kind: 'summary' })}>
                      {t('sessions.action.summary')}
                    </Button>
                  ) : null}
                </div>

                {/* rounds */}
                <section aria-labelledby="session-rounds-title" className="flex flex-col gap-3">
                  <h3 id="session-rounds-title" className="text-sm font-semibold text-foreground">
                    {t('sessions.detail.rounds')}
                  </h3>
                  {detail.rounds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('sessions.detail.noOrders')}</p>
                  ) : null}
                  {detail.rounds.map((round) => (
                    <article
                      key={round.order.id}
                      className={`rounded-lg border p-3 ${
                        round.order.status === 'PENDING'
                          ? 'border-dashed border-warning/50 bg-warning-soft/40'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {t('sessions.detail.round', { number: round.roundNumber })}
                          </span>
                          <StatusBadge status={round.order.status} type={round.order.type} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          <bdi dir="ltr">{formatDateTime(round.order.createdAt)}</bdi>
                        </span>
                      </div>
                      {round.order.status === 'PENDING' ? (
                        <p className="mt-1 text-xs font-medium text-warning">{t('sessions.detail.notCounted')}</p>
                      ) : null}
                      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                        {round.order.items.map((item, index) => (
                          <li key={`${item.productId}-${index}`}>
                            <div className="flex justify-between gap-3">
                              <span className="min-w-0">
                                <bdi dir="ltr">{item.quantity}×</bdi>{' '}
                                <bdi dir="auto">{item.productNameSnapshot}</bdi>
                              </span>
                              <span className="whitespace-nowrap text-foreground">
                                <Money amount={item.lineTotal} currency={round.order.currencyCode} />
                              </span>
                            </div>
                            {item.modifiers.map((modifier, modifierIndex) => (
                              <p key={modifierIndex} className="ps-4 text-xs text-muted-foreground">
                                + <bdi dir="auto">{modifier.groupName}</bdi>:{' '}
                                <bdi dir="auto">{modifier.optionName}</bdi>
                                {modifier.priceAdjustment !== '0.00' ? (
                                  <>
                                    {' '}
                                    <bdi dir="ltr">+{modifier.priceAdjustment}</bdi>
                                  </>
                                ) : null}
                              </p>
                            ))}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 flex justify-between gap-3 border-t border-border pt-2 text-sm font-semibold text-foreground">
                        <span>&nbsp;</span>
                        <Money amount={round.order.totalAmount} currency={round.order.currencyCode} />
                      </p>
                      <RoundActions
                        round={round}
                        permissions={permissions}
                        busy={busyOrderId === round.order.id}
                        disabled={busyOrderId !== null}
                        error={orderError?.orderId === round.order.id ? orderError.message : null}
                        onTransition={(to) => void handleOrderTransition(round, to)}
                      />
                    </article>
                  ))}
                  {detail.excludedOrderCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {tp('sessions.detail.excluded', detail.excludedOrderCount)}
                    </p>
                  ) : null}
                </section>

                {/* session facts */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-5 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('sessions.detail.sessionId')}</dt>
                    <dd className="font-medium text-foreground">
                      <bdi dir="ltr">#{detail.id.replace(/^session-/, '').slice(0, 8).toUpperCase()}</bdi>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('sessions.detail.duration')}</dt>
                    <dd className="font-medium text-foreground">
                      <bdi dir="auto">{durationLabel(minutes)}</bdi>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('sessions.detail.opened')}</dt>
                    <dd className="font-medium text-foreground">
                      <bdi dir="ltr">{formatDateTime(detail.openedAt)}</bdi>
                    </dd>
                    <dd className="text-xs text-muted-foreground">
                      {t(`sessions.detail.openedVia.${detail.openedVia}` as const)}
                    </dd>
                  </div>
                  {detail.closedAt ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('sessions.detail.closed')}</dt>
                      <dd className="font-medium text-foreground">
                        <bdi dir="ltr">{formatDateTime(detail.closedAt)}</bdi>
                      </dd>
                      {detail.closureReason ? (
                        <dd className="text-xs text-muted-foreground">
                          {t(`sessions.detail.closure.${detail.closureReason}` as const)}
                        </dd>
                      ) : null}
                    </div>
                  ) : null}
                </dl>

                {/* history */}
                <section aria-labelledby="session-history-title" className="flex flex-col gap-2">
                  <h3 id="session-history-title" className="text-sm font-semibold text-foreground">
                    {t('sessions.history.title')}
                  </h3>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {detail.events.map((event, index) => (
                      <li key={index} className="flex flex-wrap justify-between gap-2">
                        <span>
                          {t(`sessions.history.${event.type}` as const)}
                          <span className="text-xs text-muted-foreground">
                            {' · '}
                            {t(`sessions.history.actor.${event.actorType}` as const)}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <bdi dir="ltr">{formatDateTime(event.occurredAt)}</bdi>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {detail && dialog?.kind === 'close' ? (
        <CloseSessionDialog
          pendingCount={detail.pendingOrderCount}
          canRejectOrders={caps.canRejectOrders}
          isSubmitting={isSubmitting}
          error={actionError}
          onConfirm={handleClose}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.kind === 'summary' ? (
        <BillPrintDialog
          restaurantId={restaurantId}
          sessionId={sessionId}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
