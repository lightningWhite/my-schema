/**
 * Seed operations. Each takes the current seed and returns a new one; nothing
 * is mutated. History is append-only (CLAUDE.md rule 3): these functions only
 * ever add entries.
 */
import { laterAt, strictlyAfter } from './time';
import type { Confidence, Ctx, HistoryEntry, Kind, Link, LinkType, Origin, Revision, Seed } from './types';

export interface NewSeed {
  text: string;
  title?: string;
  kind?: Kind;
  category?: string;
  tags?: string[];
  confidence?: Confidence;
  source?: string;
  origin?: Origin;
}

export function createSeed(ctx: Ctx, input: NewSeed): Seed {
  const text = cleanText(input.text);
  if (!text) throw new Error('A seed needs some text');
  const at = ctx.now();
  const revision: Revision = { type: 'revision', at, text };
  if (input.confidence) revision.confidence = input.confidence;
  const seed: Seed = {
    id: ctx.newId(),
    status: 'active',
    tags: normalizeTags(input.tags ?? []),
    links: [],
    origin: input.origin ?? null,
    updated: at,
    history: [revision],
    extra: {},
  };
  const title = cleanOptional(input.title);
  if (title) seed.title = title;
  if (input.kind) seed.kind = input.kind;
  const category = normalizeCategory(input.category);
  if (category) seed.category = category;
  const source = cleanOptional(input.source);
  if (source) seed.source = source;
  return seed;
}

// ---------------------------------------------------------------- reading

export function currentRevision(seed: Seed): Revision {
  const rev = seed.history.find((e): e is Revision => e.type === 'revision');
  if (!rev) throw new Error(`Seed ${seed.id} has no revisions`);
  return rev;
}

export function revisions(seed: Seed): Revision[] {
  return seed.history.filter((e): e is Revision => e.type === 'revision');
}

