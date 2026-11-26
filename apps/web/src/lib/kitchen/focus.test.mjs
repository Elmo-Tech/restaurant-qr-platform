import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUS_SETTLE_MS,
  acknowledgeKitchenFocus,
  initialKitchenFocus,
  kitchenActionHold,
  kitchenFocusPosition,
  reconcileKitchenFocus,
  selectKitchenStage,
  selectKitchenTicket,
  settleKitchenFocus,
  stepKitchenFocus,
} from './focus.ts';
import { sortKitchenTickets } from './ticket-view.ts';

// Kitchen K3: One Ticket Focus. Pure rules only: focus is a stable id, never a position.
const at = (minute) => new Date(Date.UTC(2026, 10, 26, 12, minute)).toISOString();
const ticket = (id, status, minute) => ({ id, status, statusSince: at(minute), createdAt: at(minute) });
const labelOf = (entry) => `Ticket ${entry.id}`;
const options = { labelOf };
const NOW = 1_000_000;

/** Groups like the board does: K2 time priority inside each stage. */
function stages(tickets) {
  const byStage = { ACCEPTED: [], PREPARING: [], READY: [] };
  for (const entry of sortKitchenTickets(tickets)) byStage[entry.status].push(entry);
  return byStage;
}
const ids = (list) => list.map((entry) => entry.id);
const reconcile = (focus, tickets, ownMoves = new Map(), now = NOW) =>
  reconcileKitchenFocus(focus, stages(tickets), { ownMoves, now, labelOf });

/** A focus pinned on `id` in its stage, as a first read would leave it. */
function pinned(tickets, id, stage = 'ACCEPTED') {
  const first = reconcile(initialKitchenFocus(stage), tickets).focus;
  return id === first.ticketId ? first : selectKitchenTicket(first, stage, id, stages(tickets), options);
}

const board = () => [
  ticket('a', 'ACCEPTED', 0),
  ticket('b', 'ACCEPTED', 5),
  ticket('c', 'ACCEPTED', 10),
  ticket('p1', 'PREPARING', 2),
  ticket('r1', 'READY', 3),
];

test('the first read pins the longest-waiting ticket by id; later re-sorting never moves the focus', () => {
  const first = reconcile(initialKitchenFocus(), board());
  assert.equal(first.focus.ticketId, 'a');
  assert.equal(first.notice, null);
  assert.deepEqual(first.focus.guard, { kind: 'none' });

  // An older ticket arrives (it now sorts first) and the focused one is re-ranked: still the same ticket.
  const reordered = [...board(), ticket('old', 'ACCEPTED', -30)];
  const next = reconcile(first.focus, reordered);
  assert.equal(next.focus.ticketId, 'a');
  assert.equal(next.notice, null);
  assert.deepEqual(next.focus.order, ['old', 'a', 'b', 'c']);
  assert.deepEqual(kitchenFocusPosition(next.focus, stages(reordered)), { position: 2, total: 4 });
});

test('an empty stage has no focus; the first ticket to arrive is pinned', () => {
  const empty = reconcile(initialKitchenFocus('PREPARING'), []).focus;
  assert.equal(empty.ticketId, null);
  const arrived = reconcile(empty, [ticket('p9', 'PREPARING', 1)]);
  assert.equal(arrived.focus.ticketId, 'p9');
  assert.equal(arrived.notice, null);
});

test('a ticket that another employee moved: focus falls to its neighbour, the action is held until acknowledged', () => {
  const focus = pinned(board(), 'b');
  const after = board().map((entry) => (entry.id === 'b' ? { ...entry, status: 'PREPARING', statusSince: at(20) } : entry));
  const result = reconcile(focus, after);
  assert.equal(result.focus.ticketId, 'c'); // the next ticket in the old order
  assert.deepEqual(result.focus.guard, { kind: 'confirm', ticketId: 'c', generation: 1 });
  assert.deepEqual(result.notice, { kind: 'moved', ticketId: 'b', label: 'Ticket b', to: 'PREPARING', own: false, generation: 1 });
  assert.equal(kitchenActionHold(result.focus, 'c', NOW + 60_000), 'confirm'); // time never releases it
  assert.equal(kitchenActionHold(acknowledgeKitchenFocus(result.focus, { ticketId: 'c', generation: 1 }), 'c', NOW), null);
});

