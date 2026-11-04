'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { getGuestMenuSegment } from '../../../../../lib/guest-menu/api';
import { Button } from '../../../../../components/ui/Button';
import { IconBan, IconCheckCircle, IconCopy } from './icons';
import { IconOrders, IconTable } from '../../../../../components/staff/icons';

/**
 * At most four things a manager does all day, as one compact row of buttons
 * (visibly actions, not another set of cards): each does something on this
 * screen or is one click away, never a copy of the sidebar. An action the
 * member cannot perform is simply not rendered.
 */
export function QuickActions({
  restaurantId,
  webOrigin,
  ordersHref,
  pendingCount,
  tablesHref,
  onSoldOut,
}: {
  restaurantId: string;
  webOrigin: string;
  /** `null` when the member cannot view orders. */
  ordersHref: string | null;
  pendingCount: number;
  /** `null` when the member cannot view tables. */
  tablesHref: string | null;
  /** `null` when the member cannot manage the menu. */
  onSoldOut: (() => void) | null;
}) {
  const { t } = useStaffI18n();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'none' | 'error'>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  async function copyLink() {
    let next: 'copied' | 'none' | 'error' = 'error';
    try {
      const code = await getGuestMenuSegment(restaurantId);
      if (!code) {
        next = 'none';
      } else {
        await navigator.clipboard.writeText(`${webOrigin}/q/${encodeURIComponent(code)}`);
        next = 'copied';
      }
    } catch {
      next = 'error';
    }
    setCopyState(next);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopyState('idle'), 2500);
  }

  return (
    <section aria-labelledby="ops-actions-title" className="flex flex-wrap items-center gap-2">
      <h2 id="ops-actions-title" className="me-2 text-base font-semibold text-foreground">
        {t('ops.actions.title')}
      </h2>

      {ordersHref ? (
        <Button asChild variant="secondary" className="h-11 px-4">
          <Link href={ordersHref}>
            <IconOrders />
            {t('ops.actions.reviewPending')}
            {pendingCount > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-xs font-bold text-white">
                {pendingCount}
              </span>
            ) : null}
          </Link>
        </Button>
      ) : null}

      {onSoldOut ? (
        <Button type="button" variant="secondary" className="h-11 px-4" onClick={onSoldOut}>
          <IconBan />
          {t('ops.actions.soldOut')}
        </Button>
      ) : null}

      {tablesHref ? (
        <Button asChild variant="secondary" className="h-11 px-4">
          <Link href={tablesHref}>
            <IconTable />
            {t('ops.actions.tables')}
          </Link>
        </Button>
      ) : null}

      <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => void copyLink()}>
        {copyState === 'copied' ? <IconCheckCircle /> : <IconCopy />}
        <span role="status" aria-live="polite">
          {copyState === 'copied'
            ? t('ops.actions.copied')
            : copyState === 'none'
              ? t('guestMenu.noQr')
              : copyState === 'error'
                ? t('guestMenu.loadError')
                : t('ops.actions.copyLink')}
        </span>
      </Button>
    </section>
  );
}
