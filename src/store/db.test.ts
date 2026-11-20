import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { createTidbit } from '../core/tidbit';
import { testCtx } from '../core/testing';
import { SchemaDB } from './db';

describe('SchemaDB migration', () => {
  it('moves data saved by Seedbank (v1, table `seeds`) into `tidbits` without loss', async () => {
    const name = 'migration-test';
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'Water tomatoes deeply', kind: 'insight', category: 'Garden' });
    const b = createTidbit(ctx, { text: 'In bed by 10:30', kind: 'practice' });

    // What a phone running the old app has on disk.
    const old = new Dexie(name);
    old.version(1).stores({ seeds: '&id, status, category, kind, updated, *tags', kv: '&key' });
    await old.table('seeds').bulkAdd([a, b]);
    await old.table('kv').put({ key: 'settings', value: { reviewSize: 7 } });
    old.close();

    const db = new SchemaDB(name);
    expect((await db.tidbits.toArray()).sort((x, y) => x.id.localeCompare(y.id))).toEqual([a, b]);
    expect((await db.getSettings()).reviewSize).toBe(7);
    expect(db.tables.map((t) => t.name).sort()).toEqual(['kv', 'tidbits']);
    db.close();
  });

  it('moves data saved while entries were called grains (v3, table `grains`) into `tidbits`', async () => {
    const name = 'migration-grains-test';
    const ctx = testCtx();
    const a = createTidbit(ctx, { text: 'Clouds form where the conditions are right', kind: 'insight', draft: true });

    const old = new Dexie(name);
    const INDEXES = '&id, status, category, kind, updated, *tags';
    old.version(1).stores({ seeds: INDEXES, kv: '&key' });
    old.version(2).stores({ grains: INDEXES });
    old.version(3).stores({ seeds: null });
    await old.table('grains').add(a);
    old.close();

    const db = new SchemaDB(name);
    expect(await db.tidbits.toArray()).toEqual([a]);
    expect(db.tables.map((t) => t.name).sort()).toEqual(['kv', 'tidbits']);
    db.close();
  });

  it('starts empty on a fresh device', async () => {
    const db = new SchemaDB('fresh-test');
    expect(await db.tidbits.count()).toBe(0);
    db.close();
  });
});
