'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import * as ordersApi from '../../../../../lib/orders/api';
import type {
  OrderDetail,
  OrderListItem,
  OrderStatus,
  OrderType,
} from '../../../../../lib/orders/types';
import { getAvailableTransitions } from '../../../../../lib/orders/transitions';
import {
  countByView,
  filterOrders,
  statusesForView,
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
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { OrderCard } from './OrderCard';
import { OrderDetailDialog } from './OrderDetailDialog';
import { ALL_BRANCHES, OrdersFilterBar } from './OrdersFilterBar';
import { orderTypeLabel } from './OrderTypeBadge';

const POLL_INTERVAL_MS = 10_000;
const VIEWS: readonly OrdersView[] = ['active', 'completed', 'all'];

export interface OrdersWorkspaceProps {
  restaurantId: string;
  /** Already scoped to this Membership's authorized Branches by `/auth/me`. */
  branches: AuthContextBranch[];
  permissions: string[];
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
export function OrdersWorkspace({ restaurantId, branches, permissions }: OrdersWorkspaceProps) {
  const { t } = useStaffI18n();
  const [branchFilter, setBranchFilter] = useState<string>(ALL_BRANCHES);
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [view, setView] = useState<OrdersView>('active');
  const [typeFilter, setTypeFilter] = useState<OrderType | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null);
  const [search, setSearch] = useState('');

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
  const visibleOrders = useMemo(
    () =>
      filterOrders(orders ?? [], { view, type: typeFilter, status: statusFilter, search }),
    [orders, view, typeFilter, statusFilter, search],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1D1A18]">{t('orders.title')}</h1>
          <p className="mt-1 text-sm text-[#655D56]">{t('orders.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {isRefreshing && orders !== null ? (
            <span role="status" className="text-xs text-muted-foreground">
              {t('orders.updating')}
            </span>
          ) : null}
          <Button variant="secondary" disabled={isRefreshing} onClick={() => void loadOrders()}>
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t('orders.viewsLabel')}
        className="flex flex-wrap gap-1 border-b border-[#E5DED6]"
      >
        {VIEWS.map((option) => {
          const selected = option === view;
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => changeView(option)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? 'border-[#7A5138] text-[#7A5138]'
                  : 'border-transparent text-[#655D56] hover:text-[#302C29]'
              }`}
            >
              {t(`orders.view.${option}` as const)}
              {orders !== null ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    selected ? 'bg-[#7A5138] text-white' : 'bg-[#F1ECE6] text-[#655D56]'
                  }`}
                >
                  {counts[option]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <OrdersFilterBar
        type={typeFilter}
        status={statusFilter}
        statusOptions={statusesForView(view)}
        search={search}
        branchId={branchFilter}
        branches={branches}
        hasActiveFilters={hasActiveFilters}
        onTypeChange={setTypeFilter}
        onStatusChange={setStatusFilter}
        onSearchChange={setSearch}
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

      {visibleOrders.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleOrders.map((order) => (
            <OrderCard key={order.id} order={order} onOpen={() => void openOrder(order.id)} />
          ))}
        </div>
      ) : null}

      {selectedOrderId ? (
        detailError ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
              <Alert variant="error">{detailError}</Alert>
              <Button variant="secondary" className="mt-4" onClick={closeDetail}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        ) : orderDetail ? (
          <OrderDetailDialog
            order={orderDetail}
            availableTransitions={getAvailableTransitions(orderDetail.status, permissions, orderDetail.type)}
            isTransitioning={isTransitioning}
            transitionError={transitionError}
            onTransition={(to) => void handleTransition(to)}
            onClose={closeDetail}
          />
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
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
      <p className="text-sm font-semibold text-[#302C29]">{title}</p>
      <p className="max-w-sm text-sm text-[#655D56]">{hint}</p>
      {hasActiveFilters ? (
        <Button variant="secondary" className="mt-2" onClick={onClear}>
          {t('orders.filter.clear')}
        </Button>
      ) : null}
    </Card>
  );
}
