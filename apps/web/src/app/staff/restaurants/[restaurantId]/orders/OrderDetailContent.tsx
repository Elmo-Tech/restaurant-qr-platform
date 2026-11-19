'use client';

import type { ReactNode } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { ReadErrorAlert } from '../../../../../components/staff/ReadErrorAlert';
import { fromMinorUnits, toMinorUnits } from '../../../../../lib/public-menu/money';
import type { OrderDetail, OrderStatus } from '../../../../../lib/orders/types';
import {
  isDestructiveTransition as isDestructive,
  nextStepFor,
  transitionLabelKey,
  type OrderTransitionOption,
} from '../../../../../lib/orders/transitions';
import { formatOrderTime, isCompletedStatus } from '../../../../../lib/orders/order-views';
import { OrderReceipt } from './OrderReceipt';
import { OrderTimeline } from './OrderTimeline';
import { OrderTypeBadge } from './OrderTypeBadge';
import { StatusBadge } from './StatusBadge';

/** Whether the detail on screen is the authoritative latest state (owned by `OrdersWorkspace`). */
export type OrderDetailSync = 'current' | 'refreshing' | 'unverified';

export interface OrderDetailContentProps {
  order: OrderDetail;
  restaurantLogoUrl?: string | null;
  availableTransitions: OrderTransitionOption[];
  /** A write is in flight OR the latest state is not verified: every mutating action is disabled. */
  isTransitioning: boolean;
  transitionError: string | null;
  onTransition: (to: OrderStatus) => void;
  /** Id for the identity heading, referenced by the surrounding dialog / pane. */
  titleId: string;
  /** Top-end slot of the header (the Close control). */
  headerAction?: ReactNode;
  sync?: OrderDetailSync;
  /** Re-READS the Order (never a write) when its latest state is unverified. */
  onReloadDetail?: () => void;
}

/**
 * Phase 1 PR 2: the Order detail presentation shared by the focused dialog
 * (`OrderDetailDialog`, narrow layouts) and the desktop split pane
 * (`OrderDetailPane`). Extracted unchanged from the FT-7B dialog: identity +
 * status/type + Branch/time, Pickup / Delivery details, item lines with their
 * snapshotted modifiers, timeline, a strong total, and one dominant forward
 * action with Reject/Cancel visually separate. It renders only the NEXT valid
 * transition(s) the caller passes in (Section 25), and owns no state: the
 * workspace remains the single owner of selection, reads and writes.
 *
 * The root is a flex column (header / scrolling body / footer); the caller
 * gives it its height.
 */
export function OrderDetailContent({
  order,
  restaurantLogoUrl = null,
  availableTransitions,
  isTransitioning,
  transitionError,
  onTransition,
  titleId,
  headerAction = null,
  sync = 'current',
  onReloadDetail,
}: OrderDetailContentProps) {
  const { t, formatDateTime, formatTime, formatDayMonth } = useStaffI18n();

  const isPickup = order.type === 'PICKUP';
  const isDelivery = order.type === 'DELIVERY';
  const identity = isPickup
    ? (order.customer?.name ?? t('orders.detail.pickupOrder'))
    : isDelivery
      ? (order.customer?.name ?? t('orders.detail.deliveryOrder'))
      : t('orders.card.table', { number: order.table?.tableNumber ?? '—' });

  const destructiveTransitions = availableTransitions.filter((option) => isDestructive(option.to));
  const forwardTransitions = availableTransitions.filter((option) => !isDestructive(option.to));
  // Active Order, but nothing this Membership may do at this stage (read-only
  // user, or another role's step): say where the Order is instead of leaving
  // an unexplained empty action area. `nextStepFor` with no permissions
  // yields only that neutral status copy -- never an action.
  const waitingStep =
    availableTransitions.length === 0 && !isCompletedStatus(order.status)
      ? nextStepFor(order.status, order.type, [])
      : null;

  // The stored statuses never change with the order type; only the wording
  // does: Pickup "Mark picked up", Delivery "Out for delivery" / "Mark delivered".
  function transitionLabel(to: OrderStatus): string {
    return t(transitionLabelKey(to, order.type));
  }
  const showFee = isDelivery;
  const hasDiscount = order.discountTotal !== '0.00';

  return (
    <>
      {/* Print-only receipt, portalled to <body> (see OrderReceipt): never nested under the print:hidden detail. */}
      <OrderReceipt order={order} logoUrl={restaurantLogoUrl} />
      <div className="flex min-h-0 flex-1 flex-col print:hidden">
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={order.status} type={order.type} />
              <OrderTypeBadge type={order.type} />
            </div>
            {/* The heading keeps the page direction (so it aligns to the
                page's start); only the name is isolated, so an Arabic name in
                the English UI -- or a Latin one in Arabic -- still reads right. */}
            <h2
              id={titleId}
              className="mt-2 truncate text-start text-xl font-semibold text-foreground"
            >
              <bdi dir="auto">{identity}</bdi>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <bdi dir="auto">{order.branch.name}</bdi> ·{' '}
              {formatOrderTime(order.createdAt, {
                t,
                tMinutes: (count) => t('orders.time.minutesAgo', { count }),
                formatTime,
                formatDayMonth,
              })}{' '}
              {/* `auto`, not `ltr`: the Arabic UI formats this date in Arabic
                  ("19 نوفمبر 2026، 11:25 م"), which an LTR isolate scrambles. */}
              · <bdi dir="auto">{formatDateTime(order.createdAt)}</bdi>
            </p>
          </div>
          {headerAction}
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 max-sm:overscroll-contain">
          {sync === 'refreshing' ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none"
              />
              {t('orders.detail.syncing')}
            </p>
          ) : null}
          {transitionError ? (
            sync === 'unverified' && onReloadDetail ? (
              <ReadErrorAlert title={transitionError} onRetry={onReloadDetail} />
            ) : (
              <Alert variant="error">{transitionError}</Alert>
            )
          ) : null}

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
                      <p className="text-start text-sm font-semibold text-foreground">
                        <bdi dir="auto">
                          {item.productNameSnapshot}{item.variantName ? ` · ${item.variantName}` : ''}
                        </bdi>
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

        {/* Phones (< sm, the full-screen dialog): utilities and destructive
            actions on their own row, the next action full-width below them --
            closest to the thumb and last in tab order, as it is visually.
            `max-sm:` only, so the split pane and the tablet dialog keep the
            approved single-row footer. */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 max-sm:flex-col max-sm:flex-nowrap max-sm:items-stretch max-sm:px-4 max-sm:py-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Secondary utility, always available: every type and status, no lifecycle permission needed. Only opens the browser print dialog -- never closes the detail or touches the Order. */}
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
          {forwardTransitions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 max-sm:flex-col max-sm:items-stretch">
              {forwardTransitions.map((transition) => (
                <Button
                  key={transition.to}
                  type="button"
                  variant="primary"
                  className="px-6 py-2.5 text-base max-sm:h-12 max-sm:w-full"
                  disabled={isTransitioning}
                  onClick={() => onTransition(transition.to)}
                >
                  {transitionLabel(transition.to)}
                </Button>
              ))}
            </div>
          ) : waitingStep ? (
            <div className="min-w-0 text-end max-sm:text-start">
              <p className="text-sm font-medium text-foreground">{t(waitingStep.labelKey)}</p>
              <p className="text-xs text-muted-foreground">{t('orders.detail.noActionForYou')}</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
