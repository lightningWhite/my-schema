import { describe, expect, it } from 'vitest';
import { createTidbit, goDormant } from './tidbit';
import { pickPassing } from './resurface';
import { testCtx } from './testing';

/** Deterministic pseudo-random numbers for tests. */
function seq(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('pickPassing', () => {
  const ctx = testCtx('2026-01-01T00:00:00.000Z');
  const old = createTidbit(ctx, { text: 'old' });
  ctx.set('2026-11-19T00:00:00.000Z');
  const fresh = createTidbit(ctx, { text: 'fresh' });
  const dormant = goDormant(ctx, createTidbit(ctx, { text: 'dormant' }));
  const now = '2026-11-20T00:00:00.000Z';

  it('offers only active tidbits, never the excluded ones, at most n', () => {
    const picked = pickPassing([old, fresh, dormant], now, 5, seq());
    expect(picked).toHaveLength(2);
    expect(picked).not.toContain(dormant);
    expect(pickPassing([old, fresh], now, 5, seq(), [old.id])).toEqual([fresh]);
    expect(pickPassing([old, fresh], now, 1, seq())).toHaveLength(1);
  });

  it('favors tidbits untouched for a long time, without excluding fresh ones', () => {
    let oldFirst = 0;
    const random = seq(42);
    for (let i = 0; i < 2000; i++) if (pickPassing([old, fresh], now, 1, random)[0] === old) oldFirst++;
    expect(oldFirst).toBeGreaterThan(1200); // clearly favored
    expect(oldFirst).toBeLessThan(1950); // but the fresh one still shows up
  });

  it('is deterministic for a given random source', () => {
    expect(pickPassing([old, fresh], now, 2, seq(7))).toEqual(pickPassing([old, fresh], now, 2, seq(7)));
  });
});
