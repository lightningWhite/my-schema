/**
 * One sync pass: list the backup, fetch what changed, plan with the pure core
 * planner, write the backup (one atomic change), then update this device.
 *
 * Order matters for safety: the backup is written first, and this device is
 * only updated after that succeeds. Tidbits edited on this device while the
 * sync was in flight are left alone and picked up by the next pass.
 */
import { serializeTidbit } from '../core/format';
import { mergeReview, planSync, type Files } from '../core/sync';
import type { SchemaDB } from '../store/db';
import { StaleError, type BackupStore } from './store';

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  /** Local edits made during the sync that still need a pass. */
  pending: boolean;
  errors: Array<{ path: string; error: string }>;
}

const MAX_ATTEMPTS = 5;

export interface SyncOptions {
  /** Base wait before asking again after a stale answer (grows each try). */
  staleDelayMs?: number;
}

const PAST_HEADS = 50;

export async function syncOnce(db: SchemaDB, store: BackupStore, now: () => string, opts: SyncOptions = {}): Promise<SyncResult> {
  const staleDelay = opts.staleDelayMs ?? 1500;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { head, files } = await store.list();

    // An answer describing a backup version this device has already moved
    // past is stale (a cache, or GitHub catching up). Planning from it would
    // make freshly saved tidbits look deleted elsewhere — so ask again.
    const known = await db.getSyncHead();
    if (known && head !== known.head && known.past.includes(head)) {
      await new Promise((r) => setTimeout(r, staleDelay * (attempt + 1)));
      continue;
    }
    const baseRows = await db.syncBase.toArray();
    const baseById = new Map(baseRows.map((r) => [r.path, r]));

    // The backup's files, downloading only those that changed since the base.
    const remote: Files = new Map();
    let downloaded = 0;
    for (const [path, id] of files) {
      if (!isSchemaFile(path)) continue;
      const b = baseById.get(path);
      if (b && b.id === id) remote.set(path, b.text);
      else {
        remote.set(path, await store.read(path, id));
        if (path.startsWith('tidbits/')) downloaded++;
      }
    }
    const base: Files = new Map(baseRows.map((r) => [r.path, r.text]));

    // This device, as of now.
    const local = await db.tidbits.toArray();
    const localReview = await db.getReview();
    const snapshot = new Map(local.map((t) => [t.id, serializeTidbit(t)]));

    const plan = planSync({ local, localReview, remote, base });

    let listing = files;
    let newHead = head;
    if (plan.writes.size || plan.deletes.length) {
      try {
        const n = [...plan.writes.keys()].filter((p) => p.startsWith('tidbits/')).length + plan.deletes.length;
        ({ files: listing, head: newHead } = await store.write(head, plan.writes, plan.deletes, `Sync ${n} tidbit${n === 1 ? '' : 's'} · ${now()}`));
      } catch (e) {
        if (e instanceof StaleError) {
          // Another device (or another tab) synced first: wait a moment, so two
          // devices don't keep colliding, then start over from its version.
          await new Promise((r) => setTimeout(r, 250 + Math.random() * 750 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }

    // Update this device, skipping anything edited here mid-sync.
    let pending = false;
    await db.transaction('rw', db.tidbits, db.kv, db.syncBase, async () => {
      const current = new Map((await db.tidbits.toArray()).map((t) => [t.id, t]));
      const untouched = (id: string) => {
        const before = snapshot.get(id);
        const cur = current.get(id);
        const same = before === undefined ? cur === undefined : cur !== undefined && serializeTidbit(cur) === before;
        if (!same) pending = true;
        return same;
      };
      const keep = new Set(plan.tidbits.map((t) => t.id));
      const puts = plan.tidbits.filter((t) => untouched(t.id) && (snapshot.get(t.id) !== serializeTidbit(t)));
      const dels = [...snapshot.keys()].filter((id) => !keep.has(id) && untouched(id));
      if (puts.length) await db.tidbits.bulkPut(puts);
      if (dels.length) await db.tidbits.bulkDelete(dels);
      // Reviews done mid-sync are kept: merge with whatever is here now.
      await db.setReview(mergeReview(plan.review, await db.getReview()));

      await db.syncBase.clear();
      await db.syncBase.bulkPut(
        [...plan.next].filter(([path]) => listing.has(path)).map(([path, text]) => ({ path, id: listing.get(path)!, text })),
      );
      const account = await db.getSyncAccount();
      if (account) await db.setSyncAccount({ ...account, lastSyncAt: now() });
      // Remember where the backup is now, and every version we've moved past.
      const prev = await db.getSyncHead();
      if (!prev || prev.head !== newHead) {
        const past = prev ? [prev.head, ...prev.past] : newHead === head ? [] : [head];
        if (newHead !== head && !past.includes(head)) past.unshift(head);
        await db.setSyncHead({ head: newHead, past: past.filter((h) => h !== newHead).slice(0, PAST_HEADS) });
      }
    });

    const uploaded = [...plan.writes.keys()].filter((p) => p.startsWith('tidbits/')).length + plan.deletes.length;
    return { uploaded, downloaded, pending, errors: plan.errors };
  }
  throw new Error('The backup kept changing while syncing. Will try again shortly.');
}

function isSchemaFile(path: string): boolean {
  return /^tidbits\/[^/]+\.md$/.test(path) || path === 'review.json' || path === 'manifest.json' || path === 'index.json';
}
