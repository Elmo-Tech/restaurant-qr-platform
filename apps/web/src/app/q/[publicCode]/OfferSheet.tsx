'use client';

import { useState } from 'react';
import { DishFallback } from '../../../components/guest/DishFallback';
import {
  GuestIconCheck,
  GuestIconClose,
  GuestIconGift,
  GuestIconMinus,
  GuestIconPlus,
} from '../../../components/guest/icons';
import { Price } from '../../../components/guest/Price';
import { Sheet } from '../../../components/guest/Sheet';
import { Stepper } from '../../../components/guest/Stepper';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import { fromMinorUnits, toMinorUnits } from '../../../lib/public-menu/money';
import { MAX_OFFER_QUANTITY } from '../../../lib/public-menu/offers';
import {
  firstMissingSlot,
  isSlotComplete,
  neededInSlot,
  offerUnitPrice,
  pickedInSlot,
  picksToList,
  type OfferPick,
  type OfferPicks,
} from '../../../lib/public-menu/offers';
import type { OffersCopy } from '../../../lib/public-menu/offers-copy';
import type { PublicOffer, PublicOfferSlot } from '../../../lib/public-menu/types';

/**
 * The offer choice sheet (DEC-069): the same look and feel as the product sheet, for a fixed-price offer made of slots.
 * An included (FIXED) slot is only shown (the gift); a SINGLE slot is a radio list; a MULTI slot is a stepper per option
 * that must add up to the slot's count. The Add button stays disabled until every slot is complete and says which slot is
 * still missing. The price is live (offer price + paid adjustments) and display-only: the Backend re-prices on submit.
 * Colours are the Guest theme tokens (`g-*`), so every template and every exclusive design dresses it.
 */
