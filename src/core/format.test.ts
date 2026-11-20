import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { escapeText, parseGrain, GrainFormatError, serializeGrain, unescapeText } from './format';
import { arbGrain } from './arbitraries';
import type { Grain } from './types';

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

describe('parseGrain', () => {
  it('reads the example from the design doc', () => {
    const grain = parseGrain(DESIGN_EXAMPLE);
    expect(grain).toMatchObject({
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
    expect(grain.history).toEqual([
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
    const grain = parseGrain(file);
    expect(grain.history[0]).toEqual({ type: 'reaffirmation', at: '2028-03-02T14:00:00Z' });
    expect(grain.history).toHaveLength(3);
  });

  it('preserves unknown frontmatter fields', () => {
    const file = DESIGN_EXAMPLE.replace('origin: null\n', 'origin: null\nmood: hopeful\nfuture: { a: [1, 2] }\n');
    const grain = parseGrain(file);
    expect(grain.extra).toEqual({ mood: 'hopeful', future: { a: [1, 2] } });
    expect(parseGrain(serializeGrain(grain)).extra).toEqual(grain.extra);
    expect(serializeGrain(grain)).toContain('mood: hopeful');
  });

  it('tolerates a file without the trailing blank line, and CRLF-free BOM', () => {
    const grain = parseGrain('\uFEFF' + DESIGN_EXAMPLE.trimEnd());
    expect(grain.history[1]).toMatchObject({ text: 'Water tomatoes deeply twice a week instead of a little every day.' });
  });

  it('rejects files it cannot understand', () => {
    expect(() => parseGrain('no frontmatter')).toThrow(GrainFormatError);
    expect(() => parseGrain('---\nid: x\n---\n\n')).toThrow(/no revisions/);
    expect(() => parseGrain(DESIGN_EXAMPLE.replace('kind: insight', 'kind: rumor'))).toThrow(/Unknown kind/);
    expect(() => parseGrain('---\nid: x\n---\n\n<!-- why -->\nx\n')).toThrow(/why block/);
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

  it('keeps marker-like grain text from breaking the file', () => {
    const grain = parseGrain(DESIGN_EXAMPLE);
    const tricky: Grain = {
      ...grain,
      history: [{ type: 'revision', at: '2028-01-01T00:00:00Z', text: 'Line one\n<!-- rev at=evil -->\n<!-- why -->\nend' }, ...grain.history],
    };
    expect(parseGrain(serializeGrain(tricky))).toEqual(tricky);
  });
});

describe('round trip (property)', () => {
  it('parse(serialize(grain)) equals grain', () => {
    fc.assert(
      fc.property(arbGrain, (grain) => {
        expect(parseGrain(serializeGrain(grain))).toEqual(grain);
      }),
      { numRuns: 500 },
    );
  });

  it('serialize is stable: serialize(parse(serialize(grain))) equals serialize(grain)', () => {
    fc.assert(
      fc.property(arbGrain, (grain) => {
        const once = serializeGrain(grain);
        expect(serializeGrain(parseGrain(once))).toBe(once);
      }),
      { numRuns: 300 },
    );
  });
});
