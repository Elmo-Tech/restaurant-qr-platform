'use client';

import { useEffect, useRef } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';

export type StaffFeedbackVariant = 'success' | 'error';

/**
 * Fixed, dismissible feedback for actions initiated far down a settings page.
 * Never replaces persistent field-level validation; it is just the visible summary.
 */
export function StaffFeedbackToast({
  message,
  variant = 'success',
  onDismiss,
}: {
  message: string | null;
  variant?: StaffFeedbackVariant;
  onDismiss: () => void;
}) {
  const { t } = useStaffI18n();
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => dismissRef.current(), variant === 'error' ? 9000 : 6500);
    return () => window.clearTimeout(timeout);
  }, [message, variant]);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[80] flex justify-center sm:top-5">
      <div
        role={variant === 'error' ? 'alert' : 'status'}
        className={`pointer-events-auto flex min-h-12 w-full max-w-[520px] items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium leading-6 shadow-xl ${variant === 'error'
          ? 'border-destructive/35 bg-destructive-soft text-destructive'
          : 'border-success/35 bg-success-soft text-success'}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-5 shrink-0">
          {variant === 'success'
            ? <path d="m4 12 5 5L20 6" />
            : <><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></>}
        </svg>
        <span className="min-w-0 flex-1">{message}</span>
        <button type="button" onClick={onDismiss}
          aria-label={t('common.close')}
          className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" className="size-4">
            <path d="M6 6l12 12M18 6 6 18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
