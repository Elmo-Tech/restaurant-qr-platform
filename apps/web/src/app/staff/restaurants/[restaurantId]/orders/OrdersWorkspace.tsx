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
  filterOrders,
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
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { Card } from '../../../../../components/ui/Card';
import { ChipGroup, type ChipOption } from '../../../../../components/ui/ChipGroup';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { OrderCard } from './OrderCard';
import { OrderDetailDialog } from './OrderDetailDialog';
import { ALL_BRANCHES, OrdersFilterBar } from './OrdersFilterBar';
import { orderTypeLabel } from './OrderTypeBadge';

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
  const [sort, setSort] = useState<OrdersSort>(initialFilters.sort ?? 'newest');

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const requestRef = useRef(0);

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
      setOrders(null);
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
    ordersApi
      .getOrderDetail(restaurantId, initialOrderId)
      .then((detail) => {
        if (cancelled) return;
        setSelectedOrderId(initialOrderId);
        setOrderDetail(detail);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
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
    setSelectedOrderId(orderId);
    setOrderDetail(null);
    setDetailError(null);
    setTransitionError(null);
    try {
      const detail = await ordersApi.getOrderDetail(restaurantId, orderId);
      setOrderDetail(detail);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setDetailError(describeError(error));
    }
  }

  function closeDetail() {
    setSelectedOrderId(null);
    setOrderDetail(null);
    setDetailError(null);
    setTransitionError(null);
  }

  async function handleTransition(to: OrderStatus) {
    if (!orderDetail || isTransitioning) return;
    setIsTransitioning(true);
    setTransitionError(null);
    try {
      const updated = await ordersApi.updateOrderStatus(restaurantId, orderDetail.id, {
        expectedStatus: orderDetail.status,
        status: to,
      });
      setOrderDetail(updated);
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
        setTransitionError(t('orders.transitionStale'));
        void openOrder(orderDetail.id);
        void loadOrders();
        return;
      }
      setTransitionError(describeError(error));
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
        sort,
      }),
    [orders, view, typeFilter, statusFilter, search, sort],
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
        sort={sort}
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
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{ordersError}</span>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void loadOrders()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={withBranchLabel(order)}
              onOpen={() => void openOrder(order.id)}
            />
          ))}
        </div>
      ) : null}

      {selectedOrderId ? (
        detailError ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6">
            <div className="w-full max-w-sm rounded-lg bg-card p-5 shadow-xl">
              <Alert variant="error">{detailError}</Alert>
              <Button variant="secondary" className="mt-4" onClick={closeDetail}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        ) : orderDetail ? (
          <OrderDetailDialog
            order={withBranchLabel(orderDetail)}
            restaurantLogoUrl={restaurantLogoUrl}
            availableTransitions={getAvailableTransitions(orderDetail.status, permissions, orderDetail.type)}
            isTransitioning={isTransitioning}
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
