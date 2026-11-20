/**
 * The on-device copy of the bank (docs/design.md §3.3). Holds parsed seeds,
 * review state, the manifest and settings. In Phase 0 this is the only copy,
 * so Export matters; from Phase 1 it's a cache of the GitHub repo and can be
 * rebuilt from `seeds/` at any time.
 */
import Dexie, { type EntityTable } from 'dexie';
import { newManifest, type Manifest } from '../core/bank';
import type { ReviewState } from '../core/review';
import type { Seed } from '../core/types';

export interface Settings {
  /** Seeds per daily review. */
  reviewSize: number;
  /** Optional category to focus reviews on. */
  reviewFocus?: string;
}

export const DEFAULT_SETTINGS: Settings = { reviewSize: 5 };

interface KV {
  key: 'review' | 'manifest' | 'settings';
  value: unknown;
}

export class SeedbankDB extends Dexie {
  seeds!: EntityTable<Seed, 'id'>;
  kv!: EntityTable<KV, 'key'>;

  constructor(name = 'seedbank') {
    super(name);
    this.version(1).stores({
      seeds: '&id, status, category, kind, updated, *tags',
      kv: '&key',
    });
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
