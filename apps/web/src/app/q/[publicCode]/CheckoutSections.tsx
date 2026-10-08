'use client';

import { useState, type ReactNode } from 'react';
import { GuestIconAlert, GuestIconMapPin } from '../../../components/guest/icons';
import { Price } from '../../../components/guest/Price';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { formatMoney } from '../../../lib/public-menu/price-format';
import type { CheckoutFieldKey, CheckoutFormProps } from './guest-view-types';

const INPUT_CLASS =
  'h-[50px] w-full rounded-[14px] border border-g-line bg-g-surface px-3.5 text-[15px] text-g-text placeholder:text-g-text-3 focus:border-g-accent disabled:opacity-60';

/** A titled group of the single-step checkout. */
export function CheckoutSection({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-[16.5px] font-bold text-g-text">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  children,
  reserveLabelLines = false,
}: {
  id: string;
  label: string;
  children: ReactNode;
  /** In a narrow multi-column row, keep a two-line label slot so the inputs stay level when one label wraps. */
  reserveLabelLines?: boolean;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className={`mb-1.5 text-[13px] font-semibold leading-snug text-g-text-2 ${
          reserveLabelLines ? 'flex min-h-[2.7em] items-end' : 'block'
        }`}
      >
        {label}
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
  placeholder,
  reserveLabelLines = false,
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
  placeholder?: string;
  reserveLabelLines?: boolean;
}) {
  const id = `checkout-${fieldKey}`;
  return (
    <Field id={id} label={label} reserveLabelLines={reserveLabelLines}>
      <input
        id={id}
        type={type}
        inputMode={type === 'tel' ? 'tel' : undefined}
        dir={ltr ? 'ltr' : 'auto'}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete}
        disabled={disabled}
        placeholder={placeholder}
        aria-required={required || undefined}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        className={`${INPUT_CLASS} ${ltr ? 'rtl:text-right' : ''}`}
      />
    </Field>
  );
}

