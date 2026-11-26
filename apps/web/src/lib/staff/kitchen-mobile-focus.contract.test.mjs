import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Kitchen K3: mobile tabs and One Ticket Focus. Source-level guarantees that the browser suite cannot see: the new
// layout reuses every K1 safeguard, delivers an action only to the focused ticket, and stays RTL/LTR neutral.
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const dir = '../../app/staff/restaurants/[restaurantId]/kitchen/';
const board = read(`${dir}KitchenBoard.tsx`);
const card = read(`${dir}KitchenTicketCard.tsx`);
const view = read(`${dir}KitchenFocusView.tsx`);
const tabs = read(`${dir}KitchenStageTabs.tsx`);
const focus = read('../kitchen/focus.ts');
const copySource = read('../i18n/messages/kitchen.ts');
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function dictionary(locale) {
  const start = copySource.indexOf(`  ${locale}: {`);
  assert.ok(start >= 0, `missing ${locale} block`);
  return copySource.slice(start, copySource.indexOf('\n  },', start));
}

test('an action is delivered only to the ticket in focus at tap time; K1 locks and the status guard sit behind it', () => {
  assert.match(board, /if \(isPhone && kitchenActionHold\(focusRef\.current, target\.id, Date\.now\(\)\) !== null\) return;\n\s+void advance\(target, kitchenTicketLabel\(target, t\)\);/);
  assert.match(board, /onAdvance=\{guardedAdvance\}/);
  // The only mutation is still the guarded status route, sent from `advance` with the ticket's own expectedStatus.
  assert.equal(board.match(/updateOrderStatus\(/g).length, 1);
  assert.match(board, /\{ expectedStatus: ticket\.status, status: to \}/);
  // The focus rules never touch the network or a status.
  assert.doesNotMatch(code(focus), /fetch\(|updateOrderStatus|expectedStatus|SERVED|markServed/);
  assert.doesNotMatch(code(view + tabs), /updateOrderStatus|kitchenApi|ordersApi/);
});

test('the board keeps ONE source of ticket truth: the phone view renders the same card as the desktop columns', () => {
  assert.match(board, /renderCard=\{renderCard\}/);
  assert.match(board, /byColumn\[status\]\.map\(\(ticket\) => renderCard\(ticket\)\)/);
  assert.equal(board.match(/<KitchenTicketCard/g).length, 1);
  assert.equal(board.match(/listKitchenTickets\(/g).length, 1);
});

test('the focus is reconciled inside the guarded read, after the stale-branch check, and reset on a branch switch', () => {
  const runRead = board.slice(board.indexOf('const runRead = useCallback('), board.indexOf('/** The single entry point'));
  assert.ok(runRead.indexOf("if (generationRef.current !== generation) return 'stale';") < runRead.indexOf('reconcileKitchenFocus('));
  assert.match(runRead, /ownMoves\.set\(check\.ticketId, check\.to\)/);
  assert.match(runRead, /if \(check\.kind !== 'conflict'\)/);
  const select = board.slice(board.indexOf('function selectBranch('), board.indexOf('const focusOptions'));
  assert.match(select, /commitFocus\(initialKitchenFocus\(focusRef\.current\.stage, focusRef\.current\.generation \+ 1\)\);/);
  assert.match(select, /commitFocusNotice\(null\);/);
  assert.match(select, /stagesRef\.current = \{ ACCEPTED: \[\], PREPARING: \[\], READY: \[\] \};/);
});

test('the focused ticket is a different element per id, and the stable id is what is stored', () => {
  assert.match(view, /key=\{focused\.id\}/);
  assert.match(focus, /ticketId: string \| null;/);
  assert.match(code(focus), /byStage\[prev\.stage\]/);
  assert.doesNotMatch(code(board), /setColumn|column === status/);
});

test('tabs are real tabs with counts and a tabpanel, and every phone control is at least 44px', () => {
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /aria-selected=\{selected\}/);
  assert.match(tabs, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(tabs, /min-h-16/);
  assert.match(view, /role="tabpanel"/);
  assert.match(view, /aria-labelledby=\{kitchenTabId\(focus\.stage\)\}/);
  const controls = view.match(/className="[^"]*min-h-(?:11|14)[^"]*"/g) ?? [];
  assert.ok(controls.length >= 5, 'Previous, Next, Show it, Continue / Dismiss and the ticket rows each declare min-h-11 or min-h-14');
  assert.doesNotMatch(view, /size="sm"|h-8|h-9|h-10\b/);
});

test('arrow keys follow the reading direction and the layout uses only logical properties', () => {
  assert.match(tabs, /isRtl \? 'ArrowLeft' : 'ArrowRight'/);
  for (const [name, source] of Object.entries({ view, tabs })) {
    assert.doesNotMatch(code(source), /\b(?:ml|mr|pl|pr|left|right)-\S+|text-left|text-right|border-l-|border-r-/, `${name} must use logical properties`);
  }
  assert.match(view, /rtl:-scale-x-100/);
  assert.match(view, /dir="auto"/);
  assert.match(card, /border-s-8/); // K2's logical accent border, untouched
});

test('a changed focus is announced politely once, not shown as an alert', () => {
  assert.doesNotMatch(board, /role="status"/);
  assert.doesNotMatch(view, /role="alert"|aria-live/);
  assert.match(board, /key: left\.own \? 'kitchen\.focus\.announce\.moved' : 'kitchen\.focus\.moved'/);
  assert.match(view, /regionRef\.current\?\.focus\(\)/);
});

test('the READY stage still has no serve action and the hold never reaches the K1 pending block', () => {
  assert.match(card, /ticket\.status === 'READY' \?[\s\S]*?kitchen\.waitingService/);
  assert.match(card, /disabled=\{busy \|\| pending !== null \|\| !canUpdate \|\| held\}/);
  for (const source of [view, tabs, focus]) assert.doesNotMatch(code(source), /SERVED|markServed|OUT_FOR_DELIVERY/);
});

test('every K3 message exists in English and Arabic', () => {
  const keys = [...copySource.matchAll(/'(kitchen\.(?:tab|focus)\.[A-Za-z.]+)'/g)].map((match) => match[1]);
  const unique = [...new Set(keys)];
  assert.ok(unique.length >= 12);
  for (const key of unique) {
    const pattern = key.replaceAll('.', '\\.');
    assert.match(dictionary('en'), new RegExp(`'${pattern}': `), `en ${key}`);
    // "{column}: {count}" is all placeholders: the same in both languages.
    const arabic = key === 'kitchen.tab.count' ? `'${pattern}': '` : `'${pattern}': '[^']*[\\u0600-\\u06FF]`;
    assert.match(dictionary('ar'), new RegExp(arabic), `ar ${key}`);
  }
});
