'use client';

import { useEffect, useRef } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { IconClose } from '../../../components/staff/icons';
import type { GuestOrderView } from '../../../lib/public-menu/types';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';

export interface CartLine {
  productId: string;
  quantity: number;
  name: string;
  unitPrice: string;
  /** SOLD_OUT since being added to the Cart -- Section 21: stays visible, blocks submit until removed. */
  blocked: boolean;
}

export interface CartDrawerProps {
  copy: PublicMenuCopy;
  currency: string;
  dir: 'ltr' | 'rtl';
  lines: CartLine[];
  totalDisplay: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  submitError: string | null;
  confirmedOrder: GuestOrderView | null;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
  onPlaceOrder: () => void;
  onClose: () => void;
}

/**
 * FT-5, Section 19/22/23: a focused, non-form Cart panel -- deliberately
 * NOT built on `components/ui/Dialog.tsx` (form-shaped, wrong fit here),
 * mirroring the Staff `QrPreviewDialog`'s own bespoke-shell precedent.
 * Renders either the editable Cart (quantity steppers, remove, total,
 * Place Order) or, once `confirmedOrder` is set, a simple confirmation
 * view using ONLY the Backend's own returned total/status/table -- never a
 * client-recomputed value.
 */
export function CartDrawer({
  copy,
  currency,
  dir,
  lines,
  totalDisplay,
  isSubmitting,
  canSubmit,
  submitError,
  confirmedOrder,
  onIncrement,
  onDecrement,
  onRemove,
  onPlaceOrder,
  onClose,
}: CartDrawerProps) {
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

  return (
    <div className="fixed inset-0 z-50" dir={dir}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center sm:items-center sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cart-drawer-title"
          className="pointer-events-auto flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-h-[calc(100vh-64px)] sm:max-w-[440px] sm:rounded-2xl"
        >
          <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-[#E5DED6] px-5 py-4">
            <h2 id="cart-drawer-title" className="text-base font-semibold text-[#1D1A18]">
              {confirmedOrder ? copy.orderSent : copy.yourOrder}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label={copy.close}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[#655D56] hover:bg-[#F8F5F1]"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {confirmedOrder ? (
              <ConfirmationView copy={copy} currency={currency} order={confirmedOrder} />
            ) : (
              <>
                {submitError ? (
                  <div className="mb-4">
                    <Alert variant="error">{submitError}</Alert>
                  </div>
                ) : null}

                {lines.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[#655D56]">{copy.emptyCart}</p>
                ) : (
                  <ul className="flex flex-col gap-4">
                    {lines.map((line) => (
                      <li key={line.productId} className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#1D1A18]">{line.name}</p>
                          <p className="text-xs text-[#655D56]">
                            <bdi dir="ltr">
                              {line.unitPrice} {currency}
                            </bdi>
                          </p>
                          {line.blocked ? (
                            <p className="mt-1 text-xs font-medium text-[#8A3B24]">
                              {copy.removeToContinue}
                            </p>
                          ) : null}
                        </div>
                        {line.blocked ? (
                          <button
                            type="button"
                            onClick={() => onRemove(line.productId)}
                            className="rounded-full border border-[#E5DED6] px-3 py-1 text-xs font-medium text-[#8A3B24] hover:bg-[#F6E4DE]"
                          >
                            {copy.remove}
                          </button>
                        ) : (
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#E5DED6] bg-[#F8F5F1] px-1 py-1">
                              <button
                                type="button"
                                onClick={() => onDecrement(line.productId)}
                                aria-label={copy.remove}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#7A5138] shadow-sm"
                              >
                                −
                              </button>
                              <span className="min-w-[1.25rem] text-center text-sm font-semibold">
                                {line.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => onIncrement(line.productId)}
                                aria-label={copy.add}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#7A5138] shadow-sm"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {!confirmedOrder ? (
            <div className="flex flex-shrink-0 flex-col gap-3 border-t border-[#E5DED6] px-5 py-4">
              <div className="flex items-center justify-between text-sm font-semibold text-[#302C29]">
                <span>{copy.total}</span>
                <bdi dir="ltr">
                  {totalDisplay} {currency}
                </bdi>
              </div>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={onPlaceOrder}
                className="w-full rounded-full bg-[#7A5138] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#634127] disabled:cursor-not-allowed disabled:bg-[#AFA397]"
              >
                {isSubmitting ? copy.placingOrder : copy.placeOrder}
              </button>
            </div>
          ) : (
            <div className="flex flex-shrink-0 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full border border-[#E5DED6] px-4 py-3 text-sm font-semibold text-[#302C29] hover:bg-[#F8F5F1]"
              >
                {copy.backToMenu}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmationView({
  copy,
  currency,
  order,
}: {
  copy: PublicMenuCopy;
  currency: string;
  order: GuestOrderView;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <p className="text-lg font-bold text-[#1D1A18]">{copy.orderSent}</p>
      <p className="text-sm text-[#8A5138]">
        {copy.table} {order.table.number}
      </p>
      <p className="text-2xl font-bold text-[#302C29]">
        <bdi dir="ltr">
          {order.total} {currency}
        </bdi>
      </p>
      <p className="mt-2 text-sm text-[#655D56]">{copy.orderStatusPending}</p>
    </div>
  );
}
