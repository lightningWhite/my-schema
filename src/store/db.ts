/**
 * The on-device copy of the schema (docs/design.md §3.3). Holds parsed tidbits,
 * review state, the manifest and settings. In Phase 0 this is the only copy,
 * so Export matters; from Phase 1 it's a cache of the GitHub repo and can be
 * rebuilt from `tidbits/` at any time.
 */
import Dexie, { type EntityTable } from 'dexie';
import { newManifest, type Manifest } from '../core/files';
import type { ReviewState } from '../core/review';
import type { Tidbit } from '../core/types';

export interface Settings {
  /** Tidbits per daily review. */
  reviewSize: number;
  /** Optional category to focus reviews on. */
  reviewFocus?: string;
}

export const DEFAULT_SETTINGS: Settings = { reviewSize: 5 };

interface KV {
  key: 'review' | 'manifest' | 'settings' | 'sync';
  value: unknown;
}

/** One file as of the last successful sync: the base for three-way merges. */
export interface BaseFile {
  path: string;
  /** Content id in the backup (git blob SHA). */
  id: string;
  text: string;
}

/** Which backup this device syncs with, and how it went last time. */
export interface SyncAccount {
  provider: 'github';
  token: string;
  login: string;
  owner: string;
  repo: string;
  branch: string;
  lastSyncAt?: string;
}

export class SchemaDB extends Dexie {
  tidbits!: EntityTable<Tidbit, 'id'>;
  kv!: EntityTable<KV, 'key'>;
  syncBase!: EntityTable<BaseFile, 'path'>;

  /**
   * The database keeps its original name ('seedbank') from before the app was
   * renamed: renaming an IndexedDB database would strand everyone's data.
   */
  constructor(name = 'seedbank') {
    super(name);
    // The table has been renamed twice as the app's vocabulary settled:
    // `seeds` (Seedbank) → `grains` → `tidbits`. The objects never changed.
    // Each rename copies the rows across, then drops the old table one
    // version later, once the copy is safely committed.
    const INDEXES = '&id, status, category, kind, updated, *tags';
    this.version(1).stores({ seeds: INDEXES, kv: '&key' });
    this.version(2)
      .stores({ grains: INDEXES })
      .upgrade(async (tx) => {
        const old = await tx.table('seeds').toArray();
        if (old.length) await tx.table('grains').bulkPut(old);
      });
    this.version(3).stores({ seeds: null });
    this.version(4)
      .stores({ tidbits: INDEXES })
      .upgrade(async (tx) => {
        const old = await tx.table('grains').toArray();
        if (old.length) await tx.table('tidbits').bulkPut(old);
      });
    this.version(5).stores({ grains: null });
    this.version(6).stores({ syncBase: '&path' });
  }

  async getReview(): Promise<ReviewState> {
    return ((await this.kv.get('review'))?.value as ReviewState | undefined) ?? {};
  }

  async setReview(state: ReviewState): Promise<void> {
    await this.kv.put({ key: 'review', value: state });
  }

  async getManifest(): Promise<Manifest> {
    return ((await this.kv.get('manifest'))?.value as Manifest | undefined) ?? newManifest();
  }

  async setManifest(m: Manifest): Promise<void> {
    await this.kv.put({ key: 'manifest', value: m });
  }

  async getSyncAccount(): Promise<SyncAccount | null> {
    return ((await this.kv.get('sync'))?.value as SyncAccount | undefined) ?? null;
  }

  async setSyncAccount(a: SyncAccount | null): Promise<void> {
    if (a) await this.kv.put({ key: 'sync', value: a });
    else await this.kv.delete('sync');
  }

  async getSettings(): Promise<Settings> {
    const stored = (await this.kv.get('settings'))?.value as Partial<Settings> | undefined;
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async setSettings(s: Settings): Promise<void> {
    await this.kv.put({ key: 'settings', value: s });
  }
}
