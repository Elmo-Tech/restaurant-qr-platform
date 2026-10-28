import { KeyPool, type PoolKey } from './gemini-key-pool';

const A: PoolKey = { id: 'a', value: 'key-a' };
const B: PoolKey = { id: 'b', value: 'key-b' };
const C: PoolKey = { id: 'c', value: 'key-c' };

function pool() {
  const clock = { now: 1_000_000 };
  return { clock, pool: new KeyPool(() => clock.now) };
}

describe('KeyPool', () => {
  it('spreads simultaneous requests over the free keys', () => {
    const { pool: p } = pool();
    const first = p.acquire([A, B, C]);
    const second = p.acquire([A, B, C]);
    const third = p.acquire([A, B, C]);
    const used = [first, second, third].map((r) => (r.key ? r.key.id : null));
    expect(new Set(used).size).toBe(3);
  });

  it('prefers the key used longest ago once nothing is in flight', () => {
    const { clock, pool: p } = pool();
    const first = p.acquire([A, B]);
    clock.now += 10;
    if (first.key) p.release(first.key.id);
    const second = p.acquire([A, B]);
    clock.now += 10;
    if (second.key) p.release(second.key.id);
    const third = p.acquire([A, B]);
    expect(first.key?.id).toBe('a');
    expect(second.key?.id).toBe('b');
    expect(third.key?.id).toBe('a');
  });

  it('puts a key aside for a while, then takes it back', () => {
    const { clock, pool: p } = pool();
    p.pause('a', 30_000);
    expect(p.isPaused('a')).toBe(true);
    expect(p.acquire([A, B]).key?.id).toBe('b');
    clock.now += 30_001;
    expect(p.isPaused('a')).toBe(false);
  });

  it('says how long to wait when every key is resting, and that there is nothing to wait for with no keys', () => {
    const { pool: p } = pool();
    p.pause('a', 30_000);
    p.pause('b', 10_000);
    expect(p.acquire([A, B])).toEqual({ key: null, waitMs: 10_000 });
    expect(p.acquire([])).toEqual({ key: null, waitMs: null });
  });

  it('never shortens a pause that is already longer', () => {
    const { clock, pool: p } = pool();
    p.pause('a', 60_000);
    p.pause('a', 1_000);
    clock.now += 2_000;
    expect(p.isPaused('a')).toBe(true);
  });

  it('counts requests in flight and frees them on release', () => {
    const { pool: p } = pool();
    const first = p.acquire([A, B]);
    const second = p.acquire([A, B]);
    expect(first.key?.id).not.toBe(second.key?.id);
    if (first.key) p.release(first.key.id);
    if (first.key) p.release(first.key.id); // a double release never goes below zero
    const third = p.acquire([A, B]);
    expect(third.key?.id).toBe(first.key?.id);
  });

  it('forgets keys that left the pool', () => {
    const { pool: p } = pool();
    p.pause('a', 60_000);
    p.prune(['b']);
    expect(p.isPaused('a')).toBe(false);
  });
});
