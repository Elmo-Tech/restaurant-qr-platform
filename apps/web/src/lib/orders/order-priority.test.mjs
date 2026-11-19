import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_STATUSES,
  COMPLETED_STATUSES,
  ORDER_PRIORITY_GROUPS,
  effectiveSort,
  filterOrders,
  groupOrdersByPriority,
  priorityGroupOf,
  sortsForView,
} from './order-views.ts';
import { nextStepFor } from './transitions.ts';

// Phase 1 PR 1: Orders priority queue + informational next-step hint.

let seq = 0;
function order(status, createdAt, overrides = {}) {
  seq += 1;
  return {
    id: overrides.id ?? `order-${String(seq).padStart(3, '0')}`,
    status,
    type: overrides.type ?? 'DINE_IN',
    createdAt,
    branch: { id: 'b1', name: 'Main' },
    table: { tableNumber: String(seq) },
    customer: null,
    deliveryZoneName: null,
    itemCount: 1,
    totalAmount: '10.00',
    currencyCode: 'EGP',
    ...overrides,
  };
}

const at = (minute) => `2026-11-19T10:${String(minute).padStart(2, '0')}:00.000Z`;
const ids = (list) => list.map((o) => o.id);
const base = { type: null, status: null, search: '' };

test('every active status has exactly one group; completed statuses have none', () => {
  assert.equal(priorityGroupOf('PENDING'), 'needsDecision');
  assert.equal(priorityGroupOf('READY'), 'readyForHandoff');
  assert.equal(priorityGroupOf('ACCEPTED'), 'inProgress');
  assert.equal(priorityGroupOf('PREPARING'), 'inProgress');
  // Already left the restaurant: never "waiting for handoff".
  assert.equal(priorityGroupOf('OUT_FOR_DELIVERY'), 'inDelivery');
  for (const status of ACTIVE_STATUSES) assert.ok(ORDER_PRIORITY_GROUPS.includes(priorityGroupOf(status)));
  for (const status of COMPLETED_STATUSES) assert.equal(priorityGroupOf(status), null);
  assert.deepEqual(ORDER_PRIORITY_GROUPS, ['needsDecision', 'readyForHandoff', 'inProgress', 'inDelivery']);
});

test('priority groups in the approved order, oldest first, across order types', () => {
  const orders = [
    order('OUT_FOR_DELIVERY', at(1), { id: 'ofd', type: 'DELIVERY' }),
    order('PREPARING', at(2), { id: 'prep', type: 'PICKUP' }),
    order('READY', at(9), { id: 'ready-new', type: 'DELIVERY' }),
    order('PENDING', at(8), { id: 'pend-new', type: 'PICKUP' }),
    order('ACCEPTED', at(1), { id: 'acc-old' }),
    order('READY', at(3), { id: 'ready-old' }),
    order('PENDING', at(5), { id: 'pend-old', type: 'DELIVERY' }),
  ];
  const sections = groupOrdersByPriority(orders);
  assert.deepEqual(
    sections.map((s) => [s.group, ids(s.orders)]),
    [
      ['needsDecision', ['pend-old', 'pend-new']],
      ['readyForHandoff', ['ready-old', 'ready-new']],
      ['inProgress', ['acc-old', 'prep']],
      ['inDelivery', ['ofd']],
    ],
  );
  // The flat priority sort agrees with the grouped rendering.
  const sorted = filterOrders(orders, { ...base, view: 'active', sort: 'priority' });
  assert.deepEqual(ids(sorted), sections.flatMap((s) => ids(s.orders)));
});

test('ties on createdAt break by id, independent of input order (stable across polls)', () => {
  const a = order('PENDING', at(5), { id: 'b-2' });
  const b = order('PENDING', at(5), { id: 'a-1' });
  const c = order('PENDING', at(5), { id: 'c-3' });
  const first = ids(groupOrdersByPriority([a, b, c])[0].orders);
  const second = ids(groupOrdersByPriority([c, a, b])[0].orders);
  assert.deepEqual(first, ['a-1', 'b-2', 'c-3']);
  assert.deepEqual(second, first);
});

test('no duplicate groups, no empty groups, no missing or duplicated orders', () => {
  const orders = [];
  for (let i = 0; i < 40; i += 1) {
    orders.push(order(ACTIVE_STATUSES[i % ACTIVE_STATUSES.length], at(i % 50), {
      type: ['DINE_IN', 'PICKUP', 'DELIVERY'][i % 3],
    }));
  }
  const sections = groupOrdersByPriority(orders);
  const groups = sections.map((s) => s.group);
  assert.equal(new Set(groups).size, groups.length);
  assert.ok(sections.every((s) => s.orders.length > 0));
  const flat = sections.flatMap((s) => ids(s.orders));
  assert.equal(flat.length, orders.length);
  assert.deepEqual([...flat].sort(), ids(orders).sort());
  // Empty groups are omitted entirely.
  assert.deepEqual(groupOrdersByPriority([order('READY', at(1))]).map((s) => s.group), ['readyForHandoff']);
  assert.deepEqual(groupOrdersByPriority([]), []);
  // Grouping never mutates the caller's array.
  const input = [order('PREPARING', at(1)), order('PENDING', at(2))];
  const before = ids(input);
  groupOrdersByPriority(input);
  assert.deepEqual(ids(input), before);
});

test('completed orders never enter the priority groups', () => {
  const sections = groupOrdersByPriority([
    order('SERVED', at(1)),
    order('REJECTED', at(2)),
    order('CANCELLED', at(3)),
    order('PENDING', at(4), { id: 'p' }),
  ]);
  assert.deepEqual(sections.map((s) => [s.group, ids(s.orders)]), [['needsDecision', ['p']]]);
});

