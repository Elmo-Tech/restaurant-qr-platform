'use client';

import { useEffect, useRef } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { IconClose } from '../../../../../components/staff/icons';
import { fromMinorUnits, toMinorUnits } from '../../../../../lib/public-menu/money';
import type { OrderDetail, OrderStatus } from '../../../../../lib/orders/types';
import {
  isDestructiveTransition as isDestructive,
  TRANSITION_LABEL_KEYS as TRANSITION_KEYS,
  type OrderTransitionOption,
} from '../../../../../lib/orders/transitions';
import { formatOrderTime } from '../../../../../lib/orders/order-views';
import { OrderReceipt } from './OrderReceipt';
import { OrderTimeline } from './OrderTimeline';
import { OrderTypeBadge } from './OrderTypeBadge';
import { StatusBadge } from './StatusBadge';

/**
 * FT-5/FT-7B, Section 26: a focused, non-form Order detail panel --
 * deliberately NOT built on `components/ui/Dialog.tsx` (form-shaped, wrong
 * fit here), mirroring the `QrPreviewDialog`/`CartDrawer` bespoke-shell
 * precedent. No editing of quantities/items/payment in V1 -- purely a
 * read-only detail view plus the NEXT valid status action(s) (Section 25:
 * never an invalid transition button). FT-7B only reorganizes the hierarchy:
 * identity + status/type + Branch/time, Pickup details grouped, clear item
 * lines, a strong total, and one dominant primary action with
 * Reject/Cancel visually separate.
 */
