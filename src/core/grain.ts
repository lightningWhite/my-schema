/**
 * Grain operations. Each takes the current grain and returns a new one; nothing
 * is mutated. History is append-only (CLAUDE.md rule 3): these functions only
 * ever add entries.
 */
import { laterAt, strictlyAfter } from './time';
import type { Confidence, Ctx, HistoryEntry, Kind, Link, LinkType, Origin, Revision, Grain } from './types';

export interface NewGrain {
  text: string;
  title?: string;
  kind?: Kind;
  category?: string;
  tags?: string[];
  confidence?: Confidence;
  source?: string;
  origin?: Origin;
}

export function createGrain(ctx: Ctx, input: NewGrain): Grain {
  const text = cleanText(input.text);
  if (!text) throw new Error('A grain needs some text');
  const at = ctx.now();
  const revision: Revision = { type: 'revision', at, text };
  if (input.confidence) revision.confidence = input.confidence;
  const grain: Grain = {
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
  if (title) grain.title = title;
  if (input.kind) grain.kind = input.kind;
  const category = normalizeCategory(input.category);
  if (category) grain.category = category;
  const source = cleanOptional(input.source);
  if (source) grain.source = source;
  return grain;
}

// ---------------------------------------------------------------- reading

export function currentRevision(grain: Grain): Revision {
  const rev = grain.history.find((e): e is Revision => e.type === 'revision');
  if (!rev) throw new Error(`Grain ${grain.id} has no revisions`);
  return rev;
}

export function revisions(grain: Grain): Revision[] {
  return grain.history.filter((e): e is Revision => e.type === 'revision');
}

/** What a list shows for a grain: its title, else the first line of its text. */
export function displayTitle(grain: Grain): string {
  if (grain.title) return grain.title;
  const text = currentRevision(grain).text;
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  return line.replace(/^#+\s*/, '').trim();
}

export function isUnsorted(grain: Grain): boolean {
  return grain.category === undefined;
}

/** When the grain was first written. */
export function createdAt(grain: Grain): string {
  return grain.history[grain.history.length - 1]!.at;
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
 * Add a revision. Returns the grain unchanged if neither the text nor the
 * confidence changed (saving the editor without edits is not a revision).
 */
export function revise(ctx: Ctx, grain: Grain, input: RevisionInput): Grain {
  const text = cleanText(input.text);
  if (!text) throw new Error('A revision needs some text');
  const cur = currentRevision(grain);
  if (text === cur.text && input.confidence === cur.confidence) return grain;
  const at = nextAt(ctx, grain);
  const rev: Revision = { type: 'revision', at, text };
  if (input.confidence) rev.confidence = input.confidence;
  const why = cleanOptional(input.why);
  if (why) rev.why = why;
  return { ...grain, history: [rev, ...grain.history], updated: at };
}

/** Record "still true" from a review. */
export function reaffirm(ctx: Ctx, grain: Grain): Grain {
  const at = nextAt(ctx, grain);
  const entry: HistoryEntry = { type: 'reaffirmation', at };
  return { ...grain, history: [entry, ...grain.history], updated: at };
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
export function updateMeta(ctx: Ctx, grain: Grain, patch: MetaPatch): Grain {
  const next: Grain = { ...grain };
  if (patch.title !== undefined) setOrClear(next, 'title', cleanOptional(patch.title ?? undefined));
  if (patch.kind !== undefined) setOrClear(next, 'kind', patch.kind ?? undefined);
  if (patch.category !== undefined) setOrClear(next, 'category', normalizeCategory(patch.category ?? undefined));
  if (patch.source !== undefined) setOrClear(next, 'source', cleanOptional(patch.source ?? undefined));
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
  if (sameMeta(grain, next)) return grain;
  next.updated = nextUpdated(ctx, grain);
  return next;
}

/** Retire a grain with nothing replacing it. */
export function goDormant(ctx: Ctx, grain: Grain, why?: string): Grain {
  const at = nextUpdated(ctx, grain);
  const w = cleanOptional(why);
  return { ...grain, status: 'dormant', retired: w ? { at, why: w } : { at }, updated: at };
}

/** Bring a dormant or succeeded grain back to active. Its links are kept. */
export function reactivate(ctx: Ctx, grain: Grain): Grain {
  if (grain.status === 'active') return grain;
  const { retired: _retired, ...rest } = grain;
  return { ...rest, status: 'active', updated: nextUpdated(ctx, grain) };
}

/**
 * Replace a grain with a different idea. Returns the retired old grain and the
 * new one, linked both ways. The new grain inherits kind and category.
 */
export function succeed(ctx: Ctx, old: Grain, input: NewGrain, why?: string): { old: Grain; successor: Grain } {
  const successor = createGrain(ctx, {
    kind: old.kind,
    category: old.category,
    tags: old.tags,
    ...input,
  });
  successor.links = [{ type: 'succeeds', grain: old.id }];
  const at = nextUpdated(ctx, old);
  const w = cleanOptional(why);
  const retiredOld: Grain = {
    ...old,
    status: 'succeeded',
    retired: w ? { at, why: w } : { at },
    links: [...old.links.filter((l) => l.type !== 'succeededBy'), { type: 'succeededBy', grain: successor.id }],
    updated: at,
  };
  return { old: retiredOld, successor };
}

/**
 * Start a new grain that grows out of an existing one — e.g. turning the
 * insight "I'm happier on 8 hours of sleep" into the practice "In bed by
 * 10:30". The source keeps a `supports` link to the new grain; the new grain
 * shows it as "supported by" through backlinks. Unlike succeed, the source
 * stays active: both ideas stand.
 */
export function spinOff(ctx: Ctx, source: Grain, input: NewGrain, type: LinkType = 'supports'): { source: Grain; child: Grain } {
  const child = createGrain(ctx, { category: source.category, tags: source.tags, ...input });
  return { source: addLink(ctx, source, type, child.id), child };
}

export interface Connection {
  /** Phrase describing how `grain` relates to the one being viewed. */
  label: string;
  grain: Grain;
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
 * Every grain connected to `grain`, from its own links and from links other
 * grains hold to it. Links are stored once, on one side; this reads both.
 */
export function connections(grain: Grain, all: Grain[]): Connection[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const out: Connection[] = [];
  const seen = new Set<string>();
  const push = (label: string, s: Grain | undefined) => {
    if (!s || s.id === grain.id) return;
    const key = `${label}:${s.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, grain: s });
  };
  for (const l of grain.links) push(OUTGOING[l.type], byId.get(l.grain));
  for (const other of all) {
    for (const l of other.links) if (l.grain === grain.id) push(INCOMING[l.type], other);
  }
  return out;
}

export function addLink(ctx: Ctx, grain: Grain, type: LinkType, target: string): Grain {
  if (target === grain.id || grain.links.some((l) => l.type === type && l.grain === target)) return grain;
  return { ...grain, links: [...grain.links, { type, grain: target }], updated: nextUpdated(ctx, grain) };
}

export function removeLink(ctx: Ctx, grain: Grain, link: Link): Grain {
  const links = grain.links.filter((l) => !(l.type === link.type && l.grain === link.grain));
  if (links.length === grain.links.length) return grain;
  return { ...grain, links, updated: nextUpdated(ctx, grain) };
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

function setOrClear<K extends 'title' | 'kind' | 'category' | 'source'>(grain: Grain, key: K, value: Grain[K] | undefined) {
  if (value === undefined) delete grain[key];
  else grain[key] = value;
}

function sameMeta(a: Grain, b: Grain): boolean {
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
function nextAt(ctx: Ctx, grain: Grain): string {
  const latest = grain.history.reduce((m, e) => laterAt(e.at, m), grain.updated);
  return strictlyAfter(ctx.now(), latest);
}

function nextUpdated(ctx: Ctx, grain: Grain): string {
  return strictlyAfter(ctx.now(), grain.updated);
}
