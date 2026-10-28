import { KeyPool, type PoolKey } from './gemini-key-pool';
import {
  BAD_KEY_PAUSE_MS,
  classify,
  type ModelTransport,
} from './gemini-transport';
import type { PageResult } from './menu-model-output';

/**
 * Asks the model about each file of a menu (Menu Import, DIRECT engine, DEC-059): up to 4 files at the same time,
 * each with the best free key; a key at its limit is put aside and the file goes to another key at once; a server
 * hiccup is retried a few times (with the fallback model, when one is set); and the whole thing stops starting
 * new attempts after a soft deadline, so a busy model answers MODEL_BUSY well before the Backend's own time limit.
 * Free of Nest and of the database: the transport, the clock and the sleep are passed in, so it is tested with
 * fakes and no real waiting.
 */

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** What to ask the model about one file: the content of the user message. */
export interface WorkItem {
  content: ContentPart[];
}

export interface EngineConfig {
  apiUrl: string;
  model: string;
  fallbackModel: string | null;
  systemPrompt: string;
  /** null = do not send the field (some providers reject it). */
  reasoningEffort: string | null;
  maxTokens: number;
  maxParallel: number;
  /** One request waits at most this long for the model. */
  callTimeoutMs: number;
  /** No new attempt starts after this long from the start. */
  softDeadlineMs: number;
  /** Nothing runs past this long: a request's timeout is cut to fit. */
  hardDeadlineMs: number;
  /** Retries after a server hiccup, per file. */
  maxTransient: number;
  /** The most one file waits, in total, for a limited key to recover. */
  maxWaitMs: number;
}

export interface EngineDeps {
  transport: ModelTransport;
  pool: KeyPool;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Short, content-free notes for the log (a key id and a reason: never a key value). */
  log?: (message: string) => void;
}

const BUSY_MESSAGE = 'The model is too busy right now. Try again in a minute.';

/**
 * The limits for one extraction. The soft and hard deadlines follow the Backend's own limit for the extraction
 * (`MENU_IMPORT_TIMEOUT_SECONDS`), so the answer is always sent before the Backend gives up.
 */
export function engineLimits(
  backendTimeoutSeconds: number,
): Pick<
  EngineConfig,
  | 'maxParallel'
  | 'callTimeoutMs'
  | 'softDeadlineMs'
  | 'hardDeadlineMs'
  | 'maxTransient'
  | 'maxWaitMs'
> {
  const hard = Math.max(30_000, (backendTimeoutSeconds - 20) * 1000);
  return {
    maxParallel: 4,
    callTimeoutMs: 60_000,
    softDeadlineMs: Math.max(10_000, Math.min(180_000, hard - 60_000)),
    hardDeadlineMs: hard,
    maxTransient: 3,
    maxWaitMs: 20_000,
  };
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await work(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export class GeminiMenuEngine {
  constructor(private readonly deps: EngineDeps) {}

  /** One answer per item, in the same order. Never throws for a provider problem: it reports a failure per item. */
  async run(
    items: readonly WorkItem[],
    keys: readonly PoolKey[],
    config: EngineConfig,
  ): Promise<PageResult[]> {
    const { pool, now } = this.deps;
    pool.prune(keys.map((key) => key.id));
    const startedAt = now();
    return mapLimit(items, config.maxParallel, (item) =>
      this.ask(item, keys, config, startedAt),
    );
  }

  private async ask(
    item: WorkItem,
    keys: readonly PoolKey[],
    config: EngineConfig,
    startedAt: number,
  ): Promise<PageResult> {
    const { pool, transport, now, sleep, log } = this.deps;
    const busy = (message = BUSY_MESSAGE): PageResult => ({
      ok: false,
      code: 'MODEL_BUSY',
      message,
    });
    let transient = 0;
    let waited = 0;

    for (;;) {
      const elapsed = now() - startedAt;
      if (elapsed >= config.softDeadlineMs) return busy();

      const acquired = pool.acquire(keys);
      if (acquired.key === null) {
        const wait = acquired.waitMs;
        if (
          wait !== null &&
          waited + wait + 250 <= config.maxWaitMs &&
          elapsed + wait < config.softDeadlineMs
        ) {
          await sleep(wait + 250);
          waited += wait + 250;
          continue;
        }
        return busy(
          'Every model key is at its limit right now. Try again in a minute.',
        );
      }
      const key = acquired.key;

      const model =
        transient > 0 && config.fallbackModel
          ? config.fallbackModel
          : config.model;
      const body: Record<string, unknown> = {
        model,
        max_tokens: config.maxTokens,
        messages: [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: item.content },
        ],
      };
      if (config.reasoningEffort)
        body.reasoning_effort = config.reasoningEffort;

      let outcome;
      try {
        outcome = classify(
          await transport({
            url: config.apiUrl,
            apiKey: key.value,
            body,
            timeoutMs: Math.max(
              1000,
              Math.min(config.callTimeoutMs, config.hardDeadlineMs - elapsed),
            ),
          }),
        );
      } finally {
        pool.release(key.id);
      }

      switch (outcome.kind) {
        case 'ok':
          return {
            ok: true,
            text: outcome.text,
            finishReason: outcome.finishReason,
          };
        case 'limited':
          pool.pause(key.id, outcome.pauseMs);
          log?.(
            `model key ${key.id} is at its limit, paused ${Math.round(outcome.pauseMs / 1000)} s`,
          );
          continue;
        case 'badKey':
          pool.pause(key.id, BAD_KEY_PAUSE_MS);
          log?.(`model key ${key.id} was rejected by the provider, paused`);
          continue;
        case 'transient':
          transient += 1;
          log?.(
            `model answered ${outcome.status === 0 ? 'nothing' : `HTTP ${outcome.status}`}${outcome.detail ? ` (${outcome.detail.slice(0, 120)})` : ''}, try ${transient}`,
          );
          if (transient > config.maxTransient) {
            // A call that hangs until its timeout is a busy model, like a 503: "try again in a minute" is the honest answer.
            return outcome.status === 503 || outcome.detail === 'timeout'
              ? busy(
                  'The model is overloaded right now. Try again in a minute.',
                )
              : {
                  ok: false,
                  code: 'MODEL_ERROR',
                  message: `The model did not answer (${outcome.status === 0 ? 'no response' : `HTTP ${outcome.status}`}).`,
                };
          }
          await sleep(
            Math.min(
              2000 * transient,
              Math.max(0, config.softDeadlineMs - (now() - startedAt)),
            ),
          );
          continue;
        case 'fatal':
          return {
            ok: false,
            code: 'MODEL_ERROR',
            message: `The model refused the request (HTTP ${outcome.status}${outcome.detail ? `: ${outcome.detail}` : ''}).`,
          };
      }
    }
  }
}
