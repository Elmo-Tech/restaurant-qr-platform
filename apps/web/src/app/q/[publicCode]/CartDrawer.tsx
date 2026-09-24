'use client';

import { useEffect, useRef } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { IconClose } from '../../../components/staff/icons';
import type { GuestOrderView } from '../../../lib/public-menu/types';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';

/** FT-6A: one selected Modifier Option shown on a Cart line, e.g. "Size: Large". */
export interface CartLineSelection {
  groupName: string;
  optionName: string;
  priceAdjustment: string;
}

export interface CartLine {
  /** Stable identity for THIS Cart line (productId + selections) -- two lines of the same Product with different selections have different `lineKey`s (FT-6A). */
  lineKey: string;
  productId: string;
  quantity: number;
  modifierOptionIds: string[];
  name: string;
  /** Product.basePrice PLUS every selected Option's priceAdjustment -- display-only, exact via BigInt minor units, never authoritative. */
  unitPrice: string;
  selections: CartLineSelection[];
  /** SOLD_OUT since being added to the Cart -- Section 21: stays visible, blocks submit until removed. */
  blocked: boolean;
}

/** FT-7: Pickup checkout state + handlers (GENERIC QR only; the drawer receives null for a TABLE QR and renders exactly as before). */
export interface PickupCheckoutProps {
  branches: { id: string; name: string }[];
  /** The resolved Branch: the single ACTIVE Branch automatically, or the Guest's choice among several. */
  branchId: string | null;
  customerName: string;
  customerPhone: string;
  customerNotes: string;
  onBranchChange: (branchId: string | null) => void;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onNotesChange: (value: string) => void;
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
  pickup: PickupCheckoutProps | null;
  onIncrement: (lineKey: string) => void;
  onDecrement: (lineKey: string) => void;
  onRemove: (lineKey: string) => void;
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
  pickup,
  onIncrement,
  onDecrement,
  onRemove,
  onPlaceOrder,
  onClose,
}: CartDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // `onClose` is a fresh function on every parent render (every keystroke in
  // the Pickup fields re-renders the parent), so it must NOT be an effect
  // dependency: doing so re-ran the focus call below on each keystroke and
  // pulled focus off the input onto the close button. Keep the latest
  // handler in a ref instead, and focus the close button once on mount only.
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
              {confirmedOrder
                ? confirmedOrder.type === 'PICKUP'
                  ? copy.pickupOrderSent
                  : copy.orderSent
                : copy.yourOrder}
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
                      <li key={line.lineKey} className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#1D1A18]">{line.name}</p>
                          {line.selections.length > 0 ? (
                            <ul className="mt-0.5 flex flex-col text-xs text-[#655D56]">
                              {line.selections.map((selection, index) => (
                                <li key={index}>
                                  {selection.groupName}: {selection.optionName}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <p className="mt-0.5 text-xs text-[#655D56]">
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
                            onClick={() => onRemove(line.lineKey)}
                            className="rounded-full border border-[#E5DED6] px-3 py-1 text-xs font-medium text-[#8A3B24] hover:bg-[#F6E4DE]"
                          >
                            {copy.remove}
                          </button>
                        ) : (
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#E5DED6] bg-[#F8F5F1] px-1 py-1">
                              <button
                                type="button"
                                onClick={() => onDecrement(line.lineKey)}
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
                                onClick={() => onIncrement(line.lineKey)}
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

                {pickup && lines.length > 0 ? (
                  <PickupCheckoutForm copy={copy} pickup={pickup} disabled={isSubmitting} />
                ) : null}
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
                {isSubmitting
                  ? copy.placingOrder
                  : pickup
                    ? copy.placePickupOrder
                    : copy.placeOrder}
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
      <p className="text-lg font-bold text-[#1D1A18]">
        {order.type === 'PICKUP' ? copy.pickupOrderSent : copy.orderSent}
      </p>
      {order.table ? (
        <p className="text-sm text-[#8A5138]">
          {copy.table} {order.table.number}
        </p>
      ) : null}
      {order.pickupBranch ? (
        <p className="text-sm text-[#8A5138]">
          {copy.pickupFrom}: {order.pickupBranch.name}
        </p>
      ) : null}
      <p className="text-2xl font-bold text-[#302C29]">
        <bdi dir="ltr">
          {order.total} {currency}
        </bdi>
      </p>
      <p className="mt-2 text-sm text-[#655D56]">
        {order.type === 'PICKUP' ? copy.pickupOrderPending : copy.orderStatusPending}
      </p>
    </div>
  );
}

const FIELD_CLASS =
  'w-full rounded-md border border-[#E5DED6] bg-white px-3 py-2 text-sm text-[#1D1A18] focus:border-[#7A5138] focus:outline-none disabled:bg-[#F8F5F1]';

/** FT-7: Pickup checkout fields -- branch (read-only when only one ACTIVE Branch exists), name, phone, optional notes. */
function PickupCheckoutForm({
  copy,
  pickup,
  disabled,
}: {
  copy: PublicMenuCopy;
  pickup: PickupCheckoutProps;
  disabled: boolean;
}) {
  const singleBranch = pickup.branches.length === 1 ? pickup.branches[0] : null;
  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-[#E5DED6] pt-5">
      {singleBranch ? (
        <div>
          <p className="text-xs font-medium text-[#655D56]">{copy.pickupFrom}</p>
          <p className="mt-0.5 text-sm font-semibold text-[#1D1A18]">{singleBranch.name}</p>
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
          <span>{copy.pickupFrom} *</span>
          <select
            value={pickup.branchId ?? ''}
            disabled={disabled}
            onChange={(event) => pickup.onBranchChange(event.target.value || null)}
            className={FIELD_CLASS}
          >
            <option value="">{copy.chooseBranch}</option>
            {pickup.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
        <span>{copy.customerName} *</span>
        <input
          type="text"
          value={pickup.customerName}
          maxLength={100}
          autoComplete="name"
          disabled={disabled}
          onChange={(event) => pickup.onNameChange(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
        <span>{copy.customerPhone} *</span>
        <input
          type="tel"
          dir="ltr"
          value={pickup.customerPhone}
          maxLength={30}
          autoComplete="tel"
          disabled={disabled}
          onChange={(event) => pickup.onPhoneChange(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
        <span>{copy.customerNotes}</span>
        <textarea
          value={pickup.customerNotes}
          maxLength={500}
          rows={2}
          disabled={disabled}
          onChange={(event) => pickup.onNotesChange(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
    </div>
  );
}
