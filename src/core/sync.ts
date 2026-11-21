/**
 * Sync planning (docs/design.md §3.4). Pure and storage-agnostic: it sees
 * three sets of files — this device, the backup (GitHub today; Drive or
 * Nextcloud later), and the base (what both agreed on at the last sync) —
 * and decides what each side should end up with.
 *
 * Nothing here knows about HTTP, IndexedDB or GitHub.
 */
import { buildIndex, FORMAT_VERSION, type Manifest, newManifest } from './files';
import { parseTidbit, serializeTidbit, tidbitPath } from './format';
import { mergeTidbits } from './merge';
import type { ReviewEntry, ReviewState } from './review';
import { cmpAt } from './time';
import type { Tidbit } from './types';

/** Path → file text. */
export type Files = Map<string, string>;

export interface SyncInput {
  /** Tidbits on this device right now. */
  local: Tidbit[];
  localReview: ReviewState;
  /** Every file in the backup (tidbits, review.json, manifest.json, …). */
  remote: Files;
  /** The files as they were after the last successful sync. Empty on first sync. */
  base: Files;
}

export interface SyncPlan {
  /** What this device should hold afterwards. */
  tidbits: Tidbit[];
  review: ReviewState;
  /** Files to create or overwrite in the backup. */
  writes: Files;
  /** Paths to delete from the backup. */
  deletes: string[];
  /** The backup as it will be once `writes`/`deletes` are applied: the next base. */
  next: Files;
  /** Backup files that couldn't be read. They are left alone, never deleted. */
  errors: Array<{ path: string; error: string }>;
}

export class NewerFormatError extends Error {
  constructor(public readonly formatVersion: number) {
    super(`This backup was written by a newer version of Schema (format ${formatVersion}). Update the app to keep syncing.`);
  }
}

const TIDBIT_RE = /^tidbits\/([^/]+)\.md$/;

/**
 * Work out a sync. Never loses work: edits on either side survive, and a
 * deletion only wins over an untouched copy.
 *
 * Throws NewerFormatError if the backup's manifest is from a newer app
 * (CLAUDE.md rule 7: read it, never write it).
 */
export function planSync({ local, localReview, remote, base }: SyncInput): SyncPlan {
  const errors: SyncPlan['errors'] = [];

  // Manifest: refuse to write to a backup from a newer app.
  const remoteManifest = parseJson<Manifest>(remote.get('manifest.json'));
  if (remoteManifest && remoteManifest.formatVersion > FORMAT_VERSION) {
    throw new NewerFormatError(remoteManifest.formatVersion);
  }

  const localById = new Map(local.map((t) => [t.id, t]));
  const ids = new Set<string>(localById.keys());
  for (const files of [remote, base]) {
    for (const path of files.keys()) {
      const m = TIDBIT_RE.exec(path);
      if (m) ids.add(m[1]!);
    }
  }

  const tidbits: Tidbit[] = [];
  const writes: Files = new Map();
  const deletes: string[] = [];

  for (const id of [...ids].sort()) {
    const path = tidbitPath(id);
    const L = localById.get(id);
    const remoteText = remote.get(path);
    const baseText = base.get(path);

    let R: Tidbit | undefined;
    if (remoteText !== undefined) {
      try {
        R = parseTidbit(remoteText);
      } catch (e) {
        // Can't read it: keep our copy (if any) here, and don't touch theirs.
        errors.push({ path, error: e instanceof Error ? e.message : String(e) });
        if (L) tidbits.push(L);
        continue;
      }
    }
    const B = baseText === undefined ? null : tryParse(baseText);

    if (L && R) {
      const merged = mergeTidbits(B, L, R);
      tidbits.push(merged);
      const text = serializeTidbit(merged);
      if (text !== remoteText) writes.set(path, text);
    } else if (L) {
      const changedHere = baseText === undefined || serializeTidbit(L) !== baseText;
      if (baseText !== undefined && !changedHere) {
        // Deleted in the backup (by another device), untouched here: delete here too.
        continue;
      }
      // New here, or edited here after the other side deleted it: keep and upload.
      tidbits.push(L);
      writes.set(path, serializeTidbit(L));
    } else if (R) {
      const changedThere = baseText === undefined || remoteText !== baseText;
      if (baseText !== undefined && !changedThere) {
        // Deleted on this device, untouched in the backup: delete it there too.
        deletes.push(path);
        continue;
      }
      // New in the backup, or edited there after it was deleted here: keep it.
      tidbits.push(R);
    }
  }

  // Review schedule: per tidbit, the most recently reviewed entry wins.
  const remoteReview = parseJson<ReviewState>(remote.get('review.json')) ?? {};
  const review = mergeReview(localReview, remoteReview);
  const liveIds = new Set(tidbits.map((t) => t.id));
  for (const id of Object.keys(review)) if (!liveIds.has(id)) delete review[id];

  const reviewText = json(Object.fromEntries(Object.entries(review).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))));
  if (reviewText !== remote.get('review.json')) writes.set('review.json', reviewText);
  if (!remoteManifest) writes.set('manifest.json', json(newManifest()));

  // index.json is a cache, regenerated whenever anything else changes.
  if (writes.size || deletes.length || !remote.has('index.json')) {
    const indexText = json(buildIndex(tidbits));
    if (indexText !== remote.get('index.json')) writes.set('index.json', indexText);
  }

  const next: Files = new Map(remote);
  for (const p of deletes) next.delete(p);
  for (const [p, t] of writes) next.set(p, t);

  return { tidbits, review, writes, deletes, next, errors };
}

/** Per tidbit, keep the entry reviewed most recently (falling back to the later due date). */
export function mergeReview(a: ReviewState, b: ReviewState): ReviewState {
  const out: ReviewState = { ...a };
  for (const [id, eb] of Object.entries(b)) {
    const ea = out[id];
    out[id] = ea ? newerEntry(ea, eb) : eb;
  }
  return out;
}

function newerEntry(a: ReviewEntry, b: ReviewEntry): ReviewEntry {
  if (a.last && b.last) return cmpAt(a.last, b.last) >= 0 ? a : b;
  if (a.last || b.last) return a.last ? a : b;
  return cmpAt(a.due, b.due) >= 0 ? a : b;
}

function tryParse(text: string): Tidbit | null {
  try {
    return parseTidbit(text);
  } catch {
    return null;
  }
}

function parseJson<T>(text: string | undefined): T | null {
  if (text === undefined) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function json(v: unknown): string {
  return JSON.stringify(v, null, 2) + '\n';
}
