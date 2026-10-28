/**
 * Talking to the model (Menu Import, DIRECT engine, DEC-059): one HTTP request over an OpenAI-compatible chat
 * endpoint (Gemini's by default), and a classification of the answer. Both are free of Nest and of the database,
 * so the extraction logic can be tested with a fake transport.
 */

export interface ModelRequest {
  url: string;
  apiKey: string;
  body: unknown;
  timeoutMs: number;
}

/**
 * `status` 0 means no answer at all: a network failure or the timeout. `failure` then says which, as a short code
 * (`timeout`, `ECONNRESET`, ...): never an error message, which could carry the address or the key.
 */
export interface ModelResponse {
  status: number;
  body: unknown;
  failure?: string;
}

export type ModelTransport = (request: ModelRequest) => Promise<ModelResponse>;

export const fetchTransport: ModelTransport = async ({
  url,
  apiKey,
  body,
  timeoutMs,
}) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 500);
    }
    return { status: response.status, body: parsed };
  } catch (error) {
    return { status: 0, body: null, failure: failureCode(error) };
  }
};

/** A short, safe code for a failed `fetch`: `timeout`, or the network error code (`ECONNRESET`), else the error's name. */
export function failureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  if (error.name === 'TimeoutError') return 'timeout';
  const code = (error.cause as { code?: unknown } | undefined)?.code;
  if (typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code)) {
    return code;
  }
  return /^[A-Za-z0-9_]{1,40}$/.test(error.name) ? error.name : 'unknown';
}

export const SHORT_PAUSE_MS = 60 * 1000; // a per-minute limit
export const DAILY_PAUSE_MS = 60 * 60 * 1000; // a per-day limit: look again in an hour
export const BAD_KEY_PAUSE_MS = 6 * 60 * 60 * 1000; // a key the provider rejects

export type Outcome =
  | { kind: 'ok'; text: string; finishReason: string | null }
  /** The key is at its limit: put it aside for `pauseMs` and use another one. */
  | { kind: 'limited'; pauseMs: number }
  /** The provider rejects the key itself (invalid, revoked, not allowed). */
  | { kind: 'badKey' }
  /** A hiccup on the provider's side (5xx, timeout, no answer): worth a few more tries. */
  | { kind: 'transient'; status: number; detail: string }
  /** The request itself is wrong: asking again would not help. */
  | { kind: 'fatal'; status: number; detail: string };

function describe(body: unknown): string {
  let value: unknown = body;
  if (typeof body === 'string') {
    try {
      value = JSON.parse(body);
    } catch {
      return body.replace(/\s+/g, ' ').slice(0, 200);
    }
  }
  const record: unknown = Array.isArray(value) ? (value[0] as unknown) : value;
  if (typeof record !== 'object' || record === null) return '';
  const error = (record as { error?: unknown }).error;
  const source = error ?? record;
  if (typeof source === 'string') return source.slice(0, 200);
  if (typeof source === 'object' && source !== null) {
    const { message, status } = source as {
      message?: unknown;
      status?: unknown;
    };
    const text =
      typeof message === 'string'
        ? message
        : typeof status === 'string'
          ? status
          : '';
    return text.replace(/\s+/g, ' ').slice(0, 200);
  }
  return '';
}

function retryDelayMs(body: unknown): number | null {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const match =
    /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(text) ??
    /retry in (\d+(?:\.\d+)?)s/i.exec(text);
  return match
    ? Math.min(Math.ceil(parseFloat(match[1]) * 1000) + 500, DAILY_PAUSE_MS)
    : null;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'object' &&
        part !== null &&
        typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : '',
      )
      .join('');
  }
  return '';
}

export function classify(response: ModelResponse): Outcome {
  const { status, body } = response;

  if (status >= 200 && status < 300) {
    const choices = (body as { choices?: unknown } | null)?.choices;
    if (Array.isArray(choices)) {
      const choice = (choices[0] ?? null) as {
        message?: { content?: unknown };
        finish_reason?: unknown;
      } | null;
      return {
        kind: 'ok',
        text: textOf(choice?.message?.content).trim(),
        finishReason:
          typeof choice?.finish_reason === 'string'
            ? choice.finish_reason
            : null,
      };
    }
    return { kind: 'transient', status, detail: 'unexpected answer' };
  }

  const detail = describe(body);
  if (status === 429) {
    const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
    const daily = /PerDay|per day|daily/i.test(text);
    return {
      kind: 'limited',
      pauseMs: daily ? DAILY_PAUSE_MS : (retryDelayMs(body) ?? SHORT_PAUSE_MS),
    };
  }
  if (
    status === 401 ||
    status === 403 ||
    (status === 400 && /api key|API_KEY_INVALID/i.test(detail))
  ) {
    return { kind: 'badKey' };
  }
  if (status === 0 || status === 408 || status >= 500) {
    return {
      kind: 'transient',
      status,
      detail: status === 0 ? (response.failure ?? '') : detail,
    };
  }
  return { kind: 'fatal', status, detail };
}
