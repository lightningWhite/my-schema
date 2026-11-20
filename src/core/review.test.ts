import { describe, expect, it } from 'vitest';
import { baseInterval, dailyReview, entryFor, maxInterval, schedule, type ReviewState } from './review';
import { createSeed, goDormant } from './seed';
import { testCtx } from './testing';
import { addDays } from './time';

describe('baseInterval', () => {
  it('brings hunches and speculation back soonest, convictions latest', () => {
    expect(baseInterval('speculation', 'hunch')).toBeLessThan(baseInterval('belief', 'hunch'));
    expect(baseInterval('belief', 'hunch')).toBeLessThan(baseInterval('belief', 'conviction'));
    expect(baseInterval(undefined, undefined)).toBe(7);
    expect(baseInterval('question', 'hunch')).toBeGreaterThanOrEqual(2);
  });

  it('caps values and beliefs so they never drift away', () => {
    expect(maxInterval('value')).toBeLessThan(maxInterval('fact'));
  });
});

describe('schedule', () => {
  const ctx = testCtx();
  const seed = createSeed(ctx, { text: 'x', kind: 'insight', confidence: 'leaning' });
  const now = '2026-02-01T00:00:00.000Z';

  it('schedules a new seed from its creation date', () => {
    expect(entryFor(seed, {})).toEqual({ interval: 7, due: addDays('2026-01-01T00:00:00.000Z', 7) });
  });

  it('doubles the interval on reaffirm', () => {
    const s1 = schedule(seed, {}, 'reaffirmed', now);
    expect(s1[seed.id]).toEqual({ interval: 14, due: addDays(now, 14), last: now });
    const s2 = schedule(seed, s1, 'reaffirmed', now);
    expect(s2[seed.id]!.interval).toBe(28);
  });

  it('never grows past the cap', () => {
    const value = createSeed(ctx, { text: 'v', kind: 'value', confidence: 'conviction' });
    let st: ReviewState = {};
    for (let i = 0; i < 10; i++) st = schedule(value, st, 'reaffirmed', now);
    expect(st[value.id]!.interval).toBe(maxInterval('value'));
  });

  it('resets to the base interval on revise', () => {
    const big: ReviewState = { [seed.id]: { interval: 100, due: now } };
    expect(schedule(seed, big, 'revised', now)[seed.id]!.interval).toBe(7);
  });

  it('brings a skipped seed back in a day or two, keeping its interval', () => {
    const st = schedule(seed, { [seed.id]: { interval: 30, due: now } }, 'skipped', now, 0.5);
    expect(st[seed.id]).toEqual({ interval: 30, due: addDays(now, 1.5), last: now });
  });

  it('forgets retired seeds', () => {
    expect(schedule(seed, { [seed.id]: { interval: 3, due: now } }, 'retired', now)).toEqual({});
  });
});

describe('dailyReview', () => {
  const ctx = testCtx('2026-01-01T00:00:00.000Z');
  const hunch = createSeed(ctx, { text: 'hunch', kind: 'speculation', confidence: 'hunch' }); // due in 2 days
  const value = createSeed(ctx, { text: 'value', kind: 'value', confidence: 'conviction' }); // due in 30 days
  const dormant = goDormant(ctx, createSeed(ctx, { text: 'old', confidence: 'hunch' }));
  const seeds = [hunch, value, dormant];

  it('offers only active seeds that are due', () => {
    expect(dailyReview(seeds, {}, '2026-01-01T12:00:00.000Z')).toEqual([]);
    expect(dailyReview(seeds, {}, '2026-01-10T12:00:00.000Z')).toEqual([hunch]);
  });

  it('puts the most overdue (relative to interval) first', () => {
    expect(dailyReview(seeds, {}, '2026-03-01T00:00:00.000Z')).toEqual([hunch, value]);
  });

  it('counts seeds already reviewed today against the daily size', () => {
    const now = '2026-03-01T10:00:00.000Z';
    const st = schedule(hunch, {}, 'reaffirmed', now);
    expect(dailyReview(seeds, st, now, { size: 1 })).toEqual([]);
    expect(dailyReview(seeds, st, now, { size: 2 })).toEqual([value]);
  });

  it('can focus on a category subtree', () => {
    const c = testCtx();
    const a = createSeed(c, { text: 'a', category: 'Parenting/Discipline' });
    const b = createSeed(c, { text: 'b', category: 'Parenthood' });
    expect(dailyReview([a, b], {}, '2027-01-01T00:00:00.000Z', { focus: 'Parenting' })).toEqual([a]);
  });
});
