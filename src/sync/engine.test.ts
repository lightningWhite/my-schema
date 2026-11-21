import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FORMAT_VERSION } from '../core/files';
import { NewerFormatError } from '../core/sync';
import { testCtx } from '../core/testing';
import { createTidbit, reaffirm, revise, updateMeta } from '../core/tidbit';
import { SchemaDB } from '../store/db';
import { syncOnce } from './engine';
import { FakeGitHub } from './fakeGitHub';
import { GitHubStore, REPO_NAME } from './github';
import { AuthError } from './store';

let n = 0;
async function device(gh: FakeGitHub, token = 'tok') {
  const db = new SchemaDB(`device-${++n}`);
  const account = await GitHubStore.connect(token, gh.fetch);
  await db.setSyncAccount({ provider: 'github', ...account });
  const store = new GitHubStore(account, gh.fetch);
  return { db, store, sync: () => syncOnce(db, store, () => '2026-11-21T00:00:00.000Z') };
}

describe('sync with GitHub (end to end, fake GitHub)', () => {
  let gh: FakeGitHub;
  const ctx = testCtx('2026-11-01T00:00:00.000Z');
  beforeEach(() => {
    gh = new FakeGitHub({ tok: 'grandma', tok2: 'grandma' });
  });

  it('first sign-in creates a private backup and uploads everything', async () => {
    const a = await device(gh);
    const t = createTidbit(ctx, { text: 'Clouds form where the conditions are right', kind: 'insight' });
    await a.db.tidbits.add(t);
    const r = await a.sync();
    expect(r.uploaded).toBe(1);
    const files = gh.files('grandma', REPO_NAME);
    expect([...files.keys()].sort()).toEqual(['README.md', 'index.json', 'manifest.json', 'review.json', `tidbits/${t.id}.md`]);
    expect(files.get(`tidbits/${t.id}.md`)).toContain('Clouds form where the conditions are right');
    expect((await a.db.getSyncAccount())?.lastSyncAt).toBe('2026-11-21T00:00:00.000Z');
  });

  it('a second device signs in and gets everything', async () => {
    const a = await device(gh);
    const t = createTidbit(ctx, { text: 'No phone in the bedroom', kind: 'practice' });
    await a.db.tidbits.add(t);
    await a.sync();
    const b = await device(gh, 'tok2');
    const r = await b.sync();
    expect(r.downloaded).toBe(1);
    expect(await b.db.tidbits.toArray()).toEqual([t]);
  });

  it('edits made offline on two devices merge, and both end up the same', async () => {
    const a = await device(gh);
    const b = await device(gh, 'tok2');
    const t = createTidbit(ctx, { text: 'v1', category: 'Garden' });
    await a.db.tidbits.add(t);
    await a.sync();
    await b.sync();

    ctx.advance(1000);
    await a.db.tidbits.put(revise(ctx, (await a.db.tidbits.get(t.id))!, { text: 'v2 on the phone' }));
    ctx.advance(1000);
    await b.db.tidbits.put(reaffirm(ctx, updateMeta(ctx, (await b.db.tidbits.get(t.id))!, { category: 'Garden/Tomatoes' })));

    await a.sync();
    await b.sync();
    await a.sync();
    const ta = (await a.db.tidbits.get(t.id))!;
    const tb = (await b.db.tidbits.get(t.id))!;
    expect(ta).toEqual(tb);
    expect(ta.category).toBe('Garden/Tomatoes');
    expect(ta.history.map((e) => e.type)).toEqual(['reaffirmation', 'revision', 'revision']);
  });

  it('a deletion on one device reaches the other', async () => {
    const a = await device(gh);
    const b = await device(gh, 'tok2');
    const t = createTidbit(ctx, { text: 'to be deleted' });
    await a.db.tidbits.add(t);
    await a.sync();
    await b.sync();
    await a.db.tidbits.delete(t.id);
    await a.sync();
    expect(gh.files('grandma', REPO_NAME).has(`tidbits/${t.id}.md`)).toBe(false);
    await b.sync();
    expect(await b.db.tidbits.count()).toBe(0);
  });

  it('if another device syncs first, it starts over and merges', async () => {
    const a = await device(gh);
    const b = await device(gh, 'tok2');
    const ta = createTidbit(ctx, { text: 'from A' });
    const tb = createTidbit(ctx, { text: 'from B' });
    await a.db.tidbits.add(ta);
    await b.db.tidbits.add(tb);
    gh.beforeRefUpdate = async () => {
      await b.sync(); // B sneaks in while A is about to move the branch
    };
    await a.sync();
    await b.sync();
    const ids = (db: SchemaDB) => db.tidbits.toCollection().primaryKeys();
    expect((await ids(a.db)).sort()).toEqual([ta.id, tb.id].sort());
    expect((await ids(b.db)).sort()).toEqual([ta.id, tb.id].sort());
  });

  it('an edit made here during a sync is kept and uploaded next time', async () => {
    const a = await device(gh);
    const t = createTidbit(ctx, { text: 'before' });
    await a.db.tidbits.add(t);
    ctx.advance(1000);
    const edited = revise(ctx, t, { text: 'typed while syncing' });
    gh.beforeRefUpdate = async () => {
      await a.db.tidbits.put(edited);
    };
    const r = await a.sync();
    expect(r.pending).toBe(true);
    expect(await a.db.tidbits.get(t.id)).toEqual(edited);
    await a.sync();
    expect(gh.files('grandma', REPO_NAME).get(`tidbits/${t.id}.md`)).toContain('typed while syncing');
  });

  it('only downloads files that changed since the last sync', async () => {
    const a = await device(gh);
    for (let i = 0; i < 5; i++) await a.db.tidbits.add(createTidbit(ctx, { text: `t${i}` }));
    await a.sync();
    gh.requests = [];
    await a.sync();
    expect(gh.requests.filter((r) => r.includes('/git/blobs/'))).toEqual([]);
    expect(gh.requests.filter((r) => r.startsWith('POST') || r.startsWith('PATCH'))).toEqual([]);
  });

  it('never writes to a backup made by a newer version of the app', async () => {
    const a = await device(gh);
    await a.db.tidbits.add(createTidbit(ctx, { text: 'x' }));
    gh.commitDirect('grandma', REPO_NAME, { 'manifest.json': JSON.stringify({ formatVersion: FORMAT_VERSION + 1 }) });
    await expect(a.sync()).rejects.toThrow(NewerFormatError);
    expect([...gh.files('grandma', REPO_NAME).keys()]).not.toContain('index.json');
  });

  it('reports a revoked sign-in plainly', async () => {
    const a = await device(gh);
    const revoked = new GitHubStore({ token: 'revoked', login: 'grandma', owner: 'grandma', repo: REPO_NAME, branch: 'main' }, gh.fetch);
    await expect(syncOnce(a.db, revoked, () => 'now')).rejects.toThrow(AuthError);
  });

  it('reuses an existing backup instead of creating a second one', async () => {
    await device(gh);
    await device(gh, 'tok2');
    expect([...gh.repos.keys()]).toEqual([`grandma/${REPO_NAME}`]);
  });
});
