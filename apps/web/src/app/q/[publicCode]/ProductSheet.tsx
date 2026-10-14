'use client';

import { useState } from 'react';
import { DishFallback } from '../../../components/guest/DishFallback';
import {
  GuestIconCheck,
  GuestIconClose,
  GuestIconPlus,
  GuestIconStar,
} from '../../../components/guest/icons';
import { Price } from '../../../components/guest/Price';
import { DiscountBadge, DiscountedPrice } from '../../../components/guest/DiscountedPrice';
import { Sheet } from '../../../components/guest/Sheet';
import { Stepper } from '../../../components/guest/Stepper';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { fromMinorUnits, toMinorUnits, ZERO_MINOR_UNITS } from '../../../lib/public-menu/money';
import type { PublicMenuModifierGroup, PublicMenuProduct } from '../../../lib/public-menu/types';

const MAX_QUANTITY = 99;

/** "Choose 1", "Choose 2 to 4", "Up to 3 · 1 selected" -- the rule in guest language, never "Modifier Group". */
function groupSubtitle(group: PublicMenuModifierGroup, selected: number, copy: PublicMenuCopy) {
  const min = group.minimumSelections;
  const max = group.maximumSelections;
  if (max === 1) return copy.chooseOne;
  if (min === 0) return selected > 0 ? copy.upToSelected(max, selected) : copy.upTo(max);
  const rule = min === max ? `${copy.chooseExactly} ${min}` : copy.chooseBetween(min, max);
  return selected > 0 ? `${rule} · ${copy.selectedOf(selected, max)}` : rule;
}

/**
 * FT-13B product sheet: a bottom sheet on phones, a ~560px dialog from 640px.
 *
 * A 230px photo hero carries the title and price (white / saffron-light) over a scrim, with
 * a drag handle, a glass close button and the featured tag. With no photo the shared dish
 * tile stands in and the title/price move below it in normal colours. Each Modifier Group is
 * a titled block with a Required/Optional badge and 54px option rows; selected rows get the
 * saffron border and tint. The sticky footer pairs a quantity stepper with the saffron CTA
 * and the live total; while a required group is unmet the CTA reads as muted-but-intentional
 * and a tap scrolls to the missing group instead of adding.
 *
 * Business rules are unchanged from FT-6A/FT-13A: min/max selections are enforced
 * client-side before adding (a usability guard -- the Backend re-validates every selection),
 * and the total is display-only, computed with the same exact BigInt minor-unit helpers the
 * Cart uses. (Per-item kitchen notes are not part of the Guest order contract, so there is no
 * note field here; order-level notes live in checkout.)
 */
