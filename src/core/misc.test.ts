import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toFiles, buildIndex, canWrite, FORMAT_VERSION, fromFiles, mergeGrainSets, newManifest } from './files';
import { allCategories, categoryTree, recentCategories } from './categories';
import { suggestKind } from './kinds';
import { searchGrains, similarGrains } from './search';
import { createGrain, revise } from './grain';
import { testCtx } from './testing';
import { encodeUlid, isUlid, ulidTime } from './ulid';

describe('suggestKind', () => {
  it.each([
    ['What does my son need from me?', 'question'],
    ['"The obstacle is the way." — Marcus Aurelius', 'quote'],
    ['I believe most people are doing their best', 'belief'],
    ['Always leave a place better than you found it', 'value'],
    ['I try to get outside before 9 every morning', 'practice'],
    ['Every morning, ten minutes of sunlight', 'practice'],
    ['No phone in the bedroom', 'practice'],
    ["I don't check email before 9", 'practice'],
    ["Don't water tomatoes in the midday sun", 'tip'],
    ['I want to always tell my kids the truth', 'value'],
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
  const tomato = createGrain(ctx, { text: 'Water tomatoes deeply twice a week', category: 'Garden/Tomatoes', tags: ['watering'] });
  const kids = createGrain(ctx, { text: 'Kids need connection before correction', title: 'Connection first', category: 'Parenting' });
  const cpp = createGrain(ctx, { text: 'Use fmt for formatting in C++', category: 'Engineering/C++' });
  const grains = [tomato, kids, cpp];

  it('matches all words, prefix on the last, ignoring case and accents', () => {
    expect(searchGrains(grains, 'WATER tom').map((h) => h.grain)).toEqual([tomato]);
    expect(searchGrains(grains, 'connéction').map((h) => h.grain)).toEqual([kids]);
    expect(searchGrains(grains, 'water kids')).toEqual([]);
  });

  it('ranks title and category matches above body matches', () => {
    const body = createGrain(ctx, { text: 'Assorted notes\nSome thoughts on gardens in general' });
    expect(searchGrains([body, tomato], 'garden')[0]!.grain).toBe(tomato);
  });

  it('finds similar grains while typing a new one', () => {
    expect(similarGrains(grains, 'I should water the tomatoes deeply')).toEqual([tomato]);
    expect(similarGrains(grains, 'Completely unrelated thought here')).toEqual([]);
  });

  it('searches the current revision only', () => {
    const r = revise(ctx, tomato, { text: 'Mulch the beds in June' });
    expect(searchGrains([r], 'twice')).toEqual([]);
    expect(searchGrains([r], 'mulch')).toHaveLength(1);
  });
});

describe('categories', () => {
  const ctx = testCtx();
  const grains = [
    createGrain(ctx, { text: 'a', category: 'Garden/Tomatoes' }),
    createGrain(ctx, { text: 'b', category: 'Garden' }),
    createGrain(ctx, { text: 'c', category: 'Engineering/C++' }),
    createGrain(ctx, { text: 'd' }),
  ];

  it('builds a tree with counts', () => {
    const tree = categoryTree(grains);
    expect(tree.map((n) => [n.path, n.own, n.total])).toEqual([
      ['Engineering', 0, 1],
      ['Garden', 1, 2],
    ]);
    expect(tree[1]!.children[0]).toMatchObject({ path: 'Garden/Tomatoes', own: 1, total: 1 });
  });

  it('lists every path including parents', () => {
    expect(allCategories(grains)).toEqual(['Engineering', 'Engineering/C++', 'Garden', 'Garden/Tomatoes']);
  });

  it('orders recent categories by last use', () => {
    ctx.advance(1000);
    const later = createGrain(ctx, { text: 'e', category: 'Engineering/C++' });
    expect(recentCategories([...grains, later])[0]).toBe('Engineering/C++');
  });
});

describe('schema files', () => {
  const ctx = testCtx();
  const a = createGrain(ctx, { text: 'one', kind: 'tip' });
  const b = createGrain(ctx, { text: 'two', category: 'X' });

  it('exports and imports a schema losslessly', () => {
    const files = toFiles([a, b], { [a.id]: { interval: 3, due: '2026-02-01T00:00:00.000Z' } }, newManifest());
    expect([...files.keys()].sort()).toEqual([`grains/${a.id}.md`, `grains/${b.id}.md`, 'index.json', 'manifest.json', 'review.json']);
    const back = fromFiles(files);
    expect(back.errors).toEqual([]);
    expect(back.grains.sort((x, y) => x.id.localeCompare(y.id))).toEqual([a, b]);
    expect(back.review?.[a.id]?.interval).toBe(3);
    expect(back.manifest?.formatVersion).toBe(FORMAT_VERSION);
  });

  it('reads schemas nested in a single folder and reports bad files', () => {
    const files = new Map([
      [`schema-export/grains/${a.id}.md`, toFiles([a], {}, newManifest()).get(`grains/${a.id}.md`)!],
      ['schema-export/grains/broken.md', 'nope'],
    ]);
    const back = fromFiles(files);
    expect(back.grains).toEqual([a]);
    expect(back.errors.map((e) => e.path)).toEqual(['schema-export/grains/broken.md']);
  });

  it('merges imports without losing anything', () => {
    ctx.advance(10);
    const a2 = revise(ctx, a, { text: 'one, revised' });
    const r = mergeGrainSets([a2, b], [a, createGrain(ctx, { text: 'three' })]);
    expect(r.added).toBe(1);
    expect(r.merged).toBe(0);
    expect(r.grains.find((s) => s.id === a.id)!.history).toHaveLength(2);
  });

  it('imports exports from before the rename (seeds/ and seedbank.json)', () => {
    const grainFile = toFiles([a], {}, newManifest()).get(`grains/${a.id}.md`)!;
    const back = fromFiles(new Map([
      ['seedbank/seedbank.json', JSON.stringify(newManifest())],
      [`seedbank/seeds/${a.id}.md`, grainFile],
    ]));
    expect(back.errors).toEqual([]);
    expect(back.grains).toEqual([a]);
    expect(back.manifest).not.toBeNull();
  });

  it('builds index.json from grains alone', () => {
    const idx = buildIndex([b, a]);
    expect(idx.grains.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(idx.grains[0]).toMatchObject({ title: 'one', kind: 'tip', revisions: 1, text: 'one' });
  });

  it('refuses to write a schema from a newer app', () => {
    expect(canWrite({ formatVersion: FORMAT_VERSION })).toBe(true);
    expect(canWrite({ formatVersion: FORMAT_VERSION + 1 })).toBe(false);
  });
});
