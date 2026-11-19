'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { OrderDetail } from '../../../../../lib/orders/types';
import { OrderDetailContent, type OrderDetailContentProps } from './OrderDetailContent';
import { OrderDetailCloseButton, OrderDetailLoading, OrderDetailReadError } from './OrderDetailStates';

const DIALOG_TITLE_ID = 'order-detail-title';
const DIALOG_ERROR_TITLE_ID = 'order-detail-error-title';
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focusable, rendered elements inside `root`, in DOM (tab) order. */
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

export type OrderDetailDialogProps = Omit<
  OrderDetailContentProps,
  'order' | 'titleId' | 'headerAction'
> & {
  /** The authoritative detail READ; `null` while it loads (or failed). */
  order: OrderDetail | null;
  detailError: string | null;
  /** Re-runs the failed detail READ; never a status change. */
  onRetryRead: () => void;
  onClose: () => void;
};

/**
 * FT-5/FT-7B, Section 26: the focused, non-form Order detail dialog --
 * deliberately NOT built on `components/ui/Dialog.tsx` (form-shaped, wrong
 * fit here), mirroring the `QrPreviewDialog`/`CartDrawer` bespoke-shell
 * precedent. Used whenever the Orders workspace is too narrow for the split
 * layout; the presentation lives in `OrderDetailContent` (shared with the
 * desktop split pane).
 *
 * Phase 1 PR 3: ONE modal for the whole focused task -- loading, read error
 * and loaded detail -- so focus, the trap and the scroll lock never hand over
 * between separate overlays. While it is open:
 * - focus moves in (Close; Retry when the read failed) and Tab / Shift+Tab
 *   wrap inside it; focus that escapes (or is dropped when a re-rendered
 *   control unmounts) is pulled back, so the queue, filters and mobile dock
 *   behind it are unreachable by keyboard;
 * - Escape, the backdrop and Close all call `onClose`; the workspace then
 *   returns focus to the opening card (or a fallback when it is gone);
 * - the page behind does not scroll; the previous body styles come back on
 *   close or unmount;
 * - on phones it fills the screen, its body scrolls on its own, and it keeps
 *   clear of the notch and the home indicator (`env(safe-area-inset-*)`).
 * `onClose` is read through a ref and the listeners bind once, so the ~10s
 * background poll never re-binds them or moves focus.
 */
export function OrderDetailDialog({
  order,
  detailError,
  onRetryRead,
  onClose,
  ...contentProps
}: OrderDetailDialogProps) {
  const { t } = useStaffI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const phase = order ? 'ready' : detailError ? 'error' : 'loading';

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    // Keep the page from shifting sideways when its scrollbar disappears.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = focusablesIn(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active) || active === panel;
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    // Anything that still lands focus behind the dialog (a screen-reader
    // jump, a programmatic focus) is brought back to the dialog itself.
    function handleFocusIn(event: FocusEvent) {
      if (panel && event.target instanceof Node && !panel.contains(event.target)) {
        panel.focus({ preventScroll: true });
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, []);

  // Initial focus, once per state (on open, and when loading turns into the
  // detail or the error): Close, or Retry for a failed read. Never moves
  // focus the Staff member already placed inside the dialog, so background
  // polls (same state) never steal it.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const active = document.activeElement;
    if (active && active !== panel && panel.contains(active)) return;
    const target =
      panel.querySelector<HTMLElement>('[data-initial-focus]') ?? focusablesIn(panel)[0] ?? panel;
    target.focus({ preventScroll: true });
  }, [phase]);

  // A focused control can unmount on a re-render (an action button replaced
  // after a status change): keep focus in the dialog instead of on <body>.
  useLayoutEffect(() => {
    if (document.activeElement === document.body) {
      panelRef.current?.focus({ preventScroll: true });
    }
  });

  const closeButton = (
    <OrderDetailCloseButton label={t('common.close')} onClose={onClose} initialFocus />
  );

  return (
    <div className="fixed inset-0 z-50 print:hidden" data-testid="order-detail-dialog">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-0 sm:p-6">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={
            phase === 'ready' ? DIALOG_TITLE_ID : phase === 'error' ? DIALOG_ERROR_TITLE_ID : undefined
          }
          aria-label={phase === 'loading' ? t('orders.split.detailLabel') : undefined}
          aria-busy={phase === 'loading' || undefined}
          tabIndex={-1}
          className="pointer-events-auto flex h-full w-full flex-col overflow-hidden bg-card pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-xl focus:outline-none sm:h-auto sm:max-h-[calc(100vh-64px)] sm:max-w-[520px] sm:rounded-lg sm:pt-0 sm:pb-0"
        >
          {order ? (
            <OrderDetailContent
              {...contentProps}
              order={order}
              titleId={DIALOG_TITLE_ID}
              headerAction={closeButton}
            />
          ) : detailError ? (
            <OrderDetailReadError
              titleId={DIALOG_ERROR_TITLE_ID}
              error={detailError}
              onRetry={onRetryRead}
              onClose={onClose}
            />
          ) : (
            <OrderDetailLoading closeButton={closeButton} />
          )}
        </div>
      </div>
    </div>
  );
}
