'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';
import { IconCopy, IconGlobeOpen, IconPhonePreview, IconQr } from '../staff/icons';
import { useGuestMenuLink } from './GuestMenuLink';

/**
 * The small dropdown shared by the "open the menu" button and the floating
 * button: open in a new tab, copy the link, show the QR, quick preview.
 * `role="menu"`; Arrow Up/Down, Home/End move, Enter activates, Escape closes
 * and hands focus back to the trigger, Tab closes, a press outside closes.
 * Logical placement only (`end-0`), so it mirrors in RTL.
 */
export function GuestMenuMenu({
  id,
  triggerRef,
  placement,
  onClose,
}: {
  id: string;
  triggerRef: RefObject<HTMLElement | null>;
  placement: 'down' | 'up';
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  const link = useGuestMenuLink();
  const rootRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose, triggerRef]);

  function closeAndRestore() {
    onClose();
    triggerRef.current?.focus();
  }

  function move(from: number, delta: number) {
    const list = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    list[(from + delta + list.length) % list.length]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestore();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(index, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(0, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(-1, 0);
    } else if (event.key === 'Tab') {
      onClose();
    }
  }

  async function run(key: 'open' | 'copy' | 'qr' | 'preview') {
    if (key === 'open') {
      link.open();
      closeAndRestore();
    } else if (key === 'copy') {
      if (await link.copy()) {
        setCopied(true);
        window.setTimeout(() => closeAndRestore(), 900);
      }
    } else if (key === 'qr') {
      onClose();
      link.showQr();
    } else {
      onClose();
      link.showPreview();
    }
  }

  const entries: { key: 'open' | 'copy' | 'qr' | 'preview'; label: string; icon: ReactNode }[] = [
    { key: 'open', label: t('guestMenu.action.open'), icon: <IconGlobeOpen className="size-4" /> },
    { key: 'copy', label: copied ? t('guestMenu.copied') : t('guestMenu.action.copy'), icon: <IconCopy className="size-4" /> },
    { key: 'qr', label: t('guestMenu.action.qr'), icon: <IconQr className="size-4" /> },
    { key: 'preview', label: t('guestMenu.action.preview'), icon: <IconPhonePreview className="size-4" /> },
  ];

  return (
    <div
      ref={rootRef}
      id={id}
      role="menu"
      aria-label={t('guestMenu.moreActions')}
      className={`absolute end-0 z-[65] min-w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg ${
        placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-1.5'
      }`}
    >
      {entries.map((entry, index) => (
        <button
          key={entry.key}
          type="button"
          role="menuitem"
          onKeyDown={(event) => onKeyDown(event, index)}
          onClick={() => void run(entry.key)}
          className="flex min-h-11 w-full items-center gap-3 px-3 text-start text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted"
        >
          <span className="text-muted-foreground">{entry.icon}</span>
          {entry.label}
        </button>
      ))}
    </div>
  );
}
