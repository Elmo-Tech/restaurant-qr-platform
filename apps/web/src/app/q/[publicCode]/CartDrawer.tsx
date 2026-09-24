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

/** The free-text checkout fields, keyed for one shared change handler. */
export type CheckoutFieldKey =
  | 'customerName'
  | 'customerPhone'
  | 'customerNotes'
  | 'deliveryAddress'
  | 'deliveryBuilding'
  | 'deliveryFloor'
  | 'deliveryApartment'
  | 'deliveryLandmark';

/**
 * FT-7/FT-8: GENERIC QR checkout state + handlers (Pickup or Delivery). The
 * drawer receives null for a TABLE QR and renders exactly as before. Every
 * money value here is display-only -- the Backend resolves the zone fee,
 * minimum and total itself on submit.
 */
export interface CheckoutFormProps {
  fulfillment: 'PICKUP' | 'DELIVERY';
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  onFulfillmentChange: (next: 'PICKUP' | 'DELIVERY') => void;
  /** The Branches eligible for the CURRENT mode (Pickup: ACTIVE; Delivery: ACTIVE with an ACTIVE zone). */
  branches: { id: string; name: string }[];
  /** The resolved Branch: the only eligible one automatically, or the Guest's choice among several. */
  branchId: string | null;
  onBranchChange: (branchId: string | null) => void;
  /** Delivery only: the resolved Branch's ACTIVE zones. */
  zones: { id: string; name: string; deliveryFee: string; minimumOrder: string }[];
  zoneId: string | null;
  onZoneChange: (zoneId: string | null) => void;
  fields: Record<CheckoutFieldKey, string>;
  onFieldChange: (key: CheckoutFieldKey, value: string) => void;
  subtotalDisplay: string;
  /** Delivery only, once a zone is chosen. */
  deliveryFeeDisplay: string | null;
  grandTotalDisplay: string;
  /** Delivery only: shown when the items subtotal is below the chosen zone's minimum. */
  minimumMessage: string | null;
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
  checkout: CheckoutFormProps | null;
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
  checkout,
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
                  : confirmedOrder.type === 'DELIVERY'
                    ? copy.deliveryOrderSent
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

