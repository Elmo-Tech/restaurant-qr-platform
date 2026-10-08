'use client';

import { useState } from 'react';
import { GuestIconCheck, GuestIconClose } from '../../../components/guest/icons';
import { MonogramTile } from '../../../components/guest/MonogramTile';
import { Price } from '../../../components/guest/Price';
import { Sheet } from '../../../components/guest/Sheet';
import { Stepper } from '../../../components/guest/Stepper';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { fromMinorUnits, toMinorUnits, ZERO_MINOR_UNITS } from '../../../lib/public-menu/money';
import type { PublicMenuModifierGroup, PublicMenuProduct } from '../../../lib/public-menu/types';

const MAX_QUANTITY = 99;

/** "Choose 1", "Choose 2 to 4", "Pick one", "Choose up to 3" -- the rule in guest language, never "Modifier Group". */
function ruleText(group: PublicMenuModifierGroup, copy: PublicMenuCopy): string {
  const min = group.minimumSelections;
  const max = group.maximumSelections;
  if (min === 0) return max === 1 ? copy.pickOne : `${copy.chooseUpTo} ${max}`;
  if (min === max) return `${copy.chooseExactly} ${min}`;
  return copy.chooseBetween(min, max);
}

/**
 * FT-13A product customizer: a bottom sheet on phones, a centered dialog on
 * larger screens. Shows the dish (photo or monogram, name, description, base
 * price), each Modifier Group in plain restaurant language with its rule and a
 * Required/Optional marker, a quantity stepper and a sticky "Add to order ·
 * total" action.
 *
 * Business rules are unchanged from the previous dialog: the group's
 * `minimumSelections`/`maximumSelections` are enforced client-side before the
 * Add button works (a usability guard only -- the Backend re-validates every
 * selection authoritatively), and the live total is display-only, computed with
 * the same exact BigInt minor-unit helpers the Cart uses.
 */
