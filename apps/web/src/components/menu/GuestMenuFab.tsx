'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useStaffI18n } from '../../lib/i18n/client';
import { IconChevronDown, IconGlobeOpen } from '../staff/icons';
import { useGuestMenuLink } from './GuestMenuLink';
import { GuestMenuMenu } from './GuestMenuMenu';

/**
 * The floating "open the menu" button, mounted once in the staff shell so it
 * is on every dashboard page for any staff role that can open the dashboard.
 *
 * - One tap opens the guest menu in a new tab; the small chevron chip opens the
 *   same dropdown as the page button (copy link, QR, quick preview).
 * - Desktop: a round button in the bottom inline-end corner that grows into a
 *   pill with its label on hover / keyboard focus (it grows toward the page, so
 *   nothing around it moves). Mobile: a round button above the bottom navigation,
 *   safe-area aware.
 * - Not shown while the restaurant has no active generic QR (it never creates one),
 *   inside the kitchen screen, while the on-screen keyboard is up, or -- on a
 *   phone only -- on pages with a sticky save bar (menu import, product editor).
 */
export function GuestMenuFab({ restaurantId }: { restaurantId: string }) {
  const { t } = useStaffI18n();
  const link = useGuestMenuLink();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Same idea as the bottom navigation: an editing field plus a big covered viewport = keyboard.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const check = () => {
      const editing =
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches('input, textarea, select, [contenteditable="true"]');
      setKeyboardUp(editing && window.innerHeight - viewport.height - viewport.offsetTop > 150);
    };
    viewport.addEventListener('resize', check);
    viewport.addEventListener('scroll', check);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      viewport.removeEventListener('resize', check);
      viewport.removeEventListener('scroll', check);
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, []);

  const base = `/staff/restaurants/${restaurantId}`;
  const inKitchen = pathname === `${base}/kitchen` || pathname.startsWith(`${base}/kitchen/`);
  const stickySave =
    pathname.startsWith(`${base}/menu/import`) || pathname.startsWith(`${base}/menu/products/`);

  if (link.status !== 'ready' || inKitchen) return null;

  return (
    <div
      className={`group fixed end-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 lg:end-6 lg:bottom-6 print:hidden ${
        keyboardUp ? 'hidden' : ''
      } ${stickySave ? 'max-lg:hidden' : ''}`}
    >
      <button
        type="button"
        onClick={() => link.open()}
        aria-label={t('guestMenu.fab')}
        className="flex h-12 items-center justify-center overflow-hidden rounded-full bg-primary px-3.5 text-primary-foreground shadow-lg outline-none transition-[background-color,box-shadow] hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:h-12"
      >
        <IconGlobeOpen className="size-5 flex-shrink-0" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-[max-width,opacity,margin] duration-200 motion-reduce:transition-none max-lg:hidden group-focus-within:ms-2 group-focus-within:max-w-40 group-focus-within:opacity-100 group-hover:ms-2 group-hover:max-w-40 group-hover:opacity-100">
          {t('guestMenu.fab')}
        </span>
      </button>
      <button
        ref={chipRef}
        type="button"
        aria-label={t('guestMenu.moreActions')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => setMenuOpen((current) => !current)}
        className="absolute -top-2 -start-2 flex size-7 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconChevronDown className={`size-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
      </button>
      {menuOpen ? <GuestMenuMenu id={menuId} triggerRef={chipRef} placement="up" onClose={closeMenu} /> : null}
    </div>
  );
}