                {checkout && lines.length > 0 ? (
                  <CheckoutForm
                    copy={copy}
                    currency={currency}
                    checkout={checkout}
                    disabled={isSubmitting}
                  />
                ) : null}
              </>
            )}
          </div>

          {!confirmedOrder ? (
            <div className="flex flex-shrink-0 flex-col gap-3 border-t border-[#E5DED6] px-5 py-4">
              {checkout && checkout.deliveryFeeDisplay !== null ? (
                <div className="flex flex-col gap-1 text-sm text-[#655D56]">
                  <div className="flex items-center justify-between">
                    <span>{copy.subtotal}</span>
                    <bdi dir="ltr">
                      {checkout.subtotalDisplay} {currency}
                    </bdi>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{copy.deliveryFee}</span>
                    <bdi dir="ltr">
                      {checkout.deliveryFeeDisplay} {currency}
                    </bdi>
                  </div>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-[#EDE7DF] pt-2 text-sm font-semibold text-[#302C29]">
                <span>{copy.total}</span>
                <bdi dir="ltr">
                  {checkout ? checkout.grandTotalDisplay : totalDisplay} {currency}
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
                  : checkout
                    ? checkout.fulfillment === 'DELIVERY'
                      ? copy.placeDeliveryOrder
                      : copy.placePickupOrder
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
  const title =
    order.type === 'PICKUP'
      ? copy.pickupOrderSent
      : order.type === 'DELIVERY'
        ? copy.deliveryOrderSent
        : copy.orderSent;
  const pending =
    order.type === 'PICKUP'
      ? copy.pickupOrderPending
      : order.type === 'DELIVERY'
        ? copy.deliveryOrderPending
        : copy.orderStatusPending;
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <p className="text-lg font-bold text-[#1D1A18]">{title}</p>
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
      {order.delivery ? (
        <p className="text-sm text-[#8A5138]">
          {copy.deliveryFrom}: {order.delivery.branchName} · {order.delivery.zoneName}
        </p>
      ) : null}
      {order.type === 'DELIVERY' ? (
        <div className="mt-2 flex w-full max-w-[260px] flex-col gap-1 text-sm text-[#655D56]">
          <div className="flex items-center justify-between">
            <span>{copy.subtotal}</span>
            <bdi dir="ltr">
              {order.subtotal} {currency}
            </bdi>
          </div>
          <div className="flex items-center justify-between">
            <span>{copy.deliveryFee}</span>
            <bdi dir="ltr">
              {order.deliveryFee} {currency}
            </bdi>
          </div>
        </div>
      ) : null}
      <p className="text-2xl font-bold text-[#302C29]">
        <bdi dir="ltr">
          {order.total} {currency}
        </bdi>
      </p>
      <p className="mt-2 text-sm text-[#655D56]">{pending}</p>
    </div>
  );
}

const FIELD_CLASS =
  'w-full rounded-md border border-[#E5DED6] bg-white px-3 py-2 text-sm text-[#1D1A18] focus:border-[#7A5138] focus:outline-none disabled:bg-[#F8F5F1]';

function TextField({
  label,
  value,
  maxLength,
  disabled,
  onChange,
  type = 'text',
  autoComplete,
  ltr = false,
}: {
  label: string;
  value: string;
  maxLength: number;
  disabled: boolean;
  onChange: (value: string) => void;
  type?: 'text' | 'tel';
  autoComplete?: string;
  ltr?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
      <span>{label}</span>
      <input
        type={type}
        dir={ltr ? 'ltr' : undefined}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD_CLASS}
      />
    </label>
  );
}

/** FT-7/FT-8: GENERIC QR checkout -- Pickup/Delivery selector, Branch, delivery area, customer details, and (Delivery) the address. */
function CheckoutForm({
  copy,
  currency,
  checkout,
  disabled,
}: {
  copy: PublicMenuCopy;
  currency: string;
  checkout: CheckoutFormProps;
  disabled: boolean;
}) {
  const isDelivery = checkout.fulfillment === 'DELIVERY';
  const singleBranch = checkout.branches.length === 1 ? checkout.branches[0] : null;
  const singleZone = checkout.zones.length === 1 ? checkout.zones[0] : null;
  const { fields, onFieldChange } = checkout;
  const branchLabel = isDelivery ? copy.deliveryFrom : copy.pickupFrom;

  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-[#E5DED6] pt-5">
      {checkout.pickupAvailable || checkout.deliveryAvailable ? (
        <div role="radiogroup" aria-label={copy.fulfillment} className="grid grid-cols-2 gap-2">
          {([
            ['PICKUP', copy.pickup, checkout.pickupAvailable],
            ['DELIVERY', copy.delivery, checkout.deliveryAvailable],
          ] as const).map(([mode, label, available]) => {
            const selected = checkout.fulfillment === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled || !available}
                onClick={() => checkout.onFulfillmentChange(mode)}
                className={`rounded-full border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? 'border-[#7A5138] bg-[#7A5138] text-white'
                    : 'border-[#E5DED6] bg-white text-[#302C29] hover:bg-[#F8F5F1]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      {!checkout.deliveryAvailable ? (
        <p className="text-xs text-[#8A8177]">{copy.deliveryUnavailable}</p>
      ) : null}

      {singleBranch ? (
        <div>
          <p className="text-xs font-medium text-[#655D56]">{branchLabel}</p>
          <p className="mt-0.5 text-sm font-semibold text-[#1D1A18]">{singleBranch.name}</p>
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
          <span>{branchLabel} *</span>
          <select
            value={checkout.branchId ?? ''}
            disabled={disabled}
            onChange={(event) => checkout.onBranchChange(event.target.value || null)}
            className={FIELD_CLASS}
          >
            <option value="">{copy.chooseBranch}</option>
            {checkout.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {isDelivery && checkout.branchId ? (
        singleZone ? (
          <div>
            <p className="text-xs font-medium text-[#655D56]">{copy.deliveryArea}</p>
            <p className="mt-0.5 text-sm font-semibold text-[#1D1A18]">
              {singleZone.name}{' '}
              <span className="font-normal text-[#655D56]">
                <bdi dir="ltr">
                  {singleZone.deliveryFee} {currency}
                </bdi>
                {singleZone.minimumOrder !== '0.00' ? (
                  <>
                    {' · '}{copy.minimumOrderLabel}{' '}
                    <bdi dir="ltr">
                      {singleZone.minimumOrder} {currency}
                    </bdi>
                  </>
                ) : null}
              </span>
            </p>
          </div>
        ) : (
          <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
            <span>{copy.deliveryArea} *</span>
            <select
              value={checkout.zoneId ?? ''}
              disabled={disabled}
              onChange={(event) => checkout.onZoneChange(event.target.value || null)}
              className={FIELD_CLASS}
            >
              <option value="">{copy.chooseDeliveryArea}</option>
              {checkout.zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} — {zone.deliveryFee} {currency}
                  {zone.minimumOrder !== '0.00'
                    ? ` (${copy.minimumOrderLabel} ${zone.minimumOrder} ${currency})`
                    : ''}
                </option>
              ))}
            </select>
          </label>
        )
      ) : null}

      <TextField
        label={`${copy.customerName} *`}
        value={fields.customerName}
        maxLength={100}
        autoComplete="name"
        disabled={disabled}
        onChange={(value) => onFieldChange('customerName', value)}
      />
      <TextField
        label={`${copy.customerPhone} *`}
        value={fields.customerPhone}
        maxLength={30}
        type="tel"
        ltr
        autoComplete="tel"
        disabled={disabled}
        onChange={(value) => onFieldChange('customerPhone', value)}
      />

      {isDelivery ? (
        <>
          <TextField
            label={`${copy.deliveryAddress} *`}
            value={fields.deliveryAddress}
            maxLength={300}
            autoComplete="street-address"
            disabled={disabled}
            onChange={(value) => onFieldChange('deliveryAddress', value)}
          />
          <div className="grid grid-cols-3 gap-2">
            <TextField
              label={copy.deliveryBuilding}
              value={fields.deliveryBuilding}
              maxLength={50}
              disabled={disabled}
              onChange={(value) => onFieldChange('deliveryBuilding', value)}
            />
            <TextField
              label={copy.deliveryFloor}
              value={fields.deliveryFloor}
              maxLength={30}
              disabled={disabled}
              onChange={(value) => onFieldChange('deliveryFloor', value)}
            />
            <TextField
              label={copy.deliveryApartment}
              value={fields.deliveryApartment}
              maxLength={30}
              disabled={disabled}
              onChange={(value) => onFieldChange('deliveryApartment', value)}
            />
          </div>
          <TextField
            label={copy.deliveryLandmark}
            value={fields.deliveryLandmark}
            maxLength={150}
            disabled={disabled}
            onChange={(value) => onFieldChange('deliveryLandmark', value)}
          />
        </>
      ) : null}

      <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
        <span>{copy.customerNotes}</span>
        <textarea
          value={fields.customerNotes}
          maxLength={500}
          rows={2}
          disabled={disabled}
          onChange={(event) => onFieldChange('customerNotes', event.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      {checkout.minimumMessage ? (
        <p role="alert" className="rounded-md bg-[#FFF3D1] px-3 py-2 text-sm text-[#7A5600]">
          {checkout.minimumMessage}
        </p>
      ) : null}
    </div>
  );
}
