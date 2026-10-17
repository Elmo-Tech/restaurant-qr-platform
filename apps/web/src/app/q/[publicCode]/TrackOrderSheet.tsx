'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { GuestIconClose } from '../../../components/guest/icons';
import { Sheet } from '../../../components/guest/Sheet';
import { formatMoney } from '../../../lib/public-menu/price-format';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import {
  forgetOrder,
  getOrderTracking,
  isFinal,
  lookupOrdersByPhone,
  readTrackedOrders,
  type OrderTracking,
} from '../../../lib/public-menu/tracking';

const POLL_MS = 10_000;

interface Entry {
  /** Set for orders this device placed; absent for orders found by phone number. */
  id: string | null;
  tracking: OrderTracking | null;
  failed: boolean;
}

function clock(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** One order: where it is now, in words, and the steps it goes through with the time each was reached. */
function OrderCard({
  tracking,
  copy,
  locale,
  onForget,
}: {
  tracking: OrderTracking;
  copy: PublicMenuCopy;
  locale: string;
  onForget: (() => void) | null;
}) {
  const ended = tracking.status === 'REJECTED' || tracking.status === 'CANCELLED';
  const hint = copy.trackStatusHint(tracking.status, tracking.type);
  const reached = new Map(tracking.events.map((event) => [event.status, event.at]));
  const currentIndex = tracking.flow.indexOf(tracking.status);

  return (
    <article className="flex flex-col gap-4 rounded-[22px] border border-g-line bg-g-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-semibold text-g-text-2">
        <span dir="auto" className="g-num">
          {copy.trackRef(tracking.ref)}
        </span>
        <span>
          {copy.trackTypeLabel(tracking.type)}
          {tracking.branchName ? ` · ${tracking.branchName}` : ''}
        </span>
      </header>

      <div>
        <p
          className={`text-[22px] font-extrabold leading-tight ${ended ? 'text-[#ff8a8f]' : 'text-g-text'}`}
          role="status"
        >
          {copy.trackStatusLabel(tracking.status, tracking.type)}
        </p>
        {hint ? <p className="mt-1 text-[14px] leading-[1.6] text-g-text-2">{hint}</p> : null}
      </div>

      <ol className="flex flex-col">
        {tracking.flow.map((step, index) => {
          const at = reached.get(step);
          const done = !ended ? index < currentIndex || (index === currentIndex && isFinal(step)) : at !== undefined;
          const current = !ended && index === currentIndex && !isFinal(step);
          return (
            <li key={step} className="flex items-stretch gap-3" aria-current={current ? 'step' : undefined}>
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={`grid size-6 shrink-0 place-items-center rounded-full border-2 text-[12px] font-black ${
                    done
                      ? 'border-g-accent bg-g-accent text-g-on-accent'
                      : current
                        ? 'border-g-accent bg-g-accent-soft text-g-accent-text guest-anim-bump'
                        : 'border-g-line text-transparent'
                  }`}
                >
                  {done ? '✓' : current ? '•' : ''}
                </span>
                {index < tracking.flow.length - 1 ? (
                  <span aria-hidden="true" className={`my-0.5 w-0.5 flex-1 ${done ? 'bg-g-accent' : 'bg-g-line'}`} />
                ) : null}
              </div>
              <div className="flex flex-1 items-baseline justify-between gap-3 pb-3.5">
                <span
                  className={`text-[14.5px] ${current ? 'font-extrabold text-g-text' : done ? 'font-semibold text-g-text' : 'text-g-text-3'}`}
                >
                  {copy.trackStatusLabel(step, tracking.type)}
                </span>
                {at ? <span className="g-num shrink-0 text-[12.5px] text-g-text-3">{clock(at, locale)}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-g-line pt-3 text-[13px] text-g-text-2">
        <span>
          {copy.trackItems(tracking.itemCount)} ·{' '}
          <span className="g-num font-bold text-g-text">{formatMoney(tracking.total, tracking.currencyCode, locale)}</span>
        </span>
        <span className="flex items-center gap-3">
          <span>{copy.trackUpdatedAt(clock(tracking.updatedAt, locale))}</span>
          {onForget && isFinal(tracking.status) ? (
            <button type="button" onClick={onForget} className="font-semibold text-g-accent-text underline-offset-2 hover:underline">
              {copy.trackForget}
            </button>
          ) : null}
        </span>
      </footer>
    </article>
  );
}

/**
 * "Track your order" (DEC-042). Top: the orders THIS device placed (their ids are remembered
 * locally), refreshed every few seconds until each reaches an end. Below: a phone-number
 * lookup for an order placed from another device (last 24 hours, status only). A refresh
 * failure never hides what is already on screen.
 */
export function TrackOrderSheet({
  publicCode,
  copy,
  locale,
  dir,
  onClose,
}: {
  publicCode: string;
  copy: PublicMenuCopy;
  locale: string;
  dir: 'ltr' | 'rtl';
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<OrderTracking[] | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const searchedPhone = useRef<string | null>(null);

  const loadDevice = useCallback(async () => {
    const stored = readTrackedOrders(publicCode);
    const results = await Promise.all(
      stored.map(async (order): Promise<Entry | null> => {
        const result = await getOrderTracking(publicCode, order.id, locale);
        if (result.outcome === 'gone') {
          forgetOrder(publicCode, order.id);
          return null;
        }
        return { id: order.id, tracking: result.outcome === 'found' ? result.data : null, failed: result.outcome === 'error' };
      }),
    );
    setEntries((previous) =>
      results
        .filter((entry): entry is Entry => entry !== null)
        // Keep the last good view when a refresh fails.
        .map((entry) => (entry.failed ? (previous?.find((old) => old.id === entry.id) ?? entry) : entry)),
    );
  }, [publicCode, locale]);

  useEffect(() => {
    queueMicrotask(() => void loadDevice());
  }, [loadDevice]);

  const deviceActive = entries?.some((entry) => entry.tracking && !isFinal(entry.tracking.status)) ?? false;
  const phoneActive = found?.some((order) => !isFinal(order.status)) ?? false;

  useEffect(() => {
    if (!deviceActive && !phoneActive) return;
    const timer = window.setInterval(() => {
      if (deviceActive) void loadDevice();
      if (phoneActive && searchedPhone.current) {
        void lookupOrdersByPhone(publicCode, searchedPhone.current, locale).then((result) => {
          if (result.outcome === 'found') setFound(result.data);
        });
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [deviceActive, phoneActive, loadDevice, publicCode, locale]);

  async function handleFind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhoneError(null);
    setSearching(true);
    const result = await lookupOrdersByPhone(publicCode, phone.trim(), locale);
    setSearching(false);
    if (result.outcome === 'invalidPhone') {
      setPhoneError(copy.trackInvalidPhone);
      return;
    }
    if (result.outcome === 'error') {
      setPhoneError(copy.trackError);
      return;
    }
    searchedPhone.current = phone.trim();
    setFound(result.data);
  }

  return (
    <Sheet variant="drawer" dir={dir} labelledBy="track-sheet-title" onClose={onClose}>
      <div className="flex items-center justify-between gap-3 border-b border-g-line px-4 pb-3 pt-4 lg:px-6">
        <h2 id="track-sheet-title" className="g-display text-[26px] leading-[1.2] text-g-text">
          {copy.trackTitle}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.close}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-g-line bg-g-surface text-g-text"
        >
          <GuestIconClose className="size-[18px]" strokeWidth={2.2} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-7 overflow-y-auto overscroll-contain px-4 py-5 lg:px-6">
        <section aria-labelledby="track-device" className="flex flex-col gap-3">
          <h3 id="track-device" className="text-[15px] font-extrabold text-g-text">
            {copy.trackThisDevice}
          </h3>
          {entries === null ? (
            <p className="text-[14px] text-g-text-3">…</p>
          ) : entries.length === 0 ? (
            <p className="text-[14px] text-g-text-2">{copy.trackNoneOnDevice}</p>
          ) : (
            entries.map((entry) =>
              entry.tracking ? (
                <OrderCard
                  key={entry.id}
                  tracking={entry.tracking}
                  copy={copy}
                  locale={locale}
                  onForget={
                    entry.id
                      ? () => {
                          forgetOrder(publicCode, entry.id as string);
                          setEntries((current) => current?.filter((old) => old.id !== entry.id) ?? null);
                        }
                      : null
                  }
                />
              ) : (
                <p key={entry.id} role="alert" className="text-[14px] text-g-text-2">
                  {copy.trackError}
                </p>
              ),
            )
          )}
        </section>

        <section aria-labelledby="track-phone" className="flex flex-col gap-3 border-t border-g-line pt-6">
          <h3 id="track-phone" className="text-[15px] font-extrabold text-g-text">
            {copy.trackOtherDevice}
          </h3>
          <p className="text-[13.5px] leading-[1.6] text-g-text-2">{copy.trackOtherDeviceHint}</p>
          <form onSubmit={(event) => void handleFind(event)} className="flex flex-col gap-2.5 sm:flex-row" noValidate>
            <label className="sr-only" htmlFor="track-phone-input">
              {copy.trackPhoneLabel}
            </label>
            <input
              id="track-phone-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setPhoneError(null);
              }}
              placeholder={copy.trackPhoneLabel}
              className="h-12 min-w-0 flex-1 rounded-2xl border border-g-line bg-g-surface px-4 text-[16px] text-g-text outline-none placeholder:text-g-text-3 focus:border-g-accent"
            />
            <button
              type="submit"
              disabled={searching || phone.trim() === ''}
              className="h-12 shrink-0 rounded-2xl bg-g-accent px-6 text-[15px] font-extrabold text-g-on-accent disabled:opacity-50"
            >
              {searching ? copy.trackFinding : copy.trackFind}
            </button>
          </form>
          {phoneError ? (
            <p role="alert" className="text-[13.5px] font-semibold text-[#ff8a8f]">
              {phoneError}
            </p>
          ) : null}
          {found !== null && found.length === 0 ? <p className="text-[14px] text-g-text-2">{copy.trackNoneFound}</p> : null}
          {found?.map((order) => <OrderCard key={order.ref + order.createdAt} tracking={order} copy={copy} locale={locale} onForget={null} />)}
        </section>
      </div>
    </Sheet>
  );
}
