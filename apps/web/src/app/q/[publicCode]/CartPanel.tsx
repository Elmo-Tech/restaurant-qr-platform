'use client';

import {
  GuestIconAlert,
  GuestIconBag,
  GuestIconClose,
  GuestIconTable,
  GuestIconTrash,
} from '../../../components/guest/icons';
import { GuestEmptyState } from '../../../components/guest/GuestEmptyState';
import { Price } from '../../../components/guest/Price';
import { Sheet } from '../../../components/guest/Sheet';
import { Stepper } from '../../../components/guest/Stepper';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { GuestOrderView } from '../../../lib/public-menu/types';
import {
  AddressFields,
  BranchPicker,
  CheckoutSection,
  ContactFields,
  DeliveryAreaPicker,
  FulfillmentSelector,
  MinimumNotice,
  NotesField,
  ReceiptRow,
} from './CheckoutSections';
import type { CartLine, CheckoutFormProps, OrderingContextView } from './guest-view-types';

export interface CartPanelProps {
  copy: PublicMenuCopy;
  currency: string;
  dir: 'ltr' | 'rtl';
  context: OrderingContextView;
  lines: CartLine[];
  totalDisplay: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  submitError: string | null;
  /** Why "Place order" is unavailable right now (a visible reason beats a silently disabled button). */
  submitHint: string | null;
  confirmedOrder: GuestOrderView | null;
  checkout: CheckoutFormProps | null;
  onIncrement: (lineKey: string) => void;
  onDecrement: (lineKey: string) => void;
  onRemove: (lineKey: string) => void;
  onPlaceOrder: () => void;
  onClose: () => void;
}

function orderTitle(order: GuestOrderView, copy: PublicMenuCopy): string {
  return order.type === 'PICKUP'
    ? copy.pickupOrderSent
    : order.type === 'DELIVERY'
      ? copy.deliveryOrderSent
      : copy.orderSent;
}

/**
 * The cart and checkout, in one overlay: a bottom sheet on phones, a side
 * drawer on larger screens (overlaying the menu rather than permanently taking
 * a third of the width). Header (title + close), a scrolling body, and a fixed
 * footer holding the error/hint and the one primary action, so "Place order" is
 * never hidden below the fold or covered.
 *
 * Cart/Order semantics are unchanged: every figure is display-only, a sold-out
 * line stays visible and blocks submit until removed, and the confirmation view
 * uses only the Backend's returned order.
 */
