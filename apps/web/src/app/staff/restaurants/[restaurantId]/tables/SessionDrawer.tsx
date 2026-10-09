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
import type { SessionCapabilities } from '../../../../../lib/table-sessions/capabilities';
import type {
  PaymentMethod,
  SessionDetail,
  SessionPayment,
} from '../../../../../lib/table-sessions/types';
import { minutesBetween, useNow } from '../../../../../lib/table-sessions/use-now';
import { StatusBadge } from '../orders/StatusBadge';
import { BillPrintDialog } from './BillPrintDialog';
import {
  LifecycleBadge,
  Money,
  PaymentStatusBadge,
  useDurationLabel,
} from './SessionBadges';
import {
  CloseSessionDialog,
  RecordPaymentDialog,
  VoidPaymentDialog,
} from './SessionActionDialogs';

type OpenDialog =
  | { kind: 'close' }
  | { kind: 'pay' }
  | { kind: 'void'; payment: SessionPayment }
  | { kind: 'bill' }
  | null;

/**
 * Table Session detail panel (design v3). A bespoke right-hand panel (full
 * screen on a phone), like the Order detail: identity, lifecycle and payment
 * badges, the Backend-computed bill, the rounds with each order's own kitchen
 * status, the payment ledger and the audit history. Every amount and status
 * shown is exactly what the Backend returned; staff actions go through the
 * Backend and the panel simply re-renders the answer.
 */
