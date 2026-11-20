/**
 * Tidbit operations. Each takes the current tidbit and returns a new one; nothing
 * is mutated. History is append-only (CLAUDE.md rule 3): these functions only
 * ever add entries.
 */
import { laterAt, strictlyAfter } from './time';
import type { Confidence, Ctx, HistoryEntry, Kind, Link, LinkType, Origin, Revision, Tidbit } from './types';

export interface NewTidbit {
  /** Save as a draft (quick capture) rather than active. */
  draft?: boolean;
  /** The tidbit. If it has several lines, the first is the tidbit and the rest become details. */
  text: string;
  details?: string;
  title?: string;
  kind?: Kind;
  category?: string;
  tags?: string[];
  confidence?: Confidence;
  source?: string;
  origin?: Origin;
}

export function createTidbit(ctx: Ctx, input: NewTidbit): Tidbit {
  const { text, details } = splitTidbit(input.text, input.details);
  if (!text) throw new Error('A tidbit needs some text');
  const at = ctx.now();
  const revision: Revision = { type: 'revision', at, text };
  if (details) revision.details = details;
  if (input.confidence) revision.confidence = input.confidence;
  const tidbit: Tidbit = {
    id: ctx.newId(),
    status: input.draft ? 'draft' : 'active',
    tags: normalizeTags(input.tags ?? []),
    links: [],
    origin: input.origin ?? null,
    updated: at,
    history: [revision],
    extra: {},
  };
  const title = cleanOptional(input.title);
  if (title) tidbit.title = title;
  if (input.kind) tidbit.kind = input.kind;
  const category = normalizeCategory(input.category);
  if (category) tidbit.category = category;
  const source = cleanOptional(input.source);
  if (source) tidbit.source = source;
  return tidbit;
}

// ---------------------------------------------------------------- reading

export function currentRevision(tidbit: Tidbit): Revision {
  const rev = tidbit.history.find((e): e is Revision => e.type === 'revision');
  if (!rev) throw new Error(`Tidbit ${tidbit.id} has no revisions`);
  return rev;
}

export function revisions(tidbit: Tidbit): Revision[] {
  return tidbit.history.filter((e): e is Revision => e.type === 'revision');
}

