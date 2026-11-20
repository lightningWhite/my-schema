import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { createGrain } from '../core/grain';
import { testCtx } from '../core/testing';
import { SchemaDB } from './db';

describe('SchemaDB migration', () => {
  it('moves data saved by Seedbank (v1, table `seeds`) into `grains` without loss', async () => {
    const name = 'migration-test';
    const ctx = testCtx();
    const a = createGrain(ctx, { text: 'Water tomatoes deeply', kind: 'insight', category: 'Garden' });
    const b = createGrain(ctx, { text: 'In bed by 10:30', kind: 'practice' });

    // What a phone running the old app has on disk.
    const old = new Dexie(name);
    old.version(1).stores({ seeds: '&id, status, category, kind, updated, *tags', kv: '&key' });
    await old.table('seeds').bulkAdd([a, b]);
    await old.table('kv').put({ key: 'settings', value: { reviewSize: 7 } });
    old.close();

    const db = new SchemaDB(name);
    expect((await db.grains.toArray()).sort((x, y) => x.id.localeCompare(y.id))).toEqual([a, b]);
    expect((await db.getSettings()).reviewSize).toBe(7);
    expect(db.tables.map((t) => t.name).sort()).toEqual(['grains', 'kv']);
    db.close();
  });

  it('starts empty on a fresh device', async () => {
    const db = new SchemaDB('fresh-test');
    expect(await db.grains.count()).toBe(0);
    db.close();
  });
});
