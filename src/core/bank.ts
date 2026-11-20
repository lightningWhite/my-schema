/**
 * A bank as a set of files (docs/design.md §3.1): the shape of a GitHub repo
 * and of an export zip. Converting seeds ↔ files lives here so export,
 * import and (later) sync share one implementation.
 */
import { parseSeed, seedPath, serializeSeed } from './format';
import { mergeSeeds } from './merge';
import type { ReviewState } from './review';
import { currentRevision, displayTitle } from './seed';
import type { Seed } from './types';

/** The bank format this app reads and writes. */
export const FORMAT_VERSION = 1;

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

/** CLAUDE.md rule 7: never write to a bank from a newer app. */
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
  confidence?: string;
  updated: string;
  revisions: number;
  origin: Seed['origin'];
}

/** `index.json`: generated, never edited, rebuildable from `seeds/` alone. */
export function buildIndex(seeds: Seed[]): { formatVersion: number; seeds: IndexEntry[] } {
  const entries = [...seeds]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s): IndexEntry => {
      const cur = currentRevision(s);
      const e: IndexEntry = {
        id: s.id,
        title: displayTitle(s),
        status: s.status,
        tags: s.tags,
        text: cur.text,
        updated: s.updated,
        revisions: s.history.filter((h) => h.type === 'revision').length,
        origin: s.origin,
      };
      if (s.kind) e.kind = s.kind;
      if (s.category) e.category = s.category;
      if (cur.confidence) e.confidence = cur.confidence;
      return e;
    });
  return { formatVersion: FORMAT_VERSION, seeds: entries };
}

/** File path → text content. */
export type FileSet = Map<string, string>;

export function bankToFiles(seeds: Seed[], review: ReviewState, manifest: Manifest): FileSet {
  const files: FileSet = new Map();
  files.set('seedbank.json', json(manifest));
  files.set('index.json', json(buildIndex(seeds)));
  files.set('review.json', json(review));
  for (const s of seeds) files.set(seedPath(s.id), serializeSeed(s));
  return files;
}

export interface ImportResult {
  manifest: Manifest | null;
  seeds: Seed[];
  review: ReviewState | null;
  /** Files that couldn't be read, with the reason. */
  errors: Array<{ path: string; error: string }>;
}

/**
 * Read a bank from its files. Only `seeds/*.md` matter for seeds — `index.json`
 * is ignored, since it's a cache. Paths may sit under one top-level folder
 * (as zips usually do).
 */
export function filesToBank(files: FileSet): ImportResult {
  const result: ImportResult = { manifest: null, seeds: [], review: null, errors: [] };
  const prefix = commonFolder([...files.keys()]);
  for (const [fullPath, content] of files) {
    const path = fullPath.slice(prefix.length);
    try {
      if (path === 'seedbank.json') result.manifest = JSON.parse(content) as Manifest;
      else if (path === 'review.json') result.review = JSON.parse(content) as ReviewState;
      else if (/^seeds\/[^/]+\.md$/.test(path)) result.seeds.push(parseSeed(content));
    } catch (e) {
      result.errors.push({ path: fullPath, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

/**
 * Combine imported seeds with what's already in the bank. Nothing is lost:
 * a seed in both is merged (its histories unioned).
 */
export function mergeBanks(existing: Seed[], incoming: Seed[]): { seeds: Seed[]; added: number; merged: number } {
  const byId = new Map(existing.map((s) => [s.id, s]));
  let added = 0;
  let merged = 0;
  for (const s of incoming) {
    const cur = byId.get(s.id);
    if (!cur) {
      byId.set(s.id, s);
      added++;
    } else {
      const m = mergeSeeds(null, cur, s);
      if (JSON.stringify(m) !== JSON.stringify(cur)) merged++;
      byId.set(s.id, m);
    }
  }
  return { seeds: [...byId.values()], added, merged };
}

function commonFolder(paths: string[]): string {
  if (!paths.length) return '';
  const first = paths[0]!.split('/')[0]!;
  if (paths.every((p) => p.startsWith(first + '/')) && !['seeds'].includes(first)) return first + '/';
  return '';
}

function json(v: unknown): string {
  return JSON.stringify(v, null, 2) + '\n';
}
