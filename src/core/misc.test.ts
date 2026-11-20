import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bankToFiles, buildIndex, canWrite, FORMAT_VERSION, filesToBank, mergeBanks, newManifest } from './bank';
import { allCategories, categoryTree, recentCategories } from './categories';
import { suggestKind } from './kinds';
import { searchSeeds, similarSeeds } from './search';
import { createSeed, revise } from './seed';
import { testCtx } from './testing';
import { encodeUlid, isUlid, ulidTime } from './ulid';

describe('suggestKind', () => {
  it.each([
    ['What does my son need from me?', 'question'],
    ['"The obstacle is the way." — Marcus Aurelius', 'quote'],
    ['I believe most people are doing their best', 'belief'],
    ['Always leave a place better than you found it', 'value'],
    ['Maybe remote work revives small towns', 'speculation'],
    ['I learned that I argue worse when hungry', 'insight'],
    ['Tip: use fmt instead of iostream', 'tip'],
    ['What if the bike rack were also a planter', 'idea'],
    ['Did you know tomatoes stop setting fruit above 90F', 'fact'],
  ])('%s → %s', (text, kind) => {
    expect(suggestKind(text)).toBe(kind);
  });

  it('does not guess when unsure', () => {
    expect(suggestKind('Water tomatoes deeply twice a week')).toBeUndefined();
    expect(suggestKind('')).toBeUndefined();
  });
});

describe('ulid', () => {
  it('encodes time and randomness, and sorts by time', () => {
    const r = new Uint8Array(10).fill(255);
    const a = encodeUlid(1_700_000_000_000, r);
    const b = encodeUlid(1_700_000_000_001, new Uint8Array(10));
    expect(isUlid(a)).toBe(true);
    expect(a).toHaveLength(26);
    expect(ulidTime(a)).toBe(1_700_000_000_000);
    expect(a < b).toBe(true);
    expect(a.endsWith('ZZZZZZZZZZZZZZZZ')).toBe(true);
  });

  it('round-trips any valid time', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 48 - 1 }), fc.uint8Array({ minLength: 10, maxLength: 10 }), (t, r) => {
        const id = encodeUlid(t, r);
        expect(isUlid(id)).toBe(true);
        expect(ulidTime(id)).toBe(t);
      }),
    );
  });
});

describe('search', () => {
  const ctx = testCtx();
  const tomato = createSeed(ctx, { text: 'Water tomatoes deeply twice a week', category: 'Garden/Tomatoes', tags: ['watering'] });
  const kids = createSeed(ctx, { text: 'Kids need connection before correction', title: 'Connection first', category: 'Parenting' });
  const cpp = createSeed(ctx, { text: 'Use fmt for formatting in C++', category: 'Engineering/C++' });
  const seeds = [tomato, kids, cpp];

  it('matches all words, prefix on the last, ignoring case and accents', () => {
    expect(searchSeeds(seeds, 'WATER tom').map((h) => h.seed)).toEqual([tomato]);
    expect(searchSeeds(seeds, 'connéction').map((h) => h.seed)).toEqual([kids]);
    expect(searchSeeds(seeds, 'water kids')).toEqual([]);
  });

  it('ranks title and category matches above body matches', () => {
    const body = createSeed(ctx, { text: 'Assorted notes\nSome thoughts on gardens in general' });
    expect(searchSeeds([body, tomato], 'garden')[0]!.seed).toBe(tomato);
  });

  it('finds similar seeds while typing a new one', () => {
    expect(similarSeeds(seeds, 'I should water the tomatoes deeply')).toEqual([tomato]);
    expect(similarSeeds(seeds, 'Completely unrelated thought here')).toEqual([]);
  });

  it('searches the current revision only', () => {
    const r = revise(ctx, tomato, { text: 'Mulch the beds in June' });
    expect(searchSeeds([r], 'twice')).toEqual([]);
    expect(searchSeeds([r], 'mulch')).toHaveLength(1);
  });
});

describe('categories', () => {
  const ctx = testCtx();
  const seeds = [
    createSeed(ctx, { text: 'a', category: 'Garden/Tomatoes' }),
    createSeed(ctx, { text: 'b', category: 'Garden' }),
    createSeed(ctx, { text: 'c', category: 'Engineering/C++' }),
    createSeed(ctx, { text: 'd' }),
  ];

  it('builds a tree with counts', () => {
    const tree = categoryTree(seeds);
    expect(tree.map((n) => [n.path, n.own, n.total])).toEqual([
      ['Engineering', 0, 1],
      ['Garden', 1, 2],
    ]);
    expect(tree[1]!.children[0]).toMatchObject({ path: 'Garden/Tomatoes', own: 1, total: 1 });
  });

  it('lists every path including parents', () => {
    expect(allCategories(seeds)).toEqual(['Engineering', 'Engineering/C++', 'Garden', 'Garden/Tomatoes']);
  });

  it('orders recent categories by last use', () => {
    ctx.advance(1000);
    const later = createSeed(ctx, { text: 'e', category: 'Engineering/C++' });
    expect(recentCategories([...seeds, later])[0]).toBe('Engineering/C++');
  });
});

describe('bank files', () => {
  const ctx = testCtx();
  const a = createSeed(ctx, { text: 'one', kind: 'tip' });
  const b = createSeed(ctx, { text: 'two', category: 'X' });

  it('exports and imports a bank losslessly', () => {
    const files = bankToFiles([a, b], { [a.id]: { interval: 3, due: '2026-02-01T00:00:00.000Z' } }, newManifest());
    expect([...files.keys()].sort()).toEqual(['index.json', 'review.json', 'seedbank.json', `seeds/${a.id}.md`, `seeds/${b.id}.md`]);
    const back = filesToBank(files);
    expect(back.errors).toEqual([]);
    expect(back.seeds.sort((x, y) => x.id.localeCompare(y.id))).toEqual([a, b]);
    expect(back.review?.[a.id]?.interval).toBe(3);
    expect(back.manifest?.formatVersion).toBe(FORMAT_VERSION);
  });

  it('reads banks nested in a single folder and reports bad files', () => {
    const files = new Map([
      [`seedbank-export/seeds/${a.id}.md`, bankToFiles([a], {}, newManifest()).get(`seeds/${a.id}.md`)!],
      ['seedbank-export/seeds/broken.md', 'nope'],
    ]);
    const back = filesToBank(files);
    expect(back.seeds).toEqual([a]);
    expect(back.errors.map((e) => e.path)).toEqual(['seedbank-export/seeds/broken.md']);
  });

  it('merges imports without losing anything', () => {
    ctx.advance(10);
    const a2 = revise(ctx, a, { text: 'one, revised' });
    const r = mergeBanks([a2, b], [a, createSeed(ctx, { text: 'three' })]);
    expect(r.added).toBe(1);
    expect(r.merged).toBe(0);
    expect(r.seeds.find((s) => s.id === a.id)!.history).toHaveLength(2);
  });

  it('builds index.json from seeds alone', () => {
    const idx = buildIndex([b, a]);
    expect(idx.seeds.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(idx.seeds[0]).toMatchObject({ title: 'one', kind: 'tip', revisions: 1, text: 'one' });
  });

  it('refuses to write a bank from a newer app', () => {
    expect(canWrite({ formatVersion: FORMAT_VERSION })).toBe(true);
    expect(canWrite({ formatVersion: FORMAT_VERSION + 1 })).toBe(false);
  });
});
