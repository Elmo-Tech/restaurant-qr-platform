import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../lib/auth/session';
import { canViewMenu } from '../../../../lib/menu/capabilities';
import { canViewOrders } from '../../../../lib/orders/capabilities';
import { canViewTables } from '../../../../lib/tables/capabilities';
import { canViewRestaurantSettings } from '../../../../lib/settings/capabilities';
import type {
  RestaurantMembershipRole,
  RestaurantStatus,
} from '../../../../lib/auth/types';
import { Alert } from '../../../../components/ui/Alert';
import { OpenGuestMenuButton } from '../../../../components/menu/OpenGuestMenuButton';
import {
  IconArrowRight,
  IconMenu,
  IconOrders,
  IconQr,
  IconSettings,
  IconStaff,
} from '../../../../components/staff/icons';

interface RestaurantLandingPageProps {
  params: Promise<{ restaurantId: string }>;
}

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  ar: 'Arabic',
};

function localeLabel(locale: string): string {
  return LOCALE_LABELS[locale] ?? locale.toUpperCase();
}

function roleLabel(role: RestaurantMembershipRole): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

const STATUS_BADGE_STYLES: Record<RestaurantStatus, string> = {
  ACTIVE: 'bg-[#2F6B4F]/10 text-[#2F6B4F]',
  INACTIVE: 'bg-[#8A8177]/10 text-[#8A8177]',
  SUSPENDED: 'bg-[#B3261E]/10 text-[#B3261E]',
};

const STATUS_BADGE_LABELS: Record<RestaurantStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
};

function StatusBadge({ status }: { status: RestaurantStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_STYLES[status]}`}
    >
      {STATUS_BADGE_LABELS[status]}
    </span>
  );
}

function ContextFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[#AFA397]">
        {label}
      </p>
      <div className="mt-1.5 text-sm font-medium text-[#302C29]">
        {children}
      </div>
    </div>
  );
}

interface FeatureCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  href?: string;
  disabledReason?: string;
  emphasize?: boolean;
}

/**
 * One Restaurant Management tile (UX-2, Section 5/7). Whether it is a real
 * `<Link>` or a non-interactive placeholder is decided entirely by whether
 * `href` is supplied -- callers pass `href` only when the destination route
 * actually exists and the current Membership is actually authorized to view
 * it (Section 10), never a link to a future route. `disabledReason` renders
 * the same restrained "Soon"/"No access" treatment already established in
 * `RestaurantSidebar` (UX-1), so the Dashboard and the sidebar read as one
 * consistent navigation vocabulary.
 */
function FeatureCard({
  title,
  description,
  icon,
  href,
  disabledReason,
  emphasize = false,
}: FeatureCardProps) {
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            emphasize
              ? 'bg-[#7A5138] text-white'
              : 'bg-[#7A5138]/10 text-[#7A5138]'
          }`}
        >
          {icon}
        </span>
        {disabledReason ? (
          <span className="rounded-full bg-[#F1ECE6] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8A8177]">
            {disabledReason}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="text-[#AFA397] transition-transform group-hover:translate-x-0.5 group-hover:text-[#7A5138]"
          >
            <IconArrowRight className="h-5 w-5" />
          </span>
        )}
      </div>
      <p className="mt-4 text-sm font-semibold text-[#1D1A18]">{title}</p>
      <p className="mt-1 text-sm text-[#655D56]">{description}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group flex flex-col rounded-lg border border-[#E5DED6] bg-white p-5 shadow-sm transition-colors hover:border-[#7A5138] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7A5138]"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="flex cursor-not-allowed flex-col rounded-lg border border-[#E5DED6] bg-white/60 p-5 opacity-70">
      {inner}
    </div>
  );
}

/**
 * Section 16 (Batch G) / Section 4 (Batch H) proof-of-foundation screen,
 * replaced in UX-2 with the real Restaurant Dashboard: the URL
 * `restaurantId` is the explicit selected-Restaurant identifier
 * (Section 9), validated here only against the same Backend-authorized
 * `memberships` list every other Staff screen uses -- this is not
 * frontend-invented authorization, it is the Backend's own access decision.
 * Every feature request against this Restaurant (Menu, Orders, ...) still
 * goes through its own `RestaurantAccessGuard`-protected endpoint
 * independently.
 *
 * The Restaurant context strip and the Restaurant Management tiles use only
 * fields already present on the authenticated `membership`
 * (`restaurant.status`/`currencyCode`/`defaultLocale`, `role`) -- no new
 * Backend call, no invented metric (UX-2, Section 4).
 *
 * A non-`ACTIVE` Restaurant status (`INACTIVE`/`SUSPENDED`, already exposed
 * by `GET /auth/me`) continues to render a non-operational state instead of
 * the normal Dashboard content (unchanged domain behavior, Section 10) --
 * UX only; the Backend's `RestaurantAccessGuard` remains the actual
 * authorization/operational authority for every real request a future
 * feature page makes.
 */
