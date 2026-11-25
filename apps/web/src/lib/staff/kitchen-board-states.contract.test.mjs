import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Kitchen K1: board states and recovery (loading, refresh, stale data, retry,
// conflicts, unknown outcomes, branch isolation, sound) without changing the
// API, the lifecycle or the board layout.
const url = (file) => new URL(file, import.meta.url);
const read = (file) => readFileSync(url(file), 'utf8');
const dir = '../../app/staff/restaurants/[restaurantId]/kitchen/';
const board = read(`${dir}KitchenBoard.tsx`);
const card = read(`${dir}KitchenTicketCard.tsx`);
const soundHook = read(`${dir}useKitchenSound.ts`);
const page = read(`${dir}page.tsx`);
const capabilities = read('../kitchen/capabilities.ts');
const boardState = read('../kitchen/board-state.ts');
const copySource = read('../i18n/messages/kitchen.ts');
const kitchenSources = { board, card, soundHook, boardState };
/** Source without comments, so a rule about code is not tripped by its own explanation. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The body of a `const name = useCallback(` / `function name(` block, up to the next top-level hook or function. */
function block(source, startPattern) {
  const start = source.search(startPattern);
  assert.ok(start >= 0, `missing ${startPattern}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n {2}(?:const [a-zA-Z]+ = use|function |useEffect\(|\/\*\* )/);
  return source.slice(start, next === -1 ? undefined : start + 1 + next);
}

function dictionary(locale) {
  const start = copySource.indexOf(`  ${locale}: {`);
  assert.ok(start >= 0, `missing ${locale} block`);
  const end = copySource.indexOf('\n  },', start);
  return copySource.slice(start, end);
}

const NEW_KEYS = [
  'kitchen.connecting',
  'kitchen.notUpToDate',
  'kitchen.refreshing',
  'kitchen.loadFailedTitle',
  'kitchen.refreshFailedTitle',
  'kitchen.announce.recovered',
  'kitchen.sound.label',
  'kitchen.sound.enable',
  'kitchen.sound.unsupported',
  'kitchen.action.updating',
  'kitchen.notice.denied',
  'kitchen.notice.confirmed',
  'kitchen.notice.notApplied',
  'kitchen.notice.changedElsewhere',
  'kitchen.pending.saved',
  'kitchen.pending.unknown',
  'kitchen.pending.conflict',
  'kitchen.checkAgain',
  'kitchen.checking',
  'kitchen.boardNotice.left',
  'kitchen.dismiss',
];

test('Kitchen actions require both orders.view and kitchen.update, like the status route', () => {
  assert.match(
    capabilities,
    /canUpdateKitchen\(permissions: readonly string\[\]\): boolean \{\n\s+return permissions\.includes\('orders\.view'\) && permissions\.includes\('kitchen\.update'\);/,
  );
  // Viewing is unchanged: kitchen.view plus the KITCHEN package feature.
  assert.match(capabilities, /permissions\.includes\('kitchen\.view'\) && usesKitchen\(membership\)/);
  assert.match(board, /const canUpdate = canUpdateKitchen\(permissions\);/);
  assert.match(page, /canViewKitchen\(membership\)/);
});

test('the lifecycle stays ACCEPTED -> PREPARING -> READY; READY never implies SERVED', () => {
  for (const [name, source] of Object.entries(kitchenSources)) {
    assert.doesNotMatch(code(source), /SERVED|markServed|OUT_FOR_DELIVERY/, `${name} must not reference serving`);
  }
  assert.match(boardState, /if \(status === 'ACCEPTED'\) return 'PREPARING';\n\s+if \(status === 'PREPARING'\) return 'READY';\n\s+return null;/);
  const advance = block(board, /const advance = useCallback\(/);
  assert.match(advance, /const to = nextKitchenStatus\(ticket\.status\);\n\s+if \(to === null\) return;/);
  assert.match(advance, /expectedStatus: ticket\.status,\n\s+status: to,/);
  assert.match(card, /ticket\.status === 'READY' \?[\s\S]*?kitchen\.waitingService/);
});

test('reads never overlap: one in flight, joins for poll/visible/manual, one queued fresh read for reconciliation', () => {
  // The only network read lives in runRead, keyed by the branch session's branch.
  assert.equal(board.match(/listKitchenTickets\(/g).length, 1);
  assert.match(block(board, /const runRead = useCallback\(/), /kitchenApi\.listKitchenTickets\(restaurantId, branch\)/);
  const requestRead = block(board, /const requestRead = useCallback\(/);
  assert.match(requestRead, /if \(queuedRef\.current\) return queuedRef\.current;/);
  assert.match(requestRead, /if \(!inFlight\) return runRead\(generation, branch\);/);
  assert.match(requestRead, /if \(reason !== 'reconcile'\) return inFlight\.promise;/);
  assert.match(requestRead, /inFlight\.promise\.then\(/);
  // Polling, visibility and the initial load all go through requestRead.
  assert.match(board, /void requestRead\('initial'\);/);
  assert.match(board, /setInterval\(\(\) => void requestRead\('poll'\), POLL_INTERVAL_MS\)/);
  assert.match(board, /if \(document\.visibilityState === 'visible'\) void requestRead\('visible'\);/);
});

test('stale responses are discarded after every await (branch switch or unmount)', () => {
  const runRead = block(board, /const runRead = useCallback\(/);
  assert.equal(runRead.match(/if \(generationRef\.current !== generation\) return 'stale';/g).length, 2);
  const advance = block(board, /const advance = useCallback\(/);
  assert.match(advance, /const isCurrent = \(\) => generationRef\.current === generation;/);
  assert.match(advance, /if \(!isCurrent\(\)\) return;/);
  assert.match(board, /useEffect\(\(\) => \(\) => invalidateSession\(\), \[invalidateSession\]\);/);
});

test('switching branches resets every ticket, error, timestamp and notice in one update', () => {
  const invalidate = block(board, /const invalidateSession = useCallback\(/);
  for (const reset of [
    'generationRef.current += 1;',
    'inFlightRef.current = null;',
    'queuedRef.current = null;',
    'locksRef.current = new Set();',
    'pendingRef.current = {};',
    'seenRef.current = null;',
    'refreshLockRef.current = false;',
  ]) {
    assert.ok(invalidate.includes(reset), `invalidateSession must run ${reset}`);
  }
  const select = block(board, /function selectBranch\(/);
  for (const reset of [
    'invalidateSession();',
    'setBoard(EMPTY_BOARD);',
    'setBusyIds(NO_BUSY);',
    'setPending({});',
    'setCardNotices({});',
    'setBoardNotices([]);',
    'setAnnouncement(null);',
  ]) {
    assert.ok(select.includes(reset), `selectBranch must run ${reset}`);
  }
  assert.match(board, /onChange=\{selectBranch\}/);
  // Render guard: data tagged with another branch never renders.
  assert.match(board, /const tickets = board\.branchId === branchId \? board\.tickets : null;/);
  assert.match(board, /const readError = board\.branchId === branchId \? board\.error : null;/);
  assert.match(board, /const loadedAt = board\.branchId === branchId \? board\.loadedAt : null;/);
});

test('synchronous action locks and pending checks block duplicate or premature status changes', () => {
  const advance = block(board, /const advance = useCallback\(/);
  assert.match(
    advance,
    /const locks = locksRef\.current;\n\s+if \(locks\.has\(ticket\.id\) \|\| pendingRef\.current\[ticket\.id\]\) return;\n\s+locks\.add\(ticket\.id\);/,
  );
  // The lock is held through reconciliation and released from the same Set it was taken in.
  assert.match(advance, /await requestRead\('reconcile'\);\n\s+\} finally \{\n\s+locks\.delete\(ticket\.id\);/);
  // Unknown and conflict outcomes are pending until a read that starts afterwards.
  assert.match(advance, /kind = failure; \/\/ 'conflict' \| 'unknown'/);
  assert.match(advance, /afterRead: readSeqRef\.current,/);
  assert.match(card, /disabled=\{busy \|\| pending !== null \|\| !canUpdate\}/);
  assert.match(card, /aria-busy=\{busy \|\| undefined\}/);
});

test('recovery controls only ever re-read; status changes are never retried automatically', () => {
  const refresh = block(board, /const refreshNow = useCallback\(/);
  assert.match(refresh, /if \(refreshLockRef\.current\) return;\n\s+refreshLockRef\.current = true;/);
  assert.match(refresh, /void requestRead\(reason\)/);
  assert.doesNotMatch(refresh, /updateOrderStatus|advance/);
  assert.match(board, /<ReadErrorAlert[\s\S]*?isRetrying=\{refreshing\}\n\s+onRetry=\{\(\) => refreshNow\('manual'\)\}/);
  assert.match(board, /onCheckAgain=\{\(\) => refreshNow\('reconcile'\)\}/);
  assert.match(board, /disabled=\{refreshing\}\n\s+aria-busy=\{refreshing \|\| undefined\}\n\s+onClick=\{\(\) => refreshNow\('manual'\)\}/);
  assert.equal(board.match(/updateOrderStatus\(/g).length, 1);
});

test('first-load and refresh failures use the shared ReadErrorAlert and keep the last board visible', () => {
  assert.match(board, /from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/components\/staff\/ReadErrorAlert'/);
  assert.match(board, /t\('kitchen\.refreshFailedTitle', \{ time: loadedTime \}\)/);
  assert.match(board, /: t\('kitchen\.loadFailedTitle'\)/);
  // A failed read keeps the tickets and only records the error.
  assert.match(block(board, /const runRead = useCallback\(/), /setBoard\(\(current\) => \(\{ \.\.\.current, branchId: branch, error: describeError\(error\) \}\)\);/);
});

test('session expiry uses the existing login recovery for reads and actions', () => {
  assert.match(block(board, /const runRead = useCallback\(/), /if \(isUnauthenticatedError\(error\)\) \{\n\s+redirectToLogin\(\);/);
  assert.match(block(board, /const advance = useCallback\(/), /if \(failure === 'unauthenticated'\) \{\n\s+redirectToLogin\(\);/);
});

test('status and time are accessible and localized: no chatty live region, no browser-locale times', () => {
  for (const [name, source] of Object.entries(kitchenSources)) {
    assert.doesNotMatch(source, /toLocaleTimeString\(/, `${name} must format times with the Staff locale`);
  }
  assert.match(board, /const \{ t, locale, formatTime \} = useStaffI18n\(\);/);
  assert.match(card, /title=\{formatTime\(ticket\.statusSince\)\}/);
  assert.doesNotMatch(board, /role="status"/);
  assert.match(board, /<p className="sr-only" aria-live="polite">/);
  assert.match(board, /setAnnouncement\(\{ key: 'kitchen\.announce\.recovered' \}\)/);
});

test('tickets that move or disappear during reconciliation leave persistent feedback', () => {
  assert.match(board, /const resolution = resolvePendingChecks\(pendingRef\.current, list, seq\);/);
  assert.match(board, /setCardNotices\(\(current\) => \(\{ \.\.\.pruneCardNotices\(current, list\), \.\.\.resolution\.cardNotices \}\)\);/);
  assert.match(board, /appendBoardNotices\(current, resolution\.boardNotices\)/);
  assert.match(board, /t\('kitchen\.boardNotice\.left', \{ label: notice\.label \}\)/);
  assert.match(board, /\{t\('kitchen\.dismiss'\)\}/);
});

test('sound: one AudioContext, unlocked by a click, closed on unmount, preference separate from availability', () => {
  assert.equal(soundHook.match(/new AudioContextClass\(\)/g).length, 1);
  assert.match(soundHook, /const contextRef = useRef<AudioContext \| null>\(null\);/);
  assert.match(soundHook, /const \[preference, setPreference\] = useState\(false\);/);
  assert.match(soundHook, /const \[audio, setAudio\] = useState<KitchenAudioState>\('blocked'\);/);
  assert.match(soundHook, /void context\.close\(\)/);
  assert.match(soundHook, /if \(context\.state !== 'running'\) await context\.resume\(\);/);
  assert.match(soundHook, /if \(!preferenceRef\.current \|\| !context \|\| context\.state !== 'running'\) return;/);
  // Resuming happens only from the toggle or the explicit enable button.
  assert.match(board, /onClick=\{sound\.toggle\}/);
  assert.match(board, /sound\.preference && sound\.audio === 'blocked' \?[\s\S]*?onClick=\{sound\.enable\}/);
  assert.match(board, /aria-pressed=\{sound\.preference\}/);
  // The accessible name stays "Sound"; the pressed state carries on/off.
  assert.doesNotMatch(copySource, /kitchen\.sound\.(on|off)'/);
  // Chimes only for never-seen tickets of this branch session.
  assert.match(board, /const arrivals = detectArrivals\(seenRef\.current, list\);/);
  assert.match(board, /if \(arrivals\.arrived\.length > 0\) playChime\(\);/);
});

test('every new message exists in English and Arabic; retired keys are gone', () => {
  const en = dictionary('en');
  const ar = dictionary('ar');
  for (const key of NEW_KEYS) {
    assert.match(en, new RegExp(`'${key.replaceAll('.', '\\.')}': `), `en ${key}`);
    assert.match(ar, new RegExp(`'${key.replaceAll('.', '\\.')}': '[^']*[\\u0600-\\u06FF]`), `ar ${key}`);
  }
  for (const retired of ['kitchen.live', 'kitchen.loadFailed', 'kitchen.staleAction']) {
    assert.doesNotMatch(copySource, new RegExp(`'${retired.replaceAll('.', '\\.')}'`), retired);
  }
});