/** What a list shows for a tidbit: its title, else the first line of its text. */
export function displayTitle(tidbit: Tidbit): string {
  if (tidbit.title) return tidbit.title;
  const text = currentRevision(tidbit).text;
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  return line.replace(/^#+\s*/, '').trim();
}

export function isUnsorted(tidbit: Tidbit): boolean {
  return tidbit.category === undefined;
}

/** When the tidbit was first written. */
export function createdAt(tidbit: Tidbit): string {
  return tidbit.history[tidbit.history.length - 1]!.at;
}

/** Past this many characters, the tidbit gets a gentle "put the rest in details" hint (docs/design.md §2.5). */
export const TIDBIT_SOFT_LENGTH = 140;

/**
 * Normalize a tidbit and its details. When there are no details and the
 * tidbit spans several lines (pasted, or written before details existed),
 * the first line is the tidbit and the rest become the details.
 */
export function splitTidbit(rawText: string, rawDetails?: string): { text: string; details?: string } {
  const all = cleanText(rawText);
  let details = rawDetails === undefined ? undefined : cleanText(rawDetails) || undefined;
  let text = all;
  const nl = all.indexOf('\n');
  if (details === undefined && nl >= 0) {
    text = all.slice(0, nl).trim();
    details = cleanText(all.slice(nl + 1)) || undefined;
  }
  return details === undefined ? { text } : { text, details };
}

// ---------------------------------------------------------------- changing

export interface RevisionInput {
  text: string;
  details?: string;
  confidence?: Confidence;
  why?: string;
}

/**
 * Add a revision. Returns the tidbit unchanged if neither the text nor the
 * confidence changed (saving the editor without edits is not a revision).
 */
export function revise(ctx: Ctx, tidbit: Tidbit, input: RevisionInput): Tidbit {
  const { text, details } = splitTidbit(input.text, input.details);
  if (!text) throw new Error('A revision needs some text');
  const cur = currentRevision(tidbit);
  if (text === cur.text && details === cur.details && input.confidence === cur.confidence) return tidbit;
  const at = nextAt(ctx, tidbit);
  const rev: Revision = { type: 'revision', at, text };
  if (details) rev.details = details;
  if (input.confidence) rev.confidence = input.confidence;
  const why = cleanOptional(input.why);
  if (why) rev.why = why;
  return { ...tidbit, history: [rev, ...tidbit.history], updated: at };
}

/** Record "still true" from a review. */
export function reaffirm(ctx: Ctx, tidbit: Tidbit): Tidbit {
  const at = nextAt(ctx, tidbit);
  const entry: HistoryEntry = { type: 'reaffirmation', at };
  return { ...tidbit, history: [entry, ...tidbit.history], updated: at };
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
export function updateMeta(ctx: Ctx, tidbit: Tidbit, patch: MetaPatch): Tidbit {
  const next: Tidbit = { ...tidbit };
  if (patch.title !== undefined) setOrClear(next, 'title', cleanOptional(patch.title ?? undefined));
  if (patch.kind !== undefined) setOrClear(next, 'kind', patch.kind ?? undefined);
  // Moving from one kind to another is part of how a tidbit's meaning changed
  // ("I noticed it" → "I learned it's a fact"), so it goes in the history.
  // Choosing a first kind, or relabeling a draft, is just filing.
  const kindChanged = tidbit.status !== 'draft' && tidbit.kind && next.kind && tidbit.kind !== next.kind;
  if (patch.category !== undefined) setOrClear(next, 'category', normalizeCategory(patch.category ?? undefined));
  if (patch.source !== undefined) setOrClear(next, 'source', cleanOptional(patch.source ?? undefined));
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
  if (sameMeta(tidbit, next)) return tidbit;
  if (kindChanged) {
    const at = nextAt(ctx, tidbit);
    next.history = [{ type: 'kindChange', at, from: tidbit.kind!, to: next.kind! }, ...tidbit.history];
    next.updated = at;
  } else {
    next.updated = nextUpdated(ctx, tidbit);
  }
  return next;
}

/** Mark a draft done: it joins the schema proper (reviews, reminders). */
export function finishDraft(ctx: Ctx, tidbit: Tidbit): Tidbit {
  if (tidbit.status !== 'draft') return tidbit;
  return { ...tidbit, status: 'active', updated: nextUpdated(ctx, tidbit) };
}

export function isDraft(tidbit: Tidbit): boolean {
  return tidbit.status === 'draft';
}

/** Retire a tidbit with nothing replacing it. */
export function goDormant(ctx: Ctx, tidbit: Tidbit, why?: string): Tidbit {
  const at = nextUpdated(ctx, tidbit);
  const w = cleanOptional(why);
  return { ...tidbit, status: 'dormant', retired: w ? { at, why: w } : { at }, updated: at };
}

/** Bring a dormant or succeeded tidbit back to active. Its links are kept. */
export function reactivate(ctx: Ctx, tidbit: Tidbit): Tidbit {
  if (tidbit.status === 'active') return tidbit;
  const { retired: _retired, ...rest } = tidbit;
  return { ...rest, status: 'active', updated: nextUpdated(ctx, tidbit) };
}

/**
 * Replace a tidbit with a different idea. Returns the retired old tidbit and the
 * new one, linked both ways. The new tidbit inherits kind and category.
 */
export function succeed(ctx: Ctx, old: Tidbit, input: NewTidbit, why?: string): { old: Tidbit; successor: Tidbit } {
  const successor = createTidbit(ctx, {
    kind: old.kind,
    category: old.category,
    tags: old.tags,
    ...input,
  });
  successor.links = [{ type: 'succeeds', tidbit: old.id }];
  const at = nextUpdated(ctx, old);
  const w = cleanOptional(why);
  const retiredOld: Tidbit = {
    ...old,
    status: 'succeeded',
    retired: w ? { at, why: w } : { at },
    links: [...old.links.filter((l) => l.type !== 'succeededBy'), { type: 'succeededBy', tidbit: successor.id }],
    updated: at,
  };
  return { old: retiredOld, successor };
}

/**
 * Start a new tidbit that grows out of an existing one — e.g. turning the
 * insight "I'm happier on 8 hours of sleep" into the practice "In bed by
 * 10:30". The source keeps a `supports` link to the new tidbit; the new tidbit
 * shows it as "supported by" through backlinks. Unlike succeed, the source
 * stays active: both ideas stand.
 */
export function spinOff(ctx: Ctx, source: Tidbit, input: NewTidbit, type: LinkType = 'supports'): { source: Tidbit; child: Tidbit } {
  const child = createTidbit(ctx, { category: source.category, tags: source.tags, ...input });
  return { source: addLink(ctx, source, type, child.id), child };
}

export interface Connection {
  /** Phrase describing how `tidbit` relates to the one being viewed. */
  label: string;
  tidbit: Tidbit;
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
 * Every tidbit connected to `tidbit`, from its own links and from links other
 * tidbits hold to it. Links are stored once, on one side; this reads both.
 */
export function connections(tidbit: Tidbit, all: Tidbit[]): Connection[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const out: Connection[] = [];
  const seen = new Set<string>();
  const push = (label: string, s: Tidbit | undefined) => {
    if (!s || s.id === tidbit.id) return;
    const key = `${label}:${s.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, tidbit: s });
  };
  for (const l of tidbit.links) push(OUTGOING[l.type], byId.get(l.tidbit));
  for (const other of all) {
    for (const l of other.links) if (l.tidbit === tidbit.id) push(INCOMING[l.type], other);
  }
  return out;
}

export function addLink(ctx: Ctx, tidbit: Tidbit, type: LinkType, target: string): Tidbit {
  if (target === tidbit.id || tidbit.links.some((l) => l.type === type && l.tidbit === target)) return tidbit;
  return { ...tidbit, links: [...tidbit.links, { type, tidbit: target }], updated: nextUpdated(ctx, tidbit) };
}

export function removeLink(ctx: Ctx, tidbit: Tidbit, link: Link): Tidbit {
  const links = tidbit.links.filter((l) => !(l.type === link.type && l.tidbit === link.tidbit));
  if (links.length === tidbit.links.length) return tidbit;
  return { ...tidbit, links, updated: nextUpdated(ctx, tidbit) };
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

function setOrClear<K extends 'title' | 'kind' | 'category' | 'source'>(tidbit: Tidbit, key: K, value: Tidbit[K] | undefined) {
  if (value === undefined) delete tidbit[key];
  else tidbit[key] = value;
}

function sameMeta(a: Tidbit, b: Tidbit): boolean {
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
function nextAt(ctx: Ctx, tidbit: Tidbit): string {
  const latest = tidbit.history.reduce((m, e) => laterAt(e.at, m), tidbit.updated);
  return strictlyAfter(ctx.now(), latest);
}

function nextUpdated(ctx: Ctx, tidbit: Tidbit): string {
  return strictlyAfter(ctx.now(), tidbit.updated);
}