test('a ticket removed by another employee behaves the same, naming the ticket that left', () => {
  const focus = pinned(board(), 'c');
  const result = reconcile(focus, board().filter((entry) => entry.id !== 'c'));
  assert.equal(result.focus.ticketId, 'b'); // nothing after it: the closest earlier one
  assert.deepEqual(result.focus.guard, { kind: 'confirm', ticketId: 'b', generation: 1 });
  assert.deepEqual(result.notice, { kind: 'removed', ticketId: 'c', label: 'Ticket c', own: false, generation: 1 });
});

test('successive departures issue distinct generations and reject stale acknowledgements', () => {
  const first = reconcile(pinned(board(), 'a'), board().filter((entry) => entry.id !== 'a'));
  const second = reconcile(first.focus, board().filter((entry) => entry.id !== 'a' && entry.id !== 'b'));
  assert.equal(first.focus.ticketId, 'b');
  assert.equal(second.focus.ticketId, 'c');
  assert.equal(first.notice.generation, 1);
  assert.equal(second.notice.generation, 2);
  assert.deepEqual(second.focus.guard, { kind: 'confirm', ticketId: 'c', generation: 2 });
  assert.equal(acknowledgeKitchenFocus(second.focus, { ticketId: 'b', generation: 1 }), second.focus);
  assert.equal(acknowledgeKitchenFocus(second.focus, { ticketId: 'c', generation: 1 }), second.focus);
  assert.equal(acknowledgeKitchenFocus(second.focus, { ticketId: 'b', generation: 2 }), second.focus);
  assert.equal(kitchenActionHold(second.focus, 'c', NOW), 'confirm');
  assert.equal(kitchenActionHold(acknowledgeKitchenFocus(second.focus, { ticketId: 'c', generation: 2 }), 'c', NOW), null);
});

test('a departure without a neighbour still advances the notice generation', () => {
  const first = reconcile(pinned(board(), 'a'), board().filter((entry) => entry.id !== 'a'));
  const second = reconcile(first.focus, board().filter((entry) => !['a', 'b', 'c'].includes(entry.id)));
  assert.equal(second.focus.ticketId, null);
  assert.equal(second.notice.generation, first.notice.generation + 1);
  assert.equal(second.focus.generation, second.notice.generation);
});

test('the person\'s own action moves the focus on with a short settle pause, not an acknowledgement', () => {
  const focus = pinned(board(), 'a');
  const after = board().map((entry) => (entry.id === 'a' ? { ...entry, status: 'PREPARING', statusSince: at(30) } : entry));
  const result = reconcile(focus, after, new Map([['a', 'PREPARING']]));
  assert.equal(result.focus.ticketId, 'b');
  assert.deepEqual(result.focus.guard, { kind: 'settling', ticketId: 'b', until: NOW + FOCUS_SETTLE_MS });
  assert.equal(result.notice.own, true);
  // The second half of a double tap lands inside the pause and is refused; afterwards it is allowed.
  assert.equal(kitchenActionHold(result.focus, 'b', NOW + 100), 'settling');
  assert.equal(kitchenActionHold(result.focus, 'b', NOW + FOCUS_SETTLE_MS), null);
  assert.deepEqual(settleKitchenFocus(result.focus, NOW + 100).guard.kind, 'settling');
  assert.deepEqual(settleKitchenFocus(result.focus, NOW + FOCUS_SETTLE_MS).guard, { kind: 'none' });
});

test('a ticket that moved somewhere other than where the person sent it counts as someone else\'s change', () => {
  const focus = pinned(board(), 'a');
  const after = board().map((entry) => (entry.id === 'a' ? { ...entry, status: 'READY', statusSince: at(30) } : entry));
  const result = reconcile(focus, after, new Map([['a', 'PREPARING']]));
  assert.equal(result.notice.own, false);
  assert.equal(result.focus.guard.kind, 'confirm');
});

