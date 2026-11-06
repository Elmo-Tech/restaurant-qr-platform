'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';
import { Button } from '../ui/Button';
import { IconChevronDown, IconGlobeOpen } from '../staff/icons';
import { useGuestMenuLink } from './GuestMenuLink';
import { GuestMenuMenu } from './GuestMenuMenu';

/**
 * The Staff quick action that opens the Restaurant's public Guest Menu
 * (`/q/:slug`, the ACTIVE GENERIC QR) in a new tab: a prominent brand-coloured
 * button with an icon, and a small dropdown beside it (copy the link, show the
 * QR, quick preview). Read-only -- if the Restaurant has no ACTIVE GENERIC QR it
 * shows a small unavailable state and never creates one. The link is fetched
 * once for the whole workspace (`GuestMenuLinkProvider`), not per button.
 */
export function OpenGuestMenuButton() {
  const { t } = useStaffI18n();
  const link = useGuestMenuLink();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);

  if (link.status === 'ready') {
    return (
      <div className="relative inline-flex">
        <Button asChild className="rounded-e-none font-semibold">
          <a
            href={link.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.preventDefault();
              link.open();
            }}
          >
            <IconGlobeOpen />
            {t('guestMenu.openMenu')}
          </a>
        </Button>
        <Button
          ref={triggerRef}
          type="button"
          aria-label={t('guestMenu.moreActions')}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((current) => !current)}
          className="w-10 rounded-s-none border-s border-primary-foreground/30 px-0"
        >
          <IconChevronDown />
        </Button>
        {open ? <GuestMenuMenu id={menuId} triggerRef={triggerRef} placement="down" onClose={close} /> : null}
      </div>
    );
  }

  const hint =
    link.status === 'loading' ? undefined : link.status === 'error' ? t('guestMenu.loadError') : t('guestMenu.noQr');

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" disabled>
        <IconGlobeOpen />
        {t('guestMenu.openMenu')}
      </Button>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
