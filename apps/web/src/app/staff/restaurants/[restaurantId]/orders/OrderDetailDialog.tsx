'use client';

import { useEffect, useRef } from 'react';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { IconClose } from '../../../../../components/staff/icons';
import type { OrderDetail, OrderStatus } from '../../../../../lib/orders/types';
import type { OrderTransitionOption } from '../../../../../lib/orders/transitions';
import { formatOrderTime } from '../../../../../lib/orders/order-views';
import { OrderTypeBadge } from './OrderTypeBadge';
import { StatusBadge } from './StatusBadge';

const TRANSITION_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Reopen',
  ACCEPTED: 'Accept',
  PREPARING: 'Start preparing',
  READY: 'Mark ready',
  SERVED: 'Mark served',
  REJECTED: 'Reject',
  CANCELLED: 'Cancel',
};

function isDestructive(status: OrderStatus): boolean {
  return status === 'REJECTED' || status === 'CANCELLED';
}

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
  availableTransitions,
  isTransitioning,
  transitionError,
  onTransition,
  onClose,
}: {
  order: OrderDetail;
  availableTransitions: OrderTransitionOption[];
  isTransitioning: boolean;
  transitionError: string | null;
  onTransition: (to: OrderStatus) => void;
  onClose: () => void;
}) {
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
  const identity = isPickup
    ? (order.customer?.name ?? 'Pickup order')
    : `Table ${order.table?.tableNumber ?? '—'}`;

  const destructiveTransitions = availableTransitions.filter((t) => isDestructive(t.to));
  const forwardTransitions = availableTransitions.filter((t) => !isDestructive(t.to));

  function transitionLabel(to: OrderStatus): string {
    return to === 'SERVED' && isPickup ? 'Mark picked up' : TRANSITION_LABELS[to];
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-0 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-detail-title"
          className="pointer-events-auto flex h-full w-full flex-col bg-white shadow-xl sm:h-auto sm:max-h-[calc(100vh-64px)] sm:max-w-[520px] sm:rounded-lg"
        >
          <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-[#E5DED6] px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={order.status} />
                <OrderTypeBadge type={order.type} />
              </div>
              <h2
                id="order-detail-title"
                className="mt-2 truncate text-xl font-semibold text-[#1D1A18]"
              >
                {identity}
              </h2>
              <p className="mt-0.5 text-sm text-[#655D56]">
                {order.branch.name} · {formatOrderTime(order.createdAt)} ·{' '}
                {new Date(order.createdAt).toLocaleString()}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[#655D56] hover:bg-[#F8F5F1]"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            {transitionError ? <Alert variant="error">{transitionError}</Alert> : null}

            {isPickup && order.customer ? (
              <section aria-labelledby="pickup-details-title" className="rounded-lg bg-[#F1ECFA]/60 px-4 py-3">
                <h3
                  id="pickup-details-title"
                  className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#4B2E86]"
                >
                  Pickup details
                </h3>
                <dl className="flex flex-col gap-1.5 text-sm text-[#302C29]">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#655D56]">Branch</dt>
                    <dd className="text-end font-medium">{order.branch.name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#655D56]">Customer</dt>
                    <dd className="text-end font-medium">{order.customer.name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#655D56]">Phone</dt>
                    <dd dir="ltr" className="text-end font-medium">
                      {order.customer.phone}
                    </dd>
                  </div>
                  {order.customer.notes ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-[#655D56]">Notes</dt>
                      <dd className="text-end">{order.customer.notes}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            <section aria-labelledby="order-items-title">
              <h3
                id="order-items-title"
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A8177]"
              >
                Items
              </h3>
              <ul className="flex flex-col divide-y divide-[#EDE7DF] rounded-lg border border-[#E5DED6]">
                {order.items.map((item, index) => (
                  <li
                    key={`${item.productId}-${index}`}
                    className="flex items-start justify-between gap-3 px-3 py-3"
                  >
                    <div className="flex min-w-0 gap-3">
                      <span className="mt-0.5 inline-flex h-6 min-w-[2rem] flex-shrink-0 items-center justify-center rounded-md bg-[#F1ECE6] px-1.5 text-sm font-semibold text-[#302C29]">
                        {item.quantity}×
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1D1A18]">
                          {item.productNameSnapshot}
                        </p>
                        {/* FT-6A, ORDER_LIFECYCLE_SPEC.md #41: the exact
                            Modifier selections snapshotted at submission
                            time -- never re-derived from the live (possibly
                            since-changed) Modifier configuration. */}
                        {item.modifiers.length > 0 ? (
                          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[#655D56]">
                            {item.modifiers.map((modifier, modifierIndex) => (
                              <li key={modifierIndex}>
                                {modifier.groupName}: {modifier.optionName}
                                {modifier.priceAdjustment !== '0.00'
                                  ? ` (+${modifier.priceAdjustment})`
                                  : ''}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="mt-1 text-xs text-[#8A8177]">
                          {item.unitPrice} {order.currencyCode} each
                        </p>
                      </div>
                    </div>
                    <p className="flex-shrink-0 text-sm font-semibold text-[#302C29]">
                      {item.lineTotal} {order.currencyCode}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex items-baseline justify-between rounded-lg bg-[#F8F5F1] px-4 py-3">
              <span className="text-sm font-semibold text-[#655D56]">Total</span>
              <span className="text-2xl font-bold text-[#1D1A18]">
                {order.totalAmount} {order.currencyCode}
              </span>
            </div>
          </div>

          {availableTransitions.length > 0 ? (
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#E5DED6] px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                {destructiveTransitions.map((transition) => (
                  <Button
                    key={transition.to}
                    type="button"
                    variant="secondary"
                    className="border-[#EDB0A8] text-[#A4231B] hover:bg-[#FDF0EE]"
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
