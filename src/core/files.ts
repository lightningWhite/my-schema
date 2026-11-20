/**
 * A schema as a set of files (docs/design.md §3.1): the shape of a GitHub repo
 * and of an export zip. Converting tidbits ↔ files lives here so export,
 * import and (later) sync share one implementation.
 */
import { parseTidbit, tidbitPath, serializeTidbit } from './format';
import { mergeTidbits } from './merge';
import type { ReviewState } from './review';
import { currentRevision, displayTitle } from './tidbit';
import type { Tidbit } from './types';

/** The schema format this app reads and writes. */
// 2: revisions may have a `<!-- details -->` block.
// 3: `draft` status, and `<!-- kind … -->` entries in the history.
// 4: entries live in `tidbits/` (formerly `grains/`).
// Older files read fine.
export const FORMAT_VERSION = 4;

export interface Manifest {
  formatVersion: number;
  displayName?: string;
  bio?: string;
  visibility?: 'private' | 'public';
  /** Unknown fields, preserved. */
  [key: string]: unknown;
}

export function newManifest(): Manifest {
  return { formatVersion: FORMAT_VERSION, visibility: 'private' };
}

/** CLAUDE.md rule 7: never write to a schema from a newer app. */
export function canWrite(manifest: Manifest): boolean {
  return manifest.formatVersion <= FORMAT_VERSION;
}

export interface IndexEntry {
  id: string;
  title: string;
  kind?: string;
  status: string;
  category?: string;
  tags: string[];
  text: string;
  details?: string;
  confidence?: string;
  updated: string;
  revisions: number;
  origin: Tidbit['origin'];
}

/** `index.json`: generated, never edited, rebuildable from `tidbits/` alone. */
export function buildIndex(tidbits: Tidbit[]): { formatVersion: number; tidbits: IndexEntry[] } {
  const entries = [...tidbits]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s): IndexEntry => {
      const cur = currentRevision(s);
      const e: IndexEntry = {
        id: s.id,
        title: displayTitle(s),
        status: s.status,
        tags: s.tags,
        text: cur.text,
        ...(cur.details ? { details: cur.details } : {}),
        updated: s.updated,
        revisions: s.history.filter((h) => h.type === 'revision').length,
        origin: s.origin,
      };
      if (s.kind) e.kind = s.kind;
      if (s.category) e.category = s.category;
      if (cur.confidence) e.confidence = cur.confidence;
      return e;
    });
  return { formatVersion: FORMAT_VERSION, tidbits: entries };
}

/** File path → text content. */
export type FileSet = Map<string, string>;

export function toFiles(tidbits: Tidbit[], review: ReviewState, manifest: Manifest): FileSet {
  const files: FileSet = new Map();
  files.set('manifest.json', json(manifest));
  files.set('index.json', json(buildIndex(tidbits)));
  files.set('review.json', json(review));
  for (const s of tidbits) files.set(tidbitPath(s.id), serializeTidbit(s));
  return files;
}

export interface ImportResult {
  manifest: Manifest | null;
  tidbits: Tidbit[];
  review: ReviewState | null;
  /** Files that couldn't be read, with the reason. */
  errors: Array<{ path: string; error: string }>;
}

/**
 * Read a schema from its files. Only `tidbits/*.md` matter for tidbits — `index.json`
 * is ignored, since it's a cache. Paths may sit under one top-level folder
 * (as zips usually do).
 */
export function fromFiles(files: FileSet): ImportResult {
  const result: ImportResult = { manifest: null, tidbits: [], review: null, errors: [] };
  const prefix = commonFolder([...files.keys()]);
  for (const [fullPath, content] of files) {
    const path = fullPath.slice(prefix.length);
    try {
      // Earlier layouts: `seeds/` + `seedbank.json` (Seedbank), then `grains/`.
      if (path === 'manifest.json' || path === 'seedbank.json') result.manifest = JSON.parse(content) as Manifest;
      else if (path === 'review.json') result.review = JSON.parse(content) as ReviewState;
      else if (/^(tidbits|grains|seeds)\/[^/]+\.md$/.test(path)) result.tidbits.push(parseTidbit(content));
    } catch (e) {
      result.errors.push({ path: fullPath, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

/**
 * Combine imported tidbits with what's already in the schema. Nothing is lost:
 * a tidbit in both is merged (its histories unioned).
 */
export function mergeTidbitSets(existing: Tidbit[], incoming: Tidbit[]): { tidbits: Tidbit[]; added: number; merged: number } {
  const byId = new Map(existing.map((s) => [s.id, s]));
  let added = 0;
  let merged = 0;
  for (const s of incoming) {
    const cur = byId.get(s.id);
    if (!cur) {
      byId.set(s.id, s);
      added++;
    } else {
      const m = mergeTidbits(null, cur, s);
      if (JSON.stringify(m) !== JSON.stringify(cur)) merged++;
      byId.set(s.id, m);
    }
  }
  return { tidbits: [...byId.values()], added, merged };
}

function commonFolder(paths: string[]): string {
  if (!paths.length) return '';
  const first = paths[0]!.split('/')[0]!;
  if (paths.every((p) => p.startsWith(first + '/')) && !['tidbits', 'grains', 'seeds'].includes(first)) return first + '/';
  return '';
}

function json(v: unknown): string {
  return JSON.stringify(v, null, 2) + '\n';
}
