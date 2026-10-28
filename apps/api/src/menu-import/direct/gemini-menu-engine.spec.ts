import {
  engineLimits,
  GeminiMenuEngine,
  type EngineConfig,
  type WorkItem,
} from './gemini-menu-engine';
import { KeyPool, type PoolKey } from './gemini-key-pool';
import type { ModelRequest, ModelResponse } from './gemini-transport';

const containing = (text: string) => expect.stringContaining(text) as string;

const KEY_A: PoolKey = { id: 'a', value: 'secret-value-a' };
const KEY_B: PoolKey = { id: 'b', value: 'secret-value-b' };
const KEY_C: PoolKey = { id: 'c', value: 'secret-value-c' };

const good = (text = '{"categories":[]}'): ModelResponse => ({
  status: 200,
  body: { choices: [{ message: { content: text }, finish_reason: 'stop' }] },
});
const status = (code: number, body: unknown = null): ModelResponse => ({
  status: code,
  body,
});
const limited = (retryDelay?: string): ModelResponse =>
  status(
    429,
    retryDelay
      ? [{ error: { code: 429, details: [{ retryDelay }] } }]
      : [{ error: { code: 429 } }],
  );

const items = (count: number): WorkItem[] =>
  Array.from({ length: count }, (_, i) => ({
    content: [{ type: 'text' as const, text: `file-${i}` }],
  }));
const fileOf = (request: ModelRequest) =>
  (request.body as { messages: { content: { text: string }[] }[] }).messages[1]
    .content[0].text;
const modelOf = (request: ModelRequest) =>
  (request.body as { model: string }).model;

function setup(
  handler: (request: ModelRequest, call: number) => ModelResponse,
  overrides: Partial<EngineConfig> = {},
) {
  const clock = { now: 0 };
  const sleeps: number[] = [];
  const logs: string[] = [];
  const calls: ModelRequest[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const pool = new KeyPool(() => clock.now);
  const engine = new GeminiMenuEngine({
    pool,
    now: () => clock.now,
    sleep: (ms) => {
      sleeps.push(ms);
      clock.now += ms;
      return Promise.resolve();
    },
    log: (message) => logs.push(message),
    transport: async (request) => {
      calls.push(request);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setImmediate(resolve)); // let the others start
      inFlight -= 1;
      return handler(request, calls.length);
    },
  });
  const config: EngineConfig = {
    apiUrl: 'http://model.test/chat',
    model: 'm1',
    fallbackModel: 'm2',
    systemPrompt: 'system',
    reasoningEffort: 'low',
    maxTokens: 100,
    ...engineLimits(300),
    ...overrides,
  };
  return {
    pool,
    sleeps,
    logs,
    calls,
    clock,
    maxInFlight: () => maxInFlight,
    run: (list: WorkItem[], keys: PoolKey[]) => engine.run(list, keys, config),
  };
}

describe('engineLimits', () => {
  it('stops starting new attempts well before the Backend gives up', () => {
    expect(engineLimits(300)).toMatchObject({
      softDeadlineMs: 180_000,
      hardDeadlineMs: 280_000,
      maxParallel: 4,
      maxTransient: 3,
    });
    expect(engineLimits(120)).toMatchObject({
      softDeadlineMs: 40_000,
      hardDeadlineMs: 100_000,
    });
    expect(engineLimits(10)).toMatchObject({
      hardDeadlineMs: 30_000,
      softDeadlineMs: 10_000,
    });
  });
});

