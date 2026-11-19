import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Phase 0.3: targeted error + Retry UX for Staff Orders and Tables reads.
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const alertSource = read('../../components/staff/ReadErrorAlert.tsx');
const orders = read('../../app/staff/restaurants/[restaurantId]/orders/OrdersWorkspace.tsx');
const errorDialog = read('../../app/staff/restaurants/[restaurantId]/orders/OrderDetailErrorDialog.tsx');
const orderCard = read('../../app/staff/restaurants/[restaurantId]/orders/OrderCard.tsx');
const tables = read('../../app/staff/restaurants/[restaurantId]/tables/TablesWorkspace.tsx');
const ordersCopy = read('../i18n/messages/orders.ts');
const sessionsCopy = read('../i18n/messages/sessions.ts');
const tablesCopy = read('../i18n/messages/tables.ts');

/** Body of `function name(` / `const name = useCallback(` up to the next top-level declaration. */
function block(source, startPattern) {
  const start = source.search(startPattern);
  assert.ok(start >= 0, `missing ${startPattern}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n {2}(?:async function |function |const [a-zA-Z]+ = use|useEffect\()/);
  return source.slice(start, next === -1 ? undefined : start + 1 + next);
}

test('ReadErrorAlert retries a read once at a time and keeps Retry focusable', () => {
  assert.match(alertSource, /<Alert variant="error">/);
  // In-flight guard, plus a synchronous lock for clicks landing before the re-render.
  assert.match(alertSource, /if \(isRetrying \|\| lockRef\.current\) return;/);
  // Every click takes the lock (controlled and uncontrolled call sites alike).
  assert.match(alertSource, /return;\s*lockRef\.current = true;\s*onRetry\(\);/);
  assert.match(alertSource, /if \(!isRetrying\) lockRef\.current = false;/);
  // aria-disabled, not `disabled`: disabling would drop keyboard focus mid-retry.
  assert.match(alertSource, /aria-disabled=\{isRetrying \|\| undefined\}/);
  assert.doesNotMatch(alertSource, /\sdisabled=\{/);
  // Default-size button: no shrunken touch target.
  assert.doesNotMatch(alertSource, /size="sm"|py-1 text-xs/);
  assert.match(alertSource, /t\('common\.retry'\)/);
});

test('Orders list: initial failure and failed refresh are distinguished, loaded orders are kept', () => {
  assert.match(
    orders,
    /title=\{orders === null \? t\('orders\.loadFailed'\) : t\('orders\.refreshFailed'\)\}/,
  );
  assert.match(orders, /isRetrying=\{isRefreshing\}/);
  const load = block(orders, /const loadOrders = useCallback/);
  const catchBranch = load.slice(load.indexOf('catch (error)'), load.indexOf('finally'));
  // A failed (background) refresh never erases previously loaded Orders.
  assert.doesNotMatch(catchBranch, /setOrders\(/);
  assert.match(catchBranch, /isUnauthenticatedError\(error\)[\s\S]*redirectToLogin\(\)/);
  // Polling frequency unchanged.
  assert.match(orders, /const POLL_INTERVAL_MS = 10_000;/);
});

test('Orders branch change clears the previous scope error so loading is visible', () => {
  assert.match(orders, /setOrders\(null\);\s*setOrdersError\(null\);\s*void loadOrders\(\);/);
});

test('Order detail read failure offers Retry (a read) inside an accessible dialog', () => {
  assert.match(orders, /<OrderDetailErrorDialog\s+error=\{detailError\}\s+onRetry=\{\(\) => void openOrder\(selectedOrderId\)\}\s+onClose=\{closeDetail\}/);
  assert.match(errorDialog, /role="dialog"\s+aria-modal="true"\s+aria-labelledby="order-detail-error-title"/);
  assert.match(errorDialog, /titleId="order-detail-error-title"\s+title=\{t\('orders\.detailLoadFailed'\)\}/);
  assert.doesNotMatch(errorDialog, /updateOrderStatus|onTransition/);
});

test('detail-error dialog: focus moves in, Tab/Shift+Tab are trapped, Escape closes', () => {
  // Mount focus on the first focusable (Retry), once, like OrderDetailDialog.
  assert.match(errorDialog, /focusables\(\)\[0\]\?\.focus\(\);/);
  assert.match(errorDialog, /\}, \[\]\);/);
  // Escape goes through a stable ref so parent polls never re-bind the listener.
  assert.match(errorDialog, /event\.key === 'Escape'[\s\S]*?onCloseRef\.current\(\);/);
  // Wrap at both ends, and pull focus back in if it is somehow outside.
  assert.match(errorDialog, /event\.shiftKey && \(outside \|\| active === first\)[\s\S]*?last\.focus\(\);/);
  assert.match(errorDialog, /!event\.shiftKey && \(outside \|\| active === last\)[\s\S]*?first\.focus\(\);/);
  assert.match(errorDialog, /document\.removeEventListener\('keydown', handleKeyDown\)/);
});

test('closing the detail returns focus to the Order card that opened it', () => {
  assert.match(orderCard, /onClick=\{\(event\) => onOpen\(event\.currentTarget\)\}/);
  assert.match(orders, /detailTriggerRef\.current = trigger;\s*void openOrder\(order\.id\);/);
  const close = block(orders, /function closeDetail/);
  assert.match(close, /if \(trigger\?\.isConnected\) trigger\.focus\(\);/);
  // Retry must not overwrite the trigger with the dialog's own button.
  const open = block(orders, /async function openOrder/);
  assert.doesNotMatch(open, /detailTriggerRef/);
});

test('ORDER_STATUS_CHANGED keeps its explanation and re-reads without repeating the transition', () => {
  const transition = block(orders, /async function handleTransition/);
  assert.match(transition, /error\.code === 'ORDER_STATUS_CHANGED'/);
  assert.match(transition, /void loadOrders\(\);\s*if \(!isSameDetail\(\)\) return;\s*setTransitionError\(t\('orders\.transitionStale'\)\);\s*void refreshOrderAfterConflict\(orderDetail\.id\);/);
  // openOrder() clears transitionError, which used to wipe the stale explanation.
  assert.doesNotMatch(transition, /openOrder\(/);
  // Exactly one write call, never retried.
  assert.equal(transition.match(/updateOrderStatus\(/g)?.length, 1);
  assert.match(transition, /expectedStatus: orderDetail\.status/);
  // No transition while the fresh state is still loading.
  assert.match(transition, /if \(!orderDetail \|\| isTransitioning \|\| detailSync !== 'current'\) return;/);

  const refresh = block(orders, /async function refreshOrderAfterConflict/);
  assert.match(refresh, /setDetailSync\('refreshing'\);/);
  assert.match(refresh, /getOrderDetail\(/);
  assert.match(refresh, /setOrderDetail\(detail\);\s*setDetailSync\('current'\);/);
  assert.doesNotMatch(refresh, /updateOrderStatus|setTransitionError\(null\)|setOrderDetail\(null\)/);
  assert.match(orders, /isTransitioning=\{isTransitioning \|\| detailSync !== 'current'\}/);
});

test('a failed conflict re-read keeps stale mutating actions disabled', () => {
  const refresh = block(orders, /async function refreshOrderAfterConflict/);
  assert.match(refresh, /setDetailSync\('unverified'\);\s*setTransitionError\(t\('orders\.transitionStaleUnverified'\)\)/);
  // No `finally` that would flip the detail back to 'current' after a failure.
  assert.doesNotMatch(refresh, /finally/);
  // Only a fresh open (a full read) or closing resets it.
  const open = block(orders, /async function openOrder/);
  assert.match(open, /setDetailSync\('current'\);/);
  assert.match(block(orders, /function closeDetail/), /setDetailSync\('current'\);/);
});

test('a late transition response cannot overwrite or re-open a different Order detail', () => {
  const transition = block(orders, /async function handleTransition/);
  assert.match(transition, /const detailRequestId = detailRequestRef\.current;/);
  assert.match(transition, /if \(isSameDetail\(\)\) setOrderDetail\(updated\);/);
  assert.match(transition, /if \(isSameDetail\(\)\) setTransitionError\(describeError\(error\)\);/);
  // The list row is still updated (it is keyed by id, never "the open Order").
  assert.match(transition, /order\.id === updated\.id \? \{ \.\.\.order, status: updated\.status \} : order/);
});

test('late Order detail responses cannot replace a closed or newer Order', () => {
  const open = block(orders, /async function openOrder/);
  assert.match(open, /const requestId = \+\+detailRequestRef\.current;/);
  assert.equal(open.match(/if \(detailRequestRef\.current !== requestId\) return;/g)?.length, 2);
  const close = block(orders, /function closeDetail/);
  assert.match(close, /detailRequestRef\.current \+= 1;/);
});

test('Tables board: silent refresh failure keeps the last board and labels it out of date', () => {
  const load = block(tables, /const loadBoard = useCallback/);
  // Only a non-silent (new Branch) load clears the board and its error.
  assert.match(load, /if \(!options\.silent\) \{[\s\S]*?setBoard\(null\);\s*setBoardError\(null\);[\s\S]*?\}/);
  const catchBranch = load.slice(load.indexOf('catch (error)'), load.indexOf('finally'));
  assert.doesNotMatch(catchBranch, /setBoard\(/);
  // The error clears only after a successful read.
  assert.match(load, /setBoard\(rows\);\s*setBoardError\(null\);/);
  assert.match(
    tables,
    /title=\{board === null \? t\('sessions\.boardError'\) : t\('sessions\.boardStale'\)\}/,
  );
  assert.match(tables, /isRetrying=\{isBoardLoading\}/);
  assert.match(tables, /onRetry=\{\(\) => void loadBoard\(selectedBranchId, \{ silent: true \}\)\}/);
  // 30 s poll unchanged.
  assert.match(tables, /\}, 30_000\);/);
});

test('Tables list failure keeps its Retry, now with a localized title', () => {
  assert.match(tables, /title=\{t\('tables\.loadFailed'\)\}/);
  assert.match(tables, /onRetry=\{\(\) => void loadTables\(selectedBranchId\)\}/);
});

test('Retry never targets a table-session or order write', () => {
  for (const source of [orders, tables]) {
    for (const match of source.matchAll(/onRetry=\{([^}]*\})/g)) {
      assert.doesNotMatch(
        match[1],
        /openSession|closeSession|updateOrderStatus|createTable|updateTable|handleTransition|handleOpenSession|handleSubmit/,
      );
    }
  }
});

test('new error copy exists in English and Arabic', () => {
  const cases = [
    [ordersCopy, ['orders.loadFailed', 'orders.refreshFailed', 'orders.detailLoadFailed', 'orders.transitionStaleUnverified']],
    [sessionsCopy, ['sessions.boardError', 'sessions.boardStale']],
    [tablesCopy, ['tables.loadFailed']],
  ];
  for (const [copy, keys] of cases) {
    for (const key of keys) {
      const matches = copy.match(new RegExp(`'${key.replace(/\./g, '\\.')}':`, 'g')) ?? [];
      assert.equal(matches.length, 2, `${key} must exist in en and ar`);
    }
  }
  assert.match(ordersCopy, /'orders\.refreshFailed': 'تعذّر تحديث الطلبات/);
  assert.match(sessionsCopy, /'sessions\.boardStale': 'تعذّر تحديث جلسات الطاولات/);
});
