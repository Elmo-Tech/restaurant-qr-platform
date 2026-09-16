'use client';

import { useEffect, useRef } from 'react';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { IconClose } from '../../../../../components/staff/icons';
import type { OrderDetail, OrderStatus } from '../../../../../lib/orders/types';
import type { OrderTransitionOption } from '../../../../../lib/orders/transitions';
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

/**
 * FT-5, Section 26: a focused, non-form Order detail panel -- deliberately
 * NOT built on `components/ui/Dialog.tsx` (form-shaped, wrong fit here),
 * mirroring the `QrPreviewDialog`/`CartDrawer` bespoke-shell precedent. No
 * editing of quantities/items/payment in V1 -- purely a read-only detail
 * view plus the NEXT valid status action(s) (Section 25: never an invalid
 * transition button).
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

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const createdAt = new Date(order.createdAt);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-0 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-detail-title"
          className="pointer-events-auto flex h-full w-full flex-col bg-white shadow-xl sm:h-auto sm:max-h-[calc(100vh-64px)] sm:max-w-[480px] sm:rounded-lg"
        >
          <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-[#E5DED6] px-5 py-4">
            <div className="min-w-0">
              <h2 id="order-detail-title" className="text-base font-semibold text-[#1D1A18]">
                Table {order.table.tableNumber}
              </h2>
              <p className="mt-0.5 text-sm text-[#655D56]">
                {order.branch.name} · {createdAt.toLocaleString()}
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

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
            {transitionError ? <Alert variant="error">{transitionError}</Alert> : null}

            <div>
              <StatusBadge status={order.status} />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#AFA397]">
                Items
              </p>
              <ul className="flex flex-col gap-2">
                {order.items.map((item, index) => (
                  <li
                    key={`${item.productId}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-[#E5DED6] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1D1A18]">
                        {item.productNameSnapshot}
                      </p>
                      <p className="text-xs text-[#655D56]">
                        {item.quantity} × {item.unitPrice} {order.currencyCode}
                      </p>
                    </div>
                    <p className="flex-shrink-0 text-sm font-semibold text-[#302C29]">
                      {item.lineTotal} {order.currencyCode}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between border-t border-[#E5DED6] pt-4 text-sm font-semibold text-[#302C29]">
              <span>Total</span>
              <span>
                {order.totalAmount} {order.currencyCode}
              </span>
            </div>
          </div>

          {availableTransitions.length > 0 ? (
            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#E5DED6] px-5 py-4">
              {availableTransitions.map((transition) => (
                <Button
                  key={transition.to}
                  type="button"
                  variant={
                    transition.to === 'REJECTED' || transition.to === 'CANCELLED'
                      ? 'danger'
                      : 'primary'
                  }
                  disabled={isTransitioning}
                  onClick={() => onTransition(transition.to)}
                >
                  {TRANSITION_LABELS[transition.to]}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