export default async function RestaurantLandingPage({
  params,
}: RestaurantLandingPageProps) {
  const { restaurantId } = await params;
  const sessionState = await getAuthSessionState();

  if (sessionState.status === 'unauthenticated') {
    redirect('/login');
  }

  if (sessionState.status === 'error') {
    return <Alert variant="error">{sessionState.message}</Alert>;
  }

  const membership = sessionState.context.memberships.find(
    (candidate) => candidate.restaurant.id === restaurantId,
  );

  if (!membership) {
    return <Alert variant="error">Restaurant not found.</Alert>;
  }

  const { restaurant, role } = membership;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1D1A18]">Dashboard</h1>
          <p className="mt-1 text-sm text-[#655D56]">
            Manage {restaurant.name}&apos;s restaurant setup and operations.
          </p>
        </div>
        {restaurant.status === 'ACTIVE' && canViewMenu(membership) ? (
          <OpenGuestMenuButton restaurantId={restaurantId} />
        ) : null}
      </div>

      {restaurant.status !== 'ACTIVE' ? (
        <Alert variant="error">
          This Restaurant is currently{' '}
          {restaurant.status === 'SUSPENDED' ? 'suspended' : 'inactive'} and
          not operational. Contact your Restaurant owner for details.
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-6 rounded-lg border border-[#E5DED6] bg-white p-5 sm:grid-cols-4">
            <ContextFact label="Status">
              <StatusBadge status={restaurant.status} />
            </ContextFact>
            <ContextFact label="Currency">{restaurant.currencyCode}</ContextFact>
            <ContextFact label="Default language">
              {localeLabel(restaurant.defaultLocale)} · {restaurant.defaultLocale}
            </ContextFact>
            <ContextFact label="Your access">{roleLabel(role)}</ContextFact>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-[#302C29]">
              Restaurant Management
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {canViewMenu(membership) ? (
                <FeatureCard
                  title="Menu Management"
                  description="Manage menus, categories, products, pricing and availability."
                  icon={<IconMenu className="h-5 w-5" />}
                  href={`/staff/restaurants/${restaurantId}/menu`}
                  emphasize
                />
              ) : (
                <FeatureCard
                  title="Menu Management"
                  description="You do not have permission to view this Restaurant's Menu."
                  icon={<IconMenu className="h-5 w-5" />}
                  disabledReason="No access"
                />
              )}
              <FeatureCard
                title="Tables & QR"
                description="Manage dining tables, table QR codes and the Restaurant QR for Pickup and Delivery."
                icon={<IconQr className="h-5 w-5" />}
                {...(canViewTables(membership)
                  ? { href: `/staff/restaurants/${restaurantId}/tables` }
                  : { disabledReason: 'No access' })}
              />
              <FeatureCard
                title="Orders"
                description="Track and manage incoming Guest orders."
                icon={<IconOrders className="h-5 w-5" />}
                {...(canViewOrders(membership)
                  ? { href: `/staff/restaurants/${restaurantId}/orders` }
                  : { disabledReason: 'No access' })}
              />
              <FeatureCard
                title="Staff & Access"
                description="Invite Staff and manage Roles and Branch access."
                icon={<IconStaff className="h-5 w-5" />}
                disabledReason="Coming soon"
              />
              {canViewRestaurantSettings(membership) ? (
                <FeatureCard
                  title="Restaurant Settings"
                  description="Configure restaurant languages and delivery areas."
                  icon={<IconSettings className="h-5 w-5" />}
                  href={`/staff/restaurants/${restaurantId}/settings/languages`}
                />
              ) : (
                <FeatureCard
                  title="Restaurant Settings"
                  description="You do not have permission to view this Restaurant's Settings."
                  icon={<IconSettings className="h-5 w-5" />}
                  disabledReason="No access"
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