/** A radio card: real radio underneath (arrow keys, focus, screen readers), saffron when chosen. */
function RadioCard({
  name,
  checked,
  disabled,
  onSelect,
  children,
  trailing,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-g-accent-text ${
        checked ? 'border-g-accent bg-g-accent-soft' : 'border-g-line bg-g-surface'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="size-[22px] shrink-0 rounded-full border-2 border-g-text-3 transition-all peer-checked:border-[6px] peer-checked:border-g-accent peer-checked:bg-g-on-accent"
      />
      <span className="min-w-0 flex-1">{children}</span>
      {trailing}
    </label>
  );
}

/**
 * Where the order comes from. Pickup with several branches: a pick-one list (a single branch
 * needs no section -- it is already in the hero). Delivery: a "Delivering from" card with a
 * "Change" action when there are several branches, and the list while none is chosen yet.
 */
export function BranchChooser({
  checkout,
  copy,
  disabled,
}: {
  checkout: CheckoutFormProps;
  copy: PublicMenuCopy;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDelivery = checkout.fulfillment === 'DELIVERY';
  const selected = checkout.branches.find((branch) => branch.id === checkout.branchId) ?? null;
  const several = checkout.branches.length > 1;

  const list = (
    <div role="radiogroup" aria-label={copy.chooseBranch} className="flex flex-col gap-2.5">
      {checkout.branches.map((branch) => (
        <RadioCard
          key={branch.id}
          name="checkout-branch"
          checked={checkout.branchId === branch.id}
          disabled={disabled}
          onSelect={() => {
            checkout.onBranchChange(branch.id);
            setExpanded(false);
          }}
        >
          <span className="block text-[15px] font-bold text-g-text">
            <bdi>{branch.name}</bdi>
          </span>
        </RadioCard>
      ))}
    </div>
  );

  if (!isDelivery) {
    if (!several) return null;
    return (
      <CheckoutSection title={copy.pickupFrom} id="checkout-branch-title">
        {list}
      </CheckoutSection>
    );
  }

  return (
    <CheckoutSection title={copy.deliveringFrom} id="checkout-branch-title">
      {selected && !(several && expanded) ? (
        <div className="flex items-center gap-3 rounded-[22px] border border-g-line bg-g-surface px-3.5 py-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-g-accent-soft text-g-accent-text">
            <GuestIconMapPin className="size-5" />
          </span>
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-g-text">
            <bdi>{selected.name}</bdi>
          </span>
          {several ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              disabled={disabled}
              className="h-11 shrink-0 px-2.5 text-sm font-bold text-g-accent-text"
            >
              {copy.change}
            </button>
          ) : null}
        </div>
      ) : (
        list
      )}
    </CheckoutSection>
  );
}

/** Delivery areas with their fee and minimum on the card, so the commitment is clear before choosing. */
export function ZonePicker({
  checkout,
  copy,
  currency,
  locale,
  disabled,
}: {
  checkout: CheckoutFormProps;
  copy: PublicMenuCopy;
  currency: string;
  locale: string;
  disabled: boolean;
}) {
  if (!checkout.branchId) {
    return (
      <CheckoutSection title={copy.deliveryArea} id="checkout-zone-title">
        <p className="text-sm text-g-text-2">{copy.selectBranchFirst}</p>
      </CheckoutSection>
    );
  }
  return (
    <CheckoutSection title={copy.deliveryArea} id="checkout-zone-title">
      <div role="radiogroup" aria-label={copy.chooseDeliveryArea} className="flex flex-col gap-2.5">
        {checkout.zones.map((zone) => (
          <RadioCard
            key={zone.id}
            name="checkout-zone"
            checked={checkout.zoneId === zone.id}
            disabled={disabled}
            onSelect={() => checkout.onZoneChange(zone.id)}
            trailing={
              <Price
                amount={zone.deliveryFee}
                currency={currency}
                className="g-num text-[15px] text-g-price"
                currencyClassName="text-[0.65em] font-semibold"
              />
            }
          >
            <span className="block text-[15px] font-bold text-g-text">
              <bdi>{zone.name}</bdi>
            </span>
            {zone.minimumOrder !== '0.00' ? (
              <span className="mt-0.5 block text-[12.5px] text-g-text-2">
                {copy.minimumOrderOf(formatMoney(zone.minimumOrder, currency, locale))}
              </span>
            ) : null}
          </RadioCard>
        ))}
      </div>
    </CheckoutSection>
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
      className="mt-3 flex gap-3 rounded-2xl border border-g-accent bg-g-accent-soft p-3.5 text-g-text"
    >
      <GuestIconAlert className="mt-0.5 size-5 shrink-0 text-g-accent-text" />
      <div className="text-sm leading-[1.6]">
        <p className="font-bold">{message}</p>
        {shortfall ? <p className="mt-0.5 text-g-text-2">{shortfall}</p> : null}
      </div>
    </div>
  );
}

export function ContactSection({
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
    <CheckoutSection title={copy.yourDetails} id="checkout-details-title">
      <div className="grid grid-cols-2 gap-2.5">
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
          placeholder="01x xxxx xxxx"
          disabled={disabled}
          onChange={onFieldChange}
        />
      </div>
    </CheckoutSection>
  );
}

export function AddressSection({
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
    <CheckoutSection title={copy.deliveryAddressSection} id="checkout-address-title">
      <div className="flex flex-col gap-3">
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
        <div className="grid grid-cols-3 gap-2.5">
          <TextField
            fieldKey="deliveryBuilding"
            reserveLabelLines
            label={copy.deliveryBuilding}
            value={fields.deliveryBuilding}
            maxLength={50}
            disabled={disabled}
            onChange={onFieldChange}
          />
          <TextField
            fieldKey="deliveryFloor"
            reserveLabelLines
            label={copy.deliveryFloor}
            value={fields.deliveryFloor}
            maxLength={30}
            disabled={disabled}
            onChange={onFieldChange}
          />
          <TextField
            fieldKey="deliveryApartment"
            reserveLabelLines
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
    </CheckoutSection>
  );
}

export function NotesSection({
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

/** A summary row: label on one side, the amount on the other (Archivo numerals). */
export function SummaryRow({
  label,
  amount,
  currency,
  strong = false,
}: {
  label: string;
  amount: string;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${
        strong ? 'text-base font-bold text-g-text' : 'text-[14.5px] text-g-text-2'
      }`}
    >
      <span>{label}</span>
      <Price
        amount={amount}
        currency={currency}
        className={strong ? 'g-num text-2xl text-g-price' : 'g-num text-g-text'}
        currencyClassName="text-[0.65em] font-semibold"
      />
    </div>
  );
}
