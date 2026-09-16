'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as ordersApi from '../../../../../lib/orders/api';
import type { OrderDetail, OrderListItem, OrderStatus } from '../../../../../lib/orders/types';
import { getAvailableTransitions } from '../../../../../lib/orders/transitions';
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
import { FormField } from '../../../../../components/ui/FormField';
import { Select } from '../../../../../components/ui/Select';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { OrderDetailDialog } from './OrderDetailDialog';
import { StatusBadge } from './StatusBadge';

const POLL_INTERVAL_MS = 10_000;
const ALL_BRANCHES = '__all__';

export interface OrdersWorkspaceProps {
  restaurantId: string;
  /** Already scoped to this Membership's authorized Branches by `/auth/me`. */
  branches: AuthContextBranch[];
  permissions: string[];
}

/**
 * FT-5: the Staff Orders workspace. Section 27: no WebSocket/SSE
 * infrastructure -- a manual Refresh button plus a lightweight ~10s poll
 * while the tab is visible (paused via `document.visibilityState` so a
 * backgrounded tab does not keep hammering the Backend). `requestRef`
 * guards against a stale response landing after a newer refresh/filter
 * change already started (mirrors `TablesWorkspace`'s identical pattern).
 */
export function OrdersWorkspace({ restaurantId, branches, permissions }: OrdersWorkspaceProps) {
  const [branchFilter, setBranchFilter] = useState<string>(ALL_BRANCHES);
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const requestRef = useRef(0);

  const loadOrders = useCallback(async () => {
    const requestId = ++requestRef.current;
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
        setTransitionError('This order was already updated. Showing the latest state.');
        void openOrder(orderDetail.id);
        void loadOrders();
        return;
      }
      setTransitionError(describeError(error));
    } finally {
      setIsTransitioning(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1D1A18]">Orders</h1>
          <p className="mt-1 text-sm text-[#655D56]">Manage incoming table orders.</p>
        </div>
        <Button variant="secondary" onClick={() => void loadOrders()}>
          Refresh
        </Button>
      </div>

      {branches.length > 1 ? (
        <div className="max-w-xs">
          <FormField label="Branch" htmlFor="orders-branch-filter">
            <Select
              id="orders-branch-filter"
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
            >
              <option value={ALL_BRANCHES}>All Branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      ) : null}

      {ordersError ? (
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{ordersError}</span>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void loadOrders()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {orders === null && !ordersError ? <LoadingState label="Loading Orders…" /> : null}

      {orders !== null && orders.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm font-medium text-[#302C29]">No orders yet</p>
          <p className="text-sm text-[#655D56]">
            Orders placed by guests scanning a Table QR will appear here.
          </p>
        </Card>
      ) : null}

      {orders !== null && orders.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
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
                Close
              </Button>
            </div>
          </div>
        ) : orderDetail ? (
          <OrderDetailDialog
            order={orderDetail}
            availableTransitions={getAvailableTransitions(orderDetail.status, permissions)}
            isTransitioning={isTransitioning}
            transitionError={transitionError}
            onTransition={(to) => void handleTransition(to)}
            onClose={closeDetail}
          />
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <LoadingState label="Loading order…" />
          </div>
        )
      ) : null}
    </div>
  );
}

function OrderCard({ order, onOpen }: { order: OrderListItem; onOpen: () => void }) {
  const createdAt = new Date(order.createdAt);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[#1D1A18]">
            Table {order.table.tableNumber}
          </p>
          <p className="text-xs text-[#655D56]">
            {order.branch.name} · {createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-[#655D56]">
          {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
        </span>
        <span className="font-semibold text-[#302C29]">
          {order.totalAmount} {order.currencyCode}
        </span>
      </div>

      <Button variant="secondary" className="justify-center" onClick={onOpen}>
        View details
      </Button>
    </Card>
  );
}
