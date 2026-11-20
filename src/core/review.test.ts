import { describe, expect, it } from 'vitest';
import { baseInterval, dailyReview, entryFor, maxInterval, schedule, type ReviewState } from './review';
import { createGrain, goDormant } from './grain';
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
  const grain = createGrain(ctx, { text: 'x', kind: 'insight', confidence: 'leaning' });
  const now = '2026-02-01T00:00:00.000Z';

  it('schedules a new grain from its creation date', () => {
    expect(entryFor(grain, {})).toEqual({ interval: 7, due: addDays('2026-01-01T00:00:00.000Z', 7) });
  });

  it('doubles the interval on reaffirm', () => {
    const s1 = schedule(grain, {}, 'reaffirmed', now);
    expect(s1[grain.id]).toEqual({ interval: 14, due: addDays(now, 14), last: now });
    const s2 = schedule(grain, s1, 'reaffirmed', now);
    expect(s2[grain.id]!.interval).toBe(28);
  });

  it('never grows past the cap', () => {
    const value = createGrain(ctx, { text: 'v', kind: 'value', confidence: 'conviction' });
    let st: ReviewState = {};
    for (let i = 0; i < 10; i++) st = schedule(value, st, 'reaffirmed', now);
    expect(st[value.id]!.interval).toBe(maxInterval('value'));
  });

  it('resets to the base interval on revise', () => {
    const big: ReviewState = { [grain.id]: { interval: 100, due: now } };
    expect(schedule(grain, big, 'revised', now)[grain.id]!.interval).toBe(7);
  });

  it('brings a skipped grain back in a day or two, keeping its interval', () => {
    const st = schedule(grain, { [grain.id]: { interval: 30, due: now } }, 'skipped', now, 0.5);
    expect(st[grain.id]).toEqual({ interval: 30, due: addDays(now, 1.5), last: now });
  });

  it('forgets retired grains', () => {
    expect(schedule(grain, { [grain.id]: { interval: 3, due: now } }, 'retired', now)).toEqual({});
  });
});

describe('dailyReview', () => {
  const ctx = testCtx('2026-01-01T00:00:00.000Z');
  const hunch = createGrain(ctx, { text: 'hunch', kind: 'speculation', confidence: 'hunch' }); // due in 2 days
  const value = createGrain(ctx, { text: 'value', kind: 'value', confidence: 'conviction' }); // due in 30 days
  const dormant = goDormant(ctx, createGrain(ctx, { text: 'old', confidence: 'hunch' }));
  const grains = [hunch, value, dormant];

  it('offers only active grains that are due', () => {
    expect(dailyReview(grains, {}, '2026-01-01T12:00:00.000Z')).toEqual([]);
    expect(dailyReview(grains, {}, '2026-01-10T12:00:00.000Z')).toEqual([hunch]);
  });

  it('puts the most overdue (relative to interval) first', () => {
    expect(dailyReview(grains, {}, '2026-03-01T00:00:00.000Z')).toEqual([hunch, value]);
  });

  it('counts grains already reviewed today against the daily size', () => {
    const now = '2026-03-01T10:00:00.000Z';
    const st = schedule(hunch, {}, 'reaffirmed', now);
    expect(dailyReview(grains, st, now, { size: 1 })).toEqual([]);
    expect(dailyReview(grains, st, now, { size: 2 })).toEqual([value]);
  });

  it('can focus on a category subtree', () => {
    const c = testCtx();
    const a = createGrain(c, { text: 'a', category: 'Parenting/Discipline' });
    const b = createGrain(c, { text: 'b', category: 'Parenthood' });
    expect(dailyReview([a, b], {}, '2027-01-01T00:00:00.000Z', { focus: 'Parenting' })).toEqual([a]);
  });
});
