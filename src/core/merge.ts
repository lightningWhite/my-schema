/**
 * Merging two versions of the same grain (docs/design.md §3.5).
 *
 * - History: union of entries, newest first. Append-only history means two
 *   devices' revisions never conflict; they interleave.
 * - Metadata: three-way per field against the common ancestor (`base`, the
 *   last version both sides saw). A field changed on one side only takes that
 *   side's value; changed on both, the side with the later `updated` wins.
 *   Without a base (first sync, import), the later `updated` wins every field.
 * - Tags and links: three-way set merge, so an addition on one device and a
 *   removal on the other both survive.
 *
 * The result does not depend on which side is "ours": merge(b, x, y) equals
 * merge(b, y, x). Property-tested.
 */
import { cmpAt, laterAt } from './time';
import type { HistoryEntry, Link, Grain } from './types';

type FieldKey = 'title' | 'kind' | 'category' | 'source' | 'origin';

const FIELDS: FieldKey[] = ['title', 'kind', 'category', 'source', 'origin'];

export function mergeGrains(base: Grain | null, a: Grain, b: Grain): Grain {
  if (a.id !== b.id || (base && base.id !== a.id)) throw new Error('Cannot merge different grains');

  // Which side wins a true conflict. Deterministic regardless of argument order.
  const cmp = cmpAt(a.updated, b.updated) || compareJson(a, b);
  const winner = cmp >= 0 ? a : b;

  const pick = <T>(get: (s: Grain) => T): T => {
    const va = get(a);
    const vb = get(b);
    if (equal(va, vb)) return va;
    if (base) {
      const vbase = get(base);
      if (equal(va, vbase)) return vb;
      if (equal(vb, vbase)) return va;
    }
    return get(winner);
  };

  const out: Grain = {
    id: a.id,
    status: 'active',
    tags: mergeSet(base?.tags ?? null, a.tags, b.tags, (t) => t),
    links: mergeSet(base?.links ?? null, a.links, b.links, linkKey),
    origin: null,
    updated: laterAt(a.updated, b.updated),
    history: mergeHistory(a.history, b.history),
    extra: {},
  };

  for (const key of FIELDS) {
    const v = pick((s) => s[key]);
    if (v !== undefined) (out as unknown as Record<string, unknown>)[key] = v;
  }
  if (out.origin === undefined) out.origin = null;

  // Status and retirement move together: they describe one decision.
  const lifecycle = pick((s) => ({ status: s.status, retired: s.retired }));
  out.status = lifecycle.status;
  if (lifecycle.retired) out.retired = lifecycle.retired;

  const extraKeys = new Set([...Object.keys(a.extra), ...Object.keys(b.extra)]);
  for (const k of [...extraKeys].sort()) {
    const v = pick((s) => s.extra[k]);
    if (v !== undefined) out.extra[k] = v;
  }

  return out;
}

/** Union of both histories, newest first, duplicates removed. */
export function mergeHistory(a: HistoryEntry[], b: HistoryEntry[]): HistoryEntry[] {
  const seen = new Map<string, HistoryEntry>();
  for (const e of [...a, ...b]) {
    const k = entryKey(e);
    if (!seen.has(k)) seen.set(k, e);
  }
  return [...seen.entries()]
    .sort(([ka, ea], [kb, eb]) => cmpAt(eb.at, ea.at) || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .map(([, e]) => e);
}

function entryKey(e: HistoryEntry): string {
  switch (e.type) {
    case 'reaffirmation':
      return JSON.stringify(['a', Date.parse(e.at)]);
    case 'kindChange':
      return JSON.stringify(['k', Date.parse(e.at), e.from, e.to]);
    case 'revision':
      return JSON.stringify(['r', Date.parse(e.at), e.text, e.details ?? null, e.confidence ?? null, e.why ?? null]);
  }
}

/**
 * Three-way set merge. Keeps the base's order for surviving items, then
 * appends additions from either side in sorted order.
 */
function mergeSet<T>(base: T[] | null, a: T[], b: T[], key: (x: T) => string): T[] {
  const ka = new Map(a.map((x) => [key(x), x]));
  const kb = new Map(b.map((x) => [key(x), x]));
  const kbase = new Set((base ?? []).map(key));
  const keep = (k: string) => {
    const inA = ka.has(k);
    const inB = kb.has(k);
    if (inA && inB) return true;
    if (!base) return inA || inB; // no ancestor: union
    return (inA || inB) && !kbase.has(k); // added on one side; or removed on one side → drop
  };
  const out: T[] = [];
  const done = new Set<string>();
  for (const x of base ?? []) {
    const k = key(x);
    if (keep(k) && !done.has(k)) {
      out.push(ka.get(k) ?? kb.get(k)!);
      done.add(k);
    }
  }
  const added = [...new Set([...ka.keys(), ...kb.keys()])].filter((k) => !done.has(k) && keep(k)).sort();
  for (const k of added) out.push(ka.get(k) ?? kb.get(k)!);
  return out;
}

function linkKey(l: Link): string {
  return `${l.type}:${l.grain}`;
}

function equal(x: unknown, y: unknown): boolean {
  return canonical(x) === canonical(y);
}

function compareJson(x: unknown, y: unknown): number {
  const cx = canonical(x);
  const cy = canonical(y);
  return cx < cy ? -1 : cx > cy ? 1 : 0;
}

/** JSON with sorted keys and undefined dropped, for structural comparison. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([p], [q]) => (p < q ? -1 : 1)));
    }
    return val;
  }) ?? 'undefined';
}