export function CartPanel({
  copy,
  currency,
  dir,
  context,
  lines,
  totalDisplay,
  isSubmitting,
  canSubmit,
  submitError,
  submitHint,
  confirmedOrder,
  checkout,
  onIncrement,
  onDecrement,
  onRemove,
  onPlaceOrder,
  onClose,
}: CartPanelProps) {
  const ctaLabel = isSubmitting
    ? copy.placingOrder
    : checkout
      ? checkout.fulfillment === 'DELIVERY'
        ? copy.placeDeliveryOrder
        : copy.placePickupOrder
      : copy.placeOrder;
  const grandTotal = checkout ? checkout.grandTotalDisplay : totalDisplay;
  const isDelivery = checkout?.fulfillment === 'DELIVERY';
  const disabled = isSubmitting;

  return (
    <Sheet variant="drawer" dir={dir} labelledBy="cart-panel-title" onClose={onClose}>
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-guest-line px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <h2
            id="cart-panel-title"
            className="font-guest-display text-[1.75rem] font-extrabold leading-tight text-guest-ink"
          >
            {confirmedOrder ? orderTitle(confirmedOrder, copy) : copy.yourOrder}
          </h2>
          {context.kind === 'TABLE' && !confirmedOrder ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-guest-muted">
              <GuestIconTable className="size-4" />
              <span dir="auto">
                {copy.table} {context.tableNumber} · {copy.dineIn}
              </span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.close}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-guest-line-strong text-guest-ink transition-colors hover:bg-guest-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-guest-pine"
        >
          <GuestIconClose className="size-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain bg-guest-paper/40 px-5 py-5 sm:px-6">
        {confirmedOrder ? (
          <Confirmation copy={copy} currency={currency} order={confirmedOrder} />
        ) : lines.length === 0 ? (
          <GuestEmptyState
            icon={<GuestIconBag />}
            title={copy.emptyCart}
            className="border-0 bg-transparent"
          />
        ) : (
          <div className="flex flex-col gap-8">
            <CheckoutSection title={copy.yourItems} id="cart-items-title">
              <ul className="divide-y divide-guest-line rounded-2xl border border-guest-line bg-guest-surface px-4">
                {lines.map((line) => (
                  <li key={line.lineKey} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          dir="auto"
                          className="text-[1.02rem] font-semibold leading-snug text-guest-ink"
                        >
                          {line.name}
                        </p>
                        {line.selections.length > 0 ? (
                          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-guest-muted">
                            {line.selections.map((selection, index) => (
                              <li key={index} dir="auto">
                                {selection.groupName}
                                {/[?؟:]$/.test(selection.groupName) ? ' ' : ': '}
                                {selection.optionName}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <Price
                        amount={line.lineTotal}
                        currency={currency}
                        className="shrink-0 font-guest-display text-base font-bold text-guest-ink"
                      />
                    </div>

                    {line.blocked ? (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-guest-danger-soft px-3 py-2.5">
                        <p className="flex items-center gap-2 text-sm font-medium text-guest-danger">
                          <GuestIconAlert className="size-4 shrink-0" />
                          {copy.removeToContinue}
                        </p>
                        <button
                          type="button"
                          onClick={() => onRemove(line.lineKey)}
                          className="min-h-10 shrink-0 rounded-full bg-guest-danger px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-guest-danger"
                        >
                          {copy.remove}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <Stepper
                          value={line.quantity}
                          removesAtOne
                          decrementLabel={
                            line.quantity <= 1
                              ? copy.removeAria(line.name)
                              : copy.decreaseAria(line.name)
                          }
                          incrementLabel={copy.increaseAria(line.name)}
                          onDecrement={() => onDecrement(line.lineKey)}
                          onIncrement={() => onIncrement(line.lineKey)}
                        />
                        <button
                          type="button"
                          onClick={() => onRemove(line.lineKey)}
                          aria-label={copy.removeAria(line.name)}
                          className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-guest-muted transition-colors hover:bg-guest-danger-soft hover:text-guest-danger focus-visible:outline-2 focus-visible:outline-guest-danger"
                        >
                          <GuestIconTrash className="size-4" />
                          {copy.remove}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CheckoutSection>

            {checkout ? (
              <>
                <FulfillmentSelector checkout={checkout} copy={copy} disabled={disabled} />

                <CheckoutSection
                  title={isDelivery ? copy.deliveryTo : copy.pickupFrom}
                  id="checkout-where-title"
                >
                  <BranchPicker checkout={checkout} copy={copy} disabled={disabled} />
                  {isDelivery ? (
                    <DeliveryAreaPicker
                      checkout={checkout}
                      copy={copy}
                      currency={currency}
                      disabled={disabled}
                    />
                  ) : null}
                  {isDelivery && checkout.minimumMessage ? (
                    <MinimumNotice
                      message={checkout.minimumMessage}
                      shortfall={checkout.minimumShortfallDisplay}
                    />
                  ) : null}
                </CheckoutSection>

                <CheckoutSection title={copy.yourDetails} id="checkout-details-title">
                  <ContactFields checkout={checkout} copy={copy} disabled={disabled} />
                </CheckoutSection>

                {isDelivery ? (
                  <CheckoutSection title={copy.deliveryAddressSection} id="checkout-address-title">
                    <AddressFields checkout={checkout} copy={copy} disabled={disabled} />
                  </CheckoutSection>
                ) : null}

                <NotesField checkout={checkout} copy={copy} disabled={disabled} />
              </>
            ) : null}

            <section
              aria-label={copy.orderSummary}
              className="rounded-2xl border border-guest-line bg-guest-surface px-4 py-4"
            >
              <div className="flex flex-col gap-2.5">
                {checkout && isDelivery && checkout.deliveryFeeDisplay !== null ? (
                  <>
                    <ReceiptRow
                      label={copy.subtotal}
                      amount={checkout.subtotalDisplay}
                      currency={currency}
                    />
                    <ReceiptRow
                      label={copy.deliveryFee}
                      amount={checkout.deliveryFeeDisplay}
                      currency={currency}
                    />
                  </>
                ) : null}
                <ReceiptRow strong label={copy.total} amount={grandTotal} currency={currency} />
              </div>
            </section>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-guest-line bg-guest-surface px-5 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        {confirmedOrder ? (
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className="flex h-14 w-full items-center justify-center rounded-full bg-guest-pine text-base font-semibold text-white transition-colors hover:bg-guest-pine-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-guest-pine"
          >
            {copy.backToMenu}
          </button>
        ) : (
          <>
            {submitError ? (
              <div
                role="alert"
                className="mb-3 flex gap-2.5 rounded-xl bg-guest-danger-soft px-3.5 py-3 text-sm font-medium leading-relaxed text-guest-danger"
              >
                <GuestIconAlert className="mt-0.5 size-4 shrink-0" />
                <p>{submitError}</p>
              </div>
            ) : null}
            {!submitError && submitHint && lines.length > 0 && !canSubmit ? (
              <p id="cart-submit-hint" className="mb-2.5 text-center text-sm text-guest-muted">
                {submitHint}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onPlaceOrder}
              aria-describedby={submitHint && !canSubmit ? 'cart-submit-hint' : undefined}
              className="flex h-14 w-full items-center justify-between gap-3 rounded-full bg-guest-pine px-6 text-base font-semibold text-white transition-[background-color,transform] hover:bg-guest-pine-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-guest-pine active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-guest-line-strong disabled:text-guest-muted"
            >
              <span className="truncate">{ctaLabel}</span>
              {lines.length > 0 ? (
                <Price
                  amount={grandTotal}
                  currency={currency}
                  className="font-guest-display text-lg font-bold"
                  currencyClassName="text-[0.78em] font-medium opacity-80"
                />
              ) : null}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** The order docket: a confirmation stamped from the Backend's own returned order -- never a client recomputation. */
function Confirmation({
  copy,
  currency,
  order,
}: {
  copy: PublicMenuCopy;
  currency: string;
  order: GuestOrderView;
}) {
  const pending =
    order.type === 'PICKUP'
      ? copy.pickupOrderPending
      : order.type === 'DELIVERY'
        ? copy.deliveryOrderPending
        : copy.orderStatusPending;
  return (
    <div className="flex flex-col items-center gap-6 py-2 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="guest-anim-bump flex size-16 items-center justify-center rounded-full bg-guest-pine text-white">
          <svg
            viewBox="0 0 24 24"
            className="size-8"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              strokeDasharray="28"
              style={{ animation: 'guest-check-draw 450ms ease-out 120ms both' }}
            />
          </svg>
        </span>
        <p role="status" className="max-w-xs text-[0.97rem] leading-relaxed text-guest-ink-soft">
          {pending}
        </p>
        <div className="flex flex-col gap-0.5 text-sm font-semibold text-guest-pine">
          {order.table ? (
            <span dir="auto">
              {copy.table} {order.table.number}
            </span>
          ) : null}
          {order.pickupBranch ? (
            <span dir="auto">
              {copy.pickupFrom}: {order.pickupBranch.name}
            </span>
          ) : null}
          {order.delivery ? (
            <span dir="auto">
              {copy.deliveryFrom}: {order.delivery.branchName} · {order.delivery.zoneName}
            </span>
          ) : null}
        </div>
      </div>

      <section
        aria-label={copy.orderSummary}
        className="w-full rounded-2xl border border-guest-line bg-guest-surface px-4 py-4 text-start"
      >
        <ul className="flex flex-col gap-3 border-b border-dashed border-guest-line-strong pb-4">
          {order.items.map((item, index) => (
            <li
              key={`${item.productId}-${index}`}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p dir="auto" className="font-semibold text-guest-ink">
                  <span className="font-guest-display text-guest-pine">{item.quantity}×</span>{' '}
                  {item.name}
                </p>
                {item.modifiers.length > 0 ? (
                  <p dir="auto" className="mt-0.5 text-sm text-guest-muted">
                    {item.modifiers.map((modifier) => modifier.optionName).join(' · ')}
                  </p>
                ) : null}
              </div>
              <Price
                amount={item.lineTotal}
                currency={currency}
                className="shrink-0 text-[0.95rem] font-semibold text-guest-ink-soft"
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2.5">
          {order.type === 'DELIVERY' ? (
            <>
              <ReceiptRow label={copy.subtotal} amount={order.subtotal} currency={currency} />
              <ReceiptRow label={copy.deliveryFee} amount={order.deliveryFee} currency={currency} />
            </>
          ) : null}
          <ReceiptRow strong label={copy.total} amount={order.total} currency={currency} />
        </div>
      </section>
    </div>
  );
}
