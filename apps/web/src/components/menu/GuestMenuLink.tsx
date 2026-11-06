'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getGuestMenuSegment } from '../../lib/guest-menu/api';
import { useStaffI18n } from '../../lib/i18n/client';
import { createQrMatrix } from '../../lib/qr/stand/qr-matrix';
import { buildQrOnlySvg } from '../../lib/qr/stand/stand-svg';
import { Button } from '../ui/Button';
import { IconClose } from '../staff/icons';

export type GuestMenuLinkStatus = 'loading' | 'ready' | 'unavailable' | 'error';

export interface GuestMenuLinkValue {
  status: GuestMenuLinkStatus;
  /** The absolute guest menu URL, once known. */
  url: string | null;
  open: () => void;
  copy: () => Promise<boolean>;
  showQr: () => void;
  showPreview: () => void;
}

const GuestMenuLinkContext = createContext<GuestMenuLinkValue | null>(null);

/** The guest menu link and its actions, shared by every button and the floating button. */
export function useGuestMenuLink(): GuestMenuLinkValue {
  const value = useContext(GuestMenuLinkContext);
  if (!value) throw new Error('useGuestMenuLink must be used inside <GuestMenuLinkProvider>.');
  return value;
}

/**
 * Fetches the Restaurant's guest menu link ONCE for the whole staff workspace
 * (read only: it never creates a QR) and hosts the QR and quick-preview dialogs,
 * so every "open the menu" control shares one request and one set of dialogs.
 */
export function GuestMenuLinkProvider({
  restaurantId,
  children,
}: {
  restaurantId: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<{ status: GuestMenuLinkStatus; segment: string | null }>({
    status: 'loading',
    segment: null,
  });
  const [dialog, setDialog] = useState<'qr' | 'preview' | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGuestMenuSegment(restaurantId)
      .then((segment) => {
        if (!cancelled) setState({ status: segment ? 'ready' : 'unavailable', segment });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', segment: null });
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const path = state.segment ? `/q/${encodeURIComponent(state.segment)}` : null;
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    queueMicrotask(() => setOrigin(window.location.origin));
  }, []);
  const url = path && origin ? `${origin}${path}` : null;

  const open = useCallback(() => {
    if (path) window.open(path, '_blank', 'noopener,noreferrer');
  }, [path]);

  const copy = useCallback(async () => {
    if (!url) return false;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, [url]);

  const value = useMemo<GuestMenuLinkValue>(
    () => ({
      status: state.status,
      url,
      open,
      copy,
      showQr: () => setDialog('qr'),
      showPreview: () => setDialog('preview'),
    }),
    [state.status, url, open, copy],
  );

  return (
    <GuestMenuLinkContext.Provider value={value}>
      {children}
      {dialog === 'qr' && url ? <QrDialog url={url} onClose={() => setDialog(null)} /> : null}
      {dialog === 'preview' && path ? <PreviewDialog path={path} onClose={() => setDialog(null)} /> : null}
    </GuestMenuLinkContext.Provider>
  );
}

/* ------------------------------- dialog shell ------------------------------ */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function DialogShell({
  titleId,
  title,
  onClose,
  children,
  className,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useStaffI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && opener.isConnected && opener !== document.body) opener.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] print:hidden">
      <div className="absolute inset-0 bg-foreground/50" onClick={onClose} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 sm:p-6">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-xl bg-card shadow-xl ${className ?? 'max-w-[380px]'}`}
        >
          <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {title}
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t('guestMenu.dialog.close')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function QrDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useStaffI18n();
  const svg = useMemo(() => buildQrOnlySvg(createQrMatrix(url), { px: 240 }), [url]);
  return (
    <DialogShell titleId="guest-menu-qr-title" title={t('guestMenu.qr.title')} onClose={onClose}>
      <div className="flex flex-col items-center gap-3 overflow-y-auto px-5 py-5 text-center">
        <div
          role="img"
          aria-label={t('guestMenu.qr.alt')}
          className="size-56 overflow-hidden rounded-lg border border-border bg-white p-1 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="text-xs text-muted-foreground">{t('guestMenu.qr.scanHint')}</p>
        <p dir="ltr" className="w-full break-all rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {url}
        </p>
      </div>
    </DialogShell>
  );
}

function PreviewDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const { t } = useStaffI18n();
  return (
    <DialogShell
      titleId="guest-menu-preview-title"
      title={t('guestMenu.preview.title')}
      onClose={onClose}
      className="max-w-[420px]"
    >
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto bg-muted/50 px-4 py-4">
        {/* A phone-shaped frame: the real guest menu, same origin, so the browser lets staff frame it. */}
        <div className="w-full max-w-[320px] rounded-[2rem] border-[6px] border-foreground/80 bg-foreground/80 shadow-lg">
          <iframe
            title={t('guestMenu.preview.frame')}
            src={path}
            className="block h-[min(60dvh,560px)] w-full rounded-[1.5rem] bg-white"
          />
        </div>
        <Button variant="secondary" asChild>
          <a href={path} target="_blank" rel="noopener noreferrer">
            {t('guestMenu.preview.openTab')}
          </a>
        </Button>
      </div>
    </DialogShell>
  );
}
