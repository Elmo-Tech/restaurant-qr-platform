'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { fetchCartQuote, type CartQuoteResult, type QuoteCartInput } from '../../../lib/public-menu/quote-api';

export type CartQuoteState = CartQuoteResult | { kind: 'idle' | 'loading' | 'stale' };

function subscribeToConnection(notify: () => void) {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

export function useCartQuote(publicCode: string, input: QuoteCartInput | null) {
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const inputKey = input === null ? null : JSON.stringify(input);
  // Every edit/retry needs a fresh request identity, even A → B → A. A late
  // result for the first A must never revalidate the second A at render time.
  const request = useMemo(() => ({ publicCode, inputKey, online, revision }), [publicCode, inputKey, online, revision]);
  const [settled, setSettled] = useState<{ request: typeof request; result: CartQuoteResult } | null>(null);

  useEffect(() => {
    if (request.inputKey === null || !request.online) return;
    const payload = JSON.parse(request.inputKey) as QuoteCartInput;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const result = await fetchCartQuote(
        request.publicCode, payload, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      );
      if (!controller.signal.aborted) setSettled({ request, result });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [request]);

  let state: CartQuoteState;
  if (inputKey === null) state = { kind: 'idle' };
  else if (!online) state = { kind: 'unavailable' };
  else if (settled?.request === request) state = settled.result;
  else state = { kind: settled?.result.kind === 'ready' || settled?.result.kind === 'minimum' ? 'stale' : 'loading' };
  return { state, refresh };
}
