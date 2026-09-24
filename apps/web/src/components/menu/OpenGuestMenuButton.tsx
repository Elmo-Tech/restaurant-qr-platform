'use client';

import { useEffect, useState } from 'react';
import { getGuestMenuPublicCode } from '../../lib/guest-menu/api';

type LinkState = { status: 'loading' } | { status: 'ready'; publicCode: string | null } | { status: 'error' };

const BASE_CLASS =
  'inline-flex items-center justify-center rounded-md border border-[#E5DED6] bg-white px-4 py-2 text-sm font-medium text-[#302C29] transition-colors';

/**
 * FT-7 Staff quick action: opens the Restaurant's existing public Guest Menu
 * (`/q/:publicCode`, the ACTIVE GENERIC QR) in a new tab. Read-only -- if the
 * Restaurant has no ACTIVE GENERIC QR it shows a small unavailable state and
 * never creates one. The Guest Menu itself resolves the Restaurant's current
 * primary ACTIVE Menu; this does not link to any individual Menu.
 */
export function OpenGuestMenuButton({ restaurantId }: { restaurantId: string }) {
  const [state, setState] = useState<LinkState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getGuestMenuPublicCode(restaurantId)
      .then((publicCode) => {
        if (!cancelled) setState({ status: 'ready', publicCode });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  if (state.status === 'ready' && state.publicCode) {
    return (
      <a
        href={`/q/${encodeURIComponent(state.publicCode)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BASE_CLASS} hover:bg-[#F8F5F1]`}
      >
        Open Guest Menu
      </a>
    );
  }

  const hint =
    state.status === 'loading'
      ? undefined
      : state.status === 'error'
        ? 'Could not load the Guest Menu link.'
        : 'No active QR code for this restaurant yet.';

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled
        className={`${BASE_CLASS} cursor-not-allowed text-[#AFA397]`}
      >
        Open Guest Menu
      </button>
      {hint ? <p className="text-xs text-[#655D56]">{hint}</p> : null}
    </div>
  );
}
