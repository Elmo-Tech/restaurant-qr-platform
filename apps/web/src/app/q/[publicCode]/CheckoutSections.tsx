'use client';

import type { ReactNode } from 'react';
import {
  GuestIconAlert,
  GuestIconBag,
  GuestIconCheck,
  GuestIconMapPin,
  GuestIconMoped,
} from '../../../components/guest/icons';
import { Price } from '../../../components/guest/Price';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { CheckoutFieldKey, CheckoutFormProps, Fulfillment } from './guest-view-types';

const INPUT_CLASS =
  'h-12 w-full rounded-xl border border-guest-line-strong bg-guest-surface px-3.5 text-base text-guest-ink placeholder:text-guest-muted focus:border-guest-pine focus:outline-2 focus:outline-offset-0 focus:outline-guest-pine/25 disabled:bg-guest-paper disabled:text-guest-muted';

/** A titled group of related fields -- the checkout is a few clear sections, not one long form. */
export function CheckoutSection({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section aria-labelledby={id} className="@container flex flex-col gap-3.5">
      <h3 id={id} className="font-guest-display text-xl font-bold text-guest-ink">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  required = false,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-guest-ink-soft">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-guest-danger">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

function TextField({
  fieldKey,
  label,
  value,
  maxLength,
  disabled,
  onChange,
  required = false,
  type = 'text',
  autoComplete,
  ltr = false,
}: {
  fieldKey: CheckoutFieldKey;
  label: string;
  value: string;
  maxLength: number;
  disabled: boolean;
  onChange: (key: CheckoutFieldKey, value: string) => void;
  required?: boolean;
  type?: 'text' | 'tel';
  autoComplete?: string;
  ltr?: boolean;
}) {
  const id = `checkout-${fieldKey}`;
  return (
    <Field id={id} label={label} required={required}>
      <input
        id={id}
        type={type}
        inputMode={type === 'tel' ? 'tel' : undefined}
        dir={ltr ? 'ltr' : 'auto'}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-required={required || undefined}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

const MODE_ICON: Record<Fulfillment, ReactNode> = {
  PICKUP: <GuestIconBag className="size-5" />,
  DELIVERY: <GuestIconMoped className="size-5" />,
};

/** Pickup | Delivery as two large selectable cards (real radios underneath: arrow keys, focus, screen readers). */
export function FulfillmentSelector({
  checkout,
  copy,
  disabled,
}: {
  checkout: CheckoutFormProps;
  copy: PublicMenuCopy;
  disabled: boolean;
}) {
  const modes: { mode: Fulfillment; label: string; hint: string; available: boolean }[] = [
    {
      mode: 'PICKUP',
      label: copy.pickup,
      hint: copy.pickupHint,
      available: checkout.pickupAvailable,
    },
    {
      mode: 'DELIVERY',
      label: copy.delivery,
      hint: copy.deliveryHint,
      available: checkout.deliveryAvailable,
    },
  ];
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 font-guest-display text-xl font-bold text-guest-ink">
        {copy.fulfillment}
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {modes.map(({ mode, label, hint, available }) => {
          const selected = checkout.fulfillment === mode;
          const isDisabled = disabled || !available;
          return (
            <label
              key={mode}
              className={`relative flex flex-col gap-2.5 rounded-2xl border-2 p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-guest-pine ${
                selected
                  ? 'border-guest-pine bg-guest-pine-soft'
                  : 'border-guest-line bg-guest-surface hover:border-guest-line-strong'
              } ${!available ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}
            >
              <input
                type="radio"
                name="fulfillment"
                value={mode}
                checked={selected}
                disabled={isDisabled}
                onChange={() => checkout.onFulfillmentChange(mode)}
                className="sr-only"
              />
              <span className="flex items-center justify-between">
                <span
                  className={`flex size-10 items-center justify-center rounded-full ${
                    selected ? 'bg-guest-pine text-white' : 'bg-guest-paper text-guest-ink-soft'
                  }`}
                >
                  {MODE_ICON[mode]}
                </span>
                {selected ? (
                  <span className="flex size-6 items-center justify-center rounded-full bg-guest-pine text-white">
                    <GuestIconCheck className="size-3.5" />
                  </span>
                ) : null}
              </span>
              <span>
                <span className="block font-guest-display text-lg font-bold leading-tight text-guest-ink">
                  {label}
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-guest-muted">
                  {available ? hint : copy.notAvailableNow}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** One eligible Branch is stated; several become a pick-one list. */
export function BranchPicker({
  checkout,
  copy,
  disabled,
}: {
  checkout: CheckoutFormProps;
  copy: PublicMenuCopy;
  disabled: boolean;
}) {
  const label = checkout.fulfillment === 'DELIVERY' ? copy.deliveryFrom : copy.pickupFrom;
  if (checkout.branches.length === 1) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-guest-line bg-guest-surface px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-guest-pine-soft text-guest-pine">
          <GuestIconMapPin className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-guest-muted">{label}</p>
          <p className="font-guest-display text-lg font-bold leading-tight text-guest-ink">
            <bdi>{checkout.branches[0].name}</bdi>
          </p>
        </div>
      </div>
    );
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5">
      <legend className="sr-only">
        {label}
        <span aria-hidden="true" className="text-guest-danger">
          {' '}
          *
        </span>
      </legend>
      {checkout.branches.map((branch) => {
        const selected = checkout.branchId === branch.id;
        return (
          <label
            key={branch.id}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-guest-pine ${
              selected
                ? 'border-guest-pine bg-guest-pine-soft'
                : 'border-guest-line bg-guest-surface hover:border-guest-line-strong'
            }`}
          >
            <input
              type="radio"
              name="checkout-branch"
              checked={selected}
              disabled={disabled}
              onChange={() => checkout.onBranchChange(branch.id)}
              className="peer sr-only"
            />
            <span className="min-w-0 flex-1 font-semibold text-guest-ink">
              <bdi>{branch.name}</bdi>
            </span>
            <span
              aria-hidden="true"
              className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                selected
                  ? 'border-guest-pine bg-guest-pine text-white'
                  : 'border-guest-line-strong bg-guest-surface text-transparent'
              }`}
            >
              <GuestIconCheck className="size-3.5" />
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Delivery areas with their fee and minimum on the card, so the commitment is clear before choosing. */
export function DeliveryAreaPicker({
  checkout,
  copy,
  currency,
  disabled,
}: {
  checkout: CheckoutFormProps;
  copy: PublicMenuCopy;
  currency: string;
  disabled: boolean;
}) {
  if (!checkout.branchId) {
    return <p className="text-sm text-guest-muted">{copy.selectBranchFirst}</p>;
  }
  const hasMinimum = (amount: string) => amount !== '0.00';
  const meta = (zone: CheckoutFormProps['zones'][number]) => (
    <span className="mt-0.5 flex flex-col text-sm text-guest-muted">
      <span>
        {copy.deliveryFee}{' '}
        <Price amount={zone.deliveryFee} currency={currency} currencyClassName="text-[0.85em]" />
      </span>
      {hasMinimum(zone.minimumOrder) ? (
        <span>
          <span className="capitalize">{copy.minimumOrderLabel}</span>{' '}
          <Price amount={zone.minimumOrder} currency={currency} currencyClassName="text-[0.85em]" />
        </span>
      ) : null}
    </span>
  );
  if (checkout.zones.length === 1) {
    const zone = checkout.zones[0];
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-guest-line bg-guest-surface px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-guest-pine-soft text-guest-pine">
          <GuestIconMoped className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-guest-muted">{copy.deliveryArea}</p>
          <p className="font-guest-display text-lg font-bold leading-tight text-guest-ink">
            <bdi>{zone.name}</bdi>
          </p>
          {meta(zone)}
        </div>
      </div>
    );
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5">
      <legend className="mb-2.5 text-sm font-semibold text-guest-ink-soft">
        {copy.chooseDeliveryArea}
        <span aria-hidden="true" className="text-guest-danger">
          {' '}
          *
        </span>
      </legend>
      {checkout.zones.map((zone) => {
        const selected = checkout.zoneId === zone.id;
        return (
          <label
            key={zone.id}
            className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-guest-pine ${
              selected
                ? 'border-guest-pine bg-guest-pine-soft'
                : 'border-guest-line bg-guest-surface hover:border-guest-line-strong'
            }`}
          >
            <input
              type="radio"
              name="checkout-zone"
              checked={selected}
              disabled={disabled}
              onChange={() => checkout.onZoneChange(zone.id)}
              className="sr-only"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-guest-ink">
                <bdi>{zone.name}</bdi>
              </span>
              {meta(zone)}
            </span>
            <span
              aria-hidden="true"
              className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                selected
                  ? 'border-guest-pine bg-guest-pine text-white'
                  : 'border-guest-line-strong bg-guest-surface text-transparent'
              }`}
            >
              <GuestIconCheck className="size-3.5" />
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function ContactFields({
  checkout,
  copy,
  disabled,
}: {
  checkout: CheckoutFormProps;
  copy: PublicMenuCopy;
  disabled: boolean;
}) {
  const { fields, onFieldChange } = checkout;
  return (
    <div className="grid gap-3.5 @md:grid-cols-2">
      <TextField
        fieldKey="customerName"
        label={copy.customerName}
        required
        value={fields.customerName}
        maxLength={100}
        autoComplete="name"
        disabled={disabled}
        onChange={onFieldChange}
      />
      <TextField
        fieldKey="customerPhone"
        label={copy.customerPhone}
        required
        value={fields.customerPhone}
        maxLength={30}
        type="tel"
        ltr
        autoComplete="tel"
        disabled={disabled}
        onChange={onFieldChange}
      />
    </div>
  );
}

export function AddressFields({
  checkout,
  copy,
  disabled,
}: {
  checkout: CheckoutFormProps;
  copy: PublicMenuCopy;
  disabled: boolean;
}) {
  const { fields, onFieldChange } = checkout;
  return (
    <div className="flex flex-col gap-3.5">
      <TextField
        fieldKey="deliveryAddress"
        label={copy.deliveryAddress}
        required
        value={fields.deliveryAddress}
        maxLength={300}
        autoComplete="street-address"
        disabled={disabled}
        onChange={onFieldChange}
      />
      <div className="grid grid-cols-1 gap-3.5 @md:grid-cols-3">
        <TextField
          fieldKey="deliveryBuilding"
          label={copy.deliveryBuilding}
          value={fields.deliveryBuilding}
          maxLength={50}
          disabled={disabled}
          onChange={onFieldChange}
        />
        <TextField
          fieldKey="deliveryFloor"
          label={copy.deliveryFloor}
          value={fields.deliveryFloor}
          maxLength={30}
          disabled={disabled}
          onChange={onFieldChange}
        />
        <TextField
          fieldKey="deliveryApartment"
          label={copy.deliveryApartment}
          value={fields.deliveryApartment}
          maxLength={30}
          disabled={disabled}
          onChange={onFieldChange}
        />
      </div>
      <TextField
        fieldKey="deliveryLandmark"
        label={copy.deliveryLandmark}
        value={fields.deliveryLandmark}
        maxLength={150}
        disabled={disabled}
        onChange={onFieldChange}
      />
    </div>
  );
}

export function NotesField({
  checkout,
  copy,
  disabled,
}: {
  checkout: CheckoutFormProps;
  copy: PublicMenuCopy;
  disabled: boolean;
}) {
  return (
    <Field id="checkout-customerNotes" label={copy.customerNotes}>
      <textarea
        id="checkout-customerNotes"
        dir="auto"
        value={checkout.fields.customerNotes}
        maxLength={500}
        rows={3}
        disabled={disabled}
        onChange={(event) => checkout.onFieldChange('customerNotes', event.target.value)}
        className={`${INPUT_CLASS} h-auto resize-none py-3`}
      />
    </Field>
  );
}

/** Below-minimum feedback: what the rule is, and exactly how much more is needed. */
export function MinimumNotice({
  message,
  shortfall,
}: {
  message: string;
  shortfall: string | null;
}) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-2xl bg-guest-warning-soft px-4 py-3.5 text-guest-warning-ink"
    >
      <GuestIconAlert className="mt-0.5 size-5 shrink-0" />
      <div className="text-sm leading-relaxed">
        <p className="font-semibold">{message}</p>
        {shortfall ? <p className="mt-0.5">{shortfall}</p> : null}
      </div>
    </div>
  );
}

/** A receipt row: label ........ amount, with the dotted menu-style leader between them. */
export function ReceiptRow({
  label,
  amount,
  currency,
  strong = false,
}: {
  label: ReactNode;
  amount: string;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline gap-2 ${
        strong
          ? 'font-guest-display text-xl font-extrabold text-guest-ink'
          : 'text-[0.95rem] text-guest-ink-soft'
      }`}
    >
      <span className="min-w-0">{label}</span>
      <span
        aria-hidden="true"
        className="min-w-4 flex-1 border-b-2 border-dotted border-guest-line-strong"
      />
      <Price amount={amount} currency={currency} />
    </div>
  );
}