export function ProductSheet({
  product,
  currency,
  copy,
  dir,
  initial,
  onCancel,
  onConfirm,
  inline = false,
  previewImageUrl = null,
}: {
  /** Staff product preview only: show the sheet in normal flow, without its close control, and with a local image URL. */
  inline?: boolean;
  previewImageUrl?: string | null;
  product: PublicMenuProduct;
  currency: string;
  copy: PublicMenuCopy;
  dir: 'ltr' | 'rtl';
  /** Editing an existing cart line: start from its selections and quantity (the CTA then reads "Update order"). */
  initial?: { selectedByGroup: Record<string, string[]>; quantity: number };
  onCancel: () => void;
  onConfirm: (selectedOptionIds: string[], quantity: number) => void;
}) {
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>(
    initial?.selectedByGroup ?? {},
  );
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [showValidation, setShowValidation] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const imageUrl = previewImageUrl ?? resolveAssetUrl(product.primaryImageAssetPath);
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
  }, toMinorUnits(product.discount ? product.discount.discountedPrice : product.basePrice));
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

  const titleBlock = (
    <>
      <h2
        id="product-sheet-title"
        className={`g-display text-[30px] leading-[1.15] ${showPhoto ? 'text-white' : 'text-g-text'}`}
      >
        <bdi>{product.name}</bdi>
      </h2>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {product.discount ? (
          <DiscountBadge discount={product.discount} currency={currency} copy={copy} />
        ) : null}
        <DiscountedPrice
          original={product.basePrice}
          current={product.discount ? product.discount.discountedPrice : product.basePrice}
          discounted={product.discount !== null}
          currency={currency}
          copy={copy}
          className={`g-num text-2xl [font-weight:900] ${showPhoto ? 'text-[#f7b548]' : 'text-g-price'}`}
          currencyClassName="text-[13px] font-semibold"
          originalClassName={`g-num text-[13px] font-semibold ${showPhoto ? 'text-white/75' : 'text-g-text-3'}`}
        />
      </span>
    </>
  );

  return (
    <Sheet variant="sheet" dir={dir} labelledBy="product-sheet-title" onClose={onCancel} inline={inline}>
      <div className="relative shrink-0">
        {showPhoto ? (
          <div className="relative h-[230px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image. */}
            <img
              src={imageUrl}
              alt=""
              decoding="async"
              onError={() => setImageFailed(true)}
              className="size-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to top, rgba(12,10,8,.85) 0%, rgba(12,10,8,0) 55%)',
              }}
            />
            <div className="absolute inset-x-5 bottom-3.5 flex items-end justify-between gap-3">
              {titleBlock}
            </div>
          </div>
        ) : (
          <DishFallback className="h-[150px] w-full" iconClassName="size-14" />
        )}
        {inline ? null : (
          <>
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-2.5 mx-auto h-[5px] w-11 rounded-[3px] bg-white/75 sm:hidden"
            />
            <button
              type="button"
              onClick={onCancel}
              aria-label={copy.close}
              className="absolute end-4 top-[18px] flex size-11 items-center justify-center rounded-full border border-white/20 bg-[rgb(18_16_14/0.55)] text-white backdrop-blur-md"
            >
              <GuestIconClose className="size-[18px]" strokeWidth={2.2} />
            </button>
          </>
        )}
        {product.featured ? (
          <span className="absolute start-4 top-5 flex items-center gap-[5px] rounded-full bg-g-accent px-[11px] py-[5px] text-xs font-bold text-g-on-accent">
            <GuestIconStar className="size-3" />
            {copy.featured}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-[18px] pb-5 pt-4">
        {!showPhoto ? (
          <div className="flex items-end justify-between gap-3">{titleBlock}</div>
        ) : null}
        {product.description ? (
          <p dir="auto" className="text-sm leading-[1.75] text-g-text-2">
            {product.description}
          </p>
        ) : null}

        {product.modifierGroups.map((group) => {
          const selected = selectionsFor(group.id);
          const isInvalid = showValidation && invalidGroupIds.has(group.id);
          const isSingleSelect = group.maximumSelections === 1;
          const isRequired = group.minimumSelections > 0;
          const reachedMax = !isSingleSelect && selected.length >= group.maximumSelections;
          const titleId = `modgroup-${group.id}-title`;
          return (
            <fieldset
              key={group.id}
              id={`modgroup-${group.id}`}
              aria-labelledby={titleId}
              className="min-w-0"
            >
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 id={titleId} className="text-[16.5px] font-bold text-g-text">
                    <bdi>{group.name}</bdi>
                  </h3>
                  <p
                    className={`mt-0.5 text-[12.5px] ${isInvalid ? 'font-semibold text-g-danger' : 'text-g-text-3'}`}
                  >
                    {groupSubtitle(group, selected.length, copy)}
                  </p>
                  {group.helperText ? (
                    <p dir="auto" className="mt-0.5 text-[12.5px] text-g-text-3">
                      {group.helperText}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-[11px] py-1 text-[11.5px] font-bold ${
                      isRequired
                        ? isInvalid
                          ? 'border border-g-danger bg-g-danger-soft text-g-danger'
                          : 'border border-g-accent bg-g-accent-soft text-g-accent-text'
                        : 'border border-g-line text-g-text-3'
                    }`}
                  >
                    {isRequired ? copy.required : copy.optional}
                  </span>
                  {!isRequired && isSingleSelect && selected.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedByGroup((prev) => ({ ...prev, [group.id]: [] }))}
                      className="rounded px-1 text-xs font-bold text-g-accent-text"
                    >
                      {copy.clearChoice}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {group.options.map((option) => {
                  const isChecked = selected.includes(option.id);
                  const isDisabled = reachedMax && !isChecked;
                  const hasPrice = toMinorUnits(option.priceAdjustment) !== ZERO_MINOR_UNITS;
                  return (
                    <label
                      key={option.id}
                      className={`flex min-h-[54px] items-center gap-3 rounded-2xl border-[1.5px] border-transparent bg-g-surface-2 px-3.5 text-[15px] text-g-text transition-colors has-[:checked]:border-g-accent has-[:checked]:bg-g-accent-soft has-[:checked]:font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-g-accent-text ${
                        isDisabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type={isSingleSelect ? 'radio' : 'checkbox'}
                        name={`group-${group.id}`}
                        checked={isChecked}
                        disabled={isDisabled}
                        onChange={() => toggleOption(group.id, option.id, group.maximumSelections)}
                        className="peer sr-only"
                      />
                      {isSingleSelect ? (
                        <span
                          aria-hidden="true"
                          className="size-[22px] shrink-0 rounded-full border-2 border-g-text-3 transition-all peer-checked:border-[6px] peer-checked:border-g-accent peer-checked:bg-g-on-accent"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="grid size-[22px] shrink-0 place-items-center rounded-[7px] border-2 border-g-text-3 text-transparent transition-colors peer-checked:border-g-accent peer-checked:bg-g-accent peer-checked:text-g-on-accent"
                        >
                          <GuestIconCheck className="size-[13px]" strokeWidth={3.4} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 leading-snug">
                        <bdi>{option.name}</bdi>
                      </span>
                      {hasPrice ? (
                        <Price
                          amount={option.priceAdjustment}
                          currency={currency}
                          prefix="+"
                          className={`g-num text-sm [font-weight:700] ${isChecked ? 'text-g-price' : 'text-g-text-2'}`}
                          currencyClassName="text-[0.85em] font-semibold"
                        />
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 border-t border-g-line bg-g-surface px-4 pb-[max(1.375rem,env(safe-area-inset-bottom))] pt-3.5">
        {showValidation && !isValid ? (
          <p role="alert" className="text-center text-sm font-semibold text-g-danger">
            {copy.selectionRequiredError}
          </p>
        ) : null}
        <div className="flex items-center gap-2.5">
          <Stepper
            variant="sheet"
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
            aria-disabled={!isValid}
            className={`flex h-[54px] min-w-0 flex-1 items-center justify-between gap-2 rounded-[18px] px-4 text-[15px] font-extrabold min-[400px]:gap-3 min-[400px]:px-5 min-[400px]:text-base transition-[background-color,color,box-shadow,transform] active:scale-[0.99] ${
              isValid
                ? 'bg-g-accent text-g-on-accent shadow-[0_10px_24px_rgb(245_165_36/0.32)]'
                : 'border border-g-line bg-g-surface-2 text-g-text-2'
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <GuestIconPlus
                className="hidden size-[18px] shrink-0 min-[400px]:block"
                strokeWidth={2.6}
              />
              <span className="truncate">{initial ? copy.updateOrder : copy.addToOrder}</span>
            </span>
            <Price
              amount={totalDisplay}
              currency={currency}
              className="g-num text-[19px] [font-weight:900]"
              currencyClassName="text-xs font-semibold"
            />
          </button>
        </div>
      </div>
    </Sheet>
  );
}
