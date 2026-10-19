import Link from 'next/link';
import { roleDisplayName } from '../../../../lib/staff/role-display';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../lib/auth/session';
import { canManageMenu, canViewMenu } from '../../../../lib/menu/capabilities';
import { canViewOrders } from '../../../../lib/orders/capabilities';
import { canViewKitchen } from '../../../../lib/kitchen/capabilities';
import { canManageTables, canViewTables } from '../../../../lib/tables/capabilities';
import { sessionCapabilities } from '../../../../lib/table-sessions/capabilities';
import { getWebOrigin } from '../../../../lib/env/web-origin';
import {
  canManageLanguages,
  canViewRestaurantSettings,
} from '../../../../lib/settings/capabilities';
import { canViewStaff } from '../../../../lib/staff/capabilities';
import {
  offersPickupAndDelivery,
  receivesDashboardOrders,
  usesTableOrdering,
} from '../../../../lib/entitlements/access';
import { canViewAnalytics } from '../../../../lib/dashboard/capabilities';
import { OperationsDashboard, type DashboardAccess } from './dashboard/OperationsDashboard';
import type { RestaurantStatus } from '../../../../lib/auth/types';
import { Alert } from '../../../../components/ui/Alert';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { getStaffI18n } from '../../../../lib/i18n/server';
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

const STATUS_BADGE_STYLES: Record<RestaurantStatus, string> = {
  ACTIVE: 'bg-success-soft text-success',
  INACTIVE: 'bg-muted text-muted-foreground',
  SUSPENDED: 'bg-destructive-soft text-destructive',
};

