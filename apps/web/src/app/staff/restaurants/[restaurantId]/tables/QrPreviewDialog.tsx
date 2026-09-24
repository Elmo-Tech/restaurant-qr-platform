'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { Button } from '../../../../../components/ui/Button';
import { Alert } from '../../../../../components/ui/Alert';
import { IconClose } from '../../../../../components/staff/icons';

export interface QrPreviewTarget {
  restaurantName: string;
  branchName: string | null;
  /** `null` for the Restaurant-wide Generic QR (Pickup & Delivery), which has no Table. */
  tableNumber: string | null;
  publicCode: string;
}

function sanitizeFilenameSegment(value: string): string {
  const cleaned = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'qr';
}

/**
 * FT-4, Section 9/10/11/12: a focused, non-form QR panel -- deliberately
 * NOT built on `components/ui/Dialog.tsx`, which always wraps its content
 * in a `<form>` with a fixed Cancel/Submit footer (right for every existing
 * Create/Edit editor, wrong for a pure view+action panel like this one with
 * three independent actions -- Open menu / Download / Print -- and nothing
 * to submit). Keeps the same essential safety behavior (backdrop click,
 * Escape, a close button, initial focus) in a smaller, purpose-built shell
 * local to this Tables feature.
 *
 * The QR graphic is generated client-side from the exact Guest Menu URL
 * (`${webOrigin}/q/{publicCode}`, built by the caller) via the `qrcode`
 * package -- the smallest established QR-rendering dependency for the Web
 * app (Section 10); nothing here ever encodes a raw `publicCode` alone or
 * an internal Restaurant/Table id.
 */
