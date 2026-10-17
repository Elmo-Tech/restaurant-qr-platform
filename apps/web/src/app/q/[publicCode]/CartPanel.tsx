'use client';

import { useEffect, useRef, useState } from 'react';
import { DishFallback } from '../../../components/guest/DishFallback';
import { GuestEmptyState } from '../../../components/guest/GuestEmptyState';
import {
  GuestIconAlert,
  GuestIconBag,
  GuestIconChevron,
  GuestIconClose,
  GuestIconTrash,
} from '../../../components/guest/icons';
import { Price } from '../../../components/guest/Price';
import { fromMinorUnits, toMinorUnits } from '../../../lib/public-menu/money';
import { DiscountedPrice } from '../../../components/guest/DiscountedPrice';
import { Sheet } from '../../../components/guest/Sheet';
import { Stepper } from '../../../components/guest/Stepper';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { GuestOrderView } from '../../../lib/public-menu/types';
import {
  AddressSection,
  BranchChooser,
  CheckoutSection,
  ContactSection,
  MinimumNotice,
  NotesSection,
  SummaryRow,
  ZonePicker,
} from './CheckoutSections';
import type { CartLine, CheckoutFormProps, OrderingContextView } from './guest-view-types';
import { ModeSwitch } from './ModeSwitch';
import { TableClosedNotice, type OrderingRecheckStatus } from './TableClosedNotice';

export interface CartPanelProps {
  copy: PublicMenuCopy;
  currency: string;
  locale: string;
  dir: 'ltr' | 'rtl';
  context: OrderingContextView;
  lines: CartLine[];
  /** Total units in the cart (the badge next to the title). */
  count: number;
  /** Items subtotal AFTER product discounts (what the Guest pays for the items). */
  totalDisplay: string;
  /** Product Discounts V1: the total discount across the cart, or null when nothing is discounted. */
  discountDisplay: string | null;
  isSubmitting: boolean;
  canSubmit: boolean;
  submitError: string | null;
  /** Why "Place order" is unavailable right now (a visible reason beats a silently greyed button). */
  submitHint: string | null;
  /** Table Sessions: set while staff have closed ordering for this TABLE QR (submission is disabled). */
  orderingClosed: {
    isChecking: boolean;
    status: OrderingRecheckStatus;
    onCheckAgain: () => void;
  } | null;
  confirmedOrder: GuestOrderView | null;
  checkout: CheckoutFormProps | null;
  onIncrement: (lineKey: string) => void;
  onDecrement: (lineKey: string) => void;
  onRemove: (lineKey: string) => void;
  /** Re-open the product sheet with this line's selections (only offered for lines with Modifier Groups). */
  onEditLine: (lineKey: string) => void;
  onPlaceOrder: () => void;
  onClose: () => void;
  /** Opens the order tracking sheet (offered on the confirmation). */
  onTrackOrder: () => void;
}

type Step = 'review' | 'details';

function orderTitle(order: GuestOrderView, copy: PublicMenuCopy): string {
  return order.type === 'PICKUP'
    ? copy.pickupOrderSent
    : order.type === 'DELIVERY'
      ? copy.deliveryOrderSent
      : copy.orderSent;
}

