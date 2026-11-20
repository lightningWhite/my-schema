import { describe, expect, it } from 'vitest';
import {
  addLink,
  createSeed,
  currentRevision,
  displayTitle,
  goDormant,
  isUnsorted,
  normalizeCategory,
  normalizeTags,
  reactivate,
  reaffirm,
  removeLink,
  revise,
  succeed,
  updateMeta,
} from './seed';
import { testCtx } from './testing';

describe('createSeed', () => {
  it('makes an active, unsorted seed with one revision', () => {
    const ctx = testCtx();
    const s = createSeed(ctx, { text: '  Water deeply twice a week.  \n\n' });
    expect(s.status).toBe('active');
    expect(isUnsorted(s)).toBe(true);
    expect(s.history).toEqual([{ type: 'revision', at: '2026-01-01T00:00:00.000Z', text: 'Water deeply twice a week.' }]);
    expect(s.updated).toBe('2026-01-01T00:00:00.000Z');
    expect(s.origin).toBeNull();
  });

  it('normalizes category and tags, and drops blank optionals', () => {
    const s = createSeed(testCtx(), {
      text: 'x',
      title: '   ',
      category: ' Garden / Tomatoes/ ',
      tags: ['#Watering', 'watering', ' heat wave '],
      source: '',
    });
    expect(s.category).toBe('Garden/Tomatoes');
    expect(s.tags).toEqual(['watering', 'heat-wave']);
    expect('title' in s).toBe(false);
    expect('source' in s).toBe(false);
  });

  it('refuses an empty seed', () => {
    expect(() => createSeed(testCtx(), { text: ' \n ' })).toThrow();
  });
});

describe('revise', () => {
  it('adds a revision on top and keeps the old one', () => {
    const ctx = testCtx();
    const s1 = createSeed(ctx, { text: 'v1', confidence: 'leaning' });
    ctx.advance(1000);
    const s2 = revise(ctx, s1, { text: 'v2', confidence: 'confident', why: 'learned more' });
    expect(s2.history).toHaveLength(2);
    expect(currentRevision(s2)).toMatchObject({ text: 'v2', confidence: 'confident', why: 'learned more' });
    expect(s2.history[1]).toEqual(s1.history[0]);
    expect(s1.history).toHaveLength(1); // not mutated
  });

  it('is a no-op when nothing changed', () => {
    const ctx = testCtx();
    const s = createSeed(ctx, { text: 'same', confidence: 'hunch' });
    expect(revise(ctx, s, { text: 'same  ', confidence: 'hunch' })).toBe(s);
  });

  it('counts a confidence change alone as a revision', () => {
    const ctx = testCtx();
    const s = createSeed(ctx, { text: 'same', confidence: 'hunch' });
    ctx.advance(1);
    expect(revise(ctx, s, { text: 'same', confidence: 'conviction' }).history).toHaveLength(2);
  });

  it('stays newest-first even if the clock went backwards', () => {
    const ctx = testCtx('2026-06-01T00:00:00.000Z');
    const s = createSeed(ctx, { text: 'v1' });
    ctx.set('2026-05-01T00:00:00.000Z');
    const s2 = revise(ctx, s, { text: 'v2' });
    expect(Date.parse(s2.history[0]!.at)).toBeGreaterThan(Date.parse(s2.history[1]!.at));
    expect(currentRevision(s2).text).toBe('v2');
  });
});

describe('reaffirm', () => {
  it('adds a reaffirmation without changing the text', () => {
    const ctx = testCtx();
    const s = createSeed(ctx, { text: 'still true' });
    ctx.advance(86_400_000);
    const r = reaffirm(ctx, s);
    expect(r.history[0]).toEqual({ type: 'reaffirmation', at: '2026-01-02T00:00:00.000Z' });
    expect(currentRevision(r).text).toBe('still true');
  });
});

describe('updateMeta', () => {
  it('sets, clears and leaves fields alone', () => {
    const ctx = testCtx();
    const s = createSeed(ctx, { text: 'x', title: 'T', kind: 'tip', category: 'A' });
    ctx.advance(5);
    const u = updateMeta(ctx, s, { title: null, category: 'B/C', tags: ['one'] });
    expect('title' in u).toBe(false);
    expect(u.kind).toBe('tip');
    expect(u.category).toBe('B/C');
    expect(u.tags).toEqual(['one']);
    expect(u.updated).toBe('2026-01-01T00:00:00.005Z');
    expect(u.history).toBe(s.history);
  });

  it('returns the same seed when nothing changed', () => {
    const ctx = testCtx();
    const s = createSeed(ctx, { text: 'x', category: 'A' });
    expect(updateMeta(ctx, s, { category: ' A ' })).toBe(s);
  });
});

describe('lifecycle', () => {
  it('goes dormant with a why, and comes back', () => {
    const ctx = testCtx();
    const s = createSeed(ctx, { text: 'x' });
    ctx.advance(1);
    const d = goDormant(ctx, s, 'outgrew it');
    expect(d.status).toBe('dormant');
    expect(d.retired).toEqual({ at: '2026-01-01T00:00:00.001Z', why: 'outgrew it' });
    ctx.advance(1);
    const a = reactivate(ctx, d);
    expect(a.status).toBe('active');
    expect('retired' in a).toBe(false);
    expect(a.history).toEqual(s.history);
  });

  it('succeeds an idea with a new linked seed', () => {
    const ctx = testCtx();
    const old = createSeed(ctx, { text: 'Kids need firm rules first', kind: 'belief', category: 'Parenting' });
    ctx.advance(1000);
    const { old: o, successor: n } = succeed(ctx, old, { text: 'Kids need connection first' }, 'watched it work');
    expect(o.status).toBe('succeeded');
    expect(o.retired?.why).toBe('watched it work');
    expect(o.links).toEqual([{ type: 'succeededBy', seed: n.id }]);
    expect(n.links).toEqual([{ type: 'succeeds', seed: o.id }]);
    expect(n.kind).toBe('belief');
    expect(n.category).toBe('Parenting');
    expect(n.id).not.toBe(o.id);
    expect(o.history).toEqual(old.history);
  });
});

describe('links', () => {
  it('adds once, never to itself, and removes', () => {
    const ctx = testCtx();
    const s = createSeed(ctx, { text: 'x' });
    const l = addLink(ctx, s, 'related', 'OTHER');
    expect(addLink(ctx, l, 'related', 'OTHER')).toBe(l);
    expect(addLink(ctx, s, 'related', s.id)).toBe(s);
    expect(removeLink(ctx, l, { type: 'related', seed: 'OTHER' }).links).toEqual([]);
  });
});

describe('display', () => {
  it('uses the title, else the first non-empty line', () => {
    const ctx = testCtx();
    expect(displayTitle(createSeed(ctx, { text: 'body', title: 'Title' }))).toBe('Title');
    expect(displayTitle(createSeed(ctx, { text: '\n# Heading\nmore' }))).toBe('Heading');
  });
});

describe('normalizers', () => {
  it('categories', () => {
    expect(normalizeCategory('//a//b  c/')).toBe('a/b c');
    expect(normalizeCategory(' / ')).toBeUndefined();
  });
  it('tags', () => {
    expect(normalizeTags(['A B', '#a-b', '', '##x'])).toEqual(['a-b', 'x']);
  });
});
