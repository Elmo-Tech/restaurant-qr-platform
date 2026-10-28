import {
  BAD_KEY_PAUSE_MS,
  classify,
  DAILY_PAUSE_MS,
  failureCode,
  SHORT_PAUSE_MS,
} from './gemini-transport';

const ok = (content: unknown, finish: string | null = 'stop') => ({
  status: 200,
  body: { choices: [{ message: { content }, finish_reason: finish }] },
});

describe("classify (the model's answer)", () => {
  it('reads the text of a good answer, whether it is a string or a list of parts', () => {
    expect(classify(ok('  {"a":1}  '))).toEqual({
      kind: 'ok',
      text: '{"a":1}',
      finishReason: 'stop',
    });
    expect(classify(ok([{ text: '{"a"' }, { text: ':1}' }], 'length'))).toEqual(
      {
        kind: 'ok',
        text: '{"a":1}',
        finishReason: 'length',
      },
    );
    expect(classify(ok(null, null))).toEqual({
      kind: 'ok',
      text: '',
      finishReason: null,
    });
  });

  it('treats a 200 without choices as a hiccup', () => {
    expect(classify({ status: 200, body: { nope: true } }).kind).toBe(
      'transient',
    );
    expect(classify({ status: 200, body: null }).kind).toBe('transient');
  });

  it('puts a key aside when it hits its limit, for as long as the provider asks', () => {
    expect(
      classify({ status: 429, body: [{ error: { message: 'quota' } }] }),
    ).toEqual({
      kind: 'limited',
      pauseMs: SHORT_PAUSE_MS,
    });
    const withDelay = classify({
      status: 429,
      body: [{ error: { code: 429, details: [{ retryDelay: '34s' }] } }],
    });
    expect(withDelay).toEqual({ kind: 'limited', pauseMs: 34_500 });
    expect(classify({ status: 429, body: 'Please retry in 12.5s.' })).toEqual({
      kind: 'limited',
      pauseMs: 13_000,
    });
  });

  it('puts a key aside for an hour when its daily quota is used up, and never longer', () => {
    expect(
      classify({
        status: 429,
        body: {
          error: { message: 'Quota exceeded for GenerateRequestsPerDay' },
        },
      }),
    ).toEqual({
      kind: 'limited',
      pauseMs: DAILY_PAUSE_MS,
    });
    expect(
      classify({ status: 429, body: { details: [{ retryDelay: '999999s' }] } }),
    ).toEqual({ kind: 'limited', pauseMs: DAILY_PAUSE_MS });
  });

  it('recognizes a key the provider rejects', () => {
    expect(classify({ status: 401, body: null })).toEqual({ kind: 'badKey' });
    expect(
      classify({ status: 403, body: { error: { message: 'denied' } } }),
    ).toEqual({ kind: 'badKey' });
    expect(
      classify({
        status: 400,
        body: [
          {
            error: {
              message: 'API key not valid. Please pass a valid API key.',
            },
          },
        ],
      }),
    ).toEqual({ kind: 'badKey' });
    expect(BAD_KEY_PAUSE_MS).toBeGreaterThan(DAILY_PAUSE_MS);
  });

  it('calls a server problem, a timeout or no answer a hiccup worth retrying', () => {
    for (const status of [0, 408, 500, 502, 503, 504]) {
      expect(classify({ status, body: null }).kind).toBe('transient');
    }
    expect(
      classify({
        status: 503,
        body: {
          error: {
            message: 'This model is currently experiencing high demand.',
          },
        },
      }),
    ).toEqual({
      kind: 'transient',
      status: 503,
      detail: 'This model is currently experiencing high demand.',
    });
  });

  it('keeps the reason a call got no answer, as a short code', () => {
    expect(classify({ status: 0, body: null, failure: 'timeout' })).toEqual({
      kind: 'transient',
      status: 0,
      detail: 'timeout',
    });
    expect(classify({ status: 0, body: null })).toEqual({
      kind: 'transient',
      status: 0,
      detail: '',
    });
  });

  it('turns a failed fetch into a safe code: never its message, which can carry the address or the key', () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    expect(failureCode(timeout)).toBe('timeout');

    const reset = new TypeError('fetch failed Bearer secret-key-value', {
      cause: { code: 'ECONNRESET' },
    });
    expect(failureCode(reset)).toBe('ECONNRESET');

    const noCode = new TypeError('fetch failed https://host/?key=secret');
    expect(failureCode(noCode)).toBe('TypeError');

    const odd = new Error('x', { cause: { code: 'has spaces & symbols' } });
    expect(failureCode(odd)).toBe('Error');
    expect(failureCode('a string')).toBe('unknown');
  });

  it('calls anything else a wrong request that is not worth asking again, keeping a short reason', () => {
    expect(
      classify({
        status: 400,
        body: { error: { message: 'Unable to process input image' } },
      }),
    ).toEqual({
      kind: 'fatal',
      status: 400,
      detail: 'Unable to process input image',
    });
    expect(
      classify({ status: 404, body: [{ error: { status: 'NOT_FOUND' } }] }),
    ).toEqual({
      kind: 'fatal',
      status: 404,
      detail: 'NOT_FOUND',
    });
    const long = classify({
      status: 400,
      body: { error: { message: 'x'.repeat(500) } },
    });
    expect(long.kind === 'fatal' && long.detail.length).toBe(200);
    expect(classify({ status: 400, body: 'plain text body' })).toMatchObject({
      kind: 'fatal',
      detail: 'plain text body',
    });
  });
});
