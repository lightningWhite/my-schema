/**
 * Everything the UI can do to the schema. Each action applies a pure core
 * function and writes the result (and any review-state change) in one
 * IndexedDB transaction. Screens call these; they never touch the DB directly
 * for writes.
 */
import { toFiles, canWrite, fromFiles, mergeTidbitSets, type ImportResult } from '../core/files';
import { schedule, type ReviewOutcome } from '../core/review';
import {
  createTidbit,
  finishDraft,
  goDormant,
  reactivate,
  reaffirm,
  revise,
  spinOff,
  succeed,
  updateMeta,
  type MetaPatch,
  type NewTidbit,
  type RevisionInput,
} from '../core/tidbit';
import type { Tidbit } from '../core/types';
import { SchemaDB, type Settings } from '../store/db';
import { ctx } from './ctx';

export const db = new SchemaDB();

async function load(id: string): Promise<Tidbit> {
  const s = await db.tidbits.get(id);
  if (!s) throw new Error(`No tidbit ${id}`);
  return s;
}

async function withReview(tidbit: Tidbit, outcome: ReviewOutcome | null, write: () => Promise<unknown>) {
  await db.transaction('rw', db.tidbits, db.kv, async () => {
    await write();
    if (outcome) {
      const state = await db.getReview();
      await db.setReview(schedule(tidbit, state, outcome, ctx.now(), Math.random()));
    }
  });
}

export async function capture(input: NewTidbit): Promise<Tidbit> {
  const tidbit = createTidbit(ctx, input);
  await db.tidbits.add(tidbit);
  return tidbit;
}

/** Mark a draft done. */
export async function finishTidbit(id: string): Promise<Tidbit> {
  const next = finishDraft(ctx, await load(id));
  await db.tidbits.put(next);
  return next;
}

export async function editMeta(id: string, patch: MetaPatch): Promise<Tidbit> {
  const next = updateMeta(ctx, await load(id), patch);
  await db.tidbits.put(next);
  return next;
}

/** Add a revision. `fromReview` also reschedules it. */
export async function reviseTidbit(id: string, input: RevisionInput, fromReview = false): Promise<Tidbit> {
  const cur = await load(id);
  const next = revise(ctx, cur, input);
  if (next === cur && !fromReview) return cur;
  await withReview(next, next === cur ? 'reaffirmed' : 'revised', () => db.tidbits.put(next));
  return next;
}

export async function reaffirmTidbit(id: string): Promise<Tidbit> {
  const next = reaffirm(ctx, await load(id));
  await withReview(next, 'reaffirmed', () => db.tidbits.put(next));
  return next;
}

export async function skipTidbit(id: string): Promise<void> {
  const tidbit = await load(id);
  await withReview(tidbit, 'skipped', async () => {});
}

export async function dormantTidbit(id: string, why?: string): Promise<Tidbit> {
  const next = goDormant(ctx, await load(id), why);
  await withReview(next, 'retired', () => db.tidbits.put(next));
  return next;
}

export async function reactivateTidbit(id: string): Promise<Tidbit> {
  const next = reactivate(ctx, await load(id));
  await db.tidbits.put(next);
  return next;
}

export async function succeedTidbit(id: string, input: NewTidbit, why?: string): Promise<Tidbit> {
  const { old, successor } = succeed(ctx, await load(id), input, why);
  await withReview(old, 'retired', () => db.tidbits.bulkPut([old, successor]));
  return successor;
}

/** Start a new tidbit that grows out of this one (e.g. an insight → a practice), linked to it. */
export async function spinOffTidbit(id: string, input: NewTidbit): Promise<Tidbit> {
  const { source, child } = spinOff(ctx, await load(id), input);
  await db.tidbits.bulkPut([source, child]);
  return child;
}

/**
 * The one way a tidbit's history is ever removed: the user deleting the whole
 * tidbit (CLAUDE.md rule 3). Links pointing at it are left as they are.
 */
export async function deleteTidbit(id: string): Promise<void> {
  await db.transaction('rw', db.tidbits, db.kv, async () => {
    await db.tidbits.delete(id);
    const state = await db.getReview();
    if (state[id]) {
      const { [id]: _gone, ...rest } = state;
      await db.setReview(rest);
    }
  });
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.setSettings(s);
}

// ---------------------------------------------------------------- export / import

/** The whole schema as a zip of the repo layout (docs/design.md §3.1). */
export async function exportZip(): Promise<Blob> {
  const [tidbits, review, manifest] = await Promise.all([db.tidbits.toArray(), db.getReview(), db.getManifest()]);
  const files = toFiles(tidbits, review, manifest);
  const entries: Record<string, Uint8Array> = {};
  // Loaded on demand: only export and import need it.
  const { strToU8, zipSync } = await import('fflate');
  for (const [path, text] of files) entries[`schema/${path}`] = strToU8(text);
  const zipped = zipSync(entries, { level: 6 });
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

export interface ImportSummary {
  added: number;
  merged: number;
  errors: ImportResult['errors'];
}

/**
 * Bring in a schema zip (or loose .md tidbit files). Merges with what's here —
 * nothing on this device is overwritten or lost.
 */
export async function importFiles(files: File[]): Promise<ImportSummary> {
  const set = new Map<string, string>();
  for (const f of files) {
    if (f.name.endsWith('.zip')) {
      const { strFromU8, unzipSync } = await import('fflate');
      const unzipped = unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [path, data] of Object.entries(unzipped)) {
        if (!path.endsWith('/')) set.set(path, strFromU8(data));
      }
    } else if (f.name.endsWith('.md')) {
      set.set(`tidbits/${f.name}`, await f.text());
    }
  }
  const result = fromFiles(set);
  if (result.manifest && !canWrite(result.manifest)) {
    throw new Error('This schema was made by a newer version of Schema. Update the app before importing it.');
  }
  let summary: ImportSummary = { added: 0, merged: 0, errors: result.errors };
  await db.transaction('rw', db.tidbits, db.kv, async () => {
    const existing = await db.tidbits.toArray();
    const { tidbits, added, merged } = mergeTidbitSets(existing, result.tidbits);
    await db.tidbits.bulkPut(tidbits);
    if (result.review) {
      // Keep this device's schedule where it has one.
      await db.setReview({ ...result.review, ...(await db.getReview()) });
    }
    summary = { added, merged, errors: result.errors };
  });
  return summary;
}
