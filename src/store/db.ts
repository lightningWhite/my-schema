/**
 * The on-device copy of the schema (docs/design.md §3.3). Holds parsed grains,
 * review state, the manifest and settings. In Phase 0 this is the only copy,
 * so Export matters; from Phase 1 it's a cache of the GitHub repo and can be
 * rebuilt from `grains/` at any time.
 */
import Dexie, { type EntityTable } from 'dexie';
import { newManifest, type Manifest } from '../core/files';
import type { ReviewState } from '../core/review';
import type { Grain } from '../core/types';

export interface Settings {
  /** Grains per daily review. */
  reviewSize: number;
  /** Optional category to focus reviews on. */
  reviewFocus?: string;
}

export const DEFAULT_SETTINGS: Settings = { reviewSize: 5 };

interface KV {
  key: 'review' | 'manifest' | 'settings';
  value: unknown;
}

export class SchemaDB extends Dexie {
  grains!: EntityTable<Grain, 'id'>;
  kv!: EntityTable<KV, 'key'>;

  /**
   * The database keeps its original name ('seedbank') from before the app was
   * renamed: renaming an IndexedDB database would strand everyone's data.
   */
  constructor(name = 'seedbank') {
    super(name);
    // v1 (Seedbank) stored grains in a table called `seeds`.
    this.version(1).stores({
      seeds: '&id, status, category, kind, updated, *tags',
      kv: '&key',
    });
    // v2: copy them to `grains`. The objects themselves are unchanged.
    this.version(2)
      .stores({ grains: '&id, status, category, kind, updated, *tags' })
      .upgrade(async (tx) => {
        const old = await tx.table('seeds').toArray();
        if (old.length) await tx.table('grains').bulkPut(old);
      });
    // v3: drop the old table, once its rows are safely copied.
    this.version(3).stores({ seeds: null });
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

  async getSettings(): Promise<Settings> {
    const stored = (await this.kv.get('settings'))?.value as Partial<Settings> | undefined;
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async setSettings(s: Settings): Promise<void> {
    await this.kv.put({ key: 'settings', value: s });
  }
}