/** What a list shows for a seed: its title, else the first line of its text. */
export function displayTitle(seed: Seed): string {
  if (seed.title) return seed.title;
  const text = currentRevision(seed).text;
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  return line.replace(/^#+\s*/, '').trim();
}

export function isUnsorted(seed: Seed): boolean {
  return seed.category === undefined;
}

/** When the seed was first written. */
export function createdAt(seed: Seed): string {
  return seed.history[seed.history.length - 1]!.at;
}

/** Soft length hint threshold (docs/design.md §2.5). */
export const SOFT_LENGTH = 500;

// ---------------------------------------------------------------- changing

export interface RevisionInput {
  text: string;
  confidence?: Confidence;
  why?: string;
}

/**
 * Add a revision. Returns the seed unchanged if neither the text nor the
 * confidence changed (saving the editor without edits is not a revision).
 */
export function revise(ctx: Ctx, seed: Seed, input: RevisionInput): Seed {
  const text = cleanText(input.text);
  if (!text) throw new Error('A revision needs some text');
  const cur = currentRevision(seed);
  if (text === cur.text && input.confidence === cur.confidence) return seed;
  const at = nextAt(ctx, seed);
  const rev: Revision = { type: 'revision', at, text };
  if (input.confidence) rev.confidence = input.confidence;
  const why = cleanOptional(input.why);
  if (why) rev.why = why;
  return { ...seed, history: [rev, ...seed.history], updated: at };
}

/** Record "still true" from a review. */
export function reaffirm(ctx: Ctx, seed: Seed): Seed {
  const at = nextAt(ctx, seed);
  const entry: HistoryEntry = { type: 'reaffirmation', at };
  return { ...seed, history: [entry, ...seed.history], updated: at };
}

export interface MetaPatch {
  title?: string | null;
  kind?: Kind | null;
  category?: string | null;
  tags?: string[];
  source?: string | null;
}

/**
 * Change metadata. A field set to null (or an empty string) is cleared;
 * a field left undefined is unchanged.
 */
export function updateMeta(ctx: Ctx, seed: Seed, patch: MetaPatch): Seed {
  const next: Seed = { ...seed };
  if (patch.title !== undefined) setOrClear(next, 'title', cleanOptional(patch.title ?? undefined));
  if (patch.kind !== undefined) setOrClear(next, 'kind', patch.kind ?? undefined);
  if (patch.category !== undefined) setOrClear(next, 'category', normalizeCategory(patch.category ?? undefined));
  if (patch.source !== undefined) setOrClear(next, 'source', cleanOptional(patch.source ?? undefined));
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
  if (sameMeta(seed, next)) return seed;
  next.updated = nextUpdated(ctx, seed);
  return next;
}

/** Retire a seed with nothing replacing it. */
export function goDormant(ctx: Ctx, seed: Seed, why?: string): Seed {
  const at = nextUpdated(ctx, seed);
  const w = cleanOptional(why);
  return { ...seed, status: 'dormant', retired: w ? { at, why: w } : { at }, updated: at };
}

/** Bring a dormant or succeeded seed back to active. Its links are kept. */
export function reactivate(ctx: Ctx, seed: Seed): Seed {
  if (seed.status === 'active') return seed;
  const { retired: _retired, ...rest } = seed;
  return { ...rest, status: 'active', updated: nextUpdated(ctx, seed) };
}

/**
 * Replace a seed with a different idea. Returns the retired old seed and the
 * new one, linked both ways. The new seed inherits kind and category.
 */
export function succeed(ctx: Ctx, old: Seed, input: NewSeed, why?: string): { old: Seed; successor: Seed } {
  const successor = createSeed(ctx, {
    kind: old.kind,
    category: old.category,
    tags: old.tags,
    ...input,
  });
  successor.links = [{ type: 'succeeds', seed: old.id }];
  const at = nextUpdated(ctx, old);
  const w = cleanOptional(why);
  const retiredOld: Seed = {
    ...old,
    status: 'succeeded',
    retired: w ? { at, why: w } : { at },
    links: [...old.links.filter((l) => l.type !== 'succeededBy'), { type: 'succeededBy', seed: successor.id }],
    updated: at,
  };
  return { old: retiredOld, successor };
}

/**
 * Start a new seed that grows out of an existing one — e.g. turning the
 * insight "I'm happier on 8 hours of sleep" into the practice "In bed by
 * 10:30". The source keeps a `supports` link to the new seed; the new seed
 * shows it as "supported by" through backlinks. Unlike succeed, the source
 * stays active: both ideas stand.
 */
export function spinOff(ctx: Ctx, source: Seed, input: NewSeed, type: LinkType = 'supports'): { source: Seed; child: Seed } {
  const child = createSeed(ctx, { category: source.category, tags: source.tags, ...input });
  return { source: addLink(ctx, source, type, child.id), child };
}

export interface Connection {
  /** Phrase describing how `seed` relates to the one being viewed. */
  label: string;
  seed: Seed;
}

const OUTGOING: Record<LinkType, string> = {
  related: 'Related',
  supports: 'Supports',
  contradicts: 'Contradicts',
  succeededBy: 'Replaced by',
  succeeds: 'Replaces',
};
const INCOMING: Record<LinkType, string> = {
  related: 'Related',
  supports: 'Supported by',
  contradicts: 'Contradicted by',
  succeededBy: 'Replaces',
  succeeds: 'Replaced by',
};

/**
 * Every seed connected to `seed`, from its own links and from links other
 * seeds hold to it. Links are stored once, on one side; this reads both.
 */
export function connections(seed: Seed, all: Seed[]): Connection[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const out: Connection[] = [];
  const seen = new Set<string>();
  const push = (label: string, s: Seed | undefined) => {
    if (!s || s.id === seed.id) return;
    const key = `${label}:${s.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, seed: s });
  };
  for (const l of seed.links) push(OUTGOING[l.type], byId.get(l.seed));
  for (const other of all) {
    for (const l of other.links) if (l.seed === seed.id) push(INCOMING[l.type], other);
  }
  return out;
}

export function addLink(ctx: Ctx, seed: Seed, type: LinkType, target: string): Seed {
  if (target === seed.id || seed.links.some((l) => l.type === type && l.seed === target)) return seed;
  return { ...seed, links: [...seed.links, { type, seed: target }], updated: nextUpdated(ctx, seed) };
}

export function removeLink(ctx: Ctx, seed: Seed, link: Link): Seed {
  const links = seed.links.filter((l) => !(l.type === link.type && l.seed === link.seed));
  if (links.length === seed.links.length) return seed;
  return { ...seed, links, updated: nextUpdated(ctx, seed) };
}

// ---------------------------------------------------------------- normalizing

/** `" Garden / Tomatoes/ "` → `"Garden/Tomatoes"`. Empty → undefined. */
export function normalizeCategory(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const parts = path
    .split('/')
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  return parts.length ? parts.join('/') : undefined;
}

/** Trimmed, lowercased, `#` stripped, spaces → dashes, deduplicated, order kept. */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const tag = t.trim().replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, '-');
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function cleanText(text: string): string {
  // Keep inner formatting; drop surrounding blank space and Windows line endings.
  return text.replace(/\r\n?/g, '\n').trim();
}

function cleanOptional(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

function setOrClear<K extends 'title' | 'kind' | 'category' | 'source'>(seed: Seed, key: K, value: Seed[K] | undefined) {
  if (value === undefined) delete seed[key];
  else seed[key] = value;
}

function sameMeta(a: Seed, b: Seed): boolean {
  return (
    a.title === b.title &&
    a.kind === b.kind &&
    a.category === b.category &&
    a.source === b.source &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i])
  );
}

/**
 * Timestamp for a new history entry: now, but strictly after every existing
 * entry, so the newest-first order holds even if this device's clock is behind.
 */
function nextAt(ctx: Ctx, seed: Seed): string {
  const latest = seed.history.reduce((m, e) => laterAt(e.at, m), seed.updated);
  return strictlyAfter(ctx.now(), latest);
}

function nextUpdated(ctx: Ctx, seed: Seed): string {
  return strictlyAfter(ctx.now(), seed.updated);
}
