'use client';

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { IconClose, IconOrders } from '../../../../../components/staff/icons';
import { ReadErrorAlert } from '../../../../../components/staff/ReadErrorAlert';
import { Button } from '../../../../../components/ui/Button';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import type { OrderDetail } from '../../../../../lib/orders/types';
import { OrderDetailContent, type OrderDetailContentProps } from './OrderDetailContent';

const PANE_TITLE_ID = 'order-detail-pane-title';
const PANE_ERROR_TITLE_ID = 'order-detail-pane-error-title';
/** Matches `top-4`: where the pane sticks while the page scrolls. */
const STICKY_TOP_PX = 16;
/**
 * Space kept free under the pane: the shell's floating "Open the menu" button
 * (48px at `bottom-6`) sits in the bottom-end corner, exactly where the
 * pane's primary action would otherwise land.
 */
const BOTTOM_RESERVE_PX = 88;
const MIN_HEIGHT_PX = 240;

export type OrderDetailPaneProps = Omit<
  OrderDetailContentProps,
  'order' | 'titleId' | 'headerAction'
> & {
  /** `null`: nothing selected -- the pane shows its empty guidance. */
  selectedOrderId: string | null;
  /** The authoritative detail READ for `selectedOrderId`; `null` while it loads (or failed). */
  order: OrderDetail | null;
  detailError: string | null;
  /** Re-runs the failed detail READ; never a status change. */
  onRetryRead: () => void;
  onClose: () => void;
};

/**
 * Phase 1 PR 2: the NON-modal Order detail beside the Priority Queue on a
 * wide Orders workspace. Same content as the focused dialog
 * (`OrderDetailContent`), but no backdrop, no focus trap and no page scroll
 * lock: the queue, filters and sidebar stay usable while it is open.
 *
 * Focus: when a different Order is selected, focus moves to the pane (its
 * region, so screen readers announce the Order) -- never on a background poll
 * re-render. Escape inside the pane, or Close, clears the selection and the
 * workspace returns focus to the card that opened it.
 */
export function OrderDetailPane({
  selectedOrderId,
  order,
  detailError,
  onRetryRead,
  onClose,
  ...contentProps
}: OrderDetailPaneProps) {
  const { t } = useStaffI18n();
  const paneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selectedOrderId !== null) paneRef.current?.focus({ preventScroll: true });
  }, [selectedOrderId]);

  // Fit the pane to the viewport space below its own top edge, so the footer
  // with the next action is visible without scrolling the page -- whether the
  // pane still sits under the filters or is already stuck at the top. Writes
  // the style directly (no React state), once per animation frame.
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = Math.max(pane.getBoundingClientRect().top, STICKY_TOP_PX);
      const available = window.innerHeight - top - BOTTOM_RESERVE_PX;
      pane.style.maxHeight = `${Math.max(available, MIN_HEIGHT_PX)}px`;
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && selectedOrderId !== null) {
      event.preventDefault();
      onClose();
    }
  }

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label={t('orders.split.closeDetail')}
      className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <IconClose className="h-4 w-4" />
    </button>
  );

  const labelledBy =
    selectedOrderId === null
      ? 'order-detail-pane-empty-title'
      : order
        ? PANE_TITLE_ID
        : detailError
          ? PANE_ERROR_TITLE_ID
          : undefined;

  return (
    <section
      ref={paneRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : t('orders.split.detailLabel')}
      aria-busy={selectedOrderId !== null && !order && !detailError ? true : undefined}
      data-testid="order-detail-pane"
      className="sticky top-4 flex max-h-[calc(100vh-7.5rem)] min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
    >
      {selectedOrderId === null ? (
        <div className="flex min-h-80 flex-1 flex-col items-center justify-center gap-2 px-8 py-16 text-center">
          <span
            aria-hidden="true"
            className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground"
          >
            <IconOrders className="h-6 w-6" />
          </span>
          <h2 id="order-detail-pane-empty-title" className="text-base font-semibold text-foreground">
            {t('orders.split.emptyTitle')}
          </h2>
          <p className="max-w-xs text-sm text-muted-foreground">{t('orders.split.emptyHint')}</p>
        </div>
      ) : order ? (
        <OrderDetailContent
          {...contentProps}
          order={order}
          titleId={PANE_TITLE_ID}
          headerAction={closeButton}
        />
      ) : detailError ? (
        <div className="flex flex-1 flex-col gap-4 px-5 py-5">
          <ReadErrorAlert
            titleId={PANE_ERROR_TITLE_ID}
            title={t('orders.detailLoadFailed')}
            detail={detailError}
            onRetry={onRetryRead}
          />
          <Button variant="secondary" className="self-start" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      ) : (
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
            <div className="flex flex-col gap-3" aria-hidden="true">
              <span className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
              <span className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
              <span className="h-20 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
