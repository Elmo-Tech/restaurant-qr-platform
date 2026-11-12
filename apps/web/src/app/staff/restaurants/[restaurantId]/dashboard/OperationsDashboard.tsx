'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { RestaurantSetupPanel } from '../../../../../components/staff/RestaurantSetupPanel';
import { localizedName } from '../../../../../lib/i18n/localized-name';
import * as dashboardApi from '../../../../../lib/dashboard/api';
import type { DashboardMetrics } from '../../../../../lib/dashboard/types';
import type { PeriodComparisonLabel } from '../../../../../lib/dashboard/range';
import { previousPeriod } from '../../../../../lib/dashboard/range';
import * as ordersApi from '../../../../../lib/orders/api';
import type { OrderListItem } from '../../../../../lib/orders/types';
import {
  elapsedMinutes,
  PENDING_LATE_MINUTES,
  READY_LATE_MINUTES,
} from '../../../../../lib/orders/order-views';
import * as sessionsApi from '../../../../../lib/table-sessions/api';
import type { TableBoardRow } from '../../../../../lib/table-sessions/types';
import { useNow } from '../../../../../lib/table-sessions/use-now';
import * as qrApi from '../../../../../lib/qr/api';
import type { GenericQr } from '../../../../../lib/qr/api';
import * as settingsApi from '../../../../../lib/settings/api';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { IconOrders, IconQr, IconTable } from '../../../../../components/staff/icons';
import { Analysis } from './Analysis';
import { WhatsappOrdersPanel } from './WhatsappOrdersPanel';
import { WhatsappConnectionCard } from '../settings/ordering/WhatsappConnectionCard';
import { AttentionPanel, type AttentionItem } from './AttentionPanel';
import { IconAlert, IconClock, IconRefresh } from './icons';
import { LiveTables, sortActiveRows } from './LiveTables';
import { PeriodNumbers, type PeriodRange } from './PeriodNumbers';
import { QuickActions } from './QuickActions';
import { latestOrders, RecentOrders } from './RecentOrders';
import { SoldOutDialog } from './SoldOutDialog';
import { StatusStrip } from './StatusStrip';
import { useAgeLabel } from './use-age-label';

const ALL_BRANCHES = '__all__';
const POLL_MS = 30_000;

const COMPARISON: Record<PeriodRange, PeriodComparisonLabel> = {
  today: 'yesterday',
  yesterday: 'dayBefore',
  last7: 'last7',
  last30: 'last30',
};

/** What this member may see and do here: derived by the page from `/auth/me` permissions (UX only; the Backend enforces). */
export interface DashboardAccess {
  orders: boolean;
  /** `sessions.view`: the live tables board. */
  sessions: boolean;
  /** `tables.view`: reading the Restaurant QR state. */
  tables: boolean;
  manageTables: boolean;
  /** `menu.manage` with Restaurant-wide Branch scope. */
  manageMenu: boolean;
  /** `restaurant.manage` with Restaurant-wide Branch scope. */
  manageRestaurant: boolean;
  /** `restaurant.view`: the Settings area exists for this member. */
  settings: boolean;
  analytics: boolean;
  /** Roles that handle the bill (`orders.accept`); kitchen and floor staff do not see money. */
  money: boolean;
}

type OrderType = 'pickup' | 'delivery' | 'table';

/**
 * The operations Dashboard: what is happening and what needs doing right now,
 * above the period numbers. Live sections (orders, tables, Restaurant QR) are
 * re-read every 30 seconds while the tab is visible; all figures come from the
 * same Backend endpoints as their own workspaces, so nothing here is invented
 * client-side, and a section the member cannot use is not rendered at all.
 */
