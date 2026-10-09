'use client';

import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { GuestIconAlert } from '../../../components/guest/icons';

export type OrderingRecheckStatus = 'idle' | 'stillClosed' | 'reopened' | 'failed';

/**
 * Table Sessions: shown on a TABLE QR whose ordering staff have closed. The
 * menu stays fully browseable and the cart is kept; only submission is
 * disabled. The value is advisory (the order endpoint re-checks under a lock),
 * so "Check again" re-reads it. Generic QR (Pickup/Delivery) never renders this.
 */
export function TableClosedNotice({
  copy,
  isChecking,
  status,
  onCheckAgain,
  className = '',
}: {
  copy: PublicMenuCopy;
  isChecking: boolean;
  status: OrderingRecheckStatus;
  onCheckAgain: () => void;
  className?: string;
}) {
  const detail =
    status === 'stillClosed'
      ? copy.tableOrderingStillClosed
      : status === 'failed'
        ? copy.tableOrderingCheckFailed
        : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl border border-g-line bg-g-surface-2 px-4 py-3.5 ${className}`}
    >
      <div className="flex gap-3">
        <GuestIconAlert className="mt-0.5 size-5 shrink-0 text-g-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold leading-snug text-g-text">
            {copy.tableOrderingClosedTitle}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-g-text-2">
            {copy.tableOrderingClosedBody}
          </p>
          {detail ? (
            <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-g-text">{detail}</p>
          ) : null}
          <button
            type="button"
            onClick={onCheckAgain}
            disabled={isChecking}
            className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-g-line bg-g-surface px-4 text-[14px] font-bold text-g-text transition-colors hover:bg-g-surface-2 disabled:cursor-wait disabled:opacity-70"
          >
            {isChecking ? copy.tableOrderingChecking : copy.tableOrderingCheckAgain}
          </button>
        </div>
      </div>
    </div>
  );
}
