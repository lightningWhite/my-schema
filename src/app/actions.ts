/**
 * Everything the UI can do to the schema. Each action applies a pure core
 * function and writes the result (and any review-state change) in one
 * IndexedDB transaction. Screens call these; they never touch the DB directly
 * for writes.
 */
import { toFiles, canWrite, fromFiles, mergeGrainSets, type ImportResult } from '../core/files';
import { schedule, type ReviewOutcome } from '../core/review';
import {
  createGrain,
  finishDraft,
  goDormant,
  reactivate,
  reaffirm,
  revise,
  spinOff,
  succeed,
  updateMeta,
  type MetaPatch,
  type NewGrain,
  type RevisionInput,
} from '../core/grain';
import type { Grain } from '../core/types';
import { SchemaDB, type Settings } from '../store/db';
import { ctx } from './ctx';

export const db = new SchemaDB();

async function load(id: string): Promise<Grain> {
  const s = await db.grains.get(id);
  if (!s) throw new Error(`No grain ${id}`);
  return s;
}

async function withReview(grain: Grain, outcome: ReviewOutcome | null, write: () => Promise<unknown>) {
  await db.transaction('rw', db.grains, db.kv, async () => {
    await write();
    if (outcome) {
      const state = await db.getReview();
      await db.setReview(schedule(grain, state, outcome, ctx.now(), Math.random()));
    }
  });
}

export async function capture(input: NewGrain): Promise<Grain> {
  const grain = createGrain(ctx, input);
  await db.grains.add(grain);
  return grain;
}

/** Mark a draft done. */
export async function finishGrain(id: string): Promise<Grain> {
  const next = finishDraft(ctx, await load(id));
  await db.grains.put(next);
  return next;
}

export async function editMeta(id: string, patch: MetaPatch): Promise<Grain> {
  const next = updateMeta(ctx, await load(id), patch);
  await db.grains.put(next);
  return next;
}

/** Add a revision. `fromReview` also reschedules it. */
export async function reviseGrain(id: string, input: RevisionInput, fromReview = false): Promise<Grain> {
  const cur = await load(id);
  const next = revise(ctx, cur, input);
  if (next === cur && !fromReview) return cur;
  await withReview(next, next === cur ? 'reaffirmed' : 'revised', () => db.grains.put(next));
  return next;
}

export async function reaffirmGrain(id: string): Promise<Grain> {
  const next = reaffirm(ctx, await load(id));
  await withReview(next, 'reaffirmed', () => db.grains.put(next));
  return next;
}

export async function skipGrain(id: string): Promise<void> {
  const grain = await load(id);
  await withReview(grain, 'skipped', async () => {});
}

export async function dormantGrain(id: string, why?: string): Promise<Grain> {
  const next = goDormant(ctx, await load(id), why);
  await withReview(next, 'retired', () => db.grains.put(next));
  return next;
}

export async function reactivateGrain(id: string): Promise<Grain> {
  const next = reactivate(ctx, await load(id));
  await db.grains.put(next);
  return next;
}

export async function succeedGrain(id: string, input: NewGrain, why?: string): Promise<Grain> {
  const { old, successor } = succeed(ctx, await load(id), input, why);
  await withReview(old, 'retired', () => db.grains.bulkPut([old, successor]));
  return successor;
}

/** Start a new grain that grows out of this one (e.g. an insight → a practice), linked to it. */
export async function spinOffGrain(id: string, input: NewGrain): Promise<Grain> {
  const { source, child } = spinOff(ctx, await load(id), input);
  await db.grains.bulkPut([source, child]);
  return child;
}

/**
 * The one way a grain's history is ever removed: the user deleting the whole
 * grain (CLAUDE.md rule 3). Links pointing at it are left as they are.
 */
export async function deleteGrain(id: string): Promise<void> {
  await db.transaction('rw', db.grains, db.kv, async () => {
    await db.grains.delete(id);
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
  const [grains, review, manifest] = await Promise.all([db.grains.toArray(), db.getReview(), db.getManifest()]);
  const files = toFiles(grains, review, manifest);
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
 * Bring in a schema zip (or loose .md grain files). Merges with what's here —
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
      set.set(`grains/${f.name}`, await f.text());
    }
  }
  const result = fromFiles(set);
  if (result.manifest && !canWrite(result.manifest)) {
    throw new Error('This schema was made by a newer version of Schema. Update the app before importing it.');
  }
  let summary: ImportSummary = { added: 0, merged: 0, errors: result.errors };
  await db.transaction('rw', db.grains, db.kv, async () => {
    const existing = await db.grains.toArray();
    const { grains, added, merged } = mergeGrainSets(existing, result.grains);
    await db.grains.bulkPut(grains);
    if (result.review) {
      // Keep this device's schedule where it has one.
      await db.setReview({ ...result.review, ...(await db.getReview()) });
    }
    summary = { added, merged, errors: result.errors };
  });
  return summary;
}
