import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION } from './files';
import { serializeTidbit, tidbitPath } from './format';
import { schedule } from './review';
import { NewerFormatError, planSync, type Files } from './sync';
import { testCtx } from './testing';
import { createTidbit, reaffirm, revise, updateMeta } from './tidbit';
import type { Tidbit } from './types';

const file = (t: Tidbit): [string, string] => [tidbitPath(t.id), serializeTidbit(t)];
const filesOf = (...ts: Tidbit[]): Files => new Map(ts.map(file));

/** Run a plan and return what a second, immediate sync would do. */
function settle(plan: ReturnType<typeof planSync>) {
  return planSync({ local: plan.tidbits, localReview: plan.review, remote: plan.next, base: plan.next });
}

describe('planSync', () => {
  it('first sync: uploads everything, plus manifest, review and index', () => {
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'one' });
    const plan = planSync({ local: [a], localReview: {}, remote: new Map(), base: new Map() });
    expect([...plan.writes.keys()].sort()).toEqual(['index.json', 'manifest.json', 'review.json', tidbitPath(a.id)]);
    expect(plan.tidbits).toEqual([a]);
    expect(plan.deletes).toEqual([]);
  });

  it('second device: downloads what is in the backup', () => {
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'from the phone' });
    const remote = filesOf(a);
    const plan = planSync({ local: [], localReview: {}, remote, base: new Map() });
    expect(plan.tidbits).toEqual([a]);
    expect(plan.writes.has(tidbitPath(a.id))).toBe(false);
  });

  it('merges edits made on two devices since the last sync', () => {
    const ctx = testCtx();
    const base = createTidbit(ctx, { text: 'v1', category: 'A' });
    ctx.advance(1000);
    const here = revise(ctx, base, { text: 'v2 on laptop' });
    ctx.advance(1000);
    const there = reaffirm(ctx, updateMeta(ctx, base, { category: 'B' }));
    const plan = planSync({ local: [here], localReview: {}, remote: filesOf(there), base: filesOf(base) });
    const merged = plan.tidbits[0]!;
    expect(merged.category).toBe('B');
    expect(merged.history.map((e) => e.type)).toEqual(['reaffirmation', 'revision', 'revision']);
    expect(plan.writes.get(tidbitPath(base.id))).toBe(serializeTidbit(merged));
  });

  it('deleted on another device and untouched here: deleted here too', () => {
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'x' });
    const plan = planSync({ local: [a], localReview: {}, remote: new Map(), base: filesOf(a) });
    expect(plan.tidbits).toEqual([]);
    expect(plan.writes.has(tidbitPath(a.id))).toBe(false);
  });

  it('deleted on another device but edited here: the edit wins', () => {
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'x' });
    ctx.advance(1);
    const edited = revise(ctx, a, { text: 'x, but better' });
    const plan = planSync({ local: [edited], localReview: {}, remote: new Map(), base: filesOf(a) });
    expect(plan.tidbits).toEqual([edited]);
    expect(plan.writes.has(tidbitPath(a.id))).toBe(true);
  });

  it('deleted here and untouched in the backup: deleted there too', () => {
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'x' });
    const plan = planSync({ local: [], localReview: {}, remote: filesOf(a), base: filesOf(a) });
    expect(plan.deletes).toEqual([tidbitPath(a.id)]);
    expect(plan.tidbits).toEqual([]);
  });

  it('deleted here but edited in the backup: the edit wins', () => {
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'x' });
    ctx.advance(1);
    const edited = revise(ctx, a, { text: 'edited elsewhere' });
    const plan = planSync({ local: [], localReview: {}, remote: filesOf(edited), base: filesOf(a) });
    expect(plan.deletes).toEqual([]);
    expect(plan.tidbits).toEqual([edited]);
  });

  it('leaves unreadable backup files alone and keeps the local copy', () => {
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'x' });
    const remote: Files = new Map([[tidbitPath(a.id), 'garbage']]);
    const plan = planSync({ local: [a], localReview: {}, remote, base: new Map() });
    expect(plan.errors.map((e) => e.path)).toEqual([tidbitPath(a.id)]);
    expect(plan.tidbits).toEqual([a]);
    expect(plan.writes.has(tidbitPath(a.id))).toBe(false);
    expect(plan.deletes).toEqual([]);
  });

  it('refuses to write to a backup from a newer app', () => {
    const remote: Files = new Map([['manifest.json', JSON.stringify({ formatVersion: FORMAT_VERSION + 1 })]]);
    expect(() => planSync({ local: [], localReview: {}, remote, base: new Map() })).toThrow(NewerFormatError);
  });

  it('merges review schedules, keeping the most recent review per tidbit', () => {
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'x' });
    const older = schedule(a, {}, 'skipped', '2026-02-01T00:00:00.000Z');
    const newer = schedule(a, {}, 'reaffirmed', '2026-03-01T00:00:00.000Z');
    const remote: Files = new Map([file(a), ['review.json', JSON.stringify(newer)]]);
    const plan = planSync({ local: [a], localReview: older, remote, base: new Map() });
    expect(plan.review[a.id]).toEqual(newer[a.id]);
  });

  it('a sync right after a sync changes nothing', () => {
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'one' });
    const b = createTidbit(ctx, { text: 'two' });
    const plan = planSync({ local: [a], localReview: {}, remote: filesOf(b), base: new Map() });
    const again = settle(plan);
    expect(again.writes.size).toBe(0);
    expect(again.deletes).toEqual([]);
  });
});