export function ProductSheet({
  product,
  categoryId,
  currency,
  copy,
  dir,
  onCancel,
  onConfirm,
}: {
  product: PublicMenuProduct;
  categoryId: string;
  currency: string;
  copy: PublicMenuCopy;
  dir: 'ltr' | 'rtl';
  onCancel: () => void;
  onConfirm: (selectedOptionIds: string[], quantity: number) => void;
}) {
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [showValidation, setShowValidation] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const imageUrl = resolveAssetUrl(product.primaryImageAssetPath);
  const showPhoto = imageUrl !== null && !imageFailed;

  function selectionsFor(groupId: string): string[] {
    return selectedByGroup[groupId] ?? [];
  }

  function toggleOption(groupId: string, optionId: string, maximumSelections: number) {
    setSelectedByGroup((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (maximumSelections === 1) {
        return { ...prev, [groupId]: [optionId] };
      }
      if (current.length >= maximumSelections) {
        return prev;
      }
      return { ...prev, [groupId]: [...current, optionId] };
    });
  }

  const invalidGroupIds = new Set(
    product.modifierGroups
      .filter((group) => {
        const count = selectionsFor(group.id).length;
        return count < group.minimumSelections || count > group.maximumSelections;
      })
      .map((group) => group.id),
  );
  const isValid = invalidGroupIds.size === 0;

  const unitMinorUnits = product.modifierGroups.reduce((sum, group) => {
    const selectedIds = new Set(selectionsFor(group.id));
    const groupSum = group.options
      .filter((option) => selectedIds.has(option.id))
      .reduce((s, option) => s + toMinorUnits(option.priceAdjustment), ZERO_MINOR_UNITS);
    return sum + groupSum;
  }, toMinorUnits(product.basePrice));
  const totalDisplay = fromMinorUnits(unitMinorUnits * BigInt(quantity));

  function handleConfirm() {
    if (!isValid) {
      setShowValidation(true);
      const firstInvalid = product.modifierGroups.find((group) => invalidGroupIds.has(group.id));
      if (firstInvalid) {
        document.getElementById(`modgroup-${firstInvalid.id}`)?.scrollIntoView({
          block: 'center',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        });
      }
      return;
    }
    const selectedOptionIds = product.modifierGroups.flatMap((group) => selectionsFor(group.id));
    onConfirm(selectedOptionIds, quantity);
  }

  return (
    <Sheet variant="sheet" dir={dir} labelledBy="product-sheet-title" onClose={onCancel}>
      <div className="relative shrink-0">
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
          <img
            src={imageUrl}
            alt=""
            decoding="async"
            onError={() => setImageFailed(true)}
            className="aspect-[16/9] max-h-56 w-full object-cover sm:aspect-[2/1] sm:max-h-64"
          />
        ) : (
          <MonogramTile
            name={product.name}
            seed={categoryId}
            className="h-24 w-full sm:h-28"
            letterClassName="text-6xl"
          />
        )}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-2 mx-auto h-1 w-10 rounded-full bg-guest-ink/25 sm:hidden"
        />
        <button
          type="button"
          onClick={onCancel}
          aria-label={copy.close}
          className="absolute end-3 top-3 flex size-11 items-center justify-center rounded-full bg-guest-surface text-guest-ink shadow-md transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-guest-pine"
        >
          <GuestIconClose className="size-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <h2
            id="product-sheet-title"
            dir="auto"
            className="font-guest-display text-[1.65rem] font-extrabold leading-tight text-guest-ink"
          >
            {product.name}
          </h2>
          <Price
            amount={product.basePrice}
            currency={currency}
            className="mt-1 shrink-0 font-guest-display text-xl font-bold text-guest-ink"
          />
        </div>
        {product.description ? (
          <p dir="auto" className="mt-2 text-[0.97rem] leading-relaxed text-guest-muted">
            {product.description}
          </p>
        ) : null}

        {product.modifierGroups.length > 0 ? (
          <div className="mt-6 flex flex-col gap-4">
            {product.modifierGroups.map((group) => {
              const selected = selectionsFor(group.id);
              const isInvalid = showValidation && invalidGroupIds.has(group.id);
              const isSingleSelect = group.maximumSelections === 1;
              const isRequired = group.minimumSelections > 0;
              const isSatisfied = selected.length >= group.minimumSelections;
              const reachedMax = !isSingleSelect && selected.length >= group.maximumSelections;
              const titleId = `modgroup-${group.id}-title`;
              return (
                <fieldset
                  key={group.id}
                  id={`modgroup-${group.id}`}
                  aria-labelledby={titleId}
                  className={`min-w-0 overflow-hidden rounded-2xl border px-4 pt-4 transition-colors ${
                    isInvalid
                      ? 'border-guest-danger bg-guest-danger-soft/50'
                      : 'border-guest-line bg-guest-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 pb-2">
                    <div className="min-w-0">
                      <h3
                        id={titleId}
                        dir="auto"
                        className="font-guest-display text-lg font-bold leading-snug text-guest-ink"
                      >
                        {group.name}
                      </h3>
                      <p
                        className={`mt-0.5 text-sm ${isInvalid ? 'font-medium text-guest-danger' : 'text-guest-muted'}`}
                      >
                        {ruleText(group, copy)}
                        {!isSingleSelect && selected.length > 0
                          ? ` · ${copy.selectedOf(selected.length, group.maximumSelections)}`
                          : ''}
                      </p>
                      {group.helperText ? (
                        <p dir="auto" className="mt-0.5 text-sm text-guest-muted">
                          {group.helperText}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                          isRequired
                            ? isInvalid
                              ? 'bg-guest-danger text-white'
                              : isSatisfied
                                ? 'bg-guest-pine-soft text-guest-pine'
                                : 'bg-guest-ink text-white'
                            : 'border border-guest-line-strong text-guest-muted'
                        }`}
                      >
                        {isRequired && isSatisfied ? <GuestIconCheck className="size-3" /> : null}
                        {isRequired ? copy.required : copy.optional}
                      </span>
                      {!isRequired && isSingleSelect && selected.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedByGroup((prev) => ({ ...prev, [group.id]: [] }))
                          }
                          className="rounded px-1 text-xs font-semibold text-guest-pine underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-guest-pine"
                        >
                          {copy.clearChoice}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="divide-y divide-guest-line">
                    {group.options.map((option) => {
                      const isChecked = selected.includes(option.id);
                      const isDisabled = reachedMax && !isChecked;
                      const hasPrice = toMinorUnits(option.priceAdjustment) !== ZERO_MINOR_UNITS;
                      return (
                        <label
                          key={option.id}
                          className={`-mx-4 flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors has-[:checked]:bg-guest-pine-soft/70 has-[:focus-visible]:bg-guest-pine-soft/70 ${
                            isDisabled
                              ? 'cursor-not-allowed opacity-45'
                              : 'cursor-pointer hover:bg-guest-paper'
                          }`}
                        >
                          <input
                            type={isSingleSelect ? 'radio' : 'checkbox'}
                            name={`group-${group.id}`}
                            checked={isChecked}
                            disabled={isDisabled}
                            onChange={() =>
                              toggleOption(group.id, option.id, group.maximumSelections)
                            }
                            className="peer sr-only"
                          />
                          <span
                            dir="auto"
                            className="min-w-0 flex-1 text-[1rem] leading-snug text-guest-ink peer-checked:font-semibold"
                          >
                            {option.name}
                          </span>
                          {hasPrice ? (
                            <Price
                              amount={option.priceAdjustment}
                              currency={currency}
                              prefix="+"
                              className="text-sm text-guest-muted"
                              currencyClassName="text-[0.85em]"
                            />
                          ) : null}
                          <span
                            aria-hidden="true"
                            className={`grid size-6 shrink-0 place-items-center border-2 border-guest-line-strong bg-guest-surface text-transparent transition-colors peer-checked:border-guest-pine peer-checked:bg-guest-pine peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-guest-pine ${
                              isSingleSelect ? 'rounded-full' : 'rounded-md'
                            }`}
                          >
                            <GuestIconCheck className="size-3.5" />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-guest-line bg-guest-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
        {showValidation && !isValid ? (
          <p role="alert" className="mb-2.5 text-center text-sm font-semibold text-guest-danger">
            {copy.selectionRequiredError}
          </p>
        ) : null}
        <div className="flex items-center gap-2.5">
          <Stepper
            size="sm"
            value={quantity}
            decrementLabel={copy.decreaseAria(product.name)}
            incrementLabel={copy.increaseAria(product.name)}
            onDecrement={() => setQuantity((current) => Math.max(1, current - 1))}
            onIncrement={() => setQuantity((current) => Math.min(MAX_QUANTITY, current + 1))}
            incrementDisabled={quantity >= MAX_QUANTITY}
          />
          <button
            type="button"
            onClick={handleConfirm}
            className="flex h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-full bg-guest-pine px-4 text-[0.95rem] font-semibold text-white transition-[background-color,transform] hover:bg-guest-pine-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-guest-pine active:scale-[0.99]"
          >
            <span className="truncate">{copy.addToOrder}</span>
            <Price
              amount={totalDisplay}
              currency={currency}
              className="font-guest-display text-base font-bold"
              currencyClassName="text-[0.78em] font-medium opacity-80"
            />
          </button>
        </div>
      </div>
    </Sheet>
  );
}
