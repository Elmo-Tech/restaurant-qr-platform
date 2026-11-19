'use client';

import { useEffect, useRef } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

export interface ReadErrorAlertProps {
  /** What failed and what the Staff member is looking at now (e.g. "showing the last loaded list"). */
  title: string;
  /** The localized reason from `describeError`, when it adds something beyond the title. */
  detail?: string | null;
  /** Re-runs the failed READ. Never pass a mutation: writes are not retried from here. */
  onRetry: () => void;
  /**
   * A read is already in flight: Retry stays focusable but does nothing, so no
   * duplicate request starts. Omit it when Retry unmounts this alert (the
   * caller clears its error as the read starts).
   */
  isRetrying?: boolean;
  titleId?: string;
}

/**
 * Phase 0.3: the one error + Retry pattern for failed Staff READS (Orders
 * list, Order detail, Tables list, Table Sessions board). Kept deliberately
 * thin over `Alert` so the title states the data situation (nothing loaded vs.
 * last loaded data still shown) and the Retry target is large enough to tap.
 */
export function ReadErrorAlert({
  title,
  detail = null,
  onRetry,
  isRetrying,
  titleId,
}: ReadErrorAlertProps) {
  const { t } = useStaffI18n();
  // `isRetrying` (or the caller clearing its error) arrives through a
  // re-render, so a second click in the same task would still see the old
  // props. This lock closes that gap synchronously. Controlled: released when
  // the caller reports the read finished (`isRetrying` back to false), after
  // success or failure. Uncontrolled: the alert unmounts as the read starts,
  // and a later failure mounts a fresh, unlocked alert.
  const lockRef = useRef(false);
  useEffect(() => {
    if (!isRetrying) lockRef.current = false;
  }, [isRetrying]);
  return (
    <Alert variant="error">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p id={titleId} className="font-semibold">
            {title}
          </p>
          {detail && detail !== title ? <p>{detail}</p> : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="aria-disabled:cursor-wait aria-disabled:opacity-60"
          aria-disabled={isRetrying || undefined}
          onClick={() => {
            if (isRetrying || lockRef.current) return;
            lockRef.current = true;
            onRetry();
          }}
        >
          {t('common.retry')}
        </Button>
      </div>
    </Alert>
  );
}
