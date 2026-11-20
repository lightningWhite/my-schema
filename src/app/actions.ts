/**
 * Everything the UI can do to the bank. Each action applies a pure core
 * function and writes the result (and any review-state change) in one
 * IndexedDB transaction. Screens call these; they never touch the DB directly
 * for writes.
 */
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';
import { bankToFiles, canWrite, filesToBank, mergeBanks, type ImportResult } from '../core/bank';
import { schedule, type ReviewOutcome } from '../core/review';
import {
  createSeed,
  goDormant,
  reactivate,
  reaffirm,
  revise,
  succeed,
  updateMeta,
  type MetaPatch,
  type NewSeed,
  type RevisionInput,
} from '../core/seed';
import type { Seed } from '../core/types';
import { SeedbankDB, type Settings } from '../store/db';
import { ctx } from './ctx';

export const db = new SeedbankDB();

async function load(id: string): Promise<Seed> {
  const s = await db.seeds.get(id);
  if (!s) throw new Error(`No seed ${id}`);
  return s;
}

async function withReview(seed: Seed, outcome: ReviewOutcome | null, write: () => Promise<unknown>) {
  await db.transaction('rw', db.seeds, db.kv, async () => {
    await write();
    if (outcome) {
      const state = await db.getReview();
      await db.setReview(schedule(seed, state, outcome, ctx.now(), Math.random()));
    }
  });
}

export async function capture(input: NewSeed): Promise<Seed> {
  const seed = createSeed(ctx, input);
  await db.seeds.add(seed);
  return seed;
}

export async function editMeta(id: string, patch: MetaPatch): Promise<Seed> {
  const next = updateMeta(ctx, await load(id), patch);
  await db.seeds.put(next);
  return next;
}

/** Add a revision. `fromReview` also reschedules it. */
export async function reviseSeed(id: string, input: RevisionInput, fromReview = false): Promise<Seed> {
  const cur = await load(id);
  const next = revise(ctx, cur, input);
  if (next === cur && !fromReview) return cur;
  await withReview(next, next === cur ? 'reaffirmed' : 'revised', () => db.seeds.put(next));
  return next;
}

export async function reaffirmSeed(id: string): Promise<Seed> {
  const next = reaffirm(ctx, await load(id));
  await withReview(next, 'reaffirmed', () => db.seeds.put(next));
  return next;
}

export async function skipSeed(id: string): Promise<void> {
  const seed = await load(id);
  await withReview(seed, 'skipped', async () => {});
}

export async function dormantSeed(id: string, why?: string): Promise<Seed> {
  const next = goDormant(ctx, await load(id), why);
  await withReview(next, 'retired', () => db.seeds.put(next));
  return next;
}

export async function reactivateSeed(id: string): Promise<Seed> {
  const next = reactivate(ctx, await load(id));
  await db.seeds.put(next);
  return next;
}

export async function succeedSeed(id: string, input: NewSeed, why?: string): Promise<Seed> {
  const { old, successor } = succeed(ctx, await load(id), input, why);
  await withReview(old, 'retired', () => db.seeds.bulkPut([old, successor]));
  return successor;
}

/**
 * The one way a seed's history is ever removed: the user deleting the whole
 * seed (CLAUDE.md rule 3). Links pointing at it are left as they are.
 */
export async function deleteSeed(id: string): Promise<void> {
  await db.transaction('rw', db.seeds, db.kv, async () => {
    await db.seeds.delete(id);
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

/** The whole bank as a zip of the repo layout (docs/design.md §3.1). */
export async function exportZip(): Promise<Blob> {
  const [seeds, review, manifest] = await Promise.all([db.seeds.toArray(), db.getReview(), db.getManifest()]);
  const files = bankToFiles(seeds, review, manifest);
  const entries: Record<string, Uint8Array> = {};
  for (const [path, text] of files) entries[`seedbank/${path}`] = strToU8(text);
  const zipped = zipSync(entries, { level: 6 });
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

export interface ImportSummary {
  added: number;
  merged: number;
  errors: ImportResult['errors'];
}

/**
 * Bring in a bank zip (or loose .md seed files). Merges with what's here —
 * nothing on this device is overwritten or lost.
 */
export async function importFiles(files: File[]): Promise<ImportSummary> {
  const set = new Map<string, string>();
  for (const f of files) {
    if (f.name.endsWith('.zip')) {
      const unzipped = unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [path, data] of Object.entries(unzipped)) {
        if (!path.endsWith('/')) set.set(path, strFromU8(data));
      }
    } else if (f.name.endsWith('.md')) {
      set.set(`seeds/${f.name}`, await f.text());
    }
  }
  const result = filesToBank(set);
  if (result.manifest && !canWrite(result.manifest)) {
    throw new Error('This bank was made by a newer version of Seedbank. Update the app before importing it.');
  }
  let summary: ImportSummary = { added: 0, merged: 0, errors: result.errors };
  await db.transaction('rw', db.seeds, db.kv, async () => {
    const existing = await db.seeds.toArray();
    const { seeds, added, merged } = mergeBanks(existing, result.seeds);
    await db.seeds.bulkPut(seeds);
    if (result.review) {
      // Keep this device's schedule where it has one.
      await db.setReview({ ...result.review, ...(await db.getReview()) });
    }
    summary = { added, merged, errors: result.errors };
  });
  return summary;
}
