/** fast-check generators for property tests. Not imported by app code. */
import fc from 'fast-check';
import { CONFIDENCES, KINDS, LINK_TYPES, STATUSES, type HistoryEntry, type Grain } from './types';
import { encodeUlid } from './ulid';

/** Text that tries hard to break the file format. */
const nasty = fc.constantFrom(
  '\n',
  '\n\n',
  '<!-- rev at=2020-01-01T00:00:00Z -->',
  '<!-- why -->',
  '<!-- reaffirmed at=2020-01-01T00:00:00Z -->',
  '<!-- \\',
  '<!-- ',
  '---',
  '\n---\n',
  ': ',
  '#',
  '"',
  "'",
  '\t',
  '\r',
  ' ',
  'é',
  '🌱',
);

export const arbText = fc
  .array(fc.oneof(fc.string({ unit: 'grapheme', maxLength: 12 }), nasty), { maxLength: 12 })
  .map((parts) => parts.join(''));

const arbShort = fc.oneof(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 20 }), nasty, fc.constantFrom('null', 'yes', '123', 'true', '~'));

export const arbAt = fc
  .integer({ min: Date.parse('2000-01-01'), max: Date.parse('2100-01-01') })
  .map((ms) => new Date(ms).toISOString());

export const arbId = fc
  .tuple(fc.integer({ min: 0, max: 2 ** 40 }), fc.uint8Array({ minLength: 10, maxLength: 10 }))
  .map(([t, r]) => encodeUlid(t, r));

const arbRevision = fc.record(
  {
    type: fc.constant('revision' as const),
    at: arbAt,
    text: arbText,
    details: arbText,
    confidence: fc.constantFrom(...CONFIDENCES),
    why: arbText,
  },
  { requiredKeys: ['type', 'at', 'text'] },
);

const arbReaffirmation = fc.record({ type: fc.constant('reaffirmation' as const), at: arbAt });

export const arbHistory = fc
  .tuple(arbRevision, fc.array(fc.oneof(arbRevision, arbReaffirmation), { maxLength: 6 }))
  .map(([first, rest]): HistoryEntry[] => {
    // The app gives every entry a distinct timestamp (each is strictly after the last).
    const seen = new Set<string>();
    return [first, ...rest]
      .filter((e) => !seen.has(e.at) && seen.add(e.at))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  });

const arbExtraValue = fc.oneof(
  fc.string({ maxLength: 10 }),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string({ maxLength: 5 }), { maxLength: 3 }),
  fc.dictionary(fc.stringMatching(/^[a-z]{1,5}$/), fc.string({ maxLength: 5 }), { maxKeys: 2 }),
);

export const arbGrain: fc.Arbitrary<Grain> = fc
  .record(
    {
      id: arbId,
      title: arbShort,
      kind: fc.constantFrom(...KINDS),
      status: fc.constantFrom(...STATUSES),
      category: arbShort,
      tags: fc.array(arbShort, { maxLength: 4 }),
      links: fc.array(fc.record({ type: fc.constantFrom(...LINK_TYPES), grain: arbId }), { maxLength: 3 }),
      origin: fc.option(fc.record({ repo: arbShort, grain: arbId, revision: arbAt }), { nil: null }),
      source: arbShort,
      retired: fc.record({ at: arbAt, why: arbShort }, { requiredKeys: ['at'] }),
      updated: arbAt,
      history: arbHistory,
      extra: fc.dictionary(fc.stringMatching(/^x[a-z]{0,6}$/), arbExtraValue, { maxKeys: 3 }),
    },
    { requiredKeys: ['id', 'status', 'tags', 'links', 'origin', 'updated', 'history', 'extra'] },
  );