function CartItemRow({
  line,
  currency,
  copy,
  onIncrement,
  onDecrement,
  onRemove,
  onEditLine,
}: {
  line: CartLine;
  currency: string;
  copy: PublicMenuCopy;
  onIncrement: (lineKey: string) => void;
  onDecrement: (lineKey: string) => void;
  onRemove: (lineKey: string) => void;
  onEditLine: (lineKey: string) => void;
}) {
  const imageUrl = resolveAssetUrl(line.imageAssetPath);
  const [imageFailed, setImageFailed] = useState(false);
  const modifiers = [line.variantName, ...line.selections.map((selection) => selection.optionName)]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
  return (
    <li className="border-t border-g-line first:border-t-0">
      <div className="flex items-center gap-3 p-3.5">
        <div className="size-16 shrink-0 overflow-hidden rounded-[14px]">
          {imageUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              className="size-full object-cover"
            />
          ) : (
            <DishFallback className="size-full" iconClassName="size-7" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-g-text">
            <bdi>{line.name}</bdi>
          </p>
          {modifiers ? (
            <p dir="auto" className="mt-0.5 text-[12.5px] leading-[1.5] text-g-text-2">
              {modifiers}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-3">
            <DiscountedPrice
              original={line.originalLineTotal}
              current={line.lineTotal}
              discounted={line.discounted}
              currency={currency}
              copy={copy}
              direction="row"
              className="g-num text-base text-g-price"
              currencyClassName="text-[0.65em] font-semibold"
            />
            {line.hasModifierGroups && !line.blocked ? (
              <button
                type="button"
                onClick={() => onEditLine(line.lineKey)}
                aria-label={copy.editAria(line.name)}
                className="-my-2 flex h-11 items-center text-[13px] font-bold text-g-accent-text"
              >
                {copy.edit}
              </button>
            ) : null}
          </div>
        </div>
        {!line.blocked ? (
          <Stepper
            variant="cart"
            value={line.quantity}
            removesAtOne
            incrementLabel={copy.increaseAria(line.name)}
            decrementLabel={
              line.quantity <= 1 ? copy.removeAria(line.name) : copy.decreaseAria(line.name)
            }
            onIncrement={() => onIncrement(line.lineKey)}
            onDecrement={() => onDecrement(line.lineKey)}
          />
        ) : null}
      </div>
      {line.blocked ? (
        <div className="mx-3.5 mb-3.5 flex items-center justify-between gap-3 rounded-xl bg-g-danger-soft px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-g-danger">
            <GuestIconAlert className="size-4 shrink-0" />
            {copy.removeToContinue}
          </p>
          <button
            type="button"
            onClick={() => onRemove(line.lineKey)}
            aria-label={copy.removeAria(line.name)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-g-danger px-3.5 text-sm font-bold text-g-danger"
          >
            <GuestIconTrash className="size-4" />
            {copy.remove}
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Step 2's read-only recap of what is being ordered, with a way back to change it. */
function OrderRecap({
  lines,
  currency,
  copy,
  onEdit,
  disabled,
}: {
  lines: CartLine[];
  currency: string;
  copy: PublicMenuCopy;
  onEdit: () => void;
  disabled: boolean;
}) {
  return (
    <CheckoutSection title={copy.yourItems} id="cart-recap-title">
      <div className="rounded-[22px] border border-g-line bg-g-surface p-3.5">
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <li key={line.lineKey} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 text-g-text">
                <span className="g-num text-g-accent-text">{line.quantity}×</span>{' '}
                <bdi>{line.name}</bdi>
              </span>
              <DiscountedPrice
                original={line.originalLineTotal}
                current={line.lineTotal}
                discounted={line.discounted}
                currency={currency}
                copy={copy}
                direction="row"
                className="g-num shrink-0 text-g-text-2"
                currencyClassName="text-[0.7em] font-semibold"
                originalClassName="g-num text-[12.5px] text-g-text-3"
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="-mb-2 mt-1 flex h-11 items-center text-sm font-bold text-g-accent-text disabled:opacity-50"
        >
          {copy.edit}
        </button>
      </div>
    </CheckoutSection>
  );
}

/**
 * Cart + checkout in a drawer: a full-height bottom sheet below 1024px, a 440px side drawer from
 * the inline-end edge from 1024px up (dim backdrop; a click outside or Escape closes it).
 *
 * Two steps for a Pickup / Delivery order (a generic QR):
 *   1. Review -- the ordering-mode switch, every line with its modifiers, quantity stepper, price
 *      and Edit/remove, the items subtotal, and a sticky "Continue".
 *   2. Details -- a recap, then where from (pickup branch / "Delivering from" + delivery area with
 *      the minimum-order warning), your details, the delivery address, notes, the final summary
 *      (subtotal, delivery fee, total) and the sticky confirm button.
 * "Back" returns to step 1 with the cart and every typed value intact (all state lives in
 * `PublicMenuView`). A TABLE QR has nothing to fill in, so it is a single review step whose
 * footer sends the order (DINE_IN, unchanged).
 *
 * Cart/Order semantics are unchanged: every figure is display-only (the Backend recomputes the
 * fee, minimum and total), a sold-out line stays visible and blocks continuing until removed,
 * only the existing submit handler places the order (idempotent; the button is disabled while a
 * submission is in flight), and the confirmation uses only the Backend's returned order.
 */
export function CartPanel({
  copy,
  currency,
  locale,
  dir,
  context,
  lines,
  count,
  totalDisplay,
  discountDisplay,
  isSubmitting,
  canSubmit,
  submitError,
  submitHint,
  orderingClosed,
  confirmedOrder,
  checkout,
  onIncrement,
  onDecrement,
  onRemove,
  onEditLine,
  onPlaceOrder,
  onClose,
  onTrackOrder,
}: CartPanelProps) {
  const [step, setStep] = useState<Step>('review');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  const hasBlockedLines = lines.some((line) => line.blocked);
  const isDelivery = checkout?.fulfillment === 'DELIVERY';
  const isTwoStep = checkout !== null && !confirmedOrder && lines.length > 0;
  const canContinue = lines.length > 0 && !hasBlockedLines;
  const disabled = isSubmitting;

  // A cart emptied behind our back (or one without a checkout form) is always the review step.
  const effectiveStep: Step = step === 'details' && isTwoStep ? 'details' : 'review';

  // Moving between steps: the new step starts at the top and its heading takes focus, so a
  // keyboard or screen-reader user lands on the new content instead of a stale button.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    bodyRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [effectiveStep]);

  const ctaLabel = isSubmitting
    ? copy.placingOrder
    : checkout
      ? checkout.fulfillment === 'DELIVERY'
        ? copy.placeDeliveryOrder
        : copy.placePickupOrder
      : copy.placeOrder;
  const grandTotal = checkout ? checkout.grandTotalDisplay : totalDisplay;

  const titleText = confirmedOrder
    ? orderTitle(confirmedOrder, copy)
    : effectiveStep === 'details'
      ? copy.stepDetails
      : copy.yourOrder;

  return (
    <Sheet variant="drawer" dir={dir} labelledBy="cart-panel-title" onClose={onClose}>
      <div className="shrink-0 border-b border-g-line px-[18px] pb-4 pt-[18px] lg:px-6 lg:pt-[22px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {effectiveStep === 'details' && !confirmedOrder ? (
              <button
                type="button"
                onClick={() => setStep('review')}
                disabled={isSubmitting}
                aria-label={copy.back}
                className="-ms-1 flex size-11 shrink-0 items-center justify-center rounded-full border border-g-line bg-g-surface text-g-text disabled:opacity-50"
              >
                <GuestIconChevron
                  className="size-5 -scale-x-100 rtl:scale-x-100"
                  strokeWidth={2.4}
                />
              </button>
            ) : null}
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h2
                  id="cart-panel-title"
                  ref={headingRef}
                  tabIndex={-1}
                  className="g-display text-[28px] leading-[1.2] text-g-text outline-none lg:text-[30px]"
                >
                  {titleText}
                </h2>
                {!confirmedOrder && count > 0 && effectiveStep === 'review' ? (
                  <span className="g-num flex h-[26px] min-w-[26px] items-center justify-center rounded-[13px] bg-g-accent px-[7px] text-[13px] text-g-on-accent [font-weight:900]">
                    {count}
                  </span>
                ) : null}
              </div>
              {isTwoStep ? (
                <p className="mt-0.5 text-[12.5px] font-semibold text-g-text-3">
                  {copy.stepOf(effectiveStep === 'review' ? 1 : 2, 2)} ·{' '}
                  {effectiveStep === 'review'
                    ? copy.stepReview
                    : isDelivery
                      ? copy.delivery
                      : copy.pickup}
                </p>
              ) : context.kind === 'TABLE' && !confirmedOrder ? (
                <p dir="auto" className="mt-1 text-[13px] font-semibold text-g-accent-text">
                  {copy.tableDineIn(context.tableNumber ?? '')}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-g-line bg-g-surface text-g-text lg:bg-g-surface-2"
          >
            <GuestIconClose className="size-[18px]" strokeWidth={2.2} />
          </button>
        </div>
        {isTwoStep ? (
          <div className="mt-3 flex gap-1.5" aria-hidden="true">
            <span className="h-1 flex-1 rounded-full bg-g-accent" />
            <span
              className={`h-1 flex-1 rounded-full transition-colors ${
                effectiveStep === 'details' ? 'bg-g-accent' : 'bg-g-line'
              }`}
            />
          </div>
        ) : null}
      </div>

      <div
        ref={bodyRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-[18px] lg:px-6"
      >
        {confirmedOrder ? (
          <Confirmation copy={copy} currency={currency} order={confirmedOrder} onTrack={onTrackOrder} />
        ) : lines.length === 0 ? (
          <GuestEmptyState icon={<GuestIconBag />} title={copy.emptyCart} className="border-0" />
        ) : effectiveStep === 'review' ? (
          <div className="flex flex-col gap-[26px]">
            {checkout ? (
              <div className="flex gap-1 rounded-[20px] border border-g-line bg-g-surface p-[5px]">
                <ModeSwitch
                  variant="cart"
                  value={checkout.fulfillment}
                  pickupAvailable={checkout.pickupAvailable}
                  deliveryAvailable={checkout.deliveryAvailable}
                  onChange={checkout.onFulfillmentChange}
                  copy={copy}
                  disabled={disabled}
                />
              </div>
            ) : null}

            <ul
              aria-label={copy.yourItems}
              className="overflow-hidden rounded-[22px] border border-g-line bg-g-surface"
            >
              {lines.map((line) => (
                <CartItemRow
                  key={line.lineKey}
                  line={line}
                  currency={currency}
                  copy={copy}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                  onRemove={onRemove}
                  onEditLine={onEditLine}
                />
              ))}
            </ul>

            <CheckoutSection title={copy.orderSummary} id="cart-summary-title">
              <div className="flex flex-col gap-2.5 rounded-[22px] border border-g-line bg-g-surface p-4">
                {discountDisplay ? (
                  <>
                    <SummaryRow
                      label={copy.itemsSubtotal}
                      amount={addMoney(totalDisplay, discountDisplay)}
                      currency={currency}
                    />
                    <SummaryRow
                      label={copy.discountLabel}
                      amount={discountDisplay}
                      currency={currency}
                      negative
                    />
                  </>
                ) : (
                  <SummaryRow label={copy.itemsSubtotal} amount={totalDisplay} currency={currency} />
                )}
                {isDelivery ? (
                  <p className="text-[12.5px] text-g-text-3">{copy.deliveryFeeNextStep}</p>
                ) : null}
                {!checkout ? (
                  <>
                    <div className="my-1 h-px bg-g-line" />
                    <SummaryRow
                      strong
                      label={copy.total}
                      amount={totalDisplay}
                      currency={currency}
                    />
                  </>
                ) : null}
              </div>
            </CheckoutSection>
          </div>
        ) : (
          <div className="flex flex-col gap-[26px]">
            <OrderRecap
              lines={lines}
              currency={currency}
              copy={copy}
              onEdit={() => setStep('review')}
              disabled={disabled}
            />
            {checkout ? (
              <>
                <BranchChooser checkout={checkout} copy={copy} disabled={disabled} />
                {isDelivery ? (
                  <div>
                    <ZonePicker
                      checkout={checkout}
                      copy={copy}
                      currency={currency}
                      locale={locale}
                      disabled={disabled}
                    />
                    {checkout.minimumMessage ? (
                      <MinimumNotice
                        message={checkout.minimumMessage}
                        shortfall={checkout.minimumShortfallDisplay}
                      />
                    ) : null}
                  </div>
                ) : null}
                <ContactSection checkout={checkout} copy={copy} disabled={disabled} />
                {isDelivery ? (
                  <AddressSection checkout={checkout} copy={copy} disabled={disabled} />
                ) : null}
                <NotesSection checkout={checkout} copy={copy} disabled={disabled} />

                <CheckoutSection title={copy.orderSummary} id="cart-final-summary-title">
                  <div className="flex flex-col gap-2.5 rounded-[22px] border border-g-line bg-g-surface p-4">
                    {discountDisplay ? (
                      <>
                        <SummaryRow
                          label={copy.itemsSubtotal}
                          amount={addMoney(checkout.subtotalDisplay, discountDisplay)}
                          currency={currency}
                        />
                        <SummaryRow
                          label={copy.discountLabel}
                          amount={discountDisplay}
                          currency={currency}
                          negative
                        />
                      </>
                    ) : (
                      <SummaryRow
                        label={copy.itemsSubtotal}
                        amount={checkout.subtotalDisplay}
                        currency={currency}
                      />
                    )}
                    {isDelivery && checkout.deliveryFeeDisplay !== null ? (
                      <SummaryRow
                        label={copy.deliveryFee}
                        amount={checkout.deliveryFeeDisplay}
                        currency={currency}
                      />
                    ) : null}
                    <div className="my-1 h-px bg-g-line" />
                    <SummaryRow
                      strong
                      label={copy.total}
                      amount={checkout.grandTotalDisplay}
                      currency={currency}
                    />
                  </div>
                </CheckoutSection>
              </>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-g-line bg-g-surface px-4 pb-[max(1.375rem,env(safe-area-inset-bottom))] pt-3.5 lg:px-6">
        {confirmedOrder ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-[58px] w-full items-center justify-center rounded-[18px] bg-g-accent text-[16.5px] font-extrabold text-g-on-accent shadow-[0_10px_24px_rgb(245_165_36/0.3)]"
          >
            {copy.backToMenu}
          </button>
        ) : (
          <>
            {submitError ? (
              <div
                role="alert"
                className="mb-3 flex gap-2.5 rounded-xl bg-g-danger-soft px-3.5 py-3 text-sm font-semibold leading-relaxed text-g-danger"
              >
                <GuestIconAlert className="mt-0.5 size-4 shrink-0" />
                <p>{submitError}</p>
              </div>
            ) : null}
            {orderingClosed ? (
              <TableClosedNotice
                className="mb-3"
                copy={copy}
                isChecking={orderingClosed.isChecking}
                status={orderingClosed.status}
                onCheckAgain={orderingClosed.onCheckAgain}
              />
            ) : null}
            {isTwoStep && effectiveStep === 'review' ? (
              <>
                {hasBlockedLines ? (
                  <p id="cart-submit-hint" className="mb-2.5 text-center text-[13px] text-g-text-2">
                    {copy.placeOrderHintBlocked}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={!canContinue}
                  onClick={() => setStep('details')}
                  aria-describedby={hasBlockedLines ? 'cart-submit-hint' : undefined}
                  className={`flex h-[58px] w-full items-center justify-between gap-3 rounded-[18px] px-[22px] text-[16.5px] font-extrabold transition-[background-color,color,transform] active:scale-[0.99] disabled:cursor-not-allowed ${
                    canContinue
                      ? 'bg-g-accent text-g-on-accent shadow-[0_10px_24px_rgb(245_165_36/0.3)]'
                      : 'border border-g-line bg-g-surface-2 text-g-text-2'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{copy.continueToDetails}</span>
                    <GuestIconChevron
                      className="size-[18px] shrink-0 rtl:-scale-x-100"
                      strokeWidth={2.6}
                    />
                  </span>
                  <Price
                    amount={totalDisplay}
                    currency={currency}
                    className="g-num text-xl [font-weight:900]"
                    currencyClassName="text-xs font-semibold"
                  />
                </button>
              </>
            ) : (
              <>
                {!submitError && submitHint && lines.length > 0 && !canSubmit ? (
                  <p id="cart-submit-hint" className="mb-2.5 text-center text-[13px] text-g-text-2">
                    {submitHint}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={onPlaceOrder}
                  aria-describedby={submitHint && !canSubmit ? 'cart-submit-hint' : undefined}
                  className={`flex h-[58px] w-full items-center justify-between gap-3 rounded-[18px] px-[22px] text-[16.5px] font-extrabold transition-[background-color,color,transform] active:scale-[0.99] disabled:cursor-not-allowed ${
                    canSubmit
                      ? 'bg-g-accent text-g-on-accent shadow-[0_10px_24px_rgb(245_165_36/0.3)]'
                      : 'border border-g-line bg-g-surface-2 text-g-text-2'
                  }`}
                >
                  <span className="truncate">{ctaLabel}</span>
                  {lines.length > 0 ? (
                    <Price
                      amount={grandTotal}
                      currency={currency}
                      className="g-num text-xl [font-weight:900]"
                      currencyClassName="text-xs font-semibold"
                    />
                  ) : null}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** The confirmation, stamped from the Backend's own returned order -- never a client recomputation. */
function Confirmation({
  copy,
  currency,
  order,
  onTrack,
}: {
  copy: PublicMenuCopy;
  currency: string;
  order: GuestOrderView;
  onTrack: () => void;
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
        <span className="guest-anim-bump flex size-16 items-center justify-center rounded-full bg-g-accent text-g-on-accent">
          <svg
            viewBox="0 0 24 24"
            className="size-8"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.6}
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
        <p role="status" className="max-w-xs text-[15px] leading-[1.7] text-g-text-2">
          {pending}
        </p>
        <div className="flex flex-col gap-0.5 text-sm font-semibold text-g-accent-text">
          {order.table ? <span dir="auto">{copy.tableDineIn(order.table.number)}</span> : null}
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

      <button
        type="button"
        onClick={onTrack}
        className="flex h-12 w-full items-center justify-center rounded-2xl bg-g-accent px-6 text-[15px] font-extrabold text-g-on-accent"
      >
        {copy.trackOrder}
      </button>

      <section
        aria-label={copy.orderSummary}
        className="w-full rounded-[22px] border border-g-line bg-g-surface p-4 text-start"
      >
        <ul className="flex flex-col gap-3 border-b border-dashed border-g-line pb-4">
          {order.items.map((item, index) => (
            <li
              key={`${item.productId}-${index}`}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p dir="auto" className="text-[15px] font-bold text-g-text">
                  <span className="g-num text-g-accent-text">{item.quantity}×</span> {item.name}
                </p>
                {item.variantName !== null || item.modifiers.length > 0 ? (
                  <p dir="auto" className="mt-0.5 text-[12.5px] text-g-text-2">
                    {[item.variantName, ...item.modifiers.map((modifier) => modifier.optionName)]
                      .filter((part): part is string => part !== null && part !== '')
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
              <DiscountedPrice
                original={addMoney(item.lineTotal, item.discountAmount)}
                current={item.lineTotal}
                discounted={item.discountAmount !== '0.00'}
                currency={currency}
                copy={copy}
                direction="row"
                className="g-num shrink-0 text-[15px] text-g-text"
                currencyClassName="text-[0.65em] font-semibold"
                originalClassName="g-num text-[13px] text-g-text-3"
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2.5">
          {order.discountTotal !== '0.00' || order.type === 'DELIVERY' ? (
            <>
              <SummaryRow
                label={copy.itemsSubtotal}
                amount={addMoney(order.subtotal, order.discountTotal)}
                currency={currency}
              />
              {order.discountTotal !== '0.00' ? (
                <SummaryRow
                  label={copy.discountLabel}
                  amount={order.discountTotal}
                  currency={currency}
                  negative
                />
              ) : null}
              {order.type === 'DELIVERY' ? (
                <SummaryRow label={copy.deliveryFee} amount={order.deliveryFee} currency={currency} />
              ) : null}
              <div className="my-1 h-px bg-g-line" />
            </>
          ) : null}
          <SummaryRow strong label={copy.total} amount={order.total} currency={currency} />
        </div>
      </section>
    </div>
  );
}

/** Exact decimal addition of two Backend money strings (BigInt minor units; display only). */
function addMoney(a: string, b: string): string {
  return fromMinorUnits(toMinorUnits(a) + toMinorUnits(b));
}
