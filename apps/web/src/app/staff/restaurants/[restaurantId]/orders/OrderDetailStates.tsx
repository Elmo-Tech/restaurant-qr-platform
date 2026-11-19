'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { IconClose } from '../../../../../components/staff/icons';
import { ReadErrorAlert } from '../../../../../components/staff/ReadErrorAlert';
import { Button } from '../../../../../components/ui/Button';
import { LoadingState } from '../../../../../components/ui/LoadingState';

/** After this long, a pending detail READ says it is slow and that closing is safe. */
const SLOW_READ_MS = 4_000;

/**
 * Phase 1 PR 3: the Order detail's non-content states, shared by the desktop
 * split pane (`OrderDetailPane`) and the focused dialog (`OrderDetailDialog`)
 * so both surfaces load, fail and close the same way.
 */

/** The detail's Close control: a 40px target with a visible focus ring. */
export function OrderDetailCloseButton({
  label,
  onClose,
  initialFocus = false,
}: {
  label: string;
  onClose: () => void;
  /** The focused dialog moves focus here when it opens. */
  initialFocus?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      data-initial-focus={initialFocus || undefined}
      className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <IconClose className="h-4 w-4" />
    </button>
  );
}

/**
 * A detail READ is pending: header skeleton with a working Close, an
 * announced loading status, and -- if the read is slow -- a second status
 * saying it is safe to close. Closing drops the read (the workspace ignores
 * its response), so it can never reopen the detail.
 */
export function OrderDetailLoading({ closeButton }: { closeButton: ReactNode }) {
  const { t } = useStaffI18n();
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsSlow(true), SLOW_READ_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3" aria-hidden="true">
          <div className="flex gap-2">
            <span className="h-6 w-20 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
            <span className="h-6 w-16 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
          </div>
          <span className="h-6 w-40 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        </div>
        {closeButton}
      </div>
      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <LoadingState label={t('orders.loadingOne')} />
        {isSlow ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('orders.detail.slowRead')}
          </p>
        ) : null}
        <div className="flex flex-col gap-3" aria-hidden="true">
          <span className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <span className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <span className="h-20 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

/**
 * The detail READ failed: Retry (a re-READ, never a status change -- see
 * `ReadErrorAlert`) comes first, Close second.
 */
export function OrderDetailReadError({
  titleId,
  error,
  onRetry,
  onClose,
}: {
  titleId: string;
  error: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-5">
      <ReadErrorAlert
        titleId={titleId}
        title={t('orders.detailLoadFailed')}
        detail={error}
        onRetry={onRetry}
      />
      <Button variant="secondary" className="self-start" onClick={onClose}>
        {t('common.close')}
      </Button>
    </div>
  );
}
