import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { escapeText, parseTidbit, TidbitFormatError, serializeTidbit, unescapeText } from './format';
import { arbTidbit } from './arbitraries';
import type { Tidbit } from './types';

const DESIGN_EXAMPLE = `---
id: 01JDA7Q3V2N8XK5M4R6T9WBYCE
title: Deep watering beats frequent watering
kind: insight
status: active
category: Garden/Tomatoes
tags: [watering]
links: []
origin: null
---

<!-- rev at=2027-07-14T03:12:00Z confidence=confident -->
Water tomatoes deeply twice a week, and every day once it's above 95°F.

<!-- why -->
Lost half the crop in the July heat wave on the twice-a-week schedule.

<!-- rev at=2026-11-19T15:30:00Z confidence=leaning -->
Water tomatoes deeply twice a week instead of a little every day.
`;

describe('parseTidbit', () => {
  it('reads the example from the design doc', () => {
    const tidbit = parseTidbit(DESIGN_EXAMPLE);
    expect(tidbit).toMatchObject({
      id: '01JDA7Q3V2N8XK5M4R6T9WBYCE',
      title: 'Deep watering beats frequent watering',
      kind: 'insight',
      status: 'active',
      category: 'Garden/Tomatoes',
      tags: ['watering'],
      links: [],
      origin: null,
      updated: '2027-07-14T03:12:00Z',
    });
    expect(tidbit.history).toEqual([
      {
        type: 'revision',
        at: '2027-07-14T03:12:00Z',
        confidence: 'confident',
        text: "Water tomatoes deeply twice a week, and every day once it's above 95°F.",
        why: 'Lost half the crop in the July heat wave on the twice-a-week schedule.',
      },
      {
        type: 'revision',
        at: '2026-11-19T15:30:00Z',
        confidence: 'leaning',
        text: 'Water tomatoes deeply twice a week instead of a little every day.',
      },
    ]);
  });

  it('reads reaffirmations between revisions', () => {
    const file = DESIGN_EXAMPLE.replace(
      '<!-- rev at=2027',
      '<!-- reaffirmed at=2028-03-02T14:00:00Z -->\n\n<!-- rev at=2027',
    );
    const tidbit = parseTidbit(file);
    expect(tidbit.history[0]).toEqual({ type: 'reaffirmation', at: '2028-03-02T14:00:00Z' });
    expect(tidbit.history).toHaveLength(3);
  });

  it('preserves unknown frontmatter fields', () => {
    const file = DESIGN_EXAMPLE.replace('origin: null\n', 'origin: null\nmood: hopeful\nfuture: { a: [1, 2] }\n');
    const tidbit = parseTidbit(file);
    expect(tidbit.extra).toEqual({ mood: 'hopeful', future: { a: [1, 2] } });
    expect(parseTidbit(serializeTidbit(tidbit)).extra).toEqual(tidbit.extra);
    expect(serializeTidbit(tidbit)).toContain('mood: hopeful');
  });

  it('tolerates a file without the trailing blank line, and CRLF-free BOM', () => {
    const tidbit = parseTidbit('\uFEFF' + DESIGN_EXAMPLE.trimEnd());
    expect(tidbit.history[1]).toMatchObject({ text: 'Water tomatoes deeply twice a week instead of a little every day.' });
  });

  it('rejects files it cannot understand', () => {
    expect(() => parseTidbit('no frontmatter')).toThrow(TidbitFormatError);
    expect(() => parseTidbit('---\nid: x\n---\n\n')).toThrow(/no revisions/);
    expect(() => parseTidbit(DESIGN_EXAMPLE.replace('kind: insight', 'kind: rumor'))).toThrow(/Unknown kind/);
    expect(() => parseTidbit('---\nid: x\n---\n\n<!-- why -->\nx\n')).toThrow(/why block/);
  });
});

