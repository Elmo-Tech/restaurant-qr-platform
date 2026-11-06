'use client';

import { useEffect, useRef, useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import * as tablesApi from '../../../../../lib/tables/api';
import type { TableListItem } from '../../../../../lib/tables/types';
import { describeError } from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { IconClose } from '../../../../../components/staff/icons';
import { StandDesigner, type StandTable } from '../../../../../components/qr/StandDesigner';

/**
 * One A6 stand page per table of the selected Branch: looks up each table's
 * active QR (a few at a time, the same lookups the table cards make), then
 * offers the PDF / print of all of them in the chosen look. A small purpose-built
 * shell like `QrPreviewDialog` (the shared `Dialog` always wraps a form).
 */
export function AllTablesStandDialog({
  restaurantId,
  branchId,
  restaurantName,
  logoUrl,
  webOrigin,
  tables,
  onClose,
}: {
  restaurantId: string;
  branchId: string;
  restaurantName: string;
  logoUrl: string | null;
  webOrigin: string;
  tables: readonly TableListItem[];
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [standTables, setStandTables] = useState<StandTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && opener.isConnected && opener !== document.body) opener.focus();
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const active = tables.filter((table) => table.status === 'ACTIVE');
    const found: (StandTable | null)[] = active.map(() => null);
    let next = 0;
    let finished = 0;

    async function worker() {
      while (!cancelled) {
        const index = next;
        next += 1;
        if (index >= active.length) return;
        const detail = await tablesApi.getTableDetail(restaurantId, branchId, active[index].id);
        if (detail.qr && detail.qr.status === 'ACTIVE') {
          found[index] = { number: active[index].tableNumber, url: `${webOrigin}/q/${detail.qr.publicCode}` };
        }
        finished += 1;
        if (!cancelled) setDone(finished);
      }
    }

    Promise.all([worker(), worker(), worker(), worker()])
      .then(() => {
        if (!cancelled) setStandTables(found.filter((entry): entry is StandTable => entry !== null));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, branchId, webOrigin, tables]);

  const first = standTables?.[0] ?? null;

  return (
    <div className="fixed inset-0 z-50 print:hidden">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-0 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="all-stand-title"
          className="pointer-events-auto flex h-full w-full flex-col bg-card shadow-xl sm:h-auto sm:max-h-[calc(100vh-48px)] sm:max-w-[860px] sm:rounded-lg"
        >
          <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id="all-stand-title" className="text-base font-semibold text-foreground">
                {t('stand.all.title')}
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                <bdi dir="auto">{restaurantName}</bdi>
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
            {error ? <Alert variant="error">{error}</Alert> : null}
            {!error && standTables === null ? (
              <p role="status" className="text-sm text-muted-foreground">
                {t('stand.all.progress', { done, total: tables.filter((table) => table.status === 'ACTIVE').length })}
              </p>
            ) : null}
            {standTables && !first ? <p className="text-sm text-muted-foreground">{t('stand.all.none')}</p> : null}
            {standTables && first ? (
              <StandDesigner
                restaurantId={restaurantId}
                restaurantName={restaurantName}
                logoUrl={logoUrl}
                guestUrl={first.url}
                tables={standTables}
                batchOnly
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
