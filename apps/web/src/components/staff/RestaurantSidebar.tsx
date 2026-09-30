import type { ReactNode } from 'react';
import Link from 'next/link';
import type { RestaurantStatus } from '../../lib/auth/types';
import {
  IconClose,
  IconDashboard,
  IconMenu,
  IconOrders,
  IconQr,
  IconSettings,
  IconStaff,
} from './icons';
import { useStaffI18n } from '../../lib/i18n/client';

export type StaffSection = 'dashboard' | 'menu' | 'tables' | 'orders' | 'settings' | null;

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

interface RestaurantSidebarProps {
  restaurantId: string;
  restaurantName: string;
  restaurantStatus: RestaurantStatus;
  currentSection: StaffSection;
  canViewMenu: boolean;
  canViewTables: boolean;
  canViewOrders: boolean;
  canViewRestaurantSettings: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
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

function SidebarContent({
  restaurantId,
  restaurantName,
  restaurantStatus,
  currentSection,
  canViewMenu,
  canViewTables,
  canViewOrders,
  canViewRestaurantSettings,
  onNavigate,
}: {
  restaurantId: string;
  restaurantName: string;
  restaurantStatus: RestaurantStatus;
  currentSection: StaffSection;
  canViewMenu: boolean;
  canViewTables: boolean;
  canViewOrders: boolean;
  canViewRestaurantSettings: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useStaffI18n();
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          R
        </span>
        <span className="text-sm font-semibold leading-tight text-sidebar-foreground">
          {t('shell.productName')}
        </span>
      </div>

      <div className="mx-3 mb-4 rounded-lg bg-sidebar-surface px-3 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-sidebar-muted-foreground">
          {t('shell.restaurant')}
        </p>
        <p dir="auto" className="mt-1 truncate text-sm font-medium text-sidebar-foreground">
          {restaurantName}
        </p>
        {restaurantStatus !== 'ACTIVE' ? (
          <span className="mt-1.5 inline-block rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-destructive">
            {restaurantStatus === 'SUSPENDED' ? t('common.suspended') : t('common.inactive')}
          </span>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
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
                label: t('nav.menu'),
                href: `/staff/restaurants/${restaurantId}/menu`,
                icon: <IconMenu className={ICON_CLASS} />,
              }}
              isActive={currentSection === 'menu'}
              onNavigate={onNavigate}
            />
          ) : (
            <DisabledRow
              item={{
                key: 'menu',
                label: t('nav.menu'),
                icon: <IconMenu className={ICON_CLASS} />,
                badge: t('common.noAccess'),
              }}
            />
          )}
          {canViewTables ? (
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
          {canViewOrders ? (
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
        </ul>

        <p className="mb-1 mt-5 px-3 text-xs font-medium uppercase tracking-wide text-sidebar-muted-foreground">
          {t('nav.comingSoonSection')}
        </p>
        <ul className="flex flex-col gap-0.5">
          <DisabledRow
            item={{
              key: 'staff',
              label: t('nav.staff'),
              icon: <IconStaff className={ICON_CLASS} />,
              badge: t('common.soon'),
            }}
          />
        </ul>

        <div className="mt-5 border-t border-sidebar-border pt-3">
          <ul>
            {canViewRestaurantSettings ? (
              <ActiveLink
                item={{
                  key: 'settings',
                  label: t('nav.settings'),
                  href: `/staff/restaurants/${restaurantId}/settings/languages`,
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
    </div>
  );
}

/**
 * Restaurant workspace navigation (UX-1, Section 4; LOC-3, Section 4:
 * Restaurant Settings converted from a disabled placeholder to a real link
 * now that the Languages route exists; FT-4: Tables & QR converted the same
 * way; FT-5: Orders converted the same way now that
 * `/staff/restaurants/[restaurantId]/orders` exists). Dashboard, Menu
 * Management, Tables & QR, Orders, and Restaurant Settings link somewhere
 * real -- only Staff & Access remains a visibly disabled placeholder, never
 * a link to a route that does not exist (Section 2). `canViewMenu`/
 * `canViewTables`/`canViewOrders`/`canViewRestaurantSettings` are UX-only
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
  currentSection,
  canViewMenu,
  canViewTables,
  canViewOrders,
  canViewRestaurantSettings,
  isMobileOpen,
  onCloseMobile,
}: RestaurantSidebarProps) {
  const { t } = useStaffI18n();
  return (
    <>
      <aside className="hidden w-64 flex-shrink-0 lg:flex lg:flex-col">
        <SidebarContent
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          restaurantStatus={restaurantStatus}
          currentSection={currentSection}
          canViewMenu={canViewMenu}
          canViewTables={canViewTables}
          canViewOrders={canViewOrders}
          canViewRestaurantSettings={canViewRestaurantSettings}
        />
      </aside>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/30"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col shadow-xl">
            <div className="flex justify-end bg-sidebar px-3 pt-3">
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label={t('shell.closeNavigation')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-surface hover:text-sidebar-foreground"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent
              restaurantId={restaurantId}
              restaurantName={restaurantName}
              restaurantStatus={restaurantStatus}
              currentSection={currentSection}
              canViewMenu={canViewMenu}
              canViewTables={canViewTables}
              canViewOrders={canViewOrders}
              canViewRestaurantSettings={canViewRestaurantSettings}
              onNavigate={onCloseMobile}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
