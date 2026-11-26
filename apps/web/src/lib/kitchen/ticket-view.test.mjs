import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KITCHEN_ALERT_MINUTES,
  KITCHEN_WARN_MINUTES,
  groupKitchenModifiers,
  kitchenDelayLevel,
  sortKitchenTickets,
} from './ticket-view.ts';

// Kitchen K2: ticket readability and time priority. Pure rules only.
const at = (minute) => new Date(Date.UTC(2026, 10, 26, 12, minute)).toISOString();
const ticket = (id, statusSince, createdAt = statusSince) => ({ id, statusSince, createdAt, status: 'ACCEPTED' });
const ids = (tickets) => tickets.map((entry) => entry.id);

test('the approved thresholds are unchanged: warning at 10 minutes, alert at 20', () => {
  assert.equal(KITCHEN_WARN_MINUTES, 10);
  assert.equal(KITCHEN_ALERT_MINUTES, 20);
});

test('delay level follows the thresholds at the exact boundaries', () => {
  for (const status of ['ACCEPTED', 'PREPARING']) {
    assert.equal(kitchenDelayLevel(status, 0), 'none');
    assert.equal(kitchenDelayLevel(status, 9), 'none');
    assert.equal(kitchenDelayLevel(status, 10), 'warn');
    assert.equal(kitchenDelayLevel(status, 19), 'warn');
    assert.equal(kitchenDelayLevel(status, 20), 'alert');
    assert.equal(kitchenDelayLevel(status, 240), 'alert');
  }
});

test('a READY ticket is never delayed: it only waits for service, which is not a kitchen step', () => {
  assert.equal(kitchenDelayLevel('READY', 5), 'none');
  assert.equal(kitchenDelayLevel('READY', 25), 'none');
  assert.equal(kitchenDelayLevel('READY', 600), 'none');
});

test('tickets sort longest-waiting-in-stage first, by when the stage began, not by creation', () => {
  const sorted = sortKitchenTickets([
    ticket('accepted-just-now', at(50), at(0)), // created first, accepted last
    ticket('waiting-longest', at(10), at(20)),
    ticket('middle', at(30), at(25)),
  ]);
  assert.deepEqual(ids(sorted), ['waiting-longest', 'middle', 'accepted-just-now']);
});

test('ties break by creation time, then by id, whatever order the API returned', () => {
  const tied = [
    ticket('b', at(10), at(5)),
    ticket('c', at(10), at(5)),
    ticket('a', at(10), at(5)),
    ticket('older', at(10), at(2)),
  ];
  const expected = ['older', 'a', 'b', 'c'];
  assert.deepEqual(ids(sortKitchenTickets(tied)), expected);
  assert.deepEqual(ids(sortKitchenTickets([...tied].reverse())), expected);
  assert.deepEqual(ids(sortKitchenTickets([tied[2], tied[0], tied[3], tied[1]])), expected);
});

test('sorting never mutates its input and tolerates an unparseable timestamp (it sorts last)', () => {
  const input = [ticket('bad', 'not-a-date', 'not-a-date'), ticket('good', at(10)), ticket('bad-too', 'nope', 'nope')];
  const snapshot = ids(input);
  const sorted = sortKitchenTickets(input);
  assert.deepEqual(ids(input), snapshot);
  assert.deepEqual(ids(sorted), ['good', 'bad', 'bad-too']);
});

test('modifiers are listed under their own group name, in the order the Guest saw them', () => {
  const groups = groupKitchenModifiers([
    { groupName: 'Extras', optionName: 'Extra cheese' },
    { groupName: 'Remove', optionName: 'No onions' },
    { groupName: 'Extras', optionName: 'Mushrooms' },
  ]);
  assert.deepEqual(groups, [
    { groupName: 'Extras', options: ['Extra cheese', 'Mushrooms'] },
    { groupName: 'Remove', options: ['No onions'] },
  ]);
});

test('options without a group name stay together and are not attached to a named group', () => {
  assert.deepEqual(
    groupKitchenModifiers([
      { groupName: 'Sauce', optionName: 'Garlic' },
      { groupName: '  ', optionName: 'Well done' },
      { groupName: '', optionName: 'Cut in 8' },
    ]),
    [
      { groupName: 'Sauce', options: ['Garlic'] },
      { groupName: null, options: ['Well done', 'Cut in 8'] },
    ],
  );
  assert.deepEqual(groupKitchenModifiers([]), []);
});
