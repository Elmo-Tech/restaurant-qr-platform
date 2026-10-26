'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  buildMobileNavigation, isMobileNavActive,
  type MobileNavigationAccess, type MobileSection,
} from '../../lib/staff/mobile-navigation';
import {
  IconDashboard, IconOrders, IconMenu, IconTable,
  IconKitchen, IconStaff, IconSettings, IconSubscription, IconClose,
} from './icons';
import { useStaffI18n } from '../../lib/i18n/client';
import { StaffLanguageSwitcher } from './StaffLanguageSwitcher';
import { LogoutButton } from '../../app/staff/LogoutButton';

/**
 * Touch navigation for the restaurant workspace. The model is filtered by
 * the SAME package and membership capabilities as the desktop sidebar.
 * No feature flags are recomputed here from package names or role names.
 */
interface Props {
  restaurantId: string;
  restaurantName: string;
  restaurantLogoUrl: string | null;
  userEmail: string;
  access: MobileNavigationAccess;
}

function NavIcon({ section }: { section: MobileSection | 'more' }) {
  const size = 'size-5';
  const icons: Record<MobileSection, ReactNode> = {
    dashboard: <IconDashboard className={size}/>,
    orders: <IconOrders className={size}/>,
    menu: <IconMenu className={size}/>,
    tables: <IconTable className={size}/>,
    kitchen: <IconKitchen className={size}/>,
    staff: <IconStaff className={size}/>,
    settings: <IconSettings className={size}/>,
    subscription: <IconSubscription className={size}/>,
    account: <IconStaff className={size}/>,
  };
  if (section === 'more') {
    return (
      <svg viewBox="0 0 24 24" className={size} fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.8"/>
        <circle cx="12" cy="12" r="1.8"/>
        <circle cx="19" cy="12" r="1.8"/>
      </svg>
    );
  }
  return icons[section];
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileNavigation({
  restaurantId, restaurantName, restaurantLogoUrl, userEmail, access,
}: Props) {
  const pathname = usePathname();
  const { t } = useStaffI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const model = buildMobileNavigation(restaurantId, access);
  const overflowActive = model.more.some(item => isMobileNavActive(pathname, item));

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    const returnFocus = openButtonRef.current;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMoreOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = Array.from(
        sheetRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      returnFocus?.focus();
    };
  }, [moreOpen]);

  return (
    <>
      <nav aria-label={t('mobileNav.aria')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-[0_-6px_20px_rgba(0,0,0,0.07)] lg:hidden print:hidden">
        <div className="mx-auto flex w-full max-w-2xl items-stretch gap-1 px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {model.dock.map(item => {
            const active = isMobileNavActive(pathname, item);
            return (
              <Link key={item.key} href={item.href} aria-current={active ? 'page' : undefined}
                className={'flex min-h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ' +
                  (active ? 'bg-primary/10 text-primary' : 'text-muted-foreground active:bg-muted')}>
                <NavIcon section={item.key} />
                <span className="w-full truncate text-[11px] font-semibold leading-tight">{t(item.shortLabel)}</span>
              </Link>
            );
          })}
          <button ref={openButtonRef} type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls={moreOpen ? 'wayta-mobile-more' : undefined}
            className={'flex min-h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ' +
              (moreOpen || overflowActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground active:bg-muted')}>
            <NavIcon section="more"/>
            <span className="w-full truncate text-[11px] font-semibold leading-tight">{t('mobileNav.more')}</span>
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden print:hidden">
          <button type="button" aria-label={t('mobileNav.closeMore')}
            className="absolute inset-0 h-full w-full bg-foreground/50"
            onClick={() => setMoreOpen(false)} />
          <div ref={sheetRef} id="wayta-mobile-more" role="dialog" aria-modal="true"
            aria-labelledby="wayta-mobile-more-title"
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[min(85dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border-t border-border bg-card shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 id="wayta-mobile-more-title" className="text-lg font-bold text-foreground">
                  {t('mobileNav.moreTitle')}
                </h2>
                <p dir="auto" className="truncate text-xs text-muted-foreground">{restaurantName}</p>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setMoreOpen(false)}
                aria-label={t('mobileNav.closeMore')}
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <IconClose className="size-5"/>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="grid grid-cols-2 gap-2">
                {model.more.filter(item => item.key !== 'account').map(item => {
                  const active = isMobileNavActive(pathname, item);
                  return (
                    <Link key={item.key} href={item.href} onClick={() => setMoreOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={'flex min-h-20 min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                        (active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground active:bg-muted')}>
                      <span className="shrink-0 text-primary"><NavIcon section={item.key}/></span>
                      <span className="min-w-0 text-sm font-semibold leading-5">{t(item.label)}</span>
                    </Link>
                  );
                })}
              </div>
              <section className="mt-5 rounded-2xl border border-border bg-background p-4">
                <h3 className="mb-3 text-sm font-bold text-foreground">{t('mobileNav.accountGroup')}</h3>
                <Link href={'/staff/restaurants/' + encodeURIComponent(restaurantId) + '/account'}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <NavIcon section="account"/>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{t('account.link')}</span>
                    <span dir="ltr" className="block truncate text-xs text-muted-foreground">{userEmail}</span>
                  </span>
                </Link>
                <Link href="/staff" onClick={() => setMoreOpen(false)}
                  className="mt-1 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">
                  {restaurantLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- restaurant asset served from API.
                    <img src={restaurantLogoUrl} alt="" className="size-7 rounded-md object-contain"/>
                  ) : <IconDashboard className="size-6"/>}
                  <span>{t('mobileNav.switchRestaurant')}</span>
                </Link>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <StaffLanguageSwitcher/>
                  <LogoutButton/>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
