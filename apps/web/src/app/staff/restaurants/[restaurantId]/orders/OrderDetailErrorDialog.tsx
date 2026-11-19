'use client';

import { useEffect, useRef } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { ReadErrorAlert } from '../../../../../components/staff/ReadErrorAlert';
import { Button } from '../../../../../components/ui/Button';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Phase 0.3: shown when an Order detail READ fails. Same non-form interaction
 * pattern as `OrderDetailDialog` (focus on mount, Escape closes through a
 * stable listener so parent polls never re-bind it), plus a Tab / Shift+Tab
 * trap so keyboard focus cannot reach the workspace behind the overlay.
 * Retry re-reads the Order; it never repeats a status change.
 */
export function OrderDetailErrorDialog({
  error,
  onRetry,
  onClose,
}: {
  error: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  const dialogRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    // Retry comes first in the DOM: the primary recovery action gets focus.
    focusables()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !dialog.contains(active);
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-error-title"
        className="w-full max-w-sm rounded-lg bg-card p-5 shadow-xl"
      >
        <ReadErrorAlert
          titleId="order-detail-error-title"
          title={t('orders.detailLoadFailed')}
          detail={error}
          onRetry={onRetry}
        />
        <Button variant="secondary" className="mt-4" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}
