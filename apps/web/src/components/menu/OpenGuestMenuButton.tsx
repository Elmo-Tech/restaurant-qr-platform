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
 *
 * `variant="secondary"` is the quieter look for operational pages (Orders)
 * where Order actions must stay the primary visual. `hideWhenUnavailable`
 * renders nothing when there is no ACTIVE GENERIC QR or the link failed to
 * load (the same cases the floating button hides in); while loading it keeps
 * a disabled placeholder so the header does not shift when it resolves.
 * `compactOnPhone` shows only the icon below `sm` (like the floating button's
 * phone look); the label stays as the accessible name.
 */
export function OpenGuestMenuButton({
  variant = 'primary',
  hideWhenUnavailable = false,
  compactOnPhone = false,
}: {
  variant?: 'primary' | 'secondary';
  hideWhenUnavailable?: boolean;
  compactOnPhone?: boolean;
} = {}) {
  const { t } = useStaffI18n();
  const link = useGuestMenuLink();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);

  if (link.status === 'ready') {
    return (
      <div className="relative inline-flex">
        <Button
          asChild
          variant={variant}
          title={compactOnPhone ? t('guestMenu.openMenu') : undefined}
          className={`rounded-e-none font-semibold ${compactOnPhone ? 'max-sm:w-11 max-sm:px-0' : ''}`}
        >
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
            <span className={compactOnPhone ? 'max-sm:sr-only' : undefined}>{t('guestMenu.openMenu')}</span>
          </a>
        </Button>
        <Button
          ref={triggerRef}
          type="button"
          variant={variant}
          aria-label={t('guestMenu.moreActions')}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((current) => !current)}
          className={`w-10 rounded-s-none px-0 ${
            variant === 'primary' ? 'border-s border-primary-foreground/30' : 'border-s-0'
          }`}
        >
          <IconChevronDown />
        </Button>
        {open ? <GuestMenuMenu id={menuId} triggerRef={triggerRef} placement="down" onClose={close} /> : null}
      </div>
    );
  }

  if (hideWhenUnavailable && link.status !== 'loading') return null;

  const hint =
    link.status === 'loading' ? undefined : link.status === 'error' ? t('guestMenu.loadError') : t('guestMenu.noQr');

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant={variant} disabled className={compactOnPhone ? 'max-sm:w-11 max-sm:px-0' : undefined}>
        <IconGlobeOpen />
        <span className={compactOnPhone ? 'max-sm:sr-only' : undefined}>{t('guestMenu.openMenu')}</span>
      </Button>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