export function QrPreviewDialog({
  target,
  guestUrl,
  onClose,
}: {
  target: QrPreviewTarget;
  guestUrl: string;
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(guestUrl, { width: 320, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(t('tables.qr.generateError'));
      });
    return () => {
      cancelled = true;
    };
  }, [guestUrl, t]);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // The Generic QR has no Table: its own subject, title and filename.
  const subject =
    target.tableNumber !== null
      ? t('tables.qr.subject.table', { number: target.tableNumber })
      : t('tables.qr.subject.restaurant');
  const title =
    target.tableNumber !== null
      ? t('tables.qr.title.table', { number: target.tableNumber })
      : t('tables.qr.title.restaurant');
  const altText =
    target.tableNumber !== null
      ? t('tables.qr.alt.table', { number: target.tableNumber })
      : t('tables.qr.alt.restaurant');
  const filename =
    target.tableNumber !== null
      ? `${sanitizeFilenameSegment(target.restaurantName)}-table-${sanitizeFilenameSegment(target.tableNumber)}-qr.png`
      : `${sanitizeFilenameSegment(target.restaurantName)}-restaurant-qr.png`;

  return (
    <>
      {/*
       * Print bug fix, root cause: the printable block used to live NESTED
       * inside the on-screen dialog's own `print:hidden` wrapper. An
       * ancestor with `display: none` (what `print:hidden` compiles to)
       * never renders ANY descendant, no matter what `visibility`/`display`
       * that descendant itself claims -- so the QR `<img>` (and everything
       * else inside it) could never actually reach the printed page. Fixed
       * by making the printable block a completely separate, TOP-LEVEL
       * sibling of the interactive dialog, so no ancestor of it is ever
       * `print:hidden`.
       *
       * The rest of the Staff page (sidebar/topbar/breadcrumbs/this
       * component's own on-screen chrome) still needs hiding for print --
       * none of that lives inside this component, so it can only be
       * reached with a scoped global rule while this Dialog is mounted:
       * hide everything via `visibility` (an ancestor being merely
       * `visibility: hidden`, unlike `display: none`, does NOT block a
       * descendant's own `visibility: visible` override), then re-show only
       * `#qr-print-section`. Combined with that section's own `print:fixed
       * print:inset-0`, it overlays the full printed page regardless of
       * where it happens to sit in the normal document flow.
       *
       * The QR itself is a plain `<img src="data:image/png;...">` (from
       * `QRCode.toDataURL`, not a `<canvas>`) -- a real raster image
       * reliably prints in every browser; a `<canvas>` element's drawn
       * pixels are not guaranteed to survive print rendering at all.
       */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #qr-print-section, #qr-print-section * { visibility: visible; }
        }
      `}</style>

      <div
        id="qr-print-section"
        className="hidden print:fixed print:inset-0 print:z-[100] print:flex print:flex-col print:items-center print:justify-center print:gap-3 print:bg-white print:text-center"
      >
        <p dir="auto" className="text-base font-semibold text-[#1D1A18]">
          {target.restaurantName}
        </p>
        {target.branchName ? (
          <p dir="auto" className="text-sm text-[#655D56]">
            {target.branchName}
          </p>
        ) : null}
        <p dir="auto" className="text-sm text-[#8A5138]">
          {subject}
        </p>
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a client-generated data: URL, not a static/optimizable asset.
          <img
            src={dataUrl}
            alt={altText}
            className="h-64 w-64"
          />
        ) : null}
        <p className="text-sm text-[#655D56]">{t('tables.qr.scan')}</p>
      </div>

      <div className="fixed inset-0 z-50 print:hidden">
        <div
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-0 sm:p-6">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-dialog-title"
            className="pointer-events-auto flex h-full w-full flex-col bg-white shadow-xl sm:h-auto sm:max-h-[calc(100vh-64px)] sm:max-w-[420px] sm:rounded-lg"
          >
            <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-[#E5DED6] px-5 py-4">
              <div className="min-w-0">
                <h2 id="qr-dialog-title" className="text-base font-semibold text-[#1D1A18]">
                  {title}
                </h2>
                <p className="mt-0.5 truncate text-sm text-[#655D56]">
                  <bdi dir="auto">{target.restaurantName}</bdi>
                  {target.branchName ? (
                    <>
                      {' · '}
                      <bdi dir="auto">{target.branchName}</bdi>
                    </>
                  ) : null}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[#655D56] hover:bg-[#F8F5F1]"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-5 py-6">
              {error ? <Alert variant="error">{error}</Alert> : null}

              <div className="flex w-full flex-col items-center gap-3 text-center">
                <p dir="auto" className="text-sm font-semibold text-[#1D1A18]">
                  {target.restaurantName}
                </p>
                {target.branchName ? (
                  <p dir="auto" className="-mt-2 text-xs text-[#655D56]">
                    {target.branchName}
                  </p>
                ) : null}
                <p dir="auto" className="-mt-1 text-xs text-[#8A5138]">
                  {subject}
                </p>

                {dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a client-generated data: URL, not a static/optimizable asset.
                  <img
                    src={dataUrl}
                    alt={altText}
                    className="h-56 w-56 rounded-md border border-[#E5DED6] p-2"
                  />
                ) : !error ? (
                  <div className="flex h-56 w-56 items-center justify-center rounded-md border border-dashed border-[#E5DED6] text-xs text-[#AFA397]">
                    {t('tables.qr.generating')}
                  </div>
                ) : null}

                <p className="text-xs text-[#655D56]">{t('tables.qr.scan')}</p>
              </div>

              <p dir="ltr" className="w-full break-all rounded-md bg-[#F8F5F1] px-3 py-2 text-center text-xs text-[#655D56]">
                {guestUrl}
              </p>
            </div>

            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#E5DED6] px-5 py-4">
              <Button
                variant="secondary"
                type="button"
                disabled={!dataUrl}
                onClick={() => {
                  // Section 5: never race QR generation -- the button is
                  // also `disabled` until `dataUrl` exists, this is just
                  // defense in depth against a programmatic/fast click.
                  if (dataUrl) window.print();
                }}
              >
                {t('tables.qr.print')}
              </Button>
              {dataUrl ? (
                <a
                  href={dataUrl}
                  download={filename}
                  className="inline-flex items-center justify-center rounded-md border border-[#E5DED6] bg-white px-4 py-2 text-sm font-medium text-[#302C29] transition-colors hover:bg-[#F8F5F1]"
                >
                  {t('tables.qr.download')}
                </a>
              ) : null}
              <a
                href={guestUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-[#7A5138] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#634127]"
              >
                {t('tables.qr.openMenu')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
