import type { ReactNode } from 'react';
import Link from 'next/link';
import type { RestaurantStatus } from '../../lib/auth/types';
import {
  IconDashboard,
  IconKitchen,
  IconMenu,
  IconOrders,
  IconQr,
  IconSettings,
  IconSubscription,
  IconStaff,
} from './icons';
import { useStaffI18n } from '../../lib/i18n/client';
import { LogoutButton } from '../../app/staff/LogoutButton';
import { WaytaLockup } from '../brand/Wayta';
import { StaffLanguageSwitcher } from './StaffLanguageSwitcher';

/** Pages the platform package does not include: not shown at all (not even as "no access"). */
export interface PackageHides {
  tables: boolean;
  orders: boolean;
}

export type StaffSection =
  | 'dashboard'
  | 'menu'
  | 'tables'
  | 'orders'
  | 'kitchen'
  | 'staff'
  | 'settings'
  | 'subscription'
  | 'account'
  | null;

interface ActiveNavItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  /** Optional live count pill (e.g. open Orders) -- rendering support only; no screen wires real data through it yet. */
  count?: number;
}

interface DisabledNavItem {
  key: string;
  label: string;
  icon: ReactNode;
  badge: string;
}

/** Who is signed in: shown at the bottom of the sidebar with the language switch and sign-out. */
export interface SidebarUser {
  email: string;
  accountHref: string;
  isAccountActive: boolean;
}

interface RestaurantSidebarProps {
  user: SidebarUser;
  restaurantId: string;
  restaurantName: string;
  restaurantStatus: RestaurantStatus;
  restaurantLogoUrl: string | null;
  currentSection: StaffSection;
  canViewMenu: boolean;
  canViewTables: boolean;
  canViewOrders: boolean;
  packageHides?: PackageHides;
  canViewKitchen: boolean;
  canViewStaff: boolean;
  canViewRestaurantSettings: boolean;
  canViewSubscription?: boolean;
}

const ICON_CLASS = 'h-[18px] w-[18px]';

/**
 * design-system-v2 visual direction: the Sidebar is a permanently dark rail
 * (`sidebar-*` tokens) regardless of the rest of the app's light theme --
 * this is not a dark-mode toggle. The active item is a solid `primary`
 * (burnt-orange) fill with white text, matching the brief's "orange filled or
 * clearly orange-highlighted active state."
 */
