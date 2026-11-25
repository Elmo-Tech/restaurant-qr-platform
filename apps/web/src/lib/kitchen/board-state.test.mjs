import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/errors.ts';
import {
  BOARD_NOTICE_LIMIT,
  appendBoardNotices,
  classifyKitchenActionError,
  detectArrivals,
  nextKitchenStatus,
  pruneCardNotices,
  resolvePendingChecks,
} from './board-state.ts';

// Kitchen K1: the pure rules behind board states, conflicts and recovery.
const apiError = (status, code, details) => new ApiError(status, { error: { code, message: code, details } });
const ticket = (id, status) => ({ id, status });
const check = (ticketId, kind, overrides = {}) => ({
  ticketId,
  label: `Table ${ticketId}`,
  from: 'ACCEPTED',
  to: 'PREPARING',
  kind,
  afterRead: 3,
  ...overrides,
});

test('the kitchen only ever moves ACCEPTED -> PREPARING -> READY; READY has no kitchen step', () => {
  assert.equal(nextKitchenStatus('ACCEPTED'), 'PREPARING');
  assert.equal(nextKitchenStatus('PREPARING'), 'READY');
  assert.equal(nextKitchenStatus('READY'), null);
});

test('action failures are classified by HTTP status and stable code, never by message text', () => {
  assert.equal(classifyKitchenActionError(apiError(401, 'UNAUTHENTICATED')), 'unauthenticated');
  assert.equal(classifyKitchenActionError(apiError(409, 'ORDER_STATUS_CHANGED', { currentStatus: 'READY' })), 'conflict');
  assert.equal(classifyKitchenActionError(apiError(409, 'ORDER_INVALID_TRANSITION')), 'conflict');
  assert.equal(classifyKitchenActionError(apiError(404, 'ORDER_NOT_FOUND')), 'conflict');
  assert.equal(classifyKitchenActionError(apiError(403, 'PERMISSION_DENIED')), 'denied');
  assert.equal(classifyKitchenActionError(apiError(400, 'VALIDATION_ERROR')), 'rejected');
  // No reliable answer: the change may have been saved.
  assert.equal(classifyKitchenActionError(apiError(500, 'INTERNAL_ERROR')), 'unknown');
  assert.equal(classifyKitchenActionError(apiError(502, 'UNKNOWN_ERROR')), 'unknown');
  assert.equal(classifyKitchenActionError(new TypeError('Failed to fetch')), 'unknown');
  assert.equal(classifyKitchenActionError(undefined), 'unknown');
});

test('a pending check is only settled by a read that started after it', () => {
  const pending = { a: check('a', 'unknown', { afterRead: 5 }) };
  const older = resolvePendingChecks(pending, [ticket('a', 'PREPARING')], 5);
  assert.deepEqual(older.pending, pending);
  assert.deepEqual(older.cardNotices, {});
  const fresh = resolvePendingChecks(pending, [ticket('a', 'PREPARING')], 6);
  assert.deepEqual(fresh.pending, {});
});

test('unknown outcome: confirmed when moved, "not applied" when unchanged, "changed elsewhere" otherwise', () => {
  const pending = { a: check('a', 'unknown'), b: check('b', 'unknown'), c: check('c', 'unknown') };
  const result = resolvePendingChecks(
    pending,
    [ticket('a', 'PREPARING'), ticket('b', 'ACCEPTED'), ticket('c', 'READY')],
    4,
  );
  assert.deepEqual(result.cardNotices, {
    a: { kind: 'confirmed', status: 'PREPARING' },
    b: { kind: 'notApplied', status: 'ACCEPTED' },
    c: { kind: 'changedElsewhere', status: 'READY' },
  });
  assert.deepEqual(result.pending, {});
  assert.deepEqual(result.boardNotices, []);
});

test('conflict and saved checks: the latest state is explained; a saved move needs no extra notice', () => {
  const result = resolvePendingChecks(
    { a: check('a', 'conflict'), b: check('b', 'saved'), c: check('c', 'saved') },
    [ticket('a', 'PREPARING'), ticket('b', 'PREPARING'), ticket('c', 'READY')],
    4,
  );
  assert.deepEqual(result.cardNotices, {
    a: { kind: 'changedElsewhere', status: 'PREPARING' },
    c: { kind: 'changedElsewhere', status: 'READY' },
  });
});

test('a ticket that left the board during reconciliation becomes a named board notice', () => {
  const result = resolvePendingChecks({ a: check('a', 'conflict') }, [], 9);
  assert.deepEqual(result.boardNotices, [{ id: 'a:9', ticketId: 'a', label: 'Table a' }]);
  assert.deepEqual(result.cardNotices, {});
  assert.deepEqual(result.pending, {});
});

test('card notices last only while the ticket stays in the status they describe', () => {
  const notices = {
    a: { kind: 'denied', status: 'ACCEPTED' },
    b: { kind: 'confirmed', status: 'PREPARING' },
    c: { kind: 'failed', status: 'PREPARING', message: null },
  };
  assert.deepEqual(pruneCardNotices(notices, [ticket('a', 'ACCEPTED'), ticket('b', 'READY')]), {
    a: { kind: 'denied', status: 'ACCEPTED' },
  });
});

test('board notices: one per ticket, newest last, bounded', () => {
  const notice = (ticketId, seq) => ({ id: `${ticketId}:${seq}`, ticketId, label: ticketId });
  assert.deepEqual(appendBoardNotices([notice('a', 1), notice('b', 1)], [notice('a', 2)]), [
    notice('b', 1),
    notice('a', 2),
  ]);
  const many = Array.from({ length: BOARD_NOTICE_LIMIT + 2 }, (_, index) => notice(`t${index}`, index));
  const kept = appendBoardNotices([], many);
  assert.equal(kept.length, BOARD_NOTICE_LIMIT);
  assert.equal(kept.at(-1).ticketId, `t${BOARD_NOTICE_LIMIT + 1}`);
});

test('chime arrivals: silent first load, only never-seen ACCEPTED tickets, never twice', () => {
  const first = detectArrivals(null, [ticket('a', 'ACCEPTED'), ticket('b', 'PREPARING')]);
  assert.deepEqual(first.arrived, []);
  assert.deepEqual([...first.seen].sort(), ['a', 'b']);

  const second = detectArrivals(first.seen, [ticket('a', 'ACCEPTED'), ticket('c', 'ACCEPTED'), ticket('d', 'READY')]);
  assert.deepEqual(second.arrived, ['c']);

  // `c` drops out of one response and comes back: still seen, no second chime.
  const gap = detectArrivals(second.seen, [ticket('a', 'ACCEPTED')]);
  const back = detectArrivals(gap.seen, [ticket('a', 'ACCEPTED'), ticket('c', 'ACCEPTED')]);
  assert.deepEqual(gap.arrived, []);
  assert.deepEqual(back.arrived, []);
});