export function OfferSheet({
  offer,
  currency,
  copy,
  offersCopy,
  dir,
  initial,
  showPhotos,
  onCancel,
  onConfirm,
  inline = false,
  previewImageUrl,
}: {
  /** Staff preview only: render in normal flow, without the close control. */
  inline?: boolean;
  previewImageUrl?: string | null;
  offer: PublicOffer;
  currency: string;
  /** The shared menu copy only supplies the generic words (close, quantity). */
  copy: { close: string; increaseAria: (name: string) => string; decreaseAria: (name: string) => string };
  offersCopy: OffersCopy;
  dir: 'ltr' | 'rtl';
  /** Editing a cart line: start from its choices and quantity (the CTA then reads "Update offer"). */
  initial?: { choices: OfferPick[]; quantity: number };
  showPhotos: boolean;
  onCancel: () => void;
  onConfirm: (choices: OfferPick[], quantity: number) => void;
}) {
  const [picks, setPicks] = useState<OfferPicks>(() => {
    const start: OfferPicks = {};
    for (const pick of initial?.choices ?? []) {
      start[pick.slotId] = { ...(start[pick.slotId] ?? {}), [pick.optionId]: pick.quantity };
    }
    return start;
  });
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [showMissing, setShowMissing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const imageUrl = previewImageUrl !== undefined ? previewImageUrl : resolveAssetUrl(offer.imageAssetPath);
  const showPhoto = showPhotos && imageUrl !== null && !imageFailed;
  const missing = firstMissingSlot(offer, picks);
  const isReady = missing === null;
  const unitPrice = offerUnitPrice(offer, picks);
  const totalDisplay = fromMinorUnits(toMinorUnits(unitPrice) * BigInt(quantity));

  function chooseSingle(slot: PublicOfferSlot, optionId: string) {
    setPicks((prev) => ({ ...prev, [slot.id]: { [optionId]: 1 } }));
  }

  function changeMulti(slot: PublicOfferSlot, optionId: string, delta: 1 | -1) {
    setPicks((prev) => {
      const forSlot = { ...(prev[slot.id] ?? {}) };
      const current = forSlot[optionId] ?? 0;
      const total = Object.values(forSlot).reduce((sum, value) => sum + value, 0);
      if (delta === 1 && total >= neededInSlot(slot)) return prev;
      const next = current + delta;
      if (next < 0) return prev;
      if (next === 0) delete forSlot[optionId];
      else forSlot[optionId] = next;
      return { ...prev, [slot.id]: forSlot };
    });
  }

  function handleConfirm() {
    if (!isReady) {
      setShowMissing(true);
      document.getElementById(`offer-slot-${missing?.id}`)?.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
      return;
    }
    onConfirm(picksToList(offer, picks), quantity);
  }

  const statusChip = (slot: PublicOfferSlot) => {
    if (slot.kind === 'FIXED') {
      return (
        <span className="rounded-full border border-g-accent bg-g-accent-soft px-[11px] py-1 text-[11.5px] font-bold text-g-accent-text">
          {offersCopy.included}
        </span>
      );
    }
    const done = isSlotComplete(slot, picks);
    const left = neededInSlot(slot) - pickedInSlot(slot, picks);
    const flagged = showMissing && !done;
    return (
      <span
        className={`rounded-full px-[11px] py-1 text-[11.5px] font-bold ${
          done
            ? 'bg-g-accent text-g-on-accent'
            : flagged
              ? 'border border-g-danger bg-g-danger-soft text-g-danger'
              : 'border border-g-accent bg-g-accent-soft text-g-accent-text'
        }`}
      >
        {done
          ? offersCopy.slotDone
          : slot.kind === 'MULTI' && left < neededInSlot(slot)
            ? offersCopy.leftToPick(left)
            : slot.kind === 'SINGLE'
              ? offersCopy.pickOne
              : offersCopy.pickN(neededInSlot(slot))}
      </span>
    );
  };

  return (
    <Sheet variant="sheet" dir={dir} labelledBy="offer-sheet-title" onClose={onCancel} inline={inline}>
      <div className="relative shrink-0">
        {showPhoto ? (
          <div className="relative h-[170px]">
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
              style={{ background: 'linear-gradient(to top, rgba(12,10,8,.85) 0%, rgba(12,10,8,0) 60%)' }}
            />
          </div>
        ) : showPhotos ? (
          <DishFallback className="h-[96px] w-full" iconClassName="size-10" />
        ) : (
          <div className="h-[44px] w-full" />
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
        <span className="absolute start-4 top-5 flex items-center gap-[5px] rounded-full bg-g-accent px-[11px] py-[5px] text-xs font-bold text-g-on-accent">
          <GuestIconGift className="size-3.5" />
          {offersCopy.badge[offer.badge]}
        </span>
      </div>

      <div className="shrink-0 border-b border-g-line px-[18px] pb-3 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="offer-sheet-title" className="g-display text-[26px] leading-[1.2] text-g-text">
            <bdi>{offer.name}</bdi>
          </h2>
          <span className="flex shrink-0 flex-col items-end">
            <Price
              amount={offer.price}
              currency={currency}
              className="g-num text-2xl text-g-price [font-weight:900]"
              currencyClassName="text-[13px] font-semibold"
            />
            <span className="text-[11.5px] font-semibold text-g-text-3">{offersCopy.fixedPrice}</span>
          </span>
        </div>
        {offer.description ? (
          <p dir="auto" className="mt-1 text-sm leading-[1.7] text-g-text-2">
            {offer.description}
          </p>
        ) : null}
        <p className="mt-0.5 text-[12.5px] text-g-text-3">{offersCopy.days(offer.daysOfWeek)}</p>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-[18px] pb-5 pt-4">
        {offer.slots.map((slot) => {
          const titleId = `offer-slot-${slot.id}-title`;
          const flagged = showMissing && !isSlotComplete(slot, picks);
          return (
            <fieldset
              key={slot.id}
              id={`offer-slot-${slot.id}`}
              aria-labelledby={titleId}
              className={`min-w-0 rounded-2xl border bg-g-surface p-3 ${
                flagged ? 'border-g-danger' : 'border-g-line'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 id={titleId} className="text-[16px] font-bold text-g-text">
                  <bdi>{slot.title}</bdi>
                </h3>
                {statusChip(slot)}
              </div>

              {slot.kind === 'FIXED' ? (
                <ul className="flex flex-col gap-1.5">
                  {slot.options.map((option) => (
                    <li
                      key={option.id}
                      className="flex min-h-[44px] items-center gap-2.5 rounded-2xl bg-g-accent-soft px-3.5 text-[15px] font-bold text-g-accent-text"
                    >
                      <GuestIconGift className="size-[18px] shrink-0" />
                      <bdi>{(option.quantity ?? 1) > 1 ? `${option.quantity}× ${option.name}` : option.name}</bdi>
                    </li>
                  ))}
                </ul>
              ) : slot.kind === 'SINGLE' ? (
                <div className="flex flex-col gap-2">
                  {slot.options.map((option) => {
                    const checked = (picks[slot.id]?.[option.id] ?? 0) > 0;
                    const paid = toMinorUnits(option.priceAdjustment) > BigInt(0);
                    return (
                      <label
                        key={option.id}
                        className="flex min-h-[54px] cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-transparent bg-g-surface-2 px-3.5 text-[15px] text-g-text transition-colors has-[:checked]:border-g-accent has-[:checked]:bg-g-accent-soft has-[:checked]:font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-g-accent-text"
                      >
                        <input
                          type="radio"
                          name={`offer-slot-${slot.id}`}
                          checked={checked}
                          onChange={() => chooseSingle(slot, option.id)}
                          className="peer sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className="size-[22px] shrink-0 rounded-full border-2 border-g-text-3 transition-all peer-checked:border-[6px] peer-checked:border-g-accent peer-checked:bg-g-on-accent"
                        />
                        <span className="min-w-0 flex-1 leading-snug">
                          <bdi>{option.name}</bdi>
                        </span>
                        {paid ? (
                          <Price
                            amount={option.priceAdjustment}
                            currency={currency}
                            prefix="+"
                            className={`g-num text-sm [font-weight:700] ${checked ? 'text-g-price' : 'text-g-text-2'}`}
                            currencyClassName="text-[0.85em] font-semibold"
                          />
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {slot.options.map((option) => {
                    const count = picks[slot.id]?.[option.id] ?? 0;
                    const full = pickedInSlot(slot, picks) >= neededInSlot(slot);
                    const paid = toMinorUnits(option.priceAdjustment) > BigInt(0);
                    return (
                      <div
                        key={option.id}
                        className={`flex min-h-[54px] items-center gap-3 rounded-2xl border-[1.5px] px-3.5 text-[15px] text-g-text ${
                          count > 0 ? 'border-g-accent bg-g-accent-soft font-bold' : 'border-transparent bg-g-surface-2'
                        }`}
                      >
                        <span className="min-w-0 flex-1 leading-snug">
                          <bdi>{option.name}</bdi>
                        </span>
                        {paid ? (
                          <Price
                            amount={option.priceAdjustment}
                            currency={currency}
                            prefix="+"
                            className="g-num text-sm text-g-price [font-weight:700]"
                            currencyClassName="text-[0.85em] font-semibold"
                          />
                        ) : null}
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => changeMulti(slot, option.id, -1)}
                            disabled={count === 0}
                            aria-label={offersCopy.decreaseOption(option.name)}
                            className="flex size-11 items-center justify-center rounded-full border border-g-line bg-g-surface text-g-text disabled:opacity-35"
                          >
                            <GuestIconMinus className="size-4" strokeWidth={2.6} />
                          </button>
                          <b aria-live="polite" className="g-num min-w-[18px] text-center text-[15px]">
                            {count}
                          </b>
                          <button
                            type="button"
                            onClick={() => changeMulti(slot, option.id, 1)}
                            disabled={full}
                            aria-label={offersCopy.increaseOption(option.name)}
                            className="flex size-11 items-center justify-center rounded-full border border-g-line bg-g-surface text-g-text disabled:opacity-35"
                          >
                            <GuestIconPlus className="size-4" strokeWidth={2.6} />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 border-t border-g-line bg-g-surface px-4 pb-[max(1.375rem,env(safe-area-inset-bottom))] pt-3.5">
        {!isReady ? (
          <p
            role="status"
            className={`text-center text-sm font-semibold ${showMissing ? 'text-g-danger' : 'text-g-text-2'}`}
          >
            {offersCopy.stillMissing(missing.title)}
          </p>
        ) : null}
        <div className="flex items-center gap-2.5">
          <Stepper
            variant="sheet"
            value={quantity}
            decrementLabel={copy.decreaseAria(offer.name)}
            incrementLabel={copy.increaseAria(offer.name)}
            onDecrement={() => setQuantity((current) => Math.max(1, current - 1))}
            onIncrement={() => setQuantity((current) => Math.min(MAX_OFFER_QUANTITY, current + 1))}
            incrementDisabled={quantity >= MAX_OFFER_QUANTITY}
          />
          <button
            type="button"
            onClick={handleConfirm}
            aria-disabled={!isReady}
            className={`flex h-[54px] min-w-0 flex-1 items-center justify-between gap-2 rounded-[18px] px-4 text-[15px] font-extrabold min-[400px]:gap-3 min-[400px]:px-5 min-[400px]:text-base transition-[background-color,color,box-shadow,transform] active:scale-[0.99] ${
              isReady
                ? 'bg-g-accent text-g-on-accent shadow-[0_10px_24px_rgb(245_165_36/0.32)]'
                : 'border border-g-line bg-g-surface-2 text-g-text-2'
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <GuestIconCheck className="hidden size-[18px] shrink-0 min-[400px]:block" strokeWidth={2.6} />
              <span className="truncate">{initial ? offersCopy.updateOffer : offersCopy.addOffer}</span>
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
