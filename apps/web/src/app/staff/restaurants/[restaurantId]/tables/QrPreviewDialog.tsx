'use client';

import { useEffect, useRef, useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { Button } from '../../../../../components/ui/Button';
import { Alert } from '../../../../../components/ui/Alert';
import { IconClose } from '../../../../../components/staff/icons';
import { DEFAULT_QR_STYLE, type QrStyle } from '../../../../../lib/qr/style';
import { useQrImage } from '../../../../../lib/qr/use-qr-image';
import { StandDesigner } from '../../../../../components/qr/StandDesigner';

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
  restaurantId,
  target,
  guestUrl,
  qrStyle = DEFAULT_QR_STYLE,
  logoUrl = null,
  onClose,
}: {
  restaurantId: string;
  target: QrPreviewTarget;
  guestUrl: string;
  /** The Restaurant's saved QR appearance (Settings > Restaurant QR). */
  qrStyle?: QrStyle;
  /** Absolute URL of the restaurant logo, drawn in the center when the style asks for it. */
  logoUrl?: string | null;
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  const [view, setView] = useState<'qr' | 'stand'>('qr');
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // The same renderer as the Restaurant QR designer: colors, centered logo, quiet zone,
  // error correction level H. The name / table lines around it stay real, printable text.
  const image = useQrImage({
    url: guestUrl,
    foregroundColor: qrStyle.foregroundColor,
    backgroundColor: qrStyle.backgroundColor,
    logoUrl: qrStyle.showLogo ? logoUrl : null,
    size: 640,
  });
  const dataUrl = image.dataUrl;
  const error = image.failed ? t('tables.qr.generateError') : null;

  // Hand focus back to whatever opened the panel when it goes away (keyboard users keep their place).
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener && opener.isConnected && opener !== document.body) opener.focus();
    };
  }, []);

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
      {view === 'qr' ? (
      <>
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
        {qrStyle.showName ? (
          <p dir="auto" className="text-base font-semibold text-foreground">
            {target.restaurantName}
          </p>
        ) : null}
        {target.branchName ? (
          <p dir="auto" className="text-sm text-muted-foreground">
            {target.branchName}
          </p>
        ) : null}
        <p dir="auto" className="text-sm text-primary">
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
        <p className="text-sm text-muted-foreground">{t('tables.qr.scan')}</p>
      </div>
      </>
      ) : null}

      <div className="fixed inset-0 z-50 print:hidden">
        <div
          className="absolute inset-0 bg-foreground/40"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-0 sm:p-6">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-dialog-title"
            className={`pointer-events-auto flex h-full w-full flex-col bg-card shadow-xl sm:h-auto sm:max-h-[calc(100vh-64px)] sm:rounded-lg ${view === 'stand' ? 'sm:max-w-[860px]' : 'sm:max-w-[420px]'}`}
          >
            <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 id="qr-dialog-title" className="text-base font-semibold text-foreground">
                  {title}
                </h2>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
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
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            {view === 'stand' ? (
              <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
                <StandDesigner
                  restaurantId={restaurantId}
                  restaurantName={target.restaurantName}
                  logoUrl={logoUrl}
                  guestUrl={guestUrl}
                  fixedTableNumber={target.tableNumber}
                />
              </div>
            ) : (
            <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-5 py-6">
              {error ? <Alert variant="error">{error}</Alert> : null}

              <div className="flex w-full flex-col items-center gap-3 text-center">
                {qrStyle.showName ? (
                  <p dir="auto" className="text-sm font-semibold text-foreground">
                    {target.restaurantName}
                  </p>
                ) : null}
                {target.branchName ? (
                  <p dir="auto" className="-mt-2 text-xs text-muted-foreground">
                    {target.branchName}
                  </p>
                ) : null}
                <p dir="auto" className="-mt-1 text-xs text-primary">
                  {subject}
                </p>

                {dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a client-generated data: URL, not a static/optimizable asset.
                  <img
                    src={dataUrl}
                    alt={altText}
                    className="h-56 w-56 rounded-md border border-border p-2"
                  />
                ) : !error ? (
                  <div className="flex h-56 w-56 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                    {t('tables.qr.generating')}
                  </div>
                ) : null}

                <p className="text-xs text-muted-foreground">{t('tables.qr.scan')}</p>
              </div>

              <p dir="ltr" className="w-full break-all rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                {guestUrl}
              </p>
            </div>
            )}

            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
              {view === 'stand' ? (
                <Button variant="secondary" type="button" onClick={() => setView('qr')}>
                  {t('stand.back')}
                </Button>
              ) : (
              <>
              <Button variant="secondary" type="button" onClick={() => setView('stand')}>
                {t('stand.open')}
              </Button>
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
                <Button variant="secondary" asChild>
                  <a href={dataUrl} download={filename}>
                    {t('tables.qr.download')}
                  </a>
                </Button>
              ) : null}
              <Button asChild>
                <a href={guestUrl} target="_blank" rel="noreferrer">
                  {t('tables.qr.openMenu')}
                </a>
              </Button>
              </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
