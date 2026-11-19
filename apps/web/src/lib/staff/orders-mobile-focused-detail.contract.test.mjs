import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Phase 1 PR 3: mobile / narrow focused Order detail.
const url = (file) => new URL(file, import.meta.url);
const read = (file) => readFileSync(url(file), 'utf8');
const dir = '../../app/staff/restaurants/[restaurantId]/orders/';
const workspace = read(`${dir}OrdersWorkspace.tsx`);
const dialog = read(`${dir}OrderDetailDialog.tsx`);
const states = read(`${dir}OrderDetailStates.tsx`);
const pane = read(`${dir}OrderDetailPane.tsx`);
const content = read(`${dir}OrderDetailContent.tsx`);
const card = read(`${dir}OrderCard.tsx`);
const copySource = read('../i18n/messages/orders.ts');

function block(source, startPattern) {
  const start = source.search(startPattern);
  assert.ok(start >= 0, `missing ${startPattern}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n {2}(?:async function |function |const [a-zA-Z]+ = use|useEffect\(|\/\/ )/);
  return source.slice(start, next === -1 ? undefined : start + 1 + next);
}

test('one focused dialog covers loading, read error and detail (no separate overlays)', () => {
  assert.equal(existsSync(url(`${dir}OrderDetailErrorDialog.tsx`)), false);
  assert.doesNotMatch(workspace, /OrderDetailErrorDialog/);
  // The old plain spinner overlay is gone: loading happens inside the dialog.
  assert.doesNotMatch(workspace, /fixed inset-0/);
  assert.match(dialog, /const phase = order \? 'ready' : detailError \? 'error' : 'loading';/);
  assert.match(dialog, /<OrderDetailContent[\s\S]*?<OrderDetailReadError[\s\S]*?<OrderDetailLoading closeButton=\{closeButton\} \/>/);
  assert.match(dialog, /aria-busy=\{phase === 'loading' \|\| undefined\}/);
  assert.match(dialog, /aria-label=\{phase === 'loading' \? t\('orders\.split\.detailLabel'\) : undefined\}/);
  // Pane and dialog render the same loading / error components.
  for (const source of [dialog, pane]) {
    assert.match(source, /from '\.\/OrderDetailStates'/);
  }
});

test('modal behavior binds once: trap, focus guard, Escape, scroll lock restored', () => {
  const setup = dialog.slice(dialog.indexOf('const { body } = document;'), dialog.indexOf('// Initial focus'));
  assert.match(setup, /\}, \[\]\);/);
  assert.match(setup, /const previousOverflow = body\.style\.overflow;/);
  assert.match(setup, /body\.style\.overflow = 'hidden';/);
  assert.match(setup, /body\.style\.overflow = previousOverflow;\s*body\.style\.paddingRight = previousPaddingRight;/);
  assert.match(setup, /document\.addEventListener\('focusin', handleFocusIn\);/);
  assert.match(setup, /document\.removeEventListener\('focusin', handleFocusIn\);/);
  assert.match(setup, /!panel\.contains\(event\.target\)[\s\S]*?panel\.focus\(\{ preventScroll: true \}\);/);
  // Focus that falls to <body> (a re-rendered control unmounted) returns to the dialog.
  assert.match(dialog, /if \(document\.activeElement === document\.body\) \{\s*panelRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
  // Initial focus never moves focus the user already placed inside the dialog.
  assert.match(dialog, /if \(active && active !== panel && panel\.contains\(active\)\) return;/);
  assert.match(dialog, /tabIndex=\{-1\}/);
  // Hidden elements (the print-only receipt etc.) are never trap targets.
  assert.match(dialog, /element\.getClientRects\(\)\.length > 0/);
});

test('phones: full-screen dialog clear of the notch and home indicator', () => {
  assert.match(dialog, /flex h-full w-full flex-col overflow-hidden/);
  assert.match(dialog, /pt-\[env\(safe-area-inset-top\)\] pb-\[env\(safe-area-inset-bottom\)\]/);
  assert.match(dialog, /sm:pt-0 sm:pb-0/);
  // Above the mobile dock (z-40).
  assert.match(dialog, /fixed inset-0 z-50/);
  // Its body scrolls on its own; the page behind does not take over the scroll.
  assert.match(content, /overflow-y-auto px-5 py-5 max-sm:overscroll-contain/);
});

test('phones: next action full-width and last; split pane and tablet footer unchanged', () => {
  // The approved single-row footer is still the base (sm and up) layout...
  assert.match(content, /flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 max-sm:/);
  // ...and phones only add max-sm: variants.
  assert.match(content, /max-sm:flex-col max-sm:flex-nowrap max-sm:items-stretch/);
  assert.match(content, /className="px-6 py-2\.5 text-base max-sm:h-12 max-sm:w-full"/);
  // Destructive actions stay in the separate secondary group, never the primary one.
  const forwardStart = content.indexOf('{forwardTransitions.length > 0 ? (');
  assert.ok(content.indexOf('destructiveTransitions.map') < forwardStart);
  assert.doesNotMatch(content.slice(forwardStart, content.indexOf('waitingStep ? (')), /destructive/);
});

test('closing invalidates an outstanding read; duplicate reads are joined', () => {
  const close = block(workspace, /function closeDetail/);
  assert.match(close, /detailRequestRef\.current \+= 1;/);
  assert.match(close, /pendingDetailReadRef\.current = null;/);
  const open = block(workspace, /async function openOrder/);
  assert.match(open, /if \(pendingDetailReadRef\.current === orderId\) return;\s*pendingDetailReadRef\.current = orderId;/);
  assert.match(open, /if \(detailRequestRef\.current === requestId\) pendingDetailReadRef\.current = null;/);
  // Still a READ only: never a status write from open / Retry.
  assert.doesNotMatch(open, /updateOrderStatus/);
  assert.equal(workspace.match(/updateOrderStatus\(/g)?.length, 1);
});

test('slow reads are announced and say closing is safe', () => {
  assert.match(states, /const SLOW_READ_MS = 4_000;/);
  assert.match(states, /window\.setTimeout\(\(\) => setIsSlow\(true\), SLOW_READ_MS\)/);
  assert.match(states, /window\.clearTimeout\(timer\)/);
  assert.match(states, /<p role="status"[^>]*>\s*\{t\('orders\.detail\.slowRead'\)\}/);
  // Loading always has a working Close.
  assert.match(states, /\{closeButton\}/);
});

test('focus return: opening card, its re-mounted card, else the page title', () => {
  assert.match(card, /data-order-id=\{order\.id\}/);
  assert.equal(card.match(/<button/g)?.length, 1);
  const effect = workspace.slice(workspace.indexOf('// Focus return runs after'), workspace.indexOf('async function handleTransition'));
  assert.match(effect, /if \(selectedOrderId !== null\) return;/);
  assert.match(effect, /focusReturnRef\.current = null;/);
  assert.match(effect, /\[data-order-id="\$\{CSS\.escape\(pending\.orderId\)\}"\]/);
  assert.match(effect, /\(card \?\? pageTitleRef\.current\)\?\.focus\(\);/);
  assert.match(effect, /\}, \[selectedOrderId\]\);/);
  assert.match(workspace, /<span ref=\{pageTitleRef\} tabIndex=\{-1\} className="outline-none">/);
  // Deep links (no card clicked) still have somewhere to return to.
  assert.match(workspace, /queueMicrotask\(\(\) => void openOrder\(initialOrderId\)\);/);
});

test('switching narrow <-> split keeps one selection, one detail state, one write path', () => {
  assert.match(workspace, /const detailProps: OrderDetailDialogProps = \{/);
  assert.match(workspace, /onTransition: \(to\) => void handleTransition\(to\),/);
  assert.match(workspace, /<OrderDetailPane selectedOrderId=\{selectedOrderId\} \{\.\.\.detailProps\} \/>/);
  assert.match(workspace, /\{!isSplit && selectedOrderId \? <OrderDetailDialog \{\.\.\.detailProps\} \/> : null\}/);
  // The layout switch never touches selection or detail state.
  const measure = workspace.slice(workspace.indexOf('const workspaceRef'), workspace.indexOf('const loadOrders'));
  assert.doesNotMatch(measure, /setSelectedOrderId|setOrderDetail|setDetailSync/);
});

test('slow-read copy exists in English and Arabic', () => {
  const values = [...copySource.matchAll(/'orders\.detail\.slowRead': '([^']*)'/g)].map((m) => m[1]);
  assert.equal(values.length, 2);
  assert.notEqual(values[0], values[1]);
  assert.match(values[1], /[؀-ۿ]/);
});

test('mixed Arabic / Latin text: blocks keep the page direction, names are isolated', () => {
  // Title and item names: <bdi dir="auto"> inside a page-direction block, never dir on the block.
  assert.match(content, /<h2\s+id=\{titleId\}\s+className="[^"]*text-start[^"]*"\s*>\s*<bdi dir="auto">\{identity\}<\/bdi>/);
  assert.doesNotMatch(content, /<h2[^>]*dir="auto"/);
  assert.match(content, /<p className="text-start text-sm font-semibold text-foreground">\s*<bdi dir="auto">\s*\{item\.productNameSnapshot\}/);
  // The localized date is isolated with `auto` (Arabic dates must not be forced LTR).
  assert.match(content, /<bdi dir="auto">\{formatDateTime\(order\.createdAt\)\}<\/bdi>/);
  // Phone numbers and money stay explicitly LTR.
  assert.match(content, /<dd dir="ltr" className="text-end font-medium">\s*\{order\.customer\.phone\}/);
  assert.match(content, /<bdi dir="ltr" className="text-2xl font-bold text-foreground">/);
});
