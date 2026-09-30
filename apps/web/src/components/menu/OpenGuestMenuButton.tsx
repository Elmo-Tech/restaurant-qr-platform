'use client';

import { useEffect, useState } from 'react';
import { getGuestMenuPublicCode } from '../../lib/guest-menu/api';
import { useStaffI18n } from '../../lib/i18n/client';
import { Button } from '../ui/Button';

type LinkState = { status: 'loading' } | { status: 'ready'; publicCode: string | null } | { status: 'error' };

/**
 * FT-7 Staff quick action (design-system-v2: rebuilt on the shared `Button`
 * primitive via `asChild`): opens the Restaurant's existing public Guest
 * Menu (`/q/:publicCode`, the ACTIVE GENERIC QR) in a new tab. Read-only --
 * if the Restaurant has no ACTIVE GENERIC QR it shows a small unavailable
 * state and never creates one. The Guest Menu itself resolves the
 * Restaurant's current primary ACTIVE Menu; this does not link to any
 * individual Menu.
 */
export function OpenGuestMenuButton({ restaurantId }: { restaurantId: string }) {
  const { t } = useStaffI18n();
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
      <Button asChild variant="secondary">
        <a href={`/q/${encodeURIComponent(state.publicCode)}`} target="_blank" rel="noopener noreferrer">
          {t('guestMenu.open')}
        </a>
      </Button>
    );
  }

  const hint =
    state.status === 'loading'
      ? undefined
      : state.status === 'error'
        ? t('guestMenu.loadError')
        : t('guestMenu.noQr');

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="secondary" disabled>
        {t('guestMenu.open')}
      </Button>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