describe('escaping', () => {
  it('escapes lines that look like markers, and nothing else', () => {
    const text = '<!-- rev at=x -->\n<!-- why -->\n<!-- reaffirmed at=y -->\n<!-- \\already\n<!-- a normal comment -->';
    const escaped = escapeText(text);
    expect(escaped).toBe(
      '<!-- \\rev at=x -->\n<!-- \\why -->\n<!-- \\reaffirmed at=y -->\n<!-- \\\\already\n<!-- a normal comment -->',
    );
    expect(unescapeText(escaped)).toBe(text);
  });

  it('keeps marker-like tidbit text from breaking the file', () => {
    const tidbit = parseTidbit(DESIGN_EXAMPLE);
    const tricky: Tidbit = {
      ...tidbit,
      history: [{ type: 'revision', at: '2028-01-01T00:00:00Z', text: 'Line one\n<!-- rev at=evil -->\n<!-- why -->\nend' }, ...tidbit.history],
    };
    expect(parseTidbit(serializeTidbit(tricky))).toEqual(tricky);
  });
});

describe('round trip (property)', () => {
  it('parse(serialize(tidbit)) equals tidbit', () => {
    fc.assert(
      fc.property(arbTidbit, (tidbit) => {
        expect(parseTidbit(serializeTidbit(tidbit))).toEqual(tidbit);
      }),
      { numRuns: 500 },
    );
  });

  it('serialize is stable: serialize(parse(serialize(tidbit))) equals serialize(tidbit)', () => {
    fc.assert(
      fc.property(arbTidbit, (tidbit) => {
        const once = serializeTidbit(tidbit);
        expect(serializeTidbit(parseTidbit(once))).toBe(once);
      }),
      { numRuns: 300 },
    );
  });
});

describe('details blocks', () => {
  it('reads and writes details between the tidbit and the why', () => {
    const file = `---
id: 01JDA7Q3V2N8XK5M4R6T9WBYCE
status: active
tags: []
links: []
origin: null
updated: 2027-07-14T03:12:00Z
---

<!-- rev at=2027-07-14T03:12:00Z confidence=confident -->
Clouds form where the conditions are right

<!-- details -->
Warm, moist air rises and cools; water condenses on dust.

<!-- why -->
Read about it after a flight.

`;
    const g = parseTidbit(file);
    expect(g.history[0]).toEqual({
      type: 'revision',
      at: '2027-07-14T03:12:00Z',
      confidence: 'confident',
      text: 'Clouds form where the conditions are right',
      details: 'Warm, moist air rises and cools; water condenses on dust.',
      why: 'Read about it after a flight.',
    });
    expect(serializeTidbit(g)).toBe(file);
  });

  it('rejects details after a why, or twice', () => {
    const base = '---\nid: x\n---\n\n<!-- rev at=2020-01-01T00:00:00Z -->\nT\n\n';
    expect(() => parseTidbit(base + '<!-- why -->\nw\n\n<!-- details -->\nd\n')).toThrow(/details block/);
    expect(() => parseTidbit(base + '<!-- details -->\nd\n\n<!-- details -->\nd\n')).toThrow(/details block/);
  });
});

describe('kind changes and drafts in files', () => {
  it('round-trips a kind change and a draft status', () => {
    const file = `---
id: 01JDA7Q3V2N8XK5M4R6T9WBYCE
kind: fact
status: draft
tags: []
links: []
origin: null
updated: 2027-08-01T00:00:00Z
---

<!-- kind at=2027-08-01T00:00:00Z from=insight to=fact -->

<!-- rev at=2027-07-14T03:12:00Z -->
Clouds form where the conditions are right

`;
    const g = parseTidbit(file);
    expect(g.status).toBe('draft');
    expect(g.history[0]).toEqual({ type: 'kindChange', at: '2027-08-01T00:00:00Z', from: 'insight', to: 'fact' });
    expect(serializeTidbit(g)).toBe(file);
  });
});
