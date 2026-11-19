'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { localizedName } from '../../../../../lib/i18n/localized-name';
import * as ordersApi from '../../../../../lib/orders/api';
import type {
  OrderDetail,
  OrderListItem,
  OrderStatus,
  OrderType,
} from '../../../../../lib/orders/types';
import { getAvailableTransitions } from '../../../../../lib/orders/transitions';
import {
  countByStatus,
  countByType,
  countByView,
  effectiveSort,
  filterOrders,
  sortsForView,
  statusesForView,
  type OrdersSort,
  type OrdersView,
} from '../../../../../lib/orders/order-views';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { ApiError } from '../../../../../lib/api/errors';
import { ReadErrorAlert } from '../../../../../components/staff/ReadErrorAlert';
import { Button } from '../../../../../components/ui/Button';
import { Card } from '../../../../../components/ui/Card';
import { ChipGroup, type ChipOption } from '../../../../../components/ui/ChipGroup';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { OrderDetailDialog } from './OrderDetailDialog';
import { OrderDetailErrorDialog } from './OrderDetailErrorDialog';
import { ALL_BRANCHES, OrdersFilterBar } from './OrdersFilterBar';
import { orderTypeLabel } from './OrderTypeBadge';
import { OrdersQueue } from './OrdersQueue';

const POLL_INTERVAL_MS = 10_000;
const VIEWS: readonly OrdersView[] = ['active', 'completed', 'all'];

/** Filters a deep link (the Dashboard's "needs attention") can open the workspace with. */
export interface OrdersInitialFilters {
  view?: OrdersView;
  status?: OrderStatus | null;
  sort?: OrdersSort;
}

export interface OrdersWorkspaceProps {
  restaurantId: string;
  /** Already scoped to this Membership's authorized Branches by `/auth/me`. */
  branches: AuthContextBranch[];
  permissions: string[];
  /** The Restaurant's CURRENT logo (not part of any Order snapshot), shown only on the printed receipt header. */
  restaurantLogoUrl?: string | null;
  /** Deep link from the Dashboard (`?order=`): opens that Order's detail on load. */
  initialOrderId?: string | null;
  /** Deep link filters (`?status=`, `?sort=`). */
  initialFilters?: OrdersInitialFilters;
}

/**
 * FT-5/FT-7B: the Staff Orders workspace. Section 27 (FT-5): no
 * WebSocket/SSE infrastructure -- a manual Refresh button plus a lightweight
 * ~10s poll while the tab is visible (paused via `document.visibilityState`
 * so a backgrounded tab does not keep hammering the Backend). `requestRef`
 * guards against a stale response landing after a newer refresh/filter
 * change already started (mirrors `TablesWorkspace`'s identical pattern).
 *
 * FT-7B: Active / Completed / All views, plus Order type, status, and search
 * filters, are applied CLIENT-SIDE over the already-loaded Orders (no API or
 * pagination change). Only the Branch filter stays a server-side query
 * parameter, exactly as before. All filter state lives here, so a background
 * poll replaces only the Orders data and never resets a filter, the selected
 * tab, or an open Order.
 */
