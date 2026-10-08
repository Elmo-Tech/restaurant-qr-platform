'use client';

import { useRef, type ReactNode } from 'react';
import { useDialogBehavior } from './useDialogBehavior';

/**
 * FT-13A: the one overlay shell for the Guest Menu.
 *
 * - `sheet` (product customizer): a bottom sheet on phones, a centered dialog
 *   from the `sm` breakpoint up.
 * - `drawer` (cart + checkout): a bottom sheet on phones, a side drawer that
 *   slides in from the inline-end edge (right in LTR, left in RTL) on larger
 *   screens -- it overlays the menu instead of permanently taking width from it.
 *
 * Content is slotted as a flex column: a fixed header, a scrolling body
 * (`flex-1 overflow-y-auto`) and a fixed footer, so primary actions stay in
 * reach on a phone. Entry animation only; reduced motion collapses it.
 */
export function Sheet({
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
    <div className="guest-root fixed inset-0 z-50" dir={dir}>
      <div
        className="guest-anim-backdrop absolute inset-0 bg-guest-ink/55"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`pointer-events-none absolute inset-0 flex items-end justify-center ${
          isDrawer ? 'sm:items-stretch sm:justify-end' : 'sm:items-center sm:p-6'
        }`}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className={`pointer-events-auto flex w-full flex-col overflow-hidden bg-guest-surface text-guest-ink shadow-xl outline-none max-h-[92dvh] rounded-t-3xl ${
            isDrawer
              ? 'guest-anim-drawer sm:h-full sm:max-h-none sm:max-w-[520px] sm:rounded-none sm:rounded-s-3xl'
              : 'guest-anim-sheet sm:max-h-[min(88dvh,860px)] sm:max-w-[560px] sm:rounded-3xl'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