describe('planSync (properties)', () => {
  // A small world: a base set of tidbits, then independent edits on each side.
  type Op = 'keep' | 'revise' | 'delete';
  const arbWorld = fc.record({
    n: fc.integer({ min: 0, max: 5 }),
    here: fc.array(fc.constantFrom<Op>('keep', 'revise', 'delete'), { minLength: 5, maxLength: 5 }),
    there: fc.array(fc.constantFrom<Op>('keep', 'revise', 'delete'), { minLength: 5, maxLength: 5 }),
    newHere: fc.integer({ min: 0, max: 2 }),
    newThere: fc.integer({ min: 0, max: 2 }),
  });

  interface World {
    n: number;
    here: Op[];
    there: Op[];
    newHere: number;
    newThere: number;
  }
  function build(w: World) {
    const ctx = testCtx();
    const base = Array.from({ length: w.n }, (_, i) => createTidbit(ctx, { text: `base ${i}` }));
    const side = (ops: Op[], label: string, extra: number) => {
      ctx.advance(1000);
      const out: Tidbit[] = [];
      base.forEach((t, i) => {
        if (ops[i] === 'keep') out.push(t);
        else if (ops[i] === 'revise') out.push(revise(ctx, t, { text: `${t.history.length} ${label} ${i}` }));
      });
      for (let i = 0; i < extra; i++) out.push(createTidbit(ctx, { text: `new ${label} ${i}` }));
      return out;
    };
    const here = side(w.here, 'here', w.newHere);
    const there = side(w.there, 'there', w.newThere);
    return { base, here, there };
  }

  it('never loses an edit or a new tidbit, and converges', () => {
    fc.assert(
      fc.property(arbWorld, (w) => {
        const { base, here, there } = build(w);
        const plan = planSync({ local: here, localReview: {}, remote: filesOf(...there), base: filesOf(...base) });
        const result = new Map(plan.tidbits.map((t) => [t.id, t]));
        const baseText = new Map(base.map((t) => [t.id, serializeTidbit(t)]));
        // Anything new or changed on either side survives, with all its revisions.
        for (const t of [...here, ...there]) {
          if (baseText.get(t.id) === serializeTidbit(t)) continue; // untouched copies may lose to a delete
          const r = result.get(t.id);
          expect(r, `lost ${t.id}`).toBeDefined();
          for (const e of t.history) expect(r!.history).toContainEqual(e);
        }
        // And the backup ends up holding exactly what this device holds.
        const again = settle(plan);
        expect(again.writes.size).toBe(0);
        expect(again.deletes).toEqual([]);
        expect(again.tidbits).toEqual(plan.tidbits);
      }),
      { numRuns: 300 },
    );
  });
});