export function SessionDrawer({
  restaurantId,
  sessionId,
  caps,
  onClose,
  onChanged,
}: {
  restaurantId: string;
  sessionId: string;
  caps: SessionCapabilities;
  onClose: () => void;
  /** Tell the parent a session changed so its board / unpaid list refreshes. */
  onChanged: () => void;
}) {
  const { t, tp, formatDateTime } = useStaffI18n();
  const durationLabel = useDurationLabel();
  const now = useNow();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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

  // Escape closes the panel -- but never while a nested dialog (which handles its own
  // Escape) is open. The latest handler is kept in a ref so re-renders never re-bind it.
  const onCloseRef = useRef(onClose);
  const nestedOpenRef = useRef(false);
  useEffect(() => {
    onCloseRef.current = onClose;
    nestedOpenRef.current = dialog !== null;
  });
  useEffect(() => {
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !nestedOpenRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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

  function handleClose(policy: 'KEEP' | 'REJECT' | undefined) {
    void run(
      () => sessionsApi.closeSession(restaurantId, sessionId, policy ? { pendingOrders: policy } : {}),
      t('sessions.notice.closed'),
      ['SESSION_HAS_PENDING_ORDERS'],
    );
  }

  function handlePay(input: {
    clientRequestId: string;
    method: PaymentMethod;
    expectedAmount: string;
    note: string;
  }) {
    void run(
      () =>
        sessionsApi.recordPayment(restaurantId, sessionId, {
          clientRequestId: input.clientRequestId,
          method: input.method,
          expectedAmount: input.expectedAmount,
          ...(input.note ? { note: input.note } : {}),
        }),
      t('sessions.notice.paid'),
      ['PAYMENT_AMOUNT_MISMATCH', 'NOTHING_TO_SETTLE', 'SESSION_NOT_CLOSED'],
    );
  }

  function handleVoid(paymentId: string, reason: string) {
    void run(
      () => sessionsApi.voidPayment(restaurantId, sessionId, paymentId, reason),
      t('sessions.notice.voided'),
      ['PAYMENT_ALREADY_VOIDED'],
    );
  }

  const endMs = detail?.closedAt ? new Date(detail.closedAt).getTime() : now;
  const minutes = detail ? minutesBetween(detail.openedAt, endMs) : 0;
  // Offered only when the BACKEND-derived status says money is owed on a closed session;
  // the Backend still validates the exact amount on submission.
  const balanceDue =
    detail !== null &&
    detail.status === 'CLOSED' &&
    (detail.bill.paymentStatus === 'UNPAID' || detail.bill.paymentStatus === 'PARTIALLY_PAID');

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
                  <PaymentStatusBadge status={detail.bill.paymentStatus} />
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
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconClose className="h-4 w-4" />
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
                {/* identity */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('sessions.detail.sessionId')}</dt>
                    <dd className="font-medium text-foreground">
                      <bdi dir="ltr">#{detail.id.replace(/^session-/, '').slice(0, 8).toUpperCase()}</bdi>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('sessions.detail.duration')}</dt>
                    <dd className="font-medium text-foreground">
                      <bdi dir="ltr">{durationLabel(minutes)}</bdi>
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
                  {balanceDue && caps.canSettle ? (
                    <Button
                      onClick={() => {
                        setActionError(null);
                        setDialog({ kind: 'pay' });
                      }}
                    >
                      {t('sessions.action.recordPayment')}
                    </Button>
                  ) : null}
                  {caps.canView ? (
                    <Button variant="secondary" onClick={() => setDialog({ kind: 'bill' })}>
                      {t('sessions.action.bill')}
                    </Button>
                  ) : null}
                </div>

                {/* bill (all amounts from the Backend) */}
                <section aria-labelledby="session-bill-title" className="rounded-lg border border-border p-4">
                  <h3 id="session-bill-title" className="text-sm font-semibold text-foreground">
                    {t('sessions.bill.title')}
                  </h3>
                  <dl className="mt-3 flex flex-col gap-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{t('sessions.bill.billed')}</dt>
                      <dd className="font-medium text-foreground">
                        <Money amount={detail.bill.eligibleTotal} currency={detail.currencyCode} />
                      </dd>
                    </div>
                    {detail.bill.pendingAmount !== '0.00' ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{t('sessions.bill.awaiting')}</dt>
                        <dd className="text-muted-foreground">
                          <Money amount={detail.bill.pendingAmount} currency={detail.currencyCode} />
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{t('sessions.bill.paid')}</dt>
                      <dd className="font-medium text-foreground">
                        <Money amount={detail.bill.paidAmount} currency={detail.currencyCode} />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 border-t border-border pt-2 text-base">
                      <dt className="font-semibold text-foreground">{t('sessions.bill.balance')}</dt>
                      <dd className="font-semibold text-foreground">
                        <Money amount={detail.bill.balance} currency={detail.currencyCode} />
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('sessions.bill.status')}</dt>
                      <dd>
                        <PaymentStatusBadge status={detail.bill.paymentStatus} />
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">{t('sessions.bill.serverNote')}</p>
                </section>

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
                          ? 'border-dashed border-border bg-muted/30'
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
                        <p className="mt-1 text-xs text-muted-foreground">{t('sessions.detail.notBilled')}</p>
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
                    </article>
                  ))}
                  {detail.excludedOrderCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {tp('sessions.detail.excluded', detail.excludedOrderCount)}
                    </p>
                  ) : null}
                </section>

                {/* payments */}
                <section aria-labelledby="session-payments-title" className="flex flex-col gap-3">
                  <h3 id="session-payments-title" className="text-sm font-semibold text-foreground">
                    {t('sessions.payments.title')}
                  </h3>
                  {detail.payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('sessions.payments.empty')}</p>
                  ) : null}
                  {detail.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className={`rounded-lg border border-border p-3 text-sm ${
                        payment.voided ? 'bg-muted/40 text-muted-foreground' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {t(`sessions.payments.method.${payment.method}` as const)}
                          {payment.voided ? (
                            <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                              {t('sessions.payments.voided')}
                            </span>
                          ) : null}
                        </span>
                        <span className={payment.voided ? 'line-through' : 'font-semibold text-foreground'}>
                          <Money amount={payment.amount} currency={detail.currencyCode} />
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs">
                        <bdi dir="ltr">{formatDateTime(payment.recordedAt)}</bdi>
                        {payment.note ? (
                          <>
                            {' · '}
                            <bdi dir="auto">{payment.note}</bdi>
                          </>
                        ) : null}
                      </p>
                      {payment.voided ? (
                        <p className="mt-1 text-xs">
                          {t('sessions.payments.voidReason', { reason: payment.voided.reason })}
                        </p>
                      ) : caps.canSettle ? (
                        <div className="mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActionError(null);
                              setDialog({ kind: 'void', payment });
                            }}
                          >
                            {t('sessions.action.voidPayment')}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {detail.status === 'OPEN' && caps.canSettle ? (
                    <p className="text-xs text-muted-foreground">{t('sessions.payments.closeFirst')}</p>
                  ) : null}
                  {detail.status === 'CLOSED' && balanceDue && caps.canSettle ? (
                    <p className="text-xs text-muted-foreground">{t('sessions.payments.settleHint')}</p>
                  ) : null}
                </section>

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
      {detail && dialog?.kind === 'pay' ? (
        <RecordPaymentDialog
          balance={detail.bill.balance}
          currency={detail.currencyCode}
          isSubmitting={isSubmitting}
          error={actionError}
          onConfirm={handlePay}
          onClose={closeDialog}
        />
      ) : null}
      {detail && dialog?.kind === 'void' ? (
        <VoidPaymentDialog
          amount={dialog.payment.amount}
          currency={detail.currencyCode}
          isSubmitting={isSubmitting}
          error={actionError}
          onConfirm={(reason) => handleVoid(dialog.payment.id, reason)}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.kind === 'bill' ? (
        <BillPrintDialog
          restaurantId={restaurantId}
          sessionId={sessionId}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