export function OrderDetailDialog({
  order,
  restaurantLogoUrl = null,
  availableTransitions,
  isTransitioning,
  transitionError,
  onTransition,
  onClose,
}: {
  order: OrderDetail;
  restaurantLogoUrl?: string | null;
  availableTransitions: OrderTransitionOption[];
  isTransitioning: boolean;
  transitionError: string | null;
  onTransition: (to: OrderStatus) => void;
  onClose: () => void;
}) {
  const { t, formatDateTime, formatTime, formatDayMonth } = useStaffI18n();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // `onClose` is a fresh function on every parent render, and the parent
  // re-renders on every ~10s poll: keep the latest handler in a ref and
  // focus the close button once on mount, so a background refresh never
  // steals focus or re-binds the key listener.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isPickup = order.type === 'PICKUP';
  const isDelivery = order.type === 'DELIVERY';
  const identity = isPickup
    ? (order.customer?.name ?? t('orders.detail.pickupOrder'))
    : isDelivery
      ? (order.customer?.name ?? t('orders.detail.deliveryOrder'))
      : t('orders.card.table', { number: order.table?.tableNumber ?? '—' });

  const destructiveTransitions = availableTransitions.filter((option) => isDestructive(option.to));
  const forwardTransitions = availableTransitions.filter((option) => !isDestructive(option.to));

  // The stored statuses never change with the order type; only the wording
  // does: Pickup "Mark picked up", Delivery "Out for delivery" / "Mark delivered".
  function transitionLabel(to: OrderStatus): string {
    if (to === 'SERVED' && isPickup) return t('orders.action.markPickedUp');
    if (to === 'SERVED' && isDelivery) return t('orders.action.markDelivered');
    return t(TRANSITION_KEYS[to]);
  }
  const showFee = isDelivery;
  const hasDiscount = order.discountTotal !== '0.00';

  return (
    <>
    {/* Print-only receipt, portalled to <body> (see OrderReceipt): never nested under the print:hidden dialog. */}
    <OrderReceipt order={order} logoUrl={restaurantLogoUrl} />
    <div className="fixed inset-0 z-50 print:hidden">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-0 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-detail-title"
          className="pointer-events-auto flex h-full w-full flex-col bg-card shadow-xl sm:h-auto sm:max-h-[calc(100vh-64px)] sm:max-w-[520px] sm:rounded-lg"
        >
          <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={order.status} type={order.type} />
                <OrderTypeBadge type={order.type} />
              </div>
              <h2
                id="order-detail-title"
                dir="auto"
                className="mt-2 truncate text-start text-xl font-semibold text-foreground"
              >
                {identity}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                <bdi dir="auto">{order.branch.name}</bdi> ·{' '}
                {formatOrderTime(order.createdAt, {
                  t,
                  tMinutes: (count) => t('orders.time.minutesAgo', { count }),
                  formatTime,
                  formatDayMonth,
                })}{' '}
                · <bdi dir="ltr">{formatDateTime(order.createdAt)}</bdi>
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            {transitionError ? <Alert variant="error">{transitionError}</Alert> : null}

            {isPickup && order.customer ? (
              <section aria-labelledby="pickup-details-title" className="rounded-lg bg-info-soft/60 px-4 py-3">
                <h3
                  id="pickup-details-title"
                  className="mb-2 text-xs font-semibold uppercase tracking-wide text-info"
                >
                  {t('orders.detail.pickupDetails')}
                </h3>
                <dl className="flex flex-col gap-1.5 text-sm text-foreground">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('orders.detail.branch')}</dt>
                    <dd dir="auto" className="text-end font-medium">{order.branch.name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('orders.detail.customer')}</dt>
                    <dd dir="auto" className="text-end font-medium">{order.customer.name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('orders.detail.phone')}</dt>
                    <dd dir="ltr" className="text-end font-medium">
                      {order.customer.phone}
                    </dd>
                  </div>
                  {order.customer.notes ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t('orders.detail.notes')}</dt>
                      <dd dir="auto" className="text-end">{order.customer.notes}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            {isDelivery && order.customer && order.delivery ? (
              <section aria-labelledby="delivery-details-title" className="rounded-lg bg-delivery-soft/70 px-4 py-3">
                <h3
                  id="delivery-details-title"
                  className="mb-2 text-xs font-semibold uppercase tracking-wide text-delivery"
                >
                  {t('orders.detail.deliveryDetails')}
                </h3>
                <dl className="flex flex-col gap-1.5 text-sm text-foreground">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('orders.detail.branch')}</dt>
                    <dd dir="auto" className="text-end font-medium">{order.branch.name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('orders.detail.customer')}</dt>
                    <dd dir="auto" className="text-end font-medium">{order.customer.name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('orders.detail.phone')}</dt>
                    <dd dir="ltr" className="text-end font-medium">
                      {order.customer.phone}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('orders.detail.deliveryArea')}</dt>
                    <dd dir="auto" className="text-end font-medium">{order.delivery.zoneName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('orders.detail.address')}</dt>
                    <dd dir="auto" className="text-end font-medium">{order.delivery.address}</dd>
                  </div>
                  {order.delivery.building ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t('orders.detail.building')}</dt>
                      <dd dir="auto" className="text-end">{order.delivery.building}</dd>
                    </div>
                  ) : null}
                  {order.delivery.floor ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t('orders.detail.floor')}</dt>
                      <dd dir="auto" className="text-end">{order.delivery.floor}</dd>
                    </div>
                  ) : null}
                  {order.delivery.apartment ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t('orders.detail.apartment')}</dt>
                      <dd dir="auto" className="text-end">{order.delivery.apartment}</dd>
                    </div>
                  ) : null}
                  {order.delivery.landmark ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t('orders.detail.landmark')}</dt>
                      <dd dir="auto" className="text-end">{order.delivery.landmark}</dd>
                    </div>
                  ) : null}
                  {order.customer.notes ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t('orders.detail.notes')}</dt>
                      <dd dir="auto" className="text-end">{order.customer.notes}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            <section aria-labelledby="order-items-title">
              <h3
                id="order-items-title"
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {t('orders.detail.items')}
              </h3>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {order.items.map((item, index) => (
                  <li
                    key={`${item.productId}-${index}`}
                    className="flex items-start justify-between gap-3 px-3 py-3"
                  >
                    <div className="flex min-w-0 gap-3">
                      <span className="mt-0.5 inline-flex h-6 min-w-[2rem] flex-shrink-0 items-center justify-center rounded-md bg-muted px-1.5 text-sm font-semibold text-foreground">
                        {item.quantity}×
                      </span>
                      <div className="min-w-0">
                        <p dir="auto" className="text-start text-sm font-semibold text-foreground">
                          {item.productNameSnapshot}{item.variantName ? ` · ${item.variantName}` : ''}
                        </p>
                        {/* FT-6A, ORDER_LIFECYCLE_SPEC.md #41: the exact
                            Modifier selections snapshotted at submission
                            time -- never re-derived from the live (possibly
                            since-changed) Modifier configuration. */}
                        {item.modifiers.length > 0 ? (
                          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                            {item.modifiers.map((modifier, modifierIndex) => (
                              <li key={modifierIndex}>
                                <bdi dir="auto">{modifier.groupName}</bdi>:{' '}
                                <bdi dir="auto">{modifier.optionName}</bdi>
                                {modifier.priceAdjustment !== '0.00' ? (
                                  <bdi dir="ltr"> (+{modifier.priceAdjustment})</bdi>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          <bdi dir="ltr">
                            {t('orders.detail.each', { price: item.unitPrice, currency: order.currencyCode })}
                          </bdi>
                        </p>
                        {item.discountAmount !== '0.00' ? (
                          <p className="mt-0.5 text-xs font-semibold text-success">
                            <bdi dir="ltr">
                              {t('orders.detail.itemDiscount', {
                                amount: item.discountAmount,
                                currency: order.currencyCode,
                              })}
                            </bdi>
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <p className="flex-shrink-0 text-sm font-semibold text-foreground">
                      <bdi dir="ltr">
                        {item.lineTotal} {order.currencyCode}
                      </bdi>
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <OrderTimeline history={order.statusHistory} type={order.type} />

            <div className="flex flex-col gap-2 rounded-lg bg-muted px-4 py-3">
              {showFee || hasDiscount ? (
                <>
                  <div className="flex items-baseline justify-between text-sm text-muted-foreground">
                    <span>{t('orders.detail.subtotal')}</span>
                    <bdi dir="ltr">
                      {hasDiscount
                        ? fromMinorUnits(
                            toMinorUnits(order.subtotalAmount) + toMinorUnits(order.discountTotal),
                          )
                        : order.subtotalAmount}{' '}
                      {order.currencyCode}
                    </bdi>
                  </div>
                  {hasDiscount ? (
                    <div className="flex items-baseline justify-between text-sm font-semibold text-success">
                      <span>{t('orders.detail.discount')}</span>
                      <bdi dir="ltr">
                        {'−'}
                        {order.discountTotal} {order.currencyCode}
                      </bdi>
                    </div>
                  ) : null}
                  {showFee ? (
                    <div className="flex items-baseline justify-between text-sm text-muted-foreground">
                      <span>{t('orders.detail.deliveryFee')}</span>
                      <bdi dir="ltr">
                        {order.deliveryFee} {order.currencyCode}
                      </bdi>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-muted-foreground">{t('orders.detail.total')}</span>
                <bdi dir="ltr" className="text-2xl font-bold text-foreground">
                  {order.totalAmount} {order.currencyCode}
                </bdi>
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                {/* Secondary utility, always available: every type and status, no lifecycle permission needed. Only opens the browser print dialog -- never closes the dialog or touches the Order. */}
                <Button type="button" variant="secondary" onClick={() => window.print()}>
                  {t('orders.detail.print')}
                </Button>
                {destructiveTransitions.map((transition) => (
                  <Button
                    key={transition.to}
                    type="button"
                    variant="secondary"
                    className="border-destructive/30 text-destructive hover:bg-destructive-soft"
                    disabled={isTransitioning}
                    onClick={() => onTransition(transition.to)}
                  >
                    {transitionLabel(transition.to)}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {forwardTransitions.map((transition) => (
                  <Button
                    key={transition.to}
                    type="button"
                    variant="primary"
                    className="px-6 py-2.5 text-base"
                    disabled={isTransitioning}
                    onClick={() => onTransition(transition.to)}
                  >
                    {transitionLabel(transition.to)}
                  </Button>
                ))}
              </div>
            </div>
        </div>
      </div>
    </div>
    </>
  );
}
