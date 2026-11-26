import test from 'node:test';
import assert from 'node:assert/strict';
import { answersRequest, createRequestId, isOutdated, schedulePreview, StalePreviewError } from './preview-session.ts';

const planned = (value) => ({ draft: { value }, branchId: 'b1', orderType: 'PICKUP' });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

function recorder() {
  const events = [];
  return {
    events,
    options: (fetcher) => ({
      fetcher, delayMs: 1,
      onPending: (id) => events.push(['pending', id]),
      onResult: (id, answer) => events.push(['result', id, answer.state]),
      onError: (id, caught) => events.push(['error', id, caught instanceof StalePreviewError ? 'stale' : String(caught)]),
    }),
  };
}

test('request ids satisfy the Backend token format and never repeat', () => {
  const ids = new Set(Array.from({ length: 200 }, createRequestId));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9._-]{8,64}$/);
});

test('an answer counts only when it echoes the id that was asked', () => {
  assert.equal(answersRequest('a', { requestId: 'a' }), true);
  assert.equal(answersRequest('a', { requestId: 'b' }), false);
  assert.equal(answersRequest('a', null), false);
  assert.equal(answersRequest('a', {}), false);
});

test('the request carries the contract and its own id; the draft is sent unchanged', async () => {
  const sent = [];
  const rec = recorder();
  schedulePreview(planned('10'), rec.options(async (request) => { sent.push(request); return { state: 'REAL', requestId: request.requestId }; }));
  await tick();
  assert.equal(sent[0].contract, 'CONTEXTUAL_V1');
  assert.match(sent[0].requestId, /^[A-Za-z0-9._-]{8,64}$/);
  assert.equal(sent[0].draft.value, '10');
  assert.deepEqual(rec.events.map((e) => e[0]), ['pending', 'result']);
});

test('rapid edits: a superseded request never reports, even when its slow answer arrives last', async () => {
  const rec = recorder();
  const slow = deferred();
  const requests = [];
  const fetcher = (request, signal) => {
    requests.push({ request, signal });
    return requests.length === 1 ? slow.promise : Promise.resolve({ state: 'REAL', requestId: request.requestId });
  };
  const cancelFirst = schedulePreview(planned('1'), rec.options(fetcher));
  await tick(); // first request in flight
  cancelFirst(); // user edits again: effect cleanup
  assert.equal(requests[0].signal.aborted, true, 'the superseded fetch is aborted');
  schedulePreview(planned('12'), rec.options(fetcher));
  await tick();
  slow.resolve({ state: 'REAL', requestId: requests[0].request.requestId }); // the old answer arrives late
  await tick();
  const results = rec.events.filter((e) => e[0] === 'result');
  assert.equal(results.length, 1);
  assert.equal(results[0][1], requests[1].request.requestId, 'only the newest answer is shown');
});

test('typing faster than the debounce sends nothing for the intermediate drafts', async () => {
  const rec = recorder();
  const sent = [];
  const fetcher = async (request) => { sent.push(request.draft.value); return { state: 'REAL', requestId: request.requestId }; };
  const options = { ...rec.options(fetcher), delayMs: 20 };
  let cancel = schedulePreview(planned('1'), options);
  for (const value of ['12', '123', '1234']) { cancel(); cancel = schedulePreview(planned(value), options); }
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(sent, ['1234']);
});

test('an answer for another request id is treated as a failure, never shown', async () => {
  const rec = recorder();
  schedulePreview(planned('10'), rec.options(async () => ({ state: 'REAL', requestId: 'someone-else-1234' })));
  await tick();
  assert.deepEqual(rec.events.map((e) => e[0]), ['pending', 'error']);
  assert.equal(rec.events[1][2], 'stale');
});

test('a failed request reports an error and never a result', async () => {
  const rec = recorder();
  schedulePreview(planned('10'), rec.options(async () => { throw new Error('network'); }));
  await tick();
  assert.deepEqual(rec.events.map((e) => e[0]), ['pending', 'error']);
});

test('cancelling before the debounce fires sends nothing', async () => {
  const rec = recorder();
  let called = 0;
  const cancel = schedulePreview(planned('10'), { ...rec.options(async () => { called += 1; }), delayMs: 20 });
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(called, 0);
  assert.deepEqual(rec.events, []);
});

test('only an answer to an older question is outdated', () => {
  assert.equal(isOutdated('a', 'a'), false);
  assert.equal(isOutdated('a', 'b'), true);
  assert.equal(isOutdated(null, 'b'), false);
  assert.equal(isOutdated('a', null), false);
});
