import type { ContextualPreview, PreviewRequest } from './api.ts';
import type { PlannedRequest } from './preview-plan.ts';

/**
 * Stale-answer protection for the live preview (PROMOTIONS_SPEC D3.7).
 *
 * Every question gets its own request id; the Backend echoes it. An answer is shown only when
 *   - the question was not superseded (its timer was cleared and its fetch aborted), and
 *   - the echoed id is the id that was asked.
 * Anything else is dropped or reported as a failure, never shown as the current result.
 */

export const PREVIEW_DEBOUNCE_MS = 450;

let counter = 0;

/** `^[A-Za-z0-9._-]{8,64}$`, unique within this page. */
export function createRequestId(): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `pv-${Date.now().toString(36)}-${counter.toString(36)}-${random}`;
}

/** The answer belongs to the question that was asked. */
export function answersRequest(requestId: string, answer: Pick<ContextualPreview, 'requestId'> | null | undefined): boolean {
  return Boolean(answer) && answer?.requestId === requestId;
}

export class StalePreviewError extends Error {
  constructor() {
    super('The preview answer does not belong to the request that was asked.');
    this.name = 'StalePreviewError';
  }
}

export type PreviewFetcher = (request: PreviewRequest, signal: AbortSignal) => Promise<ContextualPreview>;

/**
 * Debounces one request. Returns the cancel function (a React effect cleanup): it clears the timer, aborts the fetch
 * and guarantees that a superseded request can never call back, even if its answer arrives later.
 */
export function schedulePreview(planned: PlannedRequest, options: {
  fetcher: PreviewFetcher;
  delayMs?: number;
  onPending: (requestId: string) => void;
  onResult: (requestId: string, answer: ContextualPreview) => void;
  onError: (requestId: string, caught: unknown) => void;
}): () => void {
  let cancelled = false;
  const controller = new AbortController();
  const requestId = createRequestId();
  const timer = setTimeout(() => {
    if (cancelled) return;
    options.onPending(requestId);
    options.fetcher({ contract: 'CONTEXTUAL_V1', requestId, ...planned }, controller.signal).then(
      (answer) => {
        if (cancelled) return;
        if (!answersRequest(requestId, answer)) options.onError(requestId, new StalePreviewError());
        else options.onResult(requestId, answer);
      },
      (caught: unknown) => { if (!cancelled) options.onError(requestId, caught); },
    );
  }, options.delayMs ?? PREVIEW_DEBOUNCE_MS);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    controller.abort();
  };
}

/** True for the dimmed "previous result" state: an answer exists for an older question than the current one. */
export function isOutdated(answeredKey: string | null, currentKey: string | null): boolean {
  return answeredKey !== null && currentKey !== null && answeredKey !== currentKey;
}
