'use client';

import { useEffect, useRef, useState } from 'react';
import { GuestIconCheck, GuestIconShare } from '../../../components/guest/icons';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { shareMenuUrl } from '../../../lib/guest-menu/subdomain-host';

/**
 * Shares the LINK to the Restaurant's menu (never a table link, see `shareCode`).
 * Where the browser has a native share sheet (phones) it opens it, so the Guest can
 * pick any app they have; otherwise the link is copied. Cancelling the sheet is
 * not an error. Nothing about the Guest or the cart is ever put in the link.
 */
export function ShareButton({
  shareCode,
  restaurantName,
  copy,
  className,
}: {
  shareCode: string;
  restaurantName: string;
  copy: PublicMenuCopy;
  className: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  async function handleShare() {
    const url = shareMenuUrl(window.location.origin, shareCode);
    const title = copy.shareTitle(restaurantName);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, url });
        return;
      }
    } catch (error) {
      // The Guest closed the share sheet: nothing to do.
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard blocked: show the link so it can still be copied by hand.
      window.prompt(title, url);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void handleShare()} aria-label={copy.share} title={copy.share} className={className}>
        {copied ? <GuestIconCheck className="size-5" /> : <GuestIconShare className="size-[19px]" />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? copy.linkCopied : ''}
      </span>
      {copied ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute end-0 top-full mt-2 whitespace-nowrap rounded-full bg-g-text px-3 py-1.5 text-[12px] font-bold text-g-bg shadow-lg"
        >
          {copy.linkCopied}
        </span>
      ) : null}
    </>
  );
}