function ActiveLink({
  item,
  isActive,
  onNavigate,
}: {
  item: ActiveNavItem;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={isActive ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-surface hover:text-sidebar-foreground'
        }`}
      >
        <span className={isActive ? 'text-primary-foreground' : 'text-sidebar-muted-foreground'}>
          {item.icon}
        </span>
        <span className="flex-1">{item.label}</span>
        {item.count !== undefined && item.count > 0 ? (
          <span
            className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${
              isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-sidebar-surface text-sidebar-foreground'
            }`}
          >
            {item.count}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function DisabledRow({ item }: { item: DisabledNavItem }) {
  return (
    <li>
      <div
        aria-disabled="true"
        className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-muted-foreground"
      >
        <span>{item.icon}</span>
        <span className="flex-1">{item.label}</span>
        <span className="rounded-full bg-sidebar-surface px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-sidebar-muted-foreground">
          {item.badge}
        </span>
      </div>
    </li>
  );
}

function SidebarFooter({ user, onNavigate }: { user: SidebarUser; onNavigate?: () => void }) {
  const { t } = useStaffI18n();
  return (
    <div className="space-y-3 border-t border-sidebar-border p-4">
      <div className="flex justify-end">
        <StaffLanguageSwitcher tone="sidebar" />
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-sidebar-surface p-2">
        <Link
          href={user.accountHref}
          onClick={onNavigate}
          aria-label={t('account.linkAria')}
          aria-current={user.isAccountActive ? 'page' : undefined}
          title={t('account.link')}
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-sidebar focus-visible:ring-2 focus-visible:ring-ring ${
            user.isAccountActive ? 'bg-sidebar' : ''
          }`}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {user.email.charAt(0).toUpperCase()}
          </span>
          <span dir="ltr" className="min-w-0 flex-1 truncate text-start text-[13px] text-sidebar-foreground">
            {user.email}
          </span>
        </Link>
        <LogoutButton variant="sidebar" />
      </div>
    </div>
  );
}

function SidebarContent({
  restaurantId,
  restaurantName,
  restaurantStatus,
  restaurantLogoUrl,
  currentSection,
  canViewMenu,
  canViewTables,
  canViewOrders,
  packageHides,
  canViewKitchen,
  canViewStaff,
  canViewRestaurantSettings,
  canViewSubscription = false,
  user,
  onNavigate,
}: {
  user: SidebarUser;
  restaurantId: string;
  restaurantName: string;
  restaurantStatus: RestaurantStatus;
  restaurantLogoUrl: string | null;
  currentSection: StaffSection;
  canViewMenu: boolean;
  canViewTables: boolean;
  canViewOrders: boolean;
  packageHides?: PackageHides;
  canViewKitchen: boolean;
  canViewStaff: boolean;
  canViewRestaurantSettings: boolean;
  /** "My subscription" is shown to Users who can manage the Restaurant (it shows what it pays). */
  canViewSubscription?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useStaffI18n();
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="px-5 py-5">
        <WaytaLockup tone="dark" size={34} />
      </div>

      <div className="mx-3 mb-4 rounded-lg bg-sidebar-surface px-3 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-sidebar-muted-foreground">
          {t('shell.restaurant')}
        </p>
        <div className="mt-1 flex items-center gap-2.5">
          {restaurantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
            <img
              src={restaurantLogoUrl}
              alt=""
              className="h-8 w-8 flex-shrink-0 rounded-md bg-card object-cover"
            />
          ) : null}
          <p dir="auto" className="min-w-0 truncate text-sm font-medium text-sidebar-foreground">
            {restaurantName}
          </p>
        </div>
        {restaurantStatus !== 'ACTIVE' ? (
          <span className="mt-1.5 inline-block rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-destructive">
            {restaurantStatus === 'SUSPENDED' ? t('common.suspended') : t('common.inactive')}
          </span>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
        <ul className="flex flex-col gap-0.5">
          <ActiveLink
            item={{
              key: 'dashboard',
              label: t('nav.dashboard'),
              href: `/staff/restaurants/${restaurantId}`,
              icon: <IconDashboard className={ICON_CLASS} />,
            }}
            isActive={currentSection === 'dashboard'}
            onNavigate={onNavigate}
          />
          {canViewMenu ? (
            <ActiveLink
              item={{
                key: 'menu',
                label: t('menuHub.title'),
                href: `/staff/restaurants/${restaurantId}/menu/overview`,
                icon: <IconMenu className={ICON_CLASS} />,
              }}
              isActive={currentSection === 'menu'}
              onNavigate={onNavigate}
            />
          ) : (
            <DisabledRow
              item={{
                key: 'menu',
                label: t('menuHub.title'),
                icon: <IconMenu className={ICON_CLASS} />,
                badge: t('common.noAccess'),
              }}
            />
          )}
          {packageHides?.tables ? null : canViewTables ? (
            <ActiveLink
              item={{
                key: 'tables',
                label: t('nav.tables'),
                href: `/staff/restaurants/${restaurantId}/tables`,
                icon: <IconQr className={ICON_CLASS} />,
              }}
              isActive={currentSection === 'tables'}
              onNavigate={onNavigate}
            />
          ) : (
            <DisabledRow
              item={{
                key: 'tables',
                label: t('nav.tables'),
                icon: <IconQr className={ICON_CLASS} />,
                badge: t('common.noAccess'),
              }}
            />
          )}
          {packageHides?.orders ? null : canViewOrders ? (
            <ActiveLink
              item={{
                key: 'orders',
                label: t('nav.orders'),
                href: `/staff/restaurants/${restaurantId}/orders`,
                icon: <IconOrders className={ICON_CLASS} />,
              }}
              isActive={currentSection === 'orders'}
              onNavigate={onNavigate}
            />
          ) : (
            <DisabledRow
              item={{
                key: 'orders',
                label: t('nav.orders'),
                icon: <IconOrders className={ICON_CLASS} />,
                badge: t('common.noAccess'),
              }}
            />
          )}
          {canViewKitchen ? (
            <ActiveLink
              item={{
                key: 'kitchen',
                label: t('nav.kitchen'),
                href: `/staff/restaurants/${restaurantId}/kitchen`,
                icon: <IconKitchen className={ICON_CLASS} />,
              }}
              isActive={currentSection === 'kitchen'}
              onNavigate={onNavigate}
            />
          ) : null}
          {canViewStaff ? (
            <ActiveLink
              item={{
                key: 'staff',
                label: t('nav.staff'),
                href: `/staff/restaurants/${restaurantId}/staff`,
                icon: <IconStaff className={ICON_CLASS} />,
              }}
              isActive={currentSection === 'staff'}
              onNavigate={onNavigate}
            />
          ) : (
            <DisabledRow
              item={{
                key: 'staff',
                label: t('nav.staff'),
                icon: <IconStaff className={ICON_CLASS} />,
                badge: t('common.noAccess'),
              }}
            />
          )}
        </ul>

        <div className="mt-5 border-t border-sidebar-border pt-3">
          <ul>
            {canViewSubscription ? (
              <ActiveLink
                item={{
                  key: 'subscription',
                  label: t('nav.subscription'),
                  href: `/staff/restaurants/${restaurantId}/subscription`,
                  icon: <IconSubscription className={ICON_CLASS} />,
                }}
                isActive={currentSection === 'subscription'}
                onNavigate={onNavigate}
              />
            ) : null}
            {canViewRestaurantSettings ? (
              <ActiveLink
                item={{
                  key: 'settings',
                  label: t('nav.settings'),
                  href: `/staff/restaurants/${restaurantId}/settings/profile`,
                  icon: <IconSettings className={ICON_CLASS} />,
                }}
                isActive={currentSection === 'settings'}
                onNavigate={onNavigate}
              />
            ) : (
              <DisabledRow
                item={{
                  key: 'settings',
                  label: t('nav.settings'),
                  icon: <IconSettings className={ICON_CLASS} />,
                  badge: t('common.noAccess'),
                }}
              />
            )}
          </ul>
        </div>
      </nav>
      <SidebarFooter user={user} onNavigate={onNavigate} />
    </div>
  );
}

/**
 * Restaurant workspace navigation (UX-1, Section 4; LOC-3, Section 4:
 * Restaurant Settings converted from a disabled placeholder to a real link
 * now that the Languages route exists; FT-4: Tables & QR converted the same
 * way; FT-5: Orders converted the same way now that
 * `/staff/restaurants/[restaurantId]/orders` exists; FT-12: Staff & Access
 * converted the same way). Every item links somewhere real, or is a visibly
 * disabled "No access" row -- never a link to a route that does not exist
 * (Section 2). Account is deliberately NOT a Restaurant nav item: it is
 * reached from the top bar's user area. `canViewMenu`/
 * `canViewTables`/`canViewOrders`/`canViewStaff`/`canViewRestaurantSettings` are UX-only
 * navigation visibility, derived from the same Backend-authorized
 * `permissions` each page itself already checks (`lib/menu/capabilities.ts`,
 * `lib/tables/capabilities.ts`, `lib/orders/capabilities.ts`,
 * `lib/settings/capabilities.ts`) -- this does not introduce a new
 * permission model (Section 12); each page still independently re-derives
 * and checks this from the authenticated context regardless of what the
 * Sidebar shows.
 */
export function RestaurantSidebar({
  restaurantId,
  restaurantName,
  restaurantStatus,
  restaurantLogoUrl,
  currentSection,
  canViewMenu,
  canViewTables,
  canViewOrders,
  packageHides,
  canViewKitchen,
  canViewStaff,
  canViewRestaurantSettings,
  canViewSubscription,
  user,
}: RestaurantSidebarProps) {
  return (
    <>
      <aside className="hidden w-64 flex-shrink-0 lg:sticky lg:top-0 lg:flex lg:h-screen lg:h-dvh lg:self-start lg:flex-col">
        <SidebarContent
          user={user}
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          restaurantStatus={restaurantStatus}
          restaurantLogoUrl={restaurantLogoUrl}
          currentSection={currentSection}
          canViewMenu={canViewMenu}
          canViewTables={canViewTables}
          canViewOrders={canViewOrders}
          packageHides={packageHides}
          canViewKitchen={canViewKitchen}
          canViewStaff={canViewStaff}
          canViewRestaurantSettings={canViewRestaurantSettings}
          canViewSubscription={canViewSubscription}
        />
      </aside>


    </>
  );
}
