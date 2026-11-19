import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPLIT_DETAIL_MIN_WIDTH,
  SPLIT_GUTTER_WIDTH,
  SPLIT_MIN_WIDTH,
  SPLIT_QUEUE_MIN_WIDTH,
  canShowSplit,
} from '../orders/split-layout.ts';
import { getAvailableTransitions } from '../orders/transitions.ts';

// Phase 1 PR 2: desktop split Orders workspace.
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const dir = '../../app/staff/restaurants/[restaurantId]/orders/';
const workspace = read(`${dir}OrdersWorkspace.tsx`);
const queue = read(`${dir}OrdersQueue.tsx`);
const card = read(`${dir}OrderCard.tsx`);
const pane = read(`${dir}OrderDetailPane.tsx`);
const content = read(`${dir}OrderDetailContent.tsx`);
const filterBar = read(`${dir}OrdersFilterBar.tsx`);
const ordersMessages = read('../i18n/messages/orders.ts');
const dialog = read(`${dir}OrderDetailDialog.tsx`);
const copySource = read('../i18n/messages/orders.ts');

function block(source, startPattern) {
  const start = source.search(startPattern);
  assert.ok(start >= 0, `missing ${startPattern}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n {2}(?:async function |function |const [a-zA-Z]+ = use|useEffect\(|\/\/ )/);
  return source.slice(start, next === -1 ? undefined : start + 1 + next);
}

function dictionary(locale) {
  const start = copySource.indexOf(`\n  ${locale}: {`);
  const end = locale === 'en' ? copySource.indexOf('\n  ar: {') : copySource.length;
  const entries = {};
  for (const match of copySource.slice(start, end).matchAll(/'([\w.]+)':\s*'((?:[^'\\]|\\.)*)'/g)) {
    entries[match[1]] = match[2];
  }
  return entries;
}

test('split threshold: queue + gutter + detail, from the workspace width', () => {
  assert.equal(SPLIT_QUEUE_MIN_WIDTH, 340);
  assert.equal(SPLIT_DETAIL_MIN_WIDTH, 480);
  assert.equal(SPLIT_MIN_WIDTH, SPLIT_QUEUE_MIN_WIDTH + SPLIT_GUTTER_WIDTH + SPLIT_DETAIL_MIN_WIDTH);
  // 1024px window - 256px sidebar - 2 x 40px gutters: too narrow for both panels.
  assert.equal(canShowSplit(1024 - 256 - 80), false);
  // 1280px and 1440px windows with the sidebar fit.
  assert.equal(canShowSplit(1280 - 256 - 80), true);
  assert.equal(canShowSplit(1440 - 256 - 80), true);
  assert.equal(canShowSplit(SPLIT_MIN_WIDTH), true);
  assert.equal(canShowSplit(SPLIT_MIN_WIDTH - 1), false);
  assert.equal(canShowSplit(Number.NaN), false);
});

test('split mode is measured on the workspace element, not a viewport breakpoint', () => {
  assert.match(workspace, /<div\s+ref=\{workspaceRef\}/);
  assert.match(workspace, /new ResizeObserver\(\(\[entry\]\) => measure\(entry\.contentRect\.width\)\)/);
  assert.match(workspace, /setIsSplit\(canShowSplit\(width\)\)/);
  assert.doesNotMatch(workspace, /matchMedia|innerWidth/);
  // Grid columns honour the same minimums.
  assert.match(workspace, /grid-cols-\[minmax\(340px,2fr\)_minmax\(480px,3fr\)\]/);
});

test('wide: non-modal pane; narrow: the existing focused dialogs only', () => {
  assert.match(workspace, /\{isSplit \? \([\s\S]*?<OrderDetailPane[\s\S]*?\) : \(\s*queueContent\s*\)\}/);
  assert.match(workspace, /layout=\{isSplit \? 'column' : 'grid'\}/);
  assert.match(workspace, /\{!isSplit && selectedOrderId \? \(/);
  // The pane is not a dialog: no modal role, no backdrop, no fixed overlay, no trap.
  assert.doesNotMatch(pane, /role="dialog"|aria-modal|fixed inset-0|bg-foreground\/40/);
  assert.match(pane, /<OrderDetailContent/);
  assert.match(dialog, /<OrderDetailContent/);
  assert.match(dialog, /role="dialog"\s+aria-modal="true"/);
  // Both modes share the same disabled-while-unverified wiring.
  assert.equal(workspace.match(/isTransitioning=\{isTransitioning \|\| detailSync !== 'current'\}/g)?.length, 2);
  assert.equal(workspace.match(/sync=\{detailSync\}/g)?.length, 2);
});

test('pane states: empty, loading, read failure with read-only Retry, detail', () => {
  assert.match(pane, /selectedOrderId === null \?[\s\S]*?t\('orders\.split\.emptyTitle'\)/);
  assert.match(pane, /<LoadingState label=\{t\('orders\.loadingOne'\)\} \/>/);
  assert.match(pane, /aria-busy=/);
  assert.match(pane, /<ReadErrorAlert[\s\S]*?title=\{t\('orders\.detailLoadFailed'\)\}[\s\S]*?onRetry=\{onRetryRead\}/);
  assert.match(workspace, /onRetryRead=\{\(\) => \{\s*if \(selectedOrderId\) void openOrder\(selectedOrderId\);/);
  assert.doesNotMatch(pane, /updateOrderStatus|ordersApi/);
});

test('pane focus moves only on a new selection; Escape and Close clear it', () => {
  assert.match(pane, /useEffect\(\(\) => \{\s*if \(selectedOrderId !== null\) paneRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*\}, \[selectedOrderId\]\);/);
  assert.match(pane, /event\.key === 'Escape' && selectedOrderId !== null[\s\S]*?onClose\(\);/);
  assert.match(pane, /tabIndex=\{-1\}/);
  assert.match(workspace, /onClose=\{closeDetail\}/);
});

test('no automatic selection: only a click, a deep link or Retry selects an Order', () => {
  assert.match(workspace, /useState<string \| null>\(null\);/);
  const setters = [...workspace.matchAll(/setSelectedOrderId\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(setters.sort(), ['initialOrderId', 'initialOrderId', 'null', 'orderId'].sort());
  // Filters never touch the selection.
  for (const name of [/function changeView/, /function clearFilters/]) {
    assert.doesNotMatch(block(workspace, name), /setSelectedOrderId|setOrderDetail/);
  }
});

test('poll reconciliation re-READS the selected Order and never copies list data into it', () => {
  const reconcile = block(workspace, /async function reconcileSelectedOrder/);
  assert.match(reconcile, /const requestId = \+\+detailRequestRef\.current;/);
  assert.match(reconcile, /setDetailSync\('refreshing'\);/);
  assert.match(reconcile, /getOrderDetail\(restaurantId, orderId\)/);
  assert.equal(reconcile.match(/if \(detailRequestRef\.current !== requestId\) return;/g)?.length, 2);
  assert.match(reconcile, /setOrderDetail\(detail\);\s*setDetailSync\('current'\);/);
  assert.match(reconcile, /setDetailSync\('unverified'\);/);
  assert.doesNotMatch(reconcile, /updateOrderStatus|setOrderDetail\(null\)|finally/);

  const effectStart = workspace.indexOf('const reconciledOrdersRef');
  const effect = workspace.slice(effectStart, workspace.indexOf('function closeDetail'));
  // Runs once per NEW list, never during a write or an in-flight re-read.
  assert.match(effect, /if \(isTransitioning \|\| detailSync === 'refreshing'\) return;/);
  assert.match(effect, /if \(reconciledOrdersRef\.current === orders\) return;/);
  assert.match(effect, /listed\.status === orderDetail\.status\) return;/);
  assert.doesNotMatch(effect, /setOrderDetail|updateOrderStatus/);
  // Polling cadence unchanged, no new write path.
  assert.match(workspace, /const POLL_INTERVAL_MS = 10_000;/);
  assert.equal(workspace.match(/updateOrderStatus\(/g)?.length, 1);
});

test('selected card is visible and announced; the card still has exactly one button', () => {
  assert.match(queue, /selected=\{order\.id === selectedOrderId\}/);
  assert.match(workspace, /selectedOrderId=\{isSplit \? selectedOrderId : null\}/);
  assert.match(card, /aria-current=\{selected \? 'true' : undefined\}/);
  assert.match(card, /outline-2 outline-offset-2 outline-primary/);
  assert.equal(card.match(/<button/g)?.length, 1);
  assert.doesNotMatch(card, /updateOrderStatus|onTransition/);
});

test('detail actions: forward and destructive apart, receipt in both modes, read-only explained', () => {
  assert.match(content, /<OrderReceipt order=\{order\} logoUrl=\{restaurantLogoUrl\} \/>/);
  assert.doesNotMatch(dialog, /<OrderReceipt/);
  assert.match(content, /variant="primary"[\s\S]*?disabled=\{isTransitioning\}/);
  assert.match(content, /border-destructive\/30 text-destructive[\s\S]*?disabled=\{isTransitioning\}/);
  assert.match(content, /window\.print\(\)/);
  assert.match(content, /availableTransitions\.length === 0 && !isCompletedStatus\(order\.status\)/);
  assert.match(content, /nextStepFor\(order\.status, order\.type, \[\]\)/);
  assert.match(content, /sync === 'unverified' && onReloadDetail/);
});

test('READY is never SERVED for delivery; type-aware forward actions', () => {
  const all = ['orders.accept', 'orders.reject', 'orders.cancel', 'kitchen.update', 'orders.markServed'];
  assert.deepEqual(getAvailableTransitions('READY', all, 'DELIVERY').map((o) => o.to), ['OUT_FOR_DELIVERY']);
  assert.deepEqual(getAvailableTransitions('OUT_FOR_DELIVERY', all, 'DELIVERY').map((o) => o.to), ['SERVED']);
  assert.deepEqual(getAvailableTransitions('READY', all, 'DINE_IN').map((o) => o.to), ['SERVED']);
  assert.deepEqual(getAvailableTransitions('PENDING', [], 'DINE_IN'), []);
  assert.deepEqual(getAvailableTransitions('SERVED', all, 'PICKUP'), []);
});

test('split copy exists in English and Arabic, and differs', () => {
  const en = dictionary('en');
  const ar = dictionary('ar');
  for (const key of [
    'orders.card.viewing',
    'orders.split.detailLabel',
    'orders.split.emptyTitle',
    'orders.split.emptyHint',
    'orders.split.closeDetail',
    'orders.detail.syncing',
    'orders.detail.noActionForYou',
    'orders.detailReconcileUnverified',
  ]) {
    assert.ok(en[key]?.trim(), `missing en ${key}`);
    assert.ok(ar[key]?.trim(), `missing ar ${key}`);
    assert.notEqual(en[key], ar[key], `untranslated ${key}`);
    assert.match(ar[key], /[؀-ۿ]/, `ar ${key} is not Arabic`);
  }
});

test('split mode is compact; the non-split (tablet/mobile) layout keeps its filters as they were', () => {
  // View tabs join the header row only in split mode, smaller; elsewhere they keep their own lg row.
  assert.match(workspace, /size=\{isSplit \? 'md' : 'lg'\}/);
  assert.match(workspace, /\{isSplit \? viewTabs : null\}/);
  assert.match(workspace, /\{isSplit \? null : viewTabs\}/);
  assert.match(workspace, /compact=\{isSplit\}/);
  assert.match(workspace, /isSplit \? 'gap-3' : 'gap-5 lg:pb-16'/);
  // Compact keeps every control and its accessible label: search label is screen-reader only, never removed.
  assert.match(filterBar, /compact = false/);
  assert.match(filterBar, /<span className=\{compact \? 'sr-only' : undefined\}>\{t\('orders\.filter\.search'\)\}<\/span>/);
  assert.match(filterBar, /<span>\{t\('orders\.filter\.sort'\)\}<\/span>/);
  assert.match(filterBar, /<span>\{t\('orders\.filter\.branch'\)\}<\/span>/);
});

test('the Orders subtitle does not claim a sort order (Priority / Newest / Oldest all exist)', () => {
  const subtitles = [...ordersMessages.matchAll(/'orders\.subtitle': '([^']*)'/g)].map((m) => m[1]);
  assert.equal(subtitles.length, 2);
  for (const subtitle of subtitles) {
    assert.doesNotMatch(subtitle, /newest|oldest|priority|الأحدث|الأقدم|الأولوية/i);
  }
});
