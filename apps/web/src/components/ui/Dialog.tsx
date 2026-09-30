'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { IconClose } from '../staff/icons';
import { Button } from './Button';
import { useStaffI18n } from '../../lib/i18n/client';

export interface DialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Fires for the close (X) button, backdrop click, and Escape -- never while `isSubmitting`. */
  onClose: () => void;
  /** The field that should receive focus once the Dialog opens, where practical -- falls back to the panel itself. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

/**
 * UX-4 presentation correction: a small, purpose-built centered editor
 * Dialog -- not a generic modal framework. Replaces the former full-height
 * right-side `Drawer` for the Menu/Category editors, which the Product
 * Owner found unnecessarily large for these short forms. One `<form>`
 * still wraps the scrollable body and the footer, so a single `onSubmit`
 * handles the actual field submission; the Dialog itself only owns
 * presentation and interaction safety (backdrop, Escape, close button, a
 * minimal Tab focus trap, and initial/return focus) -- never any
 * Menu/Category business logic. All of that safety behavior is carried
 * over unchanged from the former Drawer; only the backdrop/panel markup
 * (centered + content-driven height on desktop, full-screen on mobile)
 * changed.
 *
 * Safety invariants: the backdrop and a small manual focus trap keep
 * background controls out of both pointer and keyboard reach while open;
 * Escape/backdrop/the close button all funnel through the same
 * `requestClose`, which is a no-op while `isSubmitting` -- so an active
 * submit can never be interrupted by an accidental dismiss. The Cancel
 * button is disabled by the caller via `isSubmitting` on the surrounding
 * form state, matching that same rule.
 */
export function Dialog({
  open,
  title,
  subtitle,
  isSubmitting,
  submitLabel,
  onSubmit,
  onClose,
  initialFocusRef,
  children,
}: DialogProps) {
  const { t } = useStaffI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => setIsVisible(true));
    const focusTarget = initialFocusRef?.current ?? panelRef.current;
    focusTarget?.focus();
    return () => {
      cancelAnimationFrame(raf);
      setIsVisible(false);
      previouslyFocused.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initialFocusRef` is a stable ref, not reactive state.
  }, [open]);

  function requestClose() {
    if (isSubmitting) return;
    onClose();
  }

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = getFocusableElements(panelRef.current);
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `requestClose` closes over `isSubmitting`/`onClose` freshly each render; re-binding per render is intentional and cheap.
  }, [open, isSubmitting, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-foreground/45 transition-opacity duration-200 motion-reduce:transition-none ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={requestClose}
        aria-hidden="true"
      />
      {/* Centering layer: pointer-events-none so a click in its padding
          (i.e. outside the panel, but inside this flex box) falls through
          to the backdrop above and closes the Dialog; the panel itself
          re-enables pointer events for its own controls. At mobile widths
          there is no padding, so the panel's own `h-full w-full` fills the
          whole box -- a true full-screen editor, not a tiny centered
          desktop modal (Section 5). */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-0 sm:p-6">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          tabIndex={-1}
          className={`pointer-events-auto flex h-full w-full flex-col bg-card text-card-foreground shadow-xl outline-none transition-all duration-200 motion-reduce:transition-none sm:h-auto sm:max-h-[calc(100vh-64px)] sm:max-w-[600px] sm:rounded-xl ${
            isVisible ? 'opacity-100 sm:scale-100' : 'opacity-0 sm:scale-95'
          }`}
        >
          <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id="dialog-title" className="text-base font-semibold text-foreground">
                {title}
              </h2>
              {subtitle ? (
                <p dir="auto" className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={isSubmitting}
              aria-label={t('common.close')}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-4 sm:px-6 sm:rounded-b-xl">
              <Button type="button" variant="secondary" onClick={requestClose} disabled={isSubmitting}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {submitLabel}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