test('the last ticket leaving a stage leaves no focus and no guard', () => {
  const only = [ticket('a', 'ACCEPTED', 0)];
  const focus = pinned(only, 'a');
  const result = reconcile(focus, []);
  assert.equal(result.focus.ticketId, null);
  assert.deepEqual(result.focus.guard, { kind: 'none' });
  assert.equal(result.notice.kind, 'removed');
});

test('READY has no action to protect: a ticket leaving it is routine, with no notice and no hold', () => {
  const tickets = [ticket('r1', 'READY', 1), ticket('r2', 'READY', 2)];
  const focus = pinned(tickets, 'r1', 'READY');
  const result = reconcile(focus, [ticket('r2', 'READY', 2)]);
  assert.equal(result.focus.ticketId, 'r2');
  assert.deepEqual(result.focus.guard, { kind: 'none' });
  assert.equal(result.notice, null);
});

test('an action is refused for any ticket that is not the focused one right now (a reorder cannot redirect a tap)', () => {
  const focus = pinned(board(), 'b');
  assert.equal(kitchenActionHold(focus, 'b', NOW), null);
  assert.equal(kitchenActionHold(focus, 'a', NOW), 'not-focused');
  assert.equal(kitchenActionHold(focus, 'unknown', NOW), 'not-focused');
  assert.equal(kitchenActionHold(initialKitchenFocus(), 'a', NOW), 'not-focused');
});

test('choosing a tab returns to the ticket last focused there, else the longest-waiting one', () => {
  const tickets = [...board(), ticket('p2', 'PREPARING', 8)];
  let focus = pinned(tickets, 'b');
  focus = selectKitchenStage(focus, 'PREPARING', stages(tickets), options);
  assert.equal(focus.ticketId, 'p1'); // never visited: the longest waiting
  focus = selectKitchenTicket(focus, 'PREPARING', 'p2', stages(tickets), options);
  focus = selectKitchenStage(focus, 'ACCEPTED', stages(tickets), options);
  assert.equal(focus.ticketId, 'b'); // remembered by id
  focus = selectKitchenStage(focus, 'PREPARING', stages(tickets), options);
  assert.equal(focus.ticketId, 'p2');
  // The remembered ticket left that stage meanwhile: fall back to the head.
  const without = tickets.filter((entry) => entry.id !== 'p2');
  assert.equal(selectKitchenStage(focus, 'PREPARING', stages(without), options).ticketId, 'p1');
});

test('selecting or stepping is explicit: it clears any guard and never leaves the stage or runs past the ends', () => {
  const focus = pinned(board(), 'a');
  const guarded = { ...focus, guard: { kind: 'confirm', ticketId: 'a' } };
  const chosen = selectKitchenTicket(guarded, 'ACCEPTED', 'c', stages(board()), options);
  assert.equal(chosen.ticketId, 'c');
  assert.deepEqual(chosen.guard, { kind: 'none' });
  assert.equal(selectKitchenTicket(focus, 'ACCEPTED', 'nope', stages(board()), options), focus);

  assert.equal(stepKitchenFocus(focus, 1, stages(board()), options).ticketId, 'b');
  assert.equal(stepKitchenFocus(focus, -1, stages(board()), options), focus); // already first
  const last = stepKitchenFocus(stepKitchenFocus(focus, 1, stages(board()), options), 1, stages(board()), options);
  assert.equal(last.ticketId, 'c');
  assert.equal(stepKitchenFocus(last, 1, stages(board()), options), last);
});

test('reconciling never mutates its inputs and is stable for the same data', () => {
  const tickets = board();
  const snapshot = JSON.stringify(tickets);
  const focus = pinned(tickets, 'b');
  const frozen = JSON.stringify(focus);
  const first = reconcile(focus, tickets);
  const second = reconcile(first.focus, tickets);
  assert.equal(JSON.stringify(tickets), snapshot);
  assert.equal(JSON.stringify(focus), frozen);
  assert.deepEqual(second.focus, first.focus);
  assert.deepEqual(ids(stages(tickets).ACCEPTED), ['a', 'b', 'c']);
});
