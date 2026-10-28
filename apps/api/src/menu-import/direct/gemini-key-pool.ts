/**
 * Which model API key to use for the next request, and which keys are resting (DEC-059). A key that hit its limit
 * is put aside for a while and the next request goes to another key at once; requests spread over the keys that
 * are free (fewest in flight first, then the one used longest ago). Only ids and timestamps are kept here, in
 * memory, per API process: never the key values beyond the list the caller passes in.
 */
export interface PoolKey {
  id: string;
  value: string;
}

interface Health {
  pausedUntil: number;
  lastUsed: number;
}

export type Acquired =
  | { key: PoolKey }
  /** No key is free. `waitMs` is how long until the first one is, or null when there are no keys at all. */
  | { key: null; waitMs: number | null };

export class KeyPool {
  private readonly health = new Map<string, Health>();
  private readonly inFlight = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private healthOf(id: string): Health {
    let entry = this.health.get(id);
    if (!entry) {
      entry = { pausedUntil: 0, lastUsed: 0 };
      this.health.set(id, entry);
    }
    return entry;
  }

  private load(id: string): number {
    return this.inFlight.get(id) ?? 0;
  }

  /** Takes the best free key. The caller must `release` it when its request ends. */
  acquire(keys: readonly PoolKey[]): Acquired {
    const now = this.now();
    let best: PoolKey | null = null;
    let soonest: number | null = null;
    for (const key of keys) {
      const health = this.healthOf(key.id);
      if (health.pausedUntil > now) {
        soonest =
          soonest === null
            ? health.pausedUntil
            : Math.min(soonest, health.pausedUntil);
        continue;
      }
      if (best === null) {
        best = key;
        continue;
      }
      const load = this.load(key.id);
      const bestLoad = this.load(best.id);
      if (
        load < bestLoad ||
        (load === bestLoad && health.lastUsed < this.healthOf(best.id).lastUsed)
      ) {
        best = key;
      }
    }
    if (best === null) {
      return { key: null, waitMs: soonest === null ? null : soonest - now };
    }
    this.healthOf(best.id).lastUsed = now;
    this.inFlight.set(best.id, this.load(best.id) + 1);
    return { key: best };
  }

  release(id: string): void {
    this.inFlight.set(id, Math.max(0, this.load(id) - 1));
  }

  /** Puts a key aside. It never shortens a pause that is already longer. */
  pause(id: string, ms: number): void {
    const health = this.healthOf(id);
    health.pausedUntil = Math.max(health.pausedUntil, this.now() + ms);
  }

  isPaused(id: string): boolean {
    return this.healthOf(id).pausedUntil > this.now();
  }

  /** Forgets keys that are no longer in the pool (deleted in the console). */
  prune(liveIds: readonly string[]): void {
    const live = new Set(liveIds);
    for (const id of [...this.health.keys()]) {
      if (!live.has(id)) {
        this.health.delete(id);
        this.inFlight.delete(id);
      }
    }
  }
}
