'use client';

import { useEffect, useState } from 'react';

/**
 * A coarse "now" for live durations (an open session's running time). Ticks
 * once a minute; the first value is read lazily so render stays pure.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Whole minutes between an instant and `toMs` (never negative). Time, not money: safe to compute client-side. */
export function minutesBetween(fromIso: string, toMs: number): number {
  return Math.max(0, Math.floor((toMs - new Date(fromIso).getTime()) / 60_000));
}
