/**
 * Keeps this device and its backup in step, quietly (docs/design.md §3.4).
 * Syncs on start, a few seconds after any change, when the device comes back
 * online, when the app returns to the foreground, and every few minutes.
 * One pass at a time; never blocks the UI.
 */
import { liveQuery, type Subscription } from 'dexie';
import { useSyncExternalStore } from 'react';
import { NewerFormatError } from '../core/sync';
import type { SyncAccount } from '../store/db';
import { finishSignInIfReturning } from './auth';
import type { GitHubAccount } from '../sync/github';
import { AuthError } from '../sync/store';
import { db } from './actions';

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  account?: { login: string; webUrl: string; label: string };
  lastSyncAt?: string;
  /** Plain-language problem, when state is 'error'. */
  message?: string;
  /** The sign-in stopped working; show "Sign in again". */
  needsSignIn?: boolean;
  /** Coming back from GitHub's sign-in page. */
  signingIn?: boolean;
  /** Sign-in didn't work (shown while not connected). */
  signInError?: string;
}

const CHANGE_DELAY = 4000;
const RETRY_DELAY = 60_000;
const PERIODIC = 5 * 60_000;

class SyncService {
  private status: SyncStatus = { state: 'off' };
  private listeners = new Set<() => void>();
  private running = false;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private sub: Subscription | undefined;
  private syncedFingerprint = '';
  private started = false;

  getStatus = () => this.status;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  /** Call once at startup. Does nothing until an account is connected. */
  async start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('online', () => this.request(0));
    window.addEventListener('offline', () => this.status.state !== 'off' && this.set({ state: 'offline' }));
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.request(0));
    // Follow the account across tabs: on phones, signing in often finishes in
    // another tab (GitHub returns to the browser, not the home-screen app).
    // Dexie's liveQuery sees writes from every tab of this app.
    liveQuery(() => db.getSyncAccount()).subscribe((account) => {
      if (account && this.status.state === 'off') this.activate(account);
      else if (!account && this.status.state !== 'off') this.teardown();
    });
  }

  private activate(account: SyncAccount) {
    this.set({
      state: navigator.onLine ? 'idle' : 'offline',
      account: { login: account.login, webUrl: `https://github.com/${account.owner}/${account.repo}`, label: 'GitHub' },
      lastSyncAt: account.lastSyncAt,
      message: undefined,
      needsSignIn: false,
    });
    // Any change to tidbits or reviews (from anywhere) schedules a sync.
    this.sub?.unsubscribe();
    this.sub = liveQuery(() => fingerprint()).subscribe((fp) => {
      if (fp !== this.syncedFingerprint) this.request(CHANGE_DELAY);
    });
    clearInterval(this.interval);
    this.interval = setInterval(() => this.request(0), PERIODIC);
    this.request(0);
  }

  /** If GitHub just sent the person back from its sign-in page, finish connecting. */
  async finishSignIn() {
    this.set({ signingIn: true, signInError: undefined });
    try {
      const account = await finishSignInIfReturning();
      if (account) {
        await this.connect(account);
        location.hash = '#/settings';
      }
    } catch (e) {
      this.set({ signInError: e instanceof Error ? e.message : String(e) });
    } finally {
      this.set({ signingIn: false });
    }
  }

  /** Connect a GitHub account (after sign-in), then sync right away. */
  async connect(account: GitHubAccount) {
    const full: SyncAccount = { provider: 'github', ...account };
    await db.setSyncAccount(full);
    await db.syncBase.clear(); // a fresh start against this backup
    this.syncedFingerprint = '';
    this.activate(full);
  }

  /** Forget the sign-in on this device. Tidbits stay here, and in the backup. */
  async disconnect() {
    this.teardown();
    await db.setSyncAccount(null);
    await db.syncBase.clear();
  }

  private teardown() {
    this.sub?.unsubscribe();
    clearInterval(this.interval);
    clearTimeout(this.timer);
    this.status = { state: 'off' };
    this.listeners.forEach((fn) => fn());
  }

  /** Show a sign-in problem (e.g. a token that didn't work). */
  reportSignInError(message: string | undefined) {
    this.set({ signInError: message });
  }

  /** Sync after `delay` ms (coalescing repeated requests). */
  request(delay = 0) {
    if (this.status.state === 'off') return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), delay);
  }

  syncNow() {
    this.request(0);
  }

  private async run() {
    if (this.running) {
      this.again = true;
      return;
    }
    const account = await db.getSyncAccount();
    if (!account) return;
    if (!navigator.onLine) {
      this.set({ state: 'offline' });
      return;
    }
    this.running = true;
    this.set({ state: 'syncing' });
    try {
      // Loaded on first use, so people who never sign in never download it.
      const [{ syncOnce }, { GitHubStore }] = await Promise.all([import('../sync/engine'), import('../sync/github')]);
      const store = new GitHubStore(account);
      // One sync at a time across every open copy of the app (home-screen app,
      // browser tabs): they share this device's data, so they'd only collide.
      const pass = () => syncOnce(db, store, () => new Date().toISOString());
      const result = navigator.locks ? await navigator.locks.request('schema-sync', pass) : await pass();
      this.syncedFingerprint = await fingerprint();
      const after = await db.getSyncAccount();
      this.set({ state: 'idle', lastSyncAt: after?.lastSyncAt, message: undefined, needsSignIn: false });
      if (result.pending) this.again = true;
    } catch (e) {
      const needsSignIn = e instanceof AuthError;
      const message =
        e instanceof NewerFormatError
          ? 'Your backup was saved by a newer version of Schema. Reload the app to update it, then syncing will continue.'
          : e instanceof Error
            ? e.message
            : String(e);
      this.set({ state: navigator.onLine ? 'error' : 'offline', message, needsSignIn });
      if (!needsSignIn) this.request(RETRY_DELAY);
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.request(CHANGE_DELAY);
      }
    }
  }
}

/** Cheap summary of everything sync cares about; changes whenever anything does. */
async function fingerprint(): Promise<string> {
  const tidbits = await db.tidbits.toArray();
  const review = await db.getReview();
  return (
    tidbits
      .map((t) => `${t.id}@${t.updated}:${t.history.length}:${t.status}`)
      .sort()
      .join(',') +
    '|' +
    JSON.stringify(review)
  );
}

export const syncService = new SyncService();

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(syncService.subscribe, syncService.getStatus);
}