export function OperationsDashboard({
  restaurantId,
  currencyCode,
  branches,
  initialPickupEnabled,
  initialDeliveryEnabled,
  initialTableOrderingEnabled,
  channels,
  webOrigin,
  access,
  setupEligible,
  setupRole,
  whatsappConnection,
}: {
  restaurantId: string;
  currencyCode: string;
  /** Already limited by `/auth/me` to this Membership's authorized Branches. */
  branches: AuthContextBranch[];
  initialPickupEnabled: boolean;
  initialDeliveryEnabled: boolean;
  initialTableOrderingEnabled: boolean;
  /** What the platform package includes: table orders, and pickup / delivery (dashboard or WhatsApp). */
  channels: { table: boolean; pickupDelivery: boolean };
  webOrigin: string;
  access: DashboardAccess;
  setupEligible: boolean;
  setupRole: string;
  whatsappConnection: { visible: boolean; hasWhatsappNumber: boolean; orderingEnabled: boolean; canManage: boolean };
}) {
  const { t, locale, formatTime } = useStaffI18n();
  const now = useNow(30_000);
  const ageLabel = useAgeLabel(now);

  const [scope, setScope] = useState<string>(ALL_BRANCHES);
  const [range, setRange] = useState<PeriodRange>('today');
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [board, setBoard] = useState<TableBoardRow[] | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [previous, setPrevious] = useState<DashboardMetrics | null>(null);
  const [qr, setQr] = useState<GenericQr | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [pickupEnabled, setPickupEnabled] = useState(initialPickupEnabled);
  const [deliveryEnabled, setDeliveryEnabled] = useState(initialDeliveryEnabled);
  const [tableOrderingEnabled, setTableOrderingEnabled] = useState(initialTableOrderingEnabled);
  const [toggleBusy, setToggleBusy] = useState<OrderType | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [soldOutOpen, setSoldOutOpen] = useState(false);
  const [setupVisible, setSetupVisible] = useState(false);

  const requestRef = useRef(0);
  const basePath = `/staff/restaurants/${restaurantId}`;
  const ordersHref = access.orders ? `${basePath}/orders` : null;
  const tablesHref = channels.table && (access.sessions || access.tables) ? `${basePath}/tables` : null;
  const qrSettingsHref = access.settings ? `${basePath}/settings/guest-qr` : null;

  const { orders: canOrders, sessions: canSessions, tables: canTables, analytics: canAnalytics } = access;

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    setRefreshing(true);
    const branchId = scope === ALL_BRANCHES ? undefined : scope;
    const comparison = canAnalytics ? previousPeriod(range) : null;

    const results = await Promise.allSettled([
      canOrders ? ordersApi.listOrders(restaurantId, { branchId }) : Promise.resolve(null),
      canSessions ? sessionsApi.getBoard(restaurantId, branchId) : Promise.resolve(null),
      canAnalytics
        ? dashboardApi.getDashboardMetrics(restaurantId, { range, branchId })
        : Promise.resolve(null),
      canAnalytics && comparison
        ? dashboardApi.getDashboardMetrics(restaurantId, { ...comparison.query, branchId })
        : Promise.resolve(null),
      canTables ? qrApi.getGenericQr(restaurantId) : Promise.resolve(undefined),
    ]);
    if (requestRef.current !== requestId) return;

    const [ordersResult, boardResult, metricsResult, previousResult, qrResult] = results;
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.some((failure) => isUnauthenticatedError(failure.reason))) {
      redirectToLogin();
      return;
    }

    if (ordersResult.status === 'fulfilled' && ordersResult.value) setOrders(ordersResult.value);
    if (boardResult.status === 'fulfilled' && boardResult.value) setBoard(boardResult.value);
    if (metricsResult.status === 'fulfilled' && metricsResult.value) setMetrics(metricsResult.value);
    if (previousResult.status === 'fulfilled' && previousResult.value) setPrevious(previousResult.value);
    if (qrResult.status === 'fulfilled' && qrResult.value !== undefined) setQr(qrResult.value);

    setError(failures.length > 0 ? describeError(failures[0].reason) : null);
    setUpdatedAt(Date.now());
    setRefreshing(false);
  }, [restaurantId, scope, range, canOrders, canSessions, canTables, canAnalytics]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  function changeScope(next: string) {
    setScope(next);
    setOrders(null);
    setBoard(null);
    setMetrics(null);
    setPrevious(null);
  }

  function changeRange(next: PeriodRange) {
    setRange(next);
    setMetrics(null);
    setPrevious(null);
  }

  async function toggleOrdering(type: OrderType, next: boolean) {
    if (toggleBusy) return;
    setToggleBusy(type);
    setToggleError(null);
    try {
      const saved = await settingsApi.updateOrderingOptions(
        restaurantId,
        type === 'pickup'
          ? { pickupEnabled: next }
          : type === 'delivery'
            ? { deliveryEnabled: next }
            : { tableOrderingEnabled: next },
      );
      setPickupEnabled(saved.pickupEnabled);
      setDeliveryEnabled(saved.deliveryEnabled);
      setTableOrderingEnabled(saved.tableOrderingEnabled);
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setToggleError(describeError(caught));
    } finally {
      setToggleBusy(null);
    }
  }

  // ---- derived live state -------------------------------------------------
  const nowDate = new Date(now);
  const pendingOrders = (orders ?? []).filter((order) => order.status === 'PENDING');
  const staleReady = (orders ?? []).filter(
    (order) =>
      order.status === 'READY' && elapsedMinutes(order.createdAt, nowDate) >= READY_LATE_MINUTES,
  );
  const oldest = (rows: OrderListItem[]) =>
    rows.reduce<OrderListItem | null>(
      (current, order) =>
        current === null || new Date(order.createdAt) < new Date(current.createdAt) ? order : current,
      null,
    );
  const activeRows = sortActiveRows(board ?? []);
  const tablesWithPending = activeRows.filter((row) => row.openSession!.pendingOrderCount > 0);

  const attention: AttentionItem[] = [];
  const oldestPending = oldest(pendingOrders);
  if (ordersHref && oldestPending) {
    const urgent = elapsedMinutes(oldestPending.createdAt, nowDate) >= PENDING_LATE_MINUTES;
    attention.push({
      key: 'pending',
      tone: urgent ? 'danger' : 'warning',
      icon: <IconClock />,
      count: pendingOrders.length,
      title: t('ops.attention.pending'),
      hint: t('ops.attention.oldest', { age: ageLabel(oldestPending.createdAt) }),
      href: `${ordersHref}?status=PENDING&sort=oldest`,
      cta: t('ops.attention.review'),
    });
  }
  const oldestStale = oldest(staleReady);
  if (ordersHref && oldestStale) {
    attention.push({
      key: 'ready',
      tone: 'warning',
      icon: <IconOrders />,
      count: staleReady.length,
      title: t('ops.attention.ready'),
      hint: t('ops.attention.oldest', { age: ageLabel(oldestStale.createdAt) }),
      href: `${ordersHref}?status=READY&sort=oldest`,
      cta: t('ops.attention.review'),
    });
  }
  if (!ordersHref && tablesHref && tablesWithPending.length > 0) {
    attention.push({
      key: 'tables-pending',
      tone: 'warning',
      icon: <IconTable />,
      count: tablesWithPending.length,
      title: t('ops.attention.tablesPending'),
      hint: t('ops.attention.tablesPendingHint'),
      href: tablesHref,
      cta: t('ops.attention.review'),
    });
  }
  if (qrSettingsHref && access.manageRestaurant && qr === null) {
    attention.push({
      key: 'qr-none',
      tone: 'info',
      icon: <IconQr />,
      title: t('ops.attention.setup.qrNone'),
      hint: t('ops.attention.setup.qrNoneHint'),
      href: qrSettingsHref,
      cta: t('ops.attention.fix'),
    });
  }
  if (qrSettingsHref && access.manageRestaurant && qr && qr.status === 'INACTIVE') {
    attention.push({
      key: 'qr-inactive',
      tone: 'warning',
      icon: <IconAlert />,
      title: t('ops.attention.setup.qrInactive'),
      hint: t('ops.attention.setup.qrInactiveHint'),
      href: qrSettingsHref,
      cta: t('ops.attention.fix'),
    });
  }
  if (tablesHref && access.manageTables && board !== null && board.length === 0) {
    attention.push({
      key: 'no-tables',
      tone: 'info',
      icon: <IconTable />,
      title: t('ops.attention.setup.noTables'),
      hint: t('ops.attention.setup.noTablesHint'),
      href: tablesHref,
      cta: t('ops.attention.fix'),
    });
  }

  const attentionLoading =
    (access.orders && orders === null) || (!access.orders && access.sessions && board === null);
  // Keep urgent warnings (incl. inactive QR) visible; only redundant
  // informational setup reminders are replaced by the active setup guide.
  const attentionItems = setupVisible
    ? attention.filter(item => item.key !== 'qr-none' && item.key !== 'no-tables')
    : attention;
  const showAttention = access.orders || access.sessions || attentionItems.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-3 flex flex-wrap items-center justify-between gap-3">
        {branches.length > 1 ? (
          <select
            value={scope}
            onChange={(event) => changeScope(event.target.value)}
            aria-label={t('orders.filter.branch')}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring"
          >
            <option value={ALL_BRANCHES}>{t('orders.filter.allBranches')}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {localizedName(branch, locale)}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {updatedAt !== null ? (
            <span aria-live="off">{t('ops.updated', { time: formatTime(new Date(updatedAt)) })}</span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('ops.refresh')}
            title={t('ops.refresh')}
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <IconRefresh className={refreshing ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void refresh()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {toggleError ? <Alert variant="error">{toggleError}</Alert> : null}

      {showAttention ? <AttentionPanel items={attentionItems} loading={attentionLoading} /> : null}

      {/* High-visibility self-service pairing, not buried under Ordering Settings.
          Server-side entitlement, full-branch scope and member permissions determine visibility. */}
      {whatsappConnection.visible ? (
        <WhatsappConnectionCard
          restaurantId={restaurantId}
          hasWhatsappNumber={whatsappConnection.hasWhatsappNumber}
          orderingEnabled={whatsappConnection.orderingEnabled}
          canManage={whatsappConnection.canManage}
        />
      ) : null}

      {/* Only eligible enrolled restaurants receive this compact, verified
          guide, after urgent operational alerts. Never synthetic demo state. */}
      {setupEligible ? <RestaurantSetupPanel
        restaurantId={restaurantId}
        mode="dashboard"
        memberRole={setupRole}
        fullRestaurantScope
        onDashboardVisibilityChange={setSetupVisible}
      /> : null}

      <QuickActions
        restaurantId={restaurantId}
        webOrigin={webOrigin}
        ordersHref={ordersHref ? `${ordersHref}?status=PENDING&sort=oldest` : null}
        pendingCount={pendingOrders.length}
        tablesHref={tablesHref}
        onSoldOut={access.manageMenu ? () => setSoldOutOpen(true) : null}
      />

      <StatusStrip
        pickupEnabled={pickupEnabled}
        deliveryEnabled={deliveryEnabled}
        tableOrderingEnabled={tableOrderingEnabled}
        channels={channels}
        canManage={access.manageRestaurant}
        busy={toggleBusy}
        onToggle={(type, next) => void toggleOrdering(type, next)}
        qr={access.tables ? qr : undefined}
        qrSettingsHref={qrSettingsHref}
        openSessions={access.sessions && board !== null ? activeRows.length : null}
        tableCount={access.sessions && board !== null ? board.length : null}
        tablesHref={tablesHref}
      />


      {access.sessions || access.orders ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {access.sessions && tablesHref ? (
            <LiveTables
              rows={activeRows}
              loading={board === null}
              now={now}
              tablesHref={tablesHref}
              showMoney={access.money}
              branches={branches}
            />
          ) : null}
          {access.orders && ordersHref ? (
            <RecentOrders
              orders={latestOrders(orders ?? [])}
              loading={orders === null}
              now={now}
              ordersHref={ordersHref}
              showMoney={access.money}
            />
          ) : null}
        </div>
      ) : null}

      {access.analytics ? <WhatsappOrdersPanel restaurantId={restaurantId} /> : null}

      {access.analytics ? (
        <div className="flex flex-col gap-4">
          <PeriodNumbers
            range={range}
            onRangeChange={changeRange}
            metrics={metrics}
            previous={previous}
            currencyCode={currencyCode}
            comparison={COMPARISON[range]}
          />
          {metrics ? <Analysis metrics={metrics} currencyCode={currencyCode} /> : null}
        </div>
      ) : null}

      <SoldOutDialog
        open={soldOutOpen}
        restaurantId={restaurantId}
        onClose={() => setSoldOutOpen(false)}
      />
    </div>
  );
}