describe('GeminiMenuEngine', () => {
  it('asks once per file, keeps the order and sends the prompt, model and file', async () => {
    const t = setup(() => good());
    const results = await t.run(items(3), [KEY_A]);
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(t.calls.map(fileOf).sort()).toEqual(['file-0', 'file-1', 'file-2']);
    const body = t.calls[0].body as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'm1',
      max_tokens: 100,
      reasoning_effort: 'low',
    });
    expect((body.messages as { role: string; content: unknown }[])[0]).toEqual({
      role: 'system',
      content: 'system',
    });
    expect(t.calls[0].url).toBe('http://model.test/chat');
  });

  it('keeps the answers in the order of the files even when they finish in another order', async () => {
    const t = setup((request) => good(`answer for ${fileOf(request)}`));
    const results = await t.run(items(5), [KEY_A, KEY_B]);
    expect(results.map((r) => (r.ok ? r.text : r.code))).toEqual(
      [0, 1, 2, 3, 4].map((i) => `answer for file-${i}`),
    );
  });

  it('leaves the reasoning field out when it is not set', async () => {
    const t = setup(() => good(), { reasoningEffort: null });
    await t.run(items(1), [KEY_A]);
    expect(t.calls[0].body).not.toHaveProperty('reasoning_effort');
  });

  it('spreads files that run together over the free keys', async () => {
    const t = setup(() => good());
    await t.run(items(3), [KEY_A, KEY_B, KEY_C]);
    expect(new Set(t.calls.map((c) => c.apiKey)).size).toBe(3);
  });

  it('never runs more than four files at the same time', async () => {
    const t = setup(() => good());
    const results = await t.run(items(10), [KEY_A, KEY_B]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(t.maxInFlight()).toBe(4);
  });

  it('moves a file to another key at once when its key hits a limit, and leaves that key alone', async () => {
    const t = setup((request) =>
      request.apiKey === KEY_A.value ? limited('45s') : good(),
    );
    const results = await t.run(items(2), [KEY_A, KEY_B]);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(t.calls.filter((c) => c.apiKey === KEY_A.value)).toHaveLength(1);
    expect(t.pool.isPaused('a')).toBe(true);
    expect(t.sleeps).toEqual([]); // nothing to wait for
  });

  it('waits a little for the only key to recover, then goes on', async () => {
    const t = setup((_, call) => (call === 1 ? limited('5s') : good()));
    const [result] = await t.run(items(1), [KEY_A]);
    expect(result.ok).toBe(true);
    expect(t.sleeps).toEqual([5_750]);
    expect(t.calls).toHaveLength(2);
  });

  it('answers MODEL_BUSY, without waiting for ever, when every key is at its limit for long', async () => {
    const t = setup(() => limited('300s'));
    const results = await t.run(items(2), [KEY_A, KEY_B]);
    expect(results).toEqual([
      {
        ok: false,
        code: 'MODEL_BUSY',
        message: containing('limit'),
      },
      {
        ok: false,
        code: 'MODEL_BUSY',
        message: containing('limit'),
      },
    ]);
    expect(t.sleeps).toEqual([]);
    // a file may reach the second key before that key's own answer came back, but nobody keeps asking
    expect(t.calls.length).toBeLessThanOrEqual(3);
    expect(t.pool.isPaused('a') && t.pool.isPaused('b')).toBe(true);
  });

  it('puts a rejected key aside for a long time and uses another', async () => {
    const t = setup((request) =>
      request.apiKey === KEY_A.value ? status(403) : good(),
    );
    const results = await t.run(items(2), [KEY_A, KEY_B]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(t.pool.isPaused('a')).toBe(true);
    expect(t.calls.filter((c) => c.apiKey === KEY_A.value)).toHaveLength(1);
  });

  it('answers MODEL_BUSY when the only key is rejected', async () => {
    const t = setup(() => status(401));
    const [result] = await t.run(items(1), [KEY_A]);
    expect(result).toMatchObject({ ok: false, code: 'MODEL_BUSY' });
    expect(t.calls).toHaveLength(1);
  });

  it('retries a server hiccup after a short pause, with the fallback model', async () => {
    const t = setup((_, call) => (call === 1 ? status(503) : good()));
    const [result] = await t.run(items(1), [KEY_A]);
    expect(result.ok).toBe(true);
    expect(t.calls.map(modelOf)).toEqual(['m1', 'm2']);
    expect(t.sleeps).toEqual([2_000]);
  });

  it('keeps the same model on a retry when there is no fallback model', async () => {
    const t = setup((_, call) => (call === 1 ? status(500) : good()), {
      fallbackModel: null,
    });
    await t.run(items(1), [KEY_A]);
    expect(t.calls.map(modelOf)).toEqual(['m1', 'm1']);
  });

  it('gives up on an overloaded model after four tries with MODEL_BUSY', async () => {
    const t = setup(() => status(503, { error: { message: 'high demand' } }));
    const [result] = await t.run(items(1), [KEY_A]);
    expect(result).toMatchObject({ ok: false, code: 'MODEL_BUSY' });
    expect(t.calls).toHaveLength(4);
    expect(t.sleeps).toEqual([2_000, 4_000, 6_000]);
  });

  it('gives up on a broken model with MODEL_ERROR, and on no answer at all', async () => {
    for (const code of [500, 502, 0]) {
      const t = setup(() => status(code));
      const [result] = await t.run(items(1), [KEY_A]);
      expect(result).toMatchObject({ ok: false, code: 'MODEL_ERROR' });
      expect(t.calls).toHaveLength(4);
    }
  });

  it('does not ask again after a request the model refuses', async () => {
    const t = setup(() =>
      status(400, { error: { message: 'Unable to process input image' } }),
    );
    const [result] = await t.run(items(1), [KEY_A]);
    expect(result).toMatchObject({
      ok: false,
      code: 'MODEL_ERROR',
      message: containing('400'),
    });
    expect(t.calls).toHaveLength(1);
  });

  it('stops starting new attempts after the soft deadline', async () => {
    const t = setup(() => status(503), { softDeadlineMs: 3_000 });
    const [result] = await t.run(items(1), [KEY_A]);
    expect(result).toMatchObject({ ok: false, code: 'MODEL_BUSY' });
    expect(t.calls).toHaveLength(2);
    expect(t.clock.now).toBe(3_000);
  });

  it("cuts a request's timeout to fit the hard deadline", async () => {
    const t = setup(() => good(), {
      hardDeadlineMs: 5_000,
      callTimeoutMs: 120_000,
    });
    await t.run(items(1), [KEY_A]);
    expect(t.calls[0].timeoutMs).toBe(5_000);
    const longer = setup(() => good());
    await longer.run(items(1), [KEY_A]);
    expect(longer.calls[0].timeoutMs).toBe(60_000);
  });

  it('says why a call got no answer, and calls a model that only hangs busy', async () => {
    const hang = (): ModelResponse => ({
      status: 0,
      body: null,
      failure: 'timeout',
    });
    const t = setup(() => hang());
    const [result] = await t.run(items(1), [KEY_A]);
    expect(result).toMatchObject({ ok: false, code: 'MODEL_BUSY' });
    expect(t.calls).toHaveLength(4);
    expect(t.logs).toEqual([
      containing('nothing (timeout), try 1'),
      containing('nothing (timeout), try 2'),
      containing('nothing (timeout), try 3'),
      containing('nothing (timeout), try 4'),
    ]);
    expect(t.logs.join(' ')).not.toContain('secret-value');
  });

  it('keeps MODEL_ERROR for a connection that keeps failing', async () => {
    const t = setup(() => ({
      status: 0,
      body: null,
      failure: 'ECONNRESET',
    }));
    const [result] = await t.run(items(1), [KEY_A]);
    expect(result).toMatchObject({ ok: false, code: 'MODEL_ERROR' });
    expect(t.logs[0]).toContain('nothing (ECONNRESET), try 1');
  });

  it('lets the files that worked through when others fail', async () => {
    const t = setup((request) =>
      fileOf(request) === 'file-1'
        ? status(400)
        : good(`ok ${fileOf(request)}`),
    );
    const results = await t.run(items(3), [KEY_A]);
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
  });

  it('answers MODEL_BUSY for every file when there is no key at all', async () => {
    const t = setup(() => good());
    const results = await t.run(items(2), []);
    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual([
      'MODEL_BUSY',
      'MODEL_BUSY',
    ]);
    expect(t.calls).toHaveLength(0);
  });

  it('returns nothing for nothing', async () => {
    const t = setup(() => good());
    expect(await t.run([], [KEY_A])).toEqual([]);
  });

  it('never writes a key value to the log or the messages', async () => {
    const t = setup((request) =>
      request.apiKey === KEY_A.value ? limited() : status(503),
    );
    const results = await t.run(items(2), [KEY_A, KEY_B]);
    const everything = JSON.stringify([t.logs, results]);
    expect(everything).not.toContain('secret-value');
    expect(t.logs.length).toBeGreaterThan(0);
  });
});
