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

export type StaffSection = 'dashboard' | 'menu' | 'tables' | 'settings' | null;

interface ActiveNavItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
}

interface DisabledNavItem {
  key: string;
  label: string;
  icon: ReactNode;
  badge: 'Soon' | 'No access';
}

interface RestaurantSidebarProps {
  restaurantId: string;
  restaurantName: string;
  restaurantStatus: RestaurantStatus;
  currentSection: StaffSection;
  canViewMenu: boolean;
  canViewTables: boolean;
  canViewRestaurantSettings: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

const ICON_CLASS = 'h-[18px] w-[18px]';

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
        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-[#7A5138]/10 font-medium text-[#7A5138]'
            : 'text-[#655D56] hover:bg-[#F8F5F1] hover:text-[#302C29]'
        }`}
      >
        <span className={isActive ? 'text-[#7A5138]' : 'text-[#AFA397]'}>
          {item.icon}
        </span>
        {item.label}
      </Link>
    </li>
  );
}

function DisabledRow({ item }: { item: DisabledNavItem }) {
  return (
    <li>
      <div
        aria-disabled="true"
        className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-[#AFA397]"
      >
        <span>{item.icon}</span>
        <span className="flex-1">{item.label}</span>
        <span className="rounded-full bg-[#F1ECE6] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8A8177]">
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
  canViewRestaurantSettings,
  onNavigate,
}: {
  restaurantId: string;
  restaurantName: string;
  restaurantStatus: RestaurantStatus;
  currentSection: StaffSection;
  canViewMenu: boolean;
  canViewTables: boolean;
  canViewRestaurantSettings: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-[#7A5138] text-sm font-semibold text-white">
          R
        </span>
        <span className="text-sm font-semibold leading-tight text-[#1D1A18]">
          Restaurant QR Platform
        </span>
      </div>

      <div className="px-5 pb-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[#AFA397]">
          Restaurant
        </p>
        <p className="mt-1 truncate text-sm font-medium text-[#302C29]">
          {restaurantName}
        </p>
        {restaurantStatus !== 'ACTIVE' ? (
          <span className="mt-1 inline-block rounded-full bg-[#B3261E]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#B3261E]">
            {restaurantStatus === 'SUSPENDED' ? 'Suspended' : 'Inactive'}
          </span>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="flex flex-col gap-0.5">
          <ActiveLink
            item={{
              key: 'dashboard',
              label: 'Dashboard',
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
                label: 'Menu Management',
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
                label: 'Menu Management',
                icon: <IconMenu className={ICON_CLASS} />,
                badge: 'No access',
              }}
            />
          )}
          {canViewTables ? (
            <ActiveLink
              item={{
                key: 'tables',
                label: 'Tables & QR',
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
                label: 'Tables & QR',
                icon: <IconQr className={ICON_CLASS} />,
                badge: 'No access',
              }}
            />
          )}
        </ul>

        <p className="mb-1 mt-5 px-3 text-[11px] font-medium uppercase tracking-wide text-[#AFA397]">
          Coming soon
        </p>
        <ul className="flex flex-col gap-0.5">
          <DisabledRow
            item={{
              key: 'orders',
              label: 'Orders',
              icon: <IconOrders className={ICON_CLASS} />,
              badge: 'Soon',
            }}
          />
          <DisabledRow
            item={{
              key: 'staff',
              label: 'Staff & Access',
              icon: <IconStaff className={ICON_CLASS} />,
              badge: 'Soon',
            }}
          />
        </ul>

        <div className="mt-5 border-t border-[#E5DED6] pt-3">
          <ul>
            {canViewRestaurantSettings ? (
              <ActiveLink
                item={{
                  key: 'settings',
                  label: 'Restaurant Settings',
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
                  label: 'Restaurant Settings',
                  icon: <IconSettings className={ICON_CLASS} />,
                  badge: 'No access',
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
 * way now that `/staff/restaurants/[restaurantId]/tables` exists).
 * Dashboard, Menu Management, Tables & QR, and Restaurant Settings link
 * somewhere real -- every other entry (Orders, Staff & Access) remains a
 * visibly disabled placeholder, never a link to a route that does not exist
 * (Section 2). `canViewMenu`/`canViewTables`/`canViewRestaurantSettings` are
 * UX-only navigation visibility, derived from the same Backend-authorized
 * `permissions` each page itself already checks (`lib/menu/capabilities.ts`,
 * `lib/tables/capabilities.ts`, `lib/settings/capabilities.ts`) -- this does
 * not introduce a new permission model (Section 12); each page still
 * independently re-derives and checks this from the authenticated context
 * regardless of what the Sidebar shows.
 */
export function RestaurantSidebar({
  restaurantId,
  restaurantName,
  restaurantStatus,
  currentSection,
  canViewMenu,
  canViewTables,
  canViewRestaurantSettings,
  isMobileOpen,
  onCloseMobile,
}: RestaurantSidebarProps) {
  return (
    <>
      <aside className="hidden w-64 flex-shrink-0 border-r border-[#E5DED6] bg-white lg:flex lg:flex-col">
        <SidebarContent
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          restaurantStatus={restaurantStatus}
          currentSection={currentSection}
          canViewMenu={canViewMenu}
          canViewTables={canViewTables}
          canViewRestaurantSettings={canViewRestaurantSettings}
        />
      </aside>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#655D56] hover:bg-[#F8F5F1]"
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
              canViewRestaurantSettings={canViewRestaurantSettings}
              onNavigate={onCloseMobile}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
