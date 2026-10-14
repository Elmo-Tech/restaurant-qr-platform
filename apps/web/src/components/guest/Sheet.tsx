'use client';

import { useRef, type ReactNode } from 'react';
import { useDialogBehavior } from './useDialogBehavior';

/**
 * The one overlay shell for the Guest Menu.
 *
 * - `sheet` (product customizer): a bottom sheet on phones, a centred ~560px dialog from 640px.
 * - `drawer` (cart + checkout, one single step): a full-height bottom sheet below 1024px, and
 *   a 440px side drawer from the inline-end edge (right in LTR, left in RTL) from 1024px up.
 *   It overlays the menu behind a dim backdrop -- there is no permanent side cart.
 *
 * Content is slotted as a flex column: a fixed header, a scrolling body (`flex-1
 * overflow-y-auto`) and a fixed footer, so primary actions stay in reach on a phone. The
 * backdrop click, Escape, focus trap, scroll lock and focus return come from
 * `useDialogBehavior`. Entry animation only; reduced motion collapses it.
 */
export function Sheet({
  variant,
  dir,
  labelledBy,
  onClose,
  children,
  inline = false,
}: {
  variant: 'sheet' | 'drawer';
  dir: 'ltr' | 'rtl';
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * Staff preview only: render the panel in normal flow (no overlay, backdrop, focus trap,
   * scroll lock or Escape handling) so the Product Editor can show the real sheet beside the
   * form. The Guest Menu never sets this.
   */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div dir={dir} className="flex max-h-[640px] w-full flex-col overflow-hidden rounded-[26px] border border-g-line bg-g-bg text-g-text">
        {children}
      </div>
    );
  }
  return (
    <OverlaySheet variant={variant} dir={dir} labelledBy={labelledBy} onClose={onClose}>
      {children}
    </OverlaySheet>
  );
}

function OverlaySheet({
  variant,
  dir,
  labelledBy,
  onClose,
  children,
}: {
  variant: 'sheet' | 'drawer';
  dir: 'ltr' | 'rtl';
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogBehavior(panelRef, onClose);

  const isDrawer = variant === 'drawer';
  return (
    <div className="fixed inset-0 z-50" dir={dir}>
      <div
        className="guest-anim-backdrop absolute inset-0 bg-[rgb(8_7_6/0.6)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`pointer-events-none absolute inset-0 flex items-end justify-center ${
          isDrawer ? 'lg:items-stretch lg:justify-end' : 'sm:items-center sm:p-6'
        }`}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className={`pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-[30px] bg-g-bg text-g-text shadow-[0_-10px_40px_rgb(0_0_0/0.5)] outline-none ${
            isDrawer
              ? 'guest-anim-drawer h-[96dvh] lg:h-full lg:max-w-[440px] lg:rounded-none lg:shadow-[20px_0_50px_rgb(0_0_0/0.35)]'
              : 'guest-anim-sheet max-h-[95dvh] sm:max-h-[min(90dvh,860px)] sm:max-w-[560px] sm:rounded-[30px]'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