function StatusBadge({ status, label }: { status: RestaurantStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_STYLES[status]}`}
    >
      {label}
    </span>
  );
}

function ContextFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 text-sm font-medium text-foreground">
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
            emphasize ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
          }`}
        >
          {icon}
        </span>
        {disabledReason ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {disabledReason}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary rtl:group-hover:-translate-x-0.5"
          >
            <IconArrowRight className="h-5 w-5 rtl:rotate-180" />
          </span>
        )}
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="flex cursor-not-allowed flex-col rounded-lg border border-border bg-card/60 p-5 opacity-70">
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
  const [sessionState, { t }] = await Promise.all([getAuthSessionState(), getStaffI18n()]);

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
    return <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>;
  }

  // STAFF_DASHBOARD_UX_SPEC #101: a Kitchen account lands directly on the Kitchen Board.
  if (membership.role === 'KITCHEN' && membership.restaurant.status === 'ACTIVE' && canViewKitchen(membership)) {
    redirect(`/staff/restaurants/${restaurantId}/kitchen`);
  }

  const { restaurant, role } = membership;
  const statusLabel =
    restaurant.status === 'ACTIVE'
      ? t('common.active')
      : restaurant.status === 'SUSPENDED'
        ? t('common.suspended')
        : t('common.inactive');
  const languageLabel =
    restaurant.defaultLocale === 'ar'
      ? t('dashboard.language.ar')
      : restaurant.defaultLocale === 'en'
        ? t('dashboard.language.en')
        : restaurant.defaultLocale.toUpperCase();

  const access: DashboardAccess = {
    orders: canViewOrders(membership),
    sessions: sessionCapabilities(membership).canView,
    tables: canViewTables(membership),
    manageTables: canManageTables(membership),
    manageMenu: canManageMenu(membership),
    manageRestaurant: canManageLanguages(membership),
    settings: canViewRestaurantSettings(membership),
    analytics: canViewAnalytics(membership),
    money: membership.permissions.includes('orders.accept'),
  };
  const showOperations =
    restaurant.status === 'ACTIVE' && (access.orders || access.sessions || access.analytics);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t('dashboard.title')}
        description={
          showOperations
            ? t('dashboard.nav.subtitle', { name: restaurant.name })
            : t('dashboard.subtitle', { name: restaurant.name })
        }
        actions={
          restaurant.status === 'ACTIVE' && canViewMenu(membership) ? (
            <OpenGuestMenuButton restaurantId={restaurantId} />
          ) : undefined
        }
      />

      {restaurant.status !== 'ACTIVE' ? (
        <Alert variant="error">
          {t('guard.notOperational', {
            state: restaurant.status === 'SUSPENDED' ? t('guard.state.suspended') : t('guard.state.inactive'),
          })}
        </Alert>
      ) : showOperations ? (
        <OperationsDashboard
          restaurantId={restaurantId}
          currencyCode={restaurant.currencyCode}
          branches={membership.branches}
          initialPickupEnabled={restaurant.pickupEnabled}
          initialDeliveryEnabled={restaurant.deliveryEnabled}
          initialTableOrderingEnabled={restaurant.tableOrderingEnabled}
          channels={{
            table: usesTableOrdering(membership),
            pickupDelivery: offersPickupAndDelivery(membership),
          }}
          webOrigin={getWebOrigin()}
          access={access}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-6 rounded-lg border border-border bg-card p-5 shadow-sm sm:grid-cols-4">
            <ContextFact label={t('dashboard.fact.status')}>
              <StatusBadge status={restaurant.status} label={statusLabel} />
            </ContextFact>
            <ContextFact label={t('dashboard.fact.currency')}>
              <bdi dir="ltr">{restaurant.currencyCode}</bdi>
            </ContextFact>
            <ContextFact label={t('dashboard.fact.defaultLanguage')}>
              {languageLabel} · <bdi dir="ltr">{restaurant.defaultLocale}</bdi>
            </ContextFact>
            <ContextFact label={t('dashboard.fact.access')}>{roleDisplayName({ kind: role, name: membership.roleName }, t)}</ContextFact>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t('dashboard.management')}
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {canViewMenu(membership) ? (
                <FeatureCard
                  title={t('dashboard.card.menu.title')}
                  description={t('dashboard.card.menu.description')}
                  icon={<IconMenu className="h-5 w-5" />}
                  href={`/staff/restaurants/${restaurantId}/menu`}
                  emphasize
                />
              ) : (
                <FeatureCard
                  title={t('dashboard.card.menu.title')}
                  description={t('dashboard.card.menu.noAccess')}
                  icon={<IconMenu className="h-5 w-5" />}
                  disabledReason={t('common.noAccess')}
                />
              )}
              {usesTableOrdering(membership) ? (
                <FeatureCard
                  title={t('dashboard.card.tables.title')}
                  description={t('dashboard.card.tables.description')}
                  icon={<IconQr className="h-5 w-5" />}
                  {...(canViewTables(membership)
                    ? { href: `/staff/restaurants/${restaurantId}/tables` }
                    : { disabledReason: t('common.noAccess') })}
                />
              ) : null}
              {receivesDashboardOrders(membership) ? (
                <FeatureCard
                  title={t('dashboard.card.orders.title')}
                  description={t('dashboard.card.orders.description')}
                  icon={<IconOrders className="h-5 w-5" />}
                  {...(canViewOrders(membership)
                    ? { href: `/staff/restaurants/${restaurantId}/orders` }
                    : { disabledReason: t('common.noAccess') })}
                />
              ) : null}
              <FeatureCard
                title={t('dashboard.card.staff.title')}
                description={t('dashboard.card.staff.description')}
                icon={<IconStaff className="h-5 w-5" />}
                {...(canViewStaff(membership)
                  ? { href: `/staff/restaurants/${restaurantId}/staff` }
                  : { disabledReason: t('common.noAccess') })}
              />
              {canViewRestaurantSettings(membership) ? (
                <FeatureCard
                  title={t('dashboard.card.settings.title')}
                  description={t('dashboard.card.settings.description')}
                  icon={<IconSettings className="h-5 w-5" />}
                  href={`/staff/restaurants/${restaurantId}/settings/profile`}
                />
              ) : (
                <FeatureCard
                  title={t('dashboard.card.settings.title')}
                  description={t('dashboard.card.settings.noAccess')}
                  icon={<IconSettings className="h-5 w-5" />}
                  disabledReason={t('common.noAccess')}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
