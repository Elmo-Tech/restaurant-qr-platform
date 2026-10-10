'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { IconClose } from '../../../../../components/staff/icons';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { describeError } from '../../../../../lib/menu/error-message';
import { resolveAssetUrl } from '../../../../../lib/media/asset-url';
import * as sessionsApi from '../../../../../lib/table-sessions/api';
import type { SessionSummaryDocument } from '../../../../../lib/table-sessions/types';
import {
  SessionBillPrintPortal,
  SessionBillView,
  type BillPaper,
} from './SessionBillReceipt';

/**
 * The table order summary: a preview of exactly what will print, a paper choice
 * (80 mm receipt or A4) and the Print button. The document comes straight from
 * the Backend summary endpoint; this dialog only displays and prints it.
 * Pressing Print records a BILL_PRINTED audit event (best effort: a failure
 * there never blocks printing). Browser "Save as PDF" covers PDF output, so no
 * PDF service is involved.
 */
export function BillPrintDialog({
  restaurantId,
  sessionId,
  onClose,
}: {
  restaurantId: string;
  sessionId: string;
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  const [bill, setBill] = useState<SessionSummaryDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<BillPaper>('receipt');
  const closeRef = useRef<HTMLButtonElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    sessionsApi
      .getBill(restaurantId, sessionId)
      .then((document) => {
        if (!cancelled) setBill(document);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(describeError(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, sessionId]);

  function handlePrint() {
    void sessionsApi.recordBillPrinted(restaurantId, sessionId).catch(() => undefined);
    window.print();
  }

  const logoUrl = bill ? resolveAssetUrl(bill.restaurant.logoAssetPath) : null;

  return (
    <>
      {bill ? <SessionBillPrintPortal bill={bill} paper={paper} logoUrl={logoUrl} /> : null}
      <div className="fixed inset-0 z-[60] print:hidden">
        <div className="absolute inset-0 bg-foreground/45" onClick={onClose} aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-0 sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-dialog-title"
            className="pointer-events-auto flex h-full w-full flex-col bg-card shadow-xl sm:h-auto sm:max-h-[calc(100vh-48px)] sm:max-w-[860px] sm:rounded-xl"
          >
            <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4">
              <h2 id="bill-dialog-title" className="text-base font-semibold text-foreground">
                {t('sessions.print.title')}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label={t('sessions.print.close')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3">
              <span className="text-sm font-medium text-foreground">{t('sessions.print.paper')}</span>
              <div role="group" aria-label={t('sessions.print.paper')} className="flex gap-1">
                {(['receipt', 'a4'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={paper === option}
                    onClick={() => setPaper(option)}
                    className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                      paper === option
                        ? 'border-primary bg-accent text-accent-foreground'
                        : 'border-border bg-secondary text-secondary-foreground hover:bg-muted'
                    }`}
                  >
                    {t(`sessions.print.paper.${option}` as const)}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-muted/50 p-4 sm:p-6">
              {error ? <Alert variant="error">{error || t('sessions.print.error')}</Alert> : null}
              {!bill && !error ? <LoadingState label={t('sessions.print.loading')} /> : null}
              {bill ? (
                <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-md bg-white p-4 shadow-sm">
                  <SessionBillView bill={bill} paper={paper} logoUrl={logoUrl} />
                </div>
              ) : null}
            </div>

            <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-4 sm:rounded-b-xl">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('sessions.print.close')}
              </Button>
              <Button type="button" onClick={handlePrint} disabled={!bill}>
                {t('sessions.print.print')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
