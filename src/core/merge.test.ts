import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { arbSeed } from './arbitraries';
import { mergeSeeds } from './merge';
import { createSeed, reaffirm, revise, updateMeta } from './seed';
import { testCtx } from './testing';
import type { Seed } from './types';

const historyKeys = (s: Seed) => s.history.map((e) => JSON.stringify(e));

describe('mergeSeeds', () => {
  it('interleaves revisions made offline on two devices', () => {
    const ctx = testCtx();
    const base = createSeed(ctx, { text: 'v1' });
    ctx.advance(1000);
    const phone = revise(ctx, base, { text: 'v2 from phone' });
    ctx.advance(1000);
    const laptop = reaffirm(ctx, base);
    const m = mergeSeeds(base, phone, laptop);
    expect(m.history.map((e) => (e.type === 'revision' ? e.text : 'reaffirmed'))).toEqual(['reaffirmed', 'v2 from phone', 'v1']);
  });

  it('takes a field changed on one side only, even if the other side is newer', () => {
    const ctx = testCtx();
    const base = createSeed(ctx, { text: 'x', category: 'A', title: 'T' });
    ctx.advance(10);
    const a = updateMeta(ctx, base, { category: 'B' });
    ctx.advance(10);
    const b = updateMeta(ctx, base, { title: 'New title' });
    const m = mergeSeeds(base, a, b);
    expect(m.category).toBe('B');
    expect(m.title).toBe('New title');
  });

  it('lets the later change win when both sides changed a field', () => {
    const ctx = testCtx();
    const base = createSeed(ctx, { text: 'x', category: 'A' });
    ctx.advance(10);
    const a = updateMeta(ctx, base, { category: 'Early' });
    ctx.advance(10);
    const b = updateMeta(ctx, base, { category: 'Late' });
    expect(mergeSeeds(base, a, b).category).toBe('Late');
    expect(mergeSeeds(base, b, a).category).toBe('Late');
  });

  it('merges tags as sets: additions and removals on different devices both survive', () => {
    const ctx = testCtx();
    const base = createSeed(ctx, { text: 'x', tags: ['keep', 'drop'] });
    const a = updateMeta(ctx, base, { tags: ['keep', 'drop', 'new-a'] });
    const b = updateMeta(ctx, base, { tags: ['keep'] });
    expect(mergeSeeds(base, a, b).tags).toEqual(['keep', 'new-a']);
  });

  it('clears a field cleared on one side', () => {
    const ctx = testCtx();
    const base = createSeed(ctx, { text: 'x', title: 'T' });
    ctx.advance(1);
    const a = updateMeta(ctx, base, { title: null });
    expect('title' in mergeSeeds(base, a, base)).toBe(false);
  });
});

describe('mergeSeeds (properties)', () => {
  const pair = arbSeed.chain((a) => arbSeed.map((b) => [a, { ...b, id: a.id }] as const));
  const triple = arbSeed.chain((base) =>
    fc.tuple(arbSeed, arbSeed).map(([a, b]) => [base, { ...a, id: base.id }, { ...b, id: base.id }] as const),
  );

  it('is idempotent: merging a seed with itself changes nothing', () => {
    fc.assert(
      fc.property(arbSeed, (s) => {
        const m = mergeSeeds(s, s, s);
        expect(historyKeys(m)).toEqual(historyKeys(s));
        expect(mergeSeeds(null, s, s).history).toEqual(m.history);
      }),
    );
  });

  it('is symmetric: the result does not depend on which side is ours', () => {
    fc.assert(
      fc.property(triple, ([base, a, b]) => {
        expect(mergeSeeds(base, a, b)).toEqual(mergeSeeds(base, b, a));
        expect(mergeSeeds(null, a, b)).toEqual(mergeSeeds(null, b, a));
      }),
    );
  });

  it('never loses history: every entry from either side survives', () => {
    fc.assert(
      fc.property(pair, ([a, b]) => {
        const m = new Set(historyKeys(mergeSeeds(null, a, b)));
        for (const k of [...historyKeys(a), ...historyKeys(b)]) expect(m.has(k)).toBe(true);
      }),
    );
  });

  it('keeps history newest first', () => {
    fc.assert(
      fc.property(pair, ([a, b]) => {
        const ats = mergeSeeds(null, a, b).history.map((e) => Date.parse(e.at));
        for (let i = 1; i < ats.length; i++) expect(ats[i - 1]!).toBeGreaterThanOrEqual(ats[i]!);
      }),
    );
  });

  it('with an unchanged side, returns the other side', () => {
    fc.assert(
      fc.property(pair, ([base, changed]) => {
        const m = mergeSeeds(base, base, changed);
        expect(m.category).toEqual(changed.category);
        expect(m.title).toEqual(changed.title);
        expect(m.status).toEqual(changed.status);
        expect([...m.tags].sort()).toEqual([...new Set(changed.tags)].sort());
      }),
    );
  });
});