test('sort defaults: Active -> priority, Completed/All -> newest; explicit deep links win', () => {
  assert.equal(effectiveSort('active', null), 'priority');
  assert.equal(effectiveSort('completed', null), 'newest');
  assert.equal(effectiveSort('all', null), 'newest');
  // Dashboard deep links (?status=PENDING|READY&sort=oldest) keep their explicit sort.
  assert.equal(effectiveSort('active', 'oldest'), 'oldest');
  assert.equal(effectiveSort('active', 'newest'), 'newest');
  assert.equal(effectiveSort('completed', 'oldest'), 'oldest');
  // Priority is Active-only: elsewhere the view default applies.
  assert.equal(effectiveSort('completed', 'priority'), 'newest');
  assert.equal(effectiveSort('all', 'priority'), 'newest');
  assert.deepEqual(sortsForView('active'), ['priority', 'newest', 'oldest']);
  assert.deepEqual(sortsForView('completed'), ['newest', 'oldest']);
  assert.deepEqual(sortsForView('all'), ['newest', 'oldest']);
});

test('explicit newest/oldest sorting and Completed/All views are unchanged', () => {
  const orders = [
    order('PENDING', at(3), { id: 'p3' }),
    order('READY', at(1), { id: 'r1' }),
    order('SERVED', at(2), { id: 's2' }),
    order('CANCELLED', at(4), { id: 'c4' }),
  ];
  assert.deepEqual(ids(filterOrders(orders, { ...base, view: 'active', sort: 'oldest' })), ['r1', 'p3']);
  assert.deepEqual(ids(filterOrders(orders, { ...base, view: 'active', sort: 'newest' })), ['p3', 'r1']);
  assert.deepEqual(ids(filterOrders(orders, { ...base, view: 'completed', sort: 'newest' })), ['c4', 's2']);
  assert.deepEqual(ids(filterOrders(orders, { ...base, view: 'all', sort: 'newest' })), ['c4', 'p3', 's2', 'r1']);
  // Omitted sort keeps the historical newest-first behaviour.
  assert.deepEqual(ids(filterOrders(orders, { ...base, view: 'all' })), ['c4', 'p3', 's2', 'r1']);
  // Status filter from a Dashboard deep link still narrows the priority queue.
  assert.deepEqual(
    ids(filterOrders(orders, { ...base, view: 'active', status: 'READY', sort: 'priority' })),
    ['r1'],
  );
});

const ALL = [
  'orders.accept', 'orders.reject', 'orders.cancel', 'orders.markServed', 'kitchen.update',
];

test('next step: first permitted non-destructive action, type-aware wording', () => {
  assert.deepEqual(nextStepFor('PENDING', 'DINE_IN', ALL), {
    kind: 'action', to: 'ACCEPTED', labelKey: 'orders.action.accept',
  });
  assert.equal(nextStepFor('ACCEPTED', 'PICKUP', ALL).labelKey, 'orders.action.startPreparing');
  assert.equal(nextStepFor('PREPARING', 'DELIVERY', ALL).labelKey, 'orders.action.markReady');
  assert.equal(nextStepFor('READY', 'DINE_IN', ALL).labelKey, 'orders.action.markServed');
  assert.equal(nextStepFor('READY', 'PICKUP', ALL).labelKey, 'orders.action.markPickedUp');
});

test('next step preserves DELIVERY transitions: READY -> OUT_FOR_DELIVERY -> SERVED', () => {
  assert.deepEqual(nextStepFor('READY', 'DELIVERY', ALL), {
    kind: 'action', to: 'OUT_FOR_DELIVERY', labelKey: 'orders.action.outForDelivery',
  });
  assert.deepEqual(nextStepFor('OUT_FOR_DELIVERY', 'DELIVERY', ALL), {
    kind: 'action', to: 'SERVED', labelKey: 'orders.action.markDelivered',
  });
  // Never suggests skipping OUT_FOR_DELIVERY.
  assert.notEqual(nextStepFor('READY', 'DELIVERY', ALL).to, 'SERVED');
});

test('next step never claims a transition the Membership lacks; never suggests Reject/Cancel', () => {
  // Reject-only cashier on a PENDING order: neutral status, not "Next: Reject".
  assert.deepEqual(nextStepFor('PENDING', 'DINE_IN', ['orders.reject']), {
    kind: 'status', labelKey: 'orders.card.waiting.PENDING',
  });
  // Cancel-only on kitchen statuses: neutral.
  assert.equal(nextStepFor('ACCEPTED', 'DINE_IN', ['orders.cancel']).kind, 'status');
  assert.equal(nextStepFor('PREPARING', 'DINE_IN', ['orders.cancel']).kind, 'status');
  // Kitchen-only staff cannot serve.
  assert.deepEqual(nextStepFor('READY', 'DINE_IN', ['kitchen.update']), {
    kind: 'status', labelKey: 'orders.card.waiting.READY',
  });
  // Waiter-like: can serve READY, but PENDING stays neutral.
  assert.equal(nextStepFor('READY', 'PICKUP', ['orders.markServed']).kind, 'action');
  assert.equal(nextStepFor('PENDING', 'PICKUP', ['orders.markServed']).kind, 'status');
});

test('read-only users get neutral copy for every active status and nothing for completed', () => {
  for (const type of ['DINE_IN', 'PICKUP', 'DELIVERY']) {
    for (const status of ACTIVE_STATUSES) {
      const step = nextStepFor(status, type, []);
      assert.deepEqual(step, { kind: 'status', labelKey: `orders.card.waiting.${status}` });
    }
    for (const status of COMPLETED_STATUSES) assert.equal(nextStepFor(status, type, ALL), null);
  }
});
