'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { IconClose } from '../../../components/staff/icons';
import { fromMinorUnits, toMinorUnits, ZERO_MINOR_UNITS } from '../../../lib/public-menu/money';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { PublicMenuProduct } from '../../../lib/public-menu/types';

/**
 * FT-6A, Section: "clicking Add should open a focused Product Options
 * dialog instead of blindly adding". Deliberately a bespoke non-form panel
 * mirroring `CartDrawer`'s own precedent -- NOT built on the shared
 * form-shaped `components/ui/Dialog.tsx`. Enforces every Group's
 * `minimumSelections`/`maximumSelections` client-side before enabling
 * "Add to cart" (a genuine usability guard only -- the Backend re-validates
 * every selection authoritatively regardless, CLAUDE.md #27). The live
 * total shown here is display-only, computed via the same exact BigInt
 * minor-unit helpers the Cart itself uses -- never `Number`/`parseFloat`.
 */
export function ProductOptionsDialog({
  product,
  currency,
  copy,
  onCancel,
  onConfirm,
}: {
  product: PublicMenuProduct;
  currency: string;
  copy: PublicMenuCopy;
  onCancel: () => void;
  onConfirm: (selectedOptionIds: string[]) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function selectionsFor(groupId: string): string[] {
    return selectedByGroup[groupId] ?? [];
  }

  function toggleOption(groupId: string, optionId: string, maximumSelections: number) {
    setSelectedByGroup((prev) => {
      const current = prev[groupId] ?? [];
      const isSelected = current.includes(optionId);
      if (isSelected) {
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

  const invalidGroupIds = useMemo(
    () =>
      new Set(
        product.modifierGroups
          .filter((group) => {
            const count = selectionsFor(group.id).length;
            return count < group.minimumSelections || count > group.maximumSelections;
          })
          .map((group) => group.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectionsFor reads selectedByGroup, already a dependency below.
    [product.modifierGroups, selectedByGroup],
  );
  const isValid = invalidGroupIds.size === 0;

  const totalMinorUnits = product.modifierGroups.reduce((sum, group) => {
    const selectedIds = new Set(selectionsFor(group.id));
    const groupSum = group.options
      .filter((option) => selectedIds.has(option.id))
      .reduce((s, option) => s + toMinorUnits(option.priceAdjustment), ZERO_MINOR_UNITS);
    return sum + groupSum;
  }, toMinorUnits(product.basePrice));
  const totalDisplay = fromMinorUnits(totalMinorUnits);

  function handleConfirm() {
    if (!isValid) {
      setShowValidation(true);
      return;
    }
    const selectedOptionIds = product.modifierGroups.flatMap((group) => selectionsFor(group.id));
    onConfirm(selectedOptionIds);
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center sm:items-center sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-options-title"
          className="pointer-events-auto flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-h-[calc(100vh-64px)] sm:max-w-[440px] sm:rounded-2xl"
        >
          <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-[#E5DED6] px-5 py-4">
            <h2 id="product-options-title" className="text-base font-semibold text-[#1D1A18]">
              {product.name}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onCancel}
              aria-label={copy.close}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[#655D56] hover:bg-[#F8F5F1]"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {showValidation && !isValid ? (
              <p className="mb-4 rounded-md bg-[#F6E4DE] px-3 py-2 text-sm text-[#8A3B24]">
                {copy.selectionRequiredError}
              </p>
            ) : null}
            <div className="flex flex-col gap-6">
              {product.modifierGroups.map((group) => {
                const selected = selectionsFor(group.id);
                const isInvalid = showValidation && invalidGroupIds.has(group.id);
                const isSingleSelect = group.maximumSelections === 1;
                return (
                  <fieldset key={group.id} className="flex flex-col gap-2">
                    <legend className="w-full">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#1D1A18]">{group.name}</span>
                        <span
                          className={`text-xs font-medium ${
                            isInvalid ? 'text-[#8A3B24]' : 'text-[#655D56]'
                          }`}
                        >
                          {group.minimumSelections > 0
                            ? copy.required
                            : `${copy.optional} · ${copy.chooseUpTo} ${group.maximumSelections}`}
                        </span>
                      </div>
                      {group.helperText ? (
                        <p className="mt-0.5 text-xs text-[#655D56]">{group.helperText}</p>
                      ) : null}
                    </legend>
                    <div className="flex flex-col gap-1.5">
                      {group.options.map((option) => {
                        const isChecked = selected.includes(option.id);
                        return (
                          <label
                            key={option.id}
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[#E5DED6] px-3 py-2 has-[:checked]:border-[#7A5138] has-[:checked]:bg-[#F8F5F1]"
                          >
                            <span className="flex items-center gap-2 text-sm text-[#302C29]">
                              <input
                                type={isSingleSelect ? 'radio' : 'checkbox'}
                                name={`group-${group.id}`}
                                checked={isChecked}
                                onChange={() =>
                                  toggleOption(group.id, option.id, group.maximumSelections)
                                }
                              />
                              {option.name}
                            </span>
                            <span className="text-xs text-[#655D56]">
                              <bdi dir="ltr">
                                {option.priceAdjustment === '0.00'
                                  ? '+0.00'
                                  : `+${option.priceAdjustment}`}{' '}
                                {currency}
                              </bdi>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col gap-3 border-t border-[#E5DED6] px-5 py-4">
            <div className="flex items-center justify-between text-sm font-semibold text-[#302C29]">
              <span>{copy.total}</span>
              <bdi dir="ltr">
                {totalDisplay} {currency}
              </bdi>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-full border border-[#E5DED6] px-4 py-3 text-sm font-semibold text-[#302C29] hover:bg-[#F8F5F1]"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-full bg-[#7A5138] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#634127]"
              >
                {copy.addToCart}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
