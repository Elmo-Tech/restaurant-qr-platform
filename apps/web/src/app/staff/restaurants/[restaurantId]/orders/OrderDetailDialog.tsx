'use client';

import { useEffect, useRef } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { IconClose } from '../../../../../components/staff/icons';
import { OrderDetailContent, type OrderDetailContentProps } from './OrderDetailContent';

/**
 * FT-5/FT-7B, Section 26: the focused, non-form Order detail dialog --
 * deliberately NOT built on `components/ui/Dialog.tsx` (form-shaped, wrong
 * fit here), mirroring the `QrPreviewDialog`/`CartDrawer` bespoke-shell
 * precedent. No editing of quantities/items/payment in V1 -- purely a
 * read-only detail view plus the NEXT valid status action(s) (Section 25:
 * never an invalid transition button).
 *
 * Phase 1 PR 2: the presentation lives in `OrderDetailContent` (shared with
 * the desktop split pane); this component is only the modal shell, used
 * whenever the Orders workspace is too narrow for the split layout.
 */
export function OrderDetailDialog({
  onClose,
  ...contentProps
}: Omit<OrderDetailContentProps, 'titleId' | 'headerAction'> & {
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // `onClose` is a fresh function on every parent render, and the parent
  // re-renders on every ~10s poll: keep the latest handler in a ref and
  // focus the close button once on mount, so a background refresh never
  // steals focus or re-binds the key listener.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-50 print:hidden">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-0 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-detail-title"
          className="pointer-events-auto flex h-full w-full flex-col bg-card shadow-xl sm:h-auto sm:max-h-[calc(100vh-64px)] sm:max-w-[520px] sm:rounded-lg"
        >
          <OrderDetailContent
            {...contentProps}
            titleId="order-detail-title"
            headerAction={
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <IconClose className="h-4 w-4" />
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
