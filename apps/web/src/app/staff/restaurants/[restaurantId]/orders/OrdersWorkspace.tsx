'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { canShowSplit } from '../../../../../lib/orders/split-layout';
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
import { OpenGuestMenuButton } from '../../../../../components/menu/OpenGuestMenuButton';
import { ChipGroup, type ChipOption } from '../../../../../components/ui/ChipGroup';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import type { OrderDetailSync } from './OrderDetailContent';
import { OrderDetailDialog, type OrderDetailDialogProps } from './OrderDetailDialog';
import { OrderDetailPane } from './OrderDetailPane';
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
  const [detailSync, setDetailSync] = useState<OrderDetailSync>('current');
  // Focus returns here (the Order card that opened the detail) when it closes.
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  // Set by `closeDetail`, consumed once the detail has unmounted (see the
  // focus-return effect below).
  const focusReturnRef = useRef<{ trigger: HTMLElement | null; orderId: string } | null>(null);
  // Fallback focus target (the page title) when the opening card is gone.
  const pageTitleRef = useRef<HTMLSpanElement>(null);

  const requestRef = useRef(0);
  // Drops a detail response that lands after the Staff member closed or
  // switched to another Order (same pattern as `requestRef` for the list).
  const detailRequestRef = useRef(0);
  // The Order whose detail READ is in flight from `openOrder`: a second
  // open/Retry for it (double click, StrictMode, a re-sent deep link) joins
  // that read instead of starting a duplicate.
  const pendingDetailReadRef = useRef<string | null>(null);

  // Phase 1 PR 2: split (queue + non-modal detail pane) only when THIS
  // workspace's measured width -- what is left beside the sidebar and page
  // gutters -- fits both panels; otherwise the focused dialog as before.
  // Measured before paint so a deep-linked Order never flashes as a dialog.
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [isSplit, setIsSplit] = useState(false);
  useLayoutEffect(() => {
    const element = workspaceRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = (width: number) => setIsSplit(canShowSplit(width));
    measure(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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

  // Dashboard deep link (`?order=`): open the detail at once -- the same
  // focused loading / error / detail flow (and the same Close) as a card.
  useEffect(() => {
    if (!initialOrderId) return;
    queueMicrotask(() => void openOrder(initialOrderId));
    // openOrder is re-created every render; only the deep link decides when this runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrderId, restaurantId]);

  async function openOrder(orderId: string) {
    if (pendingDetailReadRef.current === orderId) return;
    pendingDetailReadRef.current = orderId;
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
    } finally {
      // Only this read's own completion releases the guard (a newer open owns it otherwise).
      if (detailRequestRef.current === requestId) pendingDetailReadRef.current = null;
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

  /**
   * Phase 1 PR 2: a list poll showed the selected Order in a different status
   * than its detail. The list row is not a detail, so it never replaces the
   * one on screen: re-READ the Order instead, keeping the current detail
   * visible with its actions disabled until the authoritative state lands.
   * Also the pane's read-only Retry while the latest state is unverified.
   * Never repeats a status change.
   */
  async function reconcileSelectedOrder(orderId: string) {
    const requestId = ++detailRequestRef.current;
    const conflictUnverified = t('orders.transitionStaleUnverified');
    const reconcileUnverified = t('orders.detailReconcileUnverified');
    setDetailSync('refreshing');
    try {
      const detail = await ordersApi.getOrderDetail(restaurantId, orderId);
      if (detailRequestRef.current !== requestId) return;
      setOrderDetail(detail);
      setDetailSync('current');
      // The "could not load the latest state" warnings are now untrue.
      setTransitionError((current) =>
        current === conflictUnverified
          ? t('orders.transitionStale')
          : current === reconcileUnverified
            ? null
            : current,
      );
    } catch (error) {
      if (detailRequestRef.current !== requestId) return;
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setDetailSync('unverified');
      setTransitionError((current) =>
        current === conflictUnverified ? current : reconcileUnverified,
      );
    }
  }

  // Compare each NEW list (poll, refresh, post-write reload) once against the
  // open detail. Skipped while a write or a re-read is in flight: those land
  // their own authoritative state, and the comparison runs once they settle.
  const reconciledOrdersRef = useRef<OrderListItem[] | null>(null);
  useEffect(() => {
    if (!orders || !orderDetail || orderDetail.id !== selectedOrderId) return;
    if (isTransitioning || detailSync === 'refreshing') return;
    if (reconciledOrdersRef.current === orders) return;
    reconciledOrdersRef.current = orders;
    const listed = orders.find((order) => order.id === orderDetail.id);
    if (!listed || listed.status === orderDetail.status) return;
    const orderId = orderDetail.id;
    queueMicrotask(() => void reconcileSelectedOrder(orderId));
    // reconcileSelectedOrder is re-created every render; the data deps decide when this runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, orderDetail, selectedOrderId, isTransitioning, detailSync]);

  /**
   * Closing invalidates any outstanding detail READ (its response is dropped
   * by `detailRequestRef`), so a slow read can never reopen the detail.
   */
  function closeDetail() {
    detailRequestRef.current += 1;
    pendingDetailReadRef.current = null;
    if (selectedOrderId !== null) {
      focusReturnRef.current = { trigger: detailTriggerRef.current, orderId: selectedOrderId };
    }
    detailTriggerRef.current = null;
    setDetailSync('current');
    setSelectedOrderId(null);
    setOrderDetail(null);
    setDetailError(null);
    setTransitionError(null);
  }

  // Focus return runs after the detail has unmounted (and the dialog released
  // its focus guard): the card that opened it; else the same Order's card if a
  // poll or a status change re-mounted it; else -- the card was filtered out,
  // or a Dashboard deep link opened the detail with no card -- the page title.
  useEffect(() => {
    if (selectedOrderId !== null) return;
    const pending = focusReturnRef.current;
    if (!pending) return;
    focusReturnRef.current = null;
    if (pending.trigger?.isConnected) {
      pending.trigger.focus();
      return;
    }
    const card = workspaceRef.current?.querySelector<HTMLElement>(
      `[data-order-id="${CSS.escape(pending.orderId)}"]`,
    );
    (card ?? pageTitleRef.current)?.focus();
  }, [selectedOrderId]);

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

  // The list side: identical in both layouts, only the card arrangement differs.
  const queueContent = (
    <>
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
          layout={isSplit ? 'column' : 'grid'}
          selectedOrderId={isSplit ? selectedOrderId : null}
          onOpen={(order, trigger) => {
            detailTriggerRef.current = trigger;
            void openOrder(order.id);
          }}
        />
      ) : null}
    </>
  );

  // ONE set of detail props for both surfaces (split pane / focused dialog):
  // same selection, authoritative detail, sync state, permissions-derived
  // transitions and the single `handleTransition` mutation path -- so
  // switching layout while an Order is open changes only the presentation.
  const detailProps: OrderDetailDialogProps = {
    order: orderDetail ? withBranchLabel(orderDetail) : null,
    detailError,
    onRetryRead: () => {
      if (selectedOrderId) void openOrder(selectedOrderId);
    },
    restaurantLogoUrl,
    availableTransitions: orderDetail
      ? getAvailableTransitions(orderDetail.status, permissions, orderDetail.type)
      : [],
    isTransitioning: isTransitioning || detailSync !== 'current',
    transitionError,
    sync: detailSync,
    onReloadDetail: () => {
      if (orderDetail) void reconcileSelectedOrder(orderDetail.id);
    },
    onTransition: (to) => void handleTransition(to),
    onClose: closeDetail,
  };

  const viewTabs = (
    <ChipGroup
      variant="segmented"
      size={isSplit ? 'md' : 'lg'}
      ariaLabel={t('orders.viewsLabel')}
      options={viewChipOptions}
      value={view}
      onChange={changeView}
    />
  );

  return (
    // Desktop Split Mode is compact: the view tabs join the header row, gaps
    // tighten and the filter panel slims down, so the queue and the detail
    // pane (with its action bar) start well above the fold. Outside split
    // mode the layout is unchanged. (No bottom clearance for a floating
    // button: the shell does not render one on Orders -- see GuestMenuFab.)
    <div
      ref={workspaceRef}
      className={`flex min-w-0 flex-col ${isSplit ? 'gap-3' : 'gap-5'}`}
    >
      <PageHeader
        title={
          <span ref={pageTitleRef} tabIndex={-1} className="outline-none">
            {t('orders.title')}
          </span>
        }
        description={t('orders.subtitle')}
        actions={
          <>
            {/* The poll status comes first so it never shifts the tabs or Refresh when it appears. */}
            {isRefreshing && orders !== null ? (
              <span role="status" className="text-xs text-muted-foreground">
                {t('orders.updating')}
              </span>
            ) : null}
            {isSplit ? viewTabs : null}
            <Button variant="secondary" disabled={isRefreshing} onClick={() => void loadOrders()}>
              {t('common.refresh')}
            </Button>
            {/*
              The guest-menu entry lives in the header on Orders (the shell's
              floating button is not rendered here -- it covered Order totals
              and actions). After Refresh, so its end-aligned dropdown stays
              on screen at 320px; icon-only on phones so the header does not
              grow a row and push the queue down.
            */}
            <OpenGuestMenuButton variant="secondary" hideWhenUnavailable compactOnPhone />
          </>
        }
      />

      {isSplit ? null : viewTabs}

      <OrdersFilterBar
        compact={isSplit}
        type={typeFilter}
        status={statusFilter}
        statusOptions={statusesForView(view)}
        typeCounts={typeCounts}
        statusCounts={statusCounts}
        search={search}
        sort={appliedSort}
        defaultSort={effectiveSort(view, null)}
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
        onSortReset={() => setSort(null)}
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

      {isSplit ? (
        <div className="grid grid-cols-[minmax(340px,2fr)_minmax(480px,3fr)] items-start gap-6">
          <div className="flex min-w-0 flex-col gap-4">{queueContent}</div>
          <OrderDetailPane selectedOrderId={selectedOrderId} {...detailProps} />
        </div>
      ) : (
        queueContent
      )}

      {!isSplit && selectedOrderId ? <OrderDetailDialog {...detailProps} /> : null}
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