export function OrdersWorkspace({
  restaurantId,
  branches,
  permissions,
  restaurantLogoUrl = null,
  initialOrderId = null,
  initialFilters = {},
}: OrdersWorkspaceProps) {
  const { t, locale, formatDateTime } = useStaffI18n();
  // Order DTOs carry the default-locale Branch name; the Staff language's own
  // name comes from the Memberships' Branch list (falls back to the DTO name).
  function withBranchLabel<T extends { branch: { id: string; name: string } }>(order: T): T {
    const known = branches.find((branch) => branch.id === order.branch.id);
    return known
      ? { ...order, branch: { ...order.branch, name: localizedName(known, locale) } }
      : order;
  }
  const [branchFilter, setBranchFilter] = useState<string>(ALL_BRANCHES);
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [view, setView] = useState<OrdersView>(initialFilters.view ?? 'active');
  const [typeFilter, setTypeFilter] = useState<OrderType | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(
    initialFilters.status ?? null,
  );
  const [search, setSearch] = useState('');
  // `null` = no explicit choice: the view's own default applies (Active ->
  // priority, Completed/All -> newest). An explicit pick or `?sort=` deep
  // link wins wherever the view offers it -- see `effectiveSort`.
  const [sort, setSort] = useState<OrdersSort | null>(initialFilters.sort ?? null);
  const appliedSort = effectiveSort(view, sort);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  // Whether the detail on screen is the authoritative latest state. After an
  // ORDER_STATUS_CHANGED conflict it is 'refreshing' until the re-read lands,
  // and 'unverified' if that re-read failed: in both cases mutating actions
  // stay disabled until the Order is opened (read) again.
  const [detailSync, setDetailSync] = useState<'current' | 'refreshing' | 'unverified'>('current');
  // Focus returns here (the Order card that opened the detail) when it closes.
  const detailTriggerRef = useRef<HTMLElement | null>(null);

  const requestRef = useRef(0);
  // Drops a detail response that lands after the Staff member closed or
  // switched to another Order (same pattern as `requestRef` for the list).
  const detailRequestRef = useRef(0);

  const loadOrders = useCallback(async () => {
    const requestId = ++requestRef.current;
    setIsRefreshing(true);
    try {
      const list = await ordersApi.listOrders(restaurantId, {
        branchId: branchFilter === ALL_BRANCHES ? undefined : branchFilter,
      });
      if (requestRef.current !== requestId) return;
      setOrders(list);
      setOrdersError(null);
    } catch (error) {
      if (requestRef.current !== requestId) return;
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setOrdersError(describeError(error));
    } finally {
      if (requestRef.current === requestId) setIsRefreshing(false);
    }
  }, [restaurantId, branchFilter]);

  useEffect(() => {
    queueMicrotask(() => {
      // A new Branch scope starts clean: the previous scope's error must not
      // hide this scope's loading state.
      setOrders(null);
      setOrdersError(null);
      void loadOrders();
    });
  }, [loadOrders]);

  // Section 27: ~10s background poll while the tab is visible only.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadOrders();
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadOrders]);

  useEffect(() => {
    if (!initialOrderId) return;
    let cancelled = false;
    const requestId = ++detailRequestRef.current;
    ordersApi
      .getOrderDetail(restaurantId, initialOrderId)
      .then((detail) => {
        if (cancelled || detailRequestRef.current !== requestId) return;
        setSelectedOrderId(initialOrderId);
        setOrderDetail(detail);
      })
      .catch((error: unknown) => {
        if (cancelled || detailRequestRef.current !== requestId) return;
        if (isUnauthenticatedError(error)) {
          redirectToLogin();
          return;
        }
        setSelectedOrderId(initialOrderId);
        setDetailError(describeError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [initialOrderId, restaurantId]);

  async function openOrder(orderId: string) {
    const requestId = ++detailRequestRef.current;
    setSelectedOrderId(orderId);
    setOrderDetail(null);
    setDetailError(null);
    setTransitionError(null);
    setDetailSync('current');
    try {
      const detail = await ordersApi.getOrderDetail(restaurantId, orderId);
      if (detailRequestRef.current !== requestId) return;
      setOrderDetail(detail);
    } catch (error) {
      if (detailRequestRef.current !== requestId) return;
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setDetailError(describeError(error));
    }
  }

  /**
   * After `ORDER_STATUS_CHANGED`: re-READ the Order while the current detail
   * and the stale-status explanation stay on screen. Actions stay disabled
   * until the real status arrives, and the transition itself is never
   * repeated -- the Staff member decides again against the fresh state.
   */
  async function refreshOrderAfterConflict(orderId: string) {
    const requestId = ++detailRequestRef.current;
    setDetailSync('refreshing');
    try {
      const detail = await ordersApi.getOrderDetail(restaurantId, orderId);
      if (detailRequestRef.current !== requestId) return;
      setOrderDetail(detail);
      setDetailSync('current');
    } catch (error) {
      if (detailRequestRef.current !== requestId) return;
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      // The detail on screen is now known to be outdated: say so instead of
      // claiming "showing the latest state", and keep its actions disabled.
      setDetailSync('unverified');
      setTransitionError(t('orders.transitionStaleUnverified'));
    }
  }

  function closeDetail() {
    detailRequestRef.current += 1;
    setDetailSync('current');
    setSelectedOrderId(null);
    setOrderDetail(null);
    setDetailError(null);
    setTransitionError(null);
    const trigger = detailTriggerRef.current;
    detailTriggerRef.current = null;
    if (trigger?.isConnected) trigger.focus();
  }

  async function handleTransition(to: OrderStatus) {
    if (!orderDetail || isTransitioning || detailSync !== 'current') return;
    // The detail this transition belongs to: if the Staff member closes it or
    // opens another Order before the response lands, the response must not
    // replace (or re-open) whatever is on screen by then.
    const detailRequestId = detailRequestRef.current;
    const isSameDetail = () => detailRequestRef.current === detailRequestId;
    setIsTransitioning(true);
    setTransitionError(null);
    try {
      const updated = await ordersApi.updateOrderStatus(restaurantId, orderDetail.id, {
        expectedStatus: orderDetail.status,
        status: to,
      });
      if (isSameDetail()) setOrderDetail(updated);
      setOrders((prev) =>
        (prev ?? []).map((order) =>
          order.id === updated.id ? { ...order, status: updated.status } : order,
        ),
      );
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      if (error instanceof ApiError && error.code === 'ORDER_STATUS_CHANGED') {
        // Section 14: someone else already changed it -- refresh the
        // detail + list so the Staff member sees the real current state
        // rather than retrying blindly against stale data.
        void loadOrders();
        if (!isSameDetail()) return;
        setTransitionError(t('orders.transitionStale'));
        void refreshOrderAfterConflict(orderDetail.id);
        return;
      }
      if (isSameDetail()) setTransitionError(describeError(error));
    } finally {
      setIsTransitioning(false);
    }
  }

  function changeView(next: OrdersView) {
    setView(next);
    // A status that does not belong to the new view can never match -- clear it.
    if (statusFilter !== null && !statusesForView(next).includes(statusFilter)) {
      setStatusFilter(null);
    }
  }

  function clearFilters() {
    setTypeFilter(null);
    setStatusFilter(null);
    setSearch('');
    setBranchFilter(ALL_BRANCHES);
  }

  const hasActiveFilters =
    typeFilter !== null ||
    statusFilter !== null ||
    search.trim() !== '' ||
    branchFilter !== ALL_BRANCHES;

  const counts = useMemo(() => countByView(orders ?? []), [orders]);
  // Counts for the Type/Status chips: the current view + search applied,
  // but never the chips' own filters -- so picking a Type never makes its
  // sibling Status counts (or vice versa) disappear.
  const countableOrders = useMemo(
    () => filterOrders(orders ?? [], { view, type: null, status: null, search }),
    [orders, view, search],
  );
  const typeCounts = useMemo(() => countByType(countableOrders), [countableOrders]);
  const statusCounts = useMemo(() => countByStatus(countableOrders), [countableOrders]);
  const visibleOrders = useMemo(
    () =>
      filterOrders(orders ?? [], {
        view,
        type: typeFilter,
        status: statusFilter,
        search,
        sort: appliedSort,
      }),
    [orders, view, typeFilter, statusFilter, search, appliedSort],
  );
  const span = useMemo(() => {
    if (visibleOrders.length === 0) return null;
    let first = visibleOrders[0].createdAt;
    let last = visibleOrders[0].createdAt;
    for (const order of visibleOrders) {
      if (order.createdAt < first) first = order.createdAt;
      if (order.createdAt > last) last = order.createdAt;
    }
    return { first, last };
  }, [visibleOrders]);

  const viewChipOptions: ChipOption<OrdersView>[] = VIEWS.map((option) => ({
    value: option,
    label: t(`orders.view.${option}` as const),
    count: orders !== null ? counts[option] : undefined,
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('orders.title')}
        description={t('orders.subtitle')}
        actions={
          <>
            {isRefreshing && orders !== null ? (
              <span role="status" className="text-xs text-muted-foreground">
                {t('orders.updating')}
              </span>
            ) : null}
            <Button variant="secondary" disabled={isRefreshing} onClick={() => void loadOrders()}>
              {t('common.refresh')}
            </Button>
          </>
        }
      />

      <ChipGroup
        variant="segmented"
        size="lg"
        ariaLabel={t('orders.viewsLabel')}
        options={viewChipOptions}
        value={view}
        onChange={changeView}
      />

      <OrdersFilterBar
        type={typeFilter}
        status={statusFilter}
        statusOptions={statusesForView(view)}
        typeCounts={typeCounts}
        statusCounts={statusCounts}
        search={search}
        sort={appliedSort}
        sortOptions={sortsForView(view)}
        branchId={branchFilter}
        branches={branches}
        hasActiveFilters={hasActiveFilters}
        onTypeChange={setTypeFilter}
        onStatusChange={setStatusFilter}
        onSearchChange={setSearch}
        onSortChange={setSort}
        onBranchChange={setBranchFilter}
        onClear={clearFilters}
      />

      {ordersError ? (
        // Initial failure (nothing loaded) vs. a failed refresh: the
        // previously loaded Orders stay visible and are labelled as possibly
        // out of date rather than presented as live.
        <ReadErrorAlert
          title={orders === null ? t('orders.loadFailed') : t('orders.refreshFailed')}
          detail={ordersError}
          isRetrying={isRefreshing}
          onRetry={() => void loadOrders()}
        />
      ) : null}

      {orders === null && !ordersError ? <LoadingState label={t('orders.loading')} /> : null}

      {orders !== null && visibleOrders.length === 0 ? (
        <EmptyState
          view={view}
          typeFilter={typeFilter}
          hasActiveFilters={hasActiveFilters}
          hasAnyOrders={orders.length > 0}
          onClear={clearFilters}
        />
      ) : null}

      {span ? (
        <p className="text-sm text-muted-foreground">
          {t('orders.summary', {
            count: visibleOrders.length,
            first: formatDateTime(span.first),
            last: formatDateTime(span.last),
          })}
        </p>
      ) : null}

      {visibleOrders.length > 0 ? (
        <OrdersQueue
          orders={visibleOrders.map(withBranchLabel)}
          grouped={view === 'active' && appliedSort === 'priority'}
          permissions={permissions}
          onOpen={(order, trigger) => {
            detailTriggerRef.current = trigger;
            void openOrder(order.id);
          }}
        />
      ) : null}

      {selectedOrderId ? (
        detailError ? (
          <OrderDetailErrorDialog
            error={detailError}
            onRetry={() => void openOrder(selectedOrderId)}
            onClose={closeDetail}
          />
        ) : orderDetail ? (
          <OrderDetailDialog
            order={withBranchLabel(orderDetail)}
            restaurantLogoUrl={restaurantLogoUrl}
            availableTransitions={getAvailableTransitions(orderDetail.status, permissions, orderDetail.type)}
            isTransitioning={isTransitioning || detailSync !== 'current'}
            transitionError={transitionError}
            onTransition={(to) => void handleTransition(to)}
            onClose={closeDetail}
          />
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40">
            <LoadingState label={t('orders.loadingOne')} />
          </div>
        )
      ) : null}
    </div>
  );
}

function EmptyState({
  view,
  typeFilter,
  hasActiveFilters,
  hasAnyOrders,
  onClear,
}: {
  view: OrdersView;
  typeFilter: OrderType | null;
  hasActiveFilters: boolean;
  hasAnyOrders: boolean;
  onClear: () => void;
}) {
  const { t } = useStaffI18n();
  let title: string;
  let hint: string;

  if (hasActiveFilters) {
    title = typeFilter
      ? t('orders.empty.filteredType', { type: orderTypeLabel(t, typeFilter) })
      : t('orders.empty.filtered');
    hint = t('orders.empty.filteredHint');
  } else if (view === 'active') {
    title = t('orders.empty.active');
    hint = hasAnyOrders ? t('orders.empty.activeHintDone') : t('orders.empty.activeHint');
  } else if (view === 'completed') {
    title = t('orders.empty.completed');
    hint = t('orders.empty.completedHint');
  } else {
    title = t('orders.empty.all');
    hint = t('orders.empty.allHint');
  }

  return (
    <Card className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      {hasActiveFilters ? (
        <Button variant="secondary" className="mt-2" onClick={onClear}>
          {t('orders.filter.clear')}
        </Button>
      ) : null}
    </Card>
  );
}
